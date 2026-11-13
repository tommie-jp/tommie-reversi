import { describe, expect, it } from "vitest";
import { BLACK, WHITE } from "../../../src/core/board";
import { newGame } from "../../../src/core/game";
import { RupPlayer } from "../../../src/core/rup/player";
import type { LineTransport } from "../../../src/core/transport";
import { createLoopbackPair } from "../../../src/transport/loopback";
import { ManualTimers } from "../../helpers/manual-timers";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The test plays the CPU on the other end of a loopback. */
function setup() {
    const [host, cpu] = createLoopbackPair();
    const timers = new ManualTimers();
    const notices: string[] = [];
    const received: string[] = [];
    cpu.onLine((line) => received.push(line));
    const player = new RupPlayer({ transport: host, timers, onNotice: (text) => notices.push(text) });
    const reply = async (...lines: string[]) => {
        for (const line of lines) await cpu.sendLine(line);
        await settle();
    };
    /** Answers PI and VE as a well-behaved CPU. */
    const autoAnswer = (cpuSide: LineTransport, name = "fpga") =>
        cpuSide.onLine((line) => {
            if (line === "PI") void cpuSide.sendLine("+PI");
            if (line === "VE") void cpuSide.sendLine(`+VE02${name}`);
        });
    return { host, cpu, timers, notices, received, player, reply, autoAnswer };
}

describe("RupPlayer.connect", () => {
    it("checks the CPU with PI and VE and takes its name", async () => {
        const { cpu, player, autoAnswer, received } = setup();
        autoAnswer(cpu, "SW-FPGA-pico2-reversi-03-corner.57");
        await expect(player.connect()).resolves.toEqual({ name: "SW-FPGA-pico2-reversi-03-corner.57", version: "02" });
        expect(player.name).toBe("SW-FPGA-pico2-reversi-03-corner.57");
        expect(received).toEqual(["PI", "VE"]);
    });

    it("tries PI three times, a second apart, then gives up", async () => {
        const { player, timers, received } = setup();
        const connecting = player.connect();
        const outcome = connecting.then(() => "ok", (error: Error) => error.message);
        await settle();
        await timers.advance(3_000);
        expect(await outcome).toBe("no reply to PI (3 tries)");
        expect(received).toEqual(["PI", "PI", "PI"]);
    });

    it("goes on without a name when VE gets no reply, and says so", async () => {
        const { cpu, player, timers, notices } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
        });
        const connecting = player.connect();
        await settle();
        await timers.advance(1_000);
        await expect(connecting).resolves.toEqual({ name: "unknown CPU", version: "" });
        expect(notices).toContain("no reply to VE; going on without a name");
    });

    it("warns when the CPU speaks another RUP version", async () => {
        const { cpu, player, notices } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
            if (line === "VE") void cpu.sendLine("+VE01old");
        });
        await player.connect();
        expect(notices).toContain("the CPU speaks RUP 01; this app speaks RUP 02");
    });
});

describe("RupPlayer during a game", () => {
    it("sends SB or SW at the start", async () => {
        const black = setup();
        await black.player.start(BLACK);
        await settle();
        expect(black.received).toEqual(["SB"]);
        await black.player.finish({ reason: "aborted", detail: "x" });
        const white = setup();
        await white.player.start(WHITE);
        await settle();
        expect(white.received).toEqual(["SW"]);
        await white.player.finish({ reason: "aborted", detail: "x" });
    });

    it("sends the other player's moves and passes", async () => {
        const { player, received } = setup();
        await player.opponentMoved({ kind: "move", color: BLACK, square: "f5" }, newGame());
        await player.opponentMoved({ kind: "pass", color: BLACK }, newGame());
        await settle();
        expect(received).toEqual(["MOf5", "PA"]);
    });

    it.each([
        ["MOd6", { kind: "move", square: "d6" }],
        ["PA", { kind: "pass" }],
        ["EN", { kind: "resign" }],
    ] as const)("turns %s into a move", async (line, expected) => {
        const { player, reply } = setup();
        const waiting = player.requestMove(newGame());
        await reply(line);
        expect(await waiting).toEqual(expected);
    });

    it("uses a move that arrived before it was asked for", async () => {
        const { player, reply } = setup();
        await reply("MOd6");
        expect(await player.requestMove(newGame())).toEqual({ kind: "move", square: "d6" });
    });

    it("reads past BS, ST, NC, other replies and X lines while waiting", async () => {
        const { player, reply, notices } = setup();
        const waiting = player.requestMove(newGame());
        await reply("BS" + "0".repeat(64), "ST d=3", "NC10,5", "+SB", "XB", "MOc4");
        expect(await waiting).toEqual({ kind: "move", square: "c4" });
        expect(notices).toEqual([]);
    });

    it("notes a broken line and keeps waiting", async () => {
        const { player, reply, notices } = setup();
        const waiting = player.requestMove(newGame());
        await reply("MOD3", "MOd3");
        expect(await waiting).toEqual({ kind: "move", square: "d3" });
        expect(notices).toEqual(['ignored a line that breaks RUP (-04): "MOD3"']);
    });

    it("notes RE and RS, which this app does not handle yet", async () => {
        const { player, reply, notices } = setup();
        const waiting = player.requestMove(newGame());
        await reply("RE", "RS", "PA");
        await waiting;
        expect(notices).toEqual(["the CPU sent RE (restarted); not handled, ignored", "the CPU sent RS (resync); not handled, ignored"]);
    });

    it("stops on an error reply while waiting", async () => {
        const { player, reply } = setup();
        const waiting = player.requestMove(newGame());
        const outcome = waiting.then(() => "resolved", (error: Error) => error.message);
        await reply("-04 bad coord");
        expect(await outcome).toBe("CPU error -04: bad coord");
    });

    it("stops on an error reply that came before the next request", async () => {
        const { player, reply } = setup();
        await reply("-05");
        await expect(player.requestMove(newGame())).rejects.toThrow("CPU error -05");
    });

    it("forgets an error reply of the last game when a new game starts", async () => {
        const { player, reply } = setup();
        await reply("-05");
        await player.finish({ reason: "aborted", detail: "x" });
        await player.start(BLACK);
        const waiting = player.requestMove(newGame());
        await reply("MOf5");
        expect(await waiting).toEqual({ kind: "move", square: "f5" });
        await player.finish({ reason: "aborted", detail: "x" });
    });

    it("does not stop for an error reply to a query while connecting", async () => {
        const { cpu, player, notices, timers } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
            if (line === "VE") void cpu.sendLine("-01 unknown command");
        });
        const connecting = player.connect();
        await settle();
        await timers.advance(1_000);
        await expect(connecting).resolves.toEqual({ name: "unknown CPU", version: "" });
        expect(notices[0]).toBe("the CPU answered -01: unknown command");
    });

    it("says when the CPU is slow, and still takes its move", async () => {
        const { player, reply, timers, notices } = setup();
        const waiting = player.requestMove(newGame());
        await timers.advance(90_000);
        expect(notices).toEqual(["the CPU has not moved for 90s (still waiting)"]);
        await reply("MOf5");
        expect(await waiting).toEqual({ kind: "move", square: "f5" });
    });

    it("sends PI every 3 seconds and stops when three go unanswered", async () => {
        const { player, timers, received } = setup();
        await player.start(BLACK);
        const waiting = player.requestMove(newGame());
        const outcome = waiting.then(() => "ok", (error: Error) => error.message);
        await timers.advance(12_000);
        expect(await outcome).toBe("disconnected: no reply to PI (3 times)");
        expect(received.filter((l) => l === "PI")).toHaveLength(3);
    });

    it("keeps going while PI is answered", async () => {
        const { cpu, player, timers, reply } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
        });
        await player.start(BLACK);
        const waiting = player.requestMove(newGame());
        await timers.advance(30_000);
        await reply("MOf5");
        expect(await waiting).toEqual({ kind: "move", square: "f5" });
        await player.finish({ reason: "aborted", detail: "x" });
    });

    it("stops when the connection closes", async () => {
        const { cpu, player } = setup();
        const waiting = player.requestMove(newGame());
        const outcome = waiting.then(() => "resolved", (error: Error) => error.message);
        await cpu.close();
        expect(await outcome).toBe("disconnected: closed by the other end");
        await expect(player.requestMove(newGame())).rejects.toThrow("disconnected");
    });

    it("cancels the 90 s notice when the game is stopped while waiting", async () => {
        const { player, timers, notices } = setup();
        const waiting = player.requestMove(newGame());
        const outcome = waiting.then(() => "resolved", () => "rejected");
        await player.finish({ reason: "aborted", detail: "new game" });
        await timers.advance(100_000);
        expect(notices).toEqual([]);
        expect(await outcome).toBe("rejected");
    });

    it("stops sending PI once the connection is lost", async () => {
        const { player, timers, cpu, received } = setup();
        await player.start(BLACK);
        await cpu.close();
        await timers.advance(30_000);
        expect(received.filter((l) => l === "PI")).toHaveLength(0);
    });

    it.each([
        ["black", "EB"],
        ["white", "EW"],
        ["draw", "ED"],
    ] as const)("sends the end of a normal game: %s", async (outcome, line) => {
        const { player, received } = setup();
        await player.finish({ reason: "normal", outcome });
        await settle();
        expect(received).toEqual([line]);
    });

    it("sends nothing at the end of a stopped game, and stops the PI", async () => {
        const { player, received, timers } = setup();
        await player.start(BLACK);
        await player.finish({ reason: "aborted", detail: "quit" });
        await timers.advance(10_000);
        expect(received).toEqual(["SB"]);
    });
});
