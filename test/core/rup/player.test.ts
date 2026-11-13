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
        const { cpu, player, autoAnswer, received, timers } = setup();
        autoAnswer(cpu, "SW-FPGA-pico2-reversi-03-corner.57");
        const connecting = player.connect();
        await settle();
        await timers.advance(1_000);
        await expect(connecting).resolves.toEqual({ name: "SW-FPGA-pico2-reversi-03-corner.57", version: "02" });
        expect(player.name).toBe("SW-FPGA-pico2-reversi-03-corner.57");
        expect(received).toEqual(["PI", "VE", "CA"]);
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

    it("asks for the CPU's commands and uses EA to stop a game when the CPU knows it", async () => {
        const { cpu, player, received } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
            if (line === "VE") void cpu.sendLine("+VE03new");
            if (line === "CA") void cpu.sendLine("+CA PI VE CA SB SW MO PA EB EW ED EA");
        });
        await player.connect();
        expect(received).toEqual(["PI", "VE", "CA"]);
        await player.start(BLACK);
        await player.finish({ reason: "aborted", detail: "new game" });
        await settle();
        expect(received.slice(3)).toEqual(["SB", "EA", "PI"]);
    });

    it("falls back to ED when the CPU does not list EA", async () => {
        const { cpu, player, received, notices } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
            if (line === "VE") void cpu.sendLine("+VE02old");
            if (line === "CA") void cpu.sendLine("+CA PI VE CA SB SW MO PA EB EW ED");
        });
        await player.connect();
        await player.finish({ reason: "aborted", detail: "quit" });
        await settle();
        expect(received.slice(3)).toEqual(["ED", "PI"]);
        expect(notices).toEqual([]);
    });

    it("falls back to ED, without a notice, when the CPU rejects or ignores CA", async () => {
        const rejecting = setup();
        rejecting.cpu.onLine((line) => {
            if (line === "PI") void rejecting.cpu.sendLine("+PI");
            if (line === "VE") void rejecting.cpu.sendLine("+VE02old");
            if (line === "CA") void rejecting.cpu.sendLine("-01 unknown command");
        });
        await rejecting.player.connect();
        expect(rejecting.notices).toEqual([]);

        const silent = setup();
        silent.autoAnswer(silent.cpu);
        const connecting = silent.player.connect();
        await settle();
        await silent.timers.advance(1_000);
        await connecting;
        await silent.player.finish({ reason: "aborted", detail: "quit" });
        await settle();
        expect(silent.received.slice(3)).toEqual(["ED", "PI"]);
        expect(silent.notices).toEqual([]);
    });

    it("still ends a normal game with EB, EW or ED when the CPU knows EA", async () => {
        const { cpu, player, received } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
            if (line === "VE") void cpu.sendLine("+VE03new");
            if (line === "CA") void cpu.sendLine("+CA EA");
        });
        await player.connect();
        await player.finish({ reason: "normal", outcome: "white" });
        await settle();
        expect(received.slice(3)).toEqual(["EW", "PI"]);
    });

    it("goes on without a name when VE gets no reply, and says so", async () => {
        const { cpu, player, timers, notices } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
        });
        const connecting = player.connect();
        await settle();
        await timers.advance(2_000);
        await expect(connecting).resolves.toEqual({ name: "unknown CPU", version: "" });
        expect(notices).toContain("no reply to VE; going on without a name");
    });

    it("warns when the CPU speaks another RUP version", async () => {
        const { cpu, player, notices } = setup();
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
            if (line === "VE") void cpu.sendLine("+VE01old");
            if (line === "CA") void cpu.sendLine("+CA PI VE CA");
        });
        await player.connect();
        expect(notices).toContain("the CPU speaks RUP 01; this app speaks RUP 02 and 03");
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
        const { cpu, player, reply, autoAnswer } = setup();
        autoAnswer(cpu);
        await reply("-05");
        await player.finish({ reason: "aborted", detail: "x" });
        await settle();
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
        await timers.advance(2_000);
        await expect(connecting).resolves.toEqual({ name: "unknown CPU", version: "" });
        expect(notices[0]).toBe("the CPU answered -01: unknown command");
    });

    it("drops a PA that the CPU sends after the last game ended", async () => {
        // The last move filled the board; the CPU answers it with PA, which arrives late.
        const { cpu, player, reply, notices, autoAnswer } = setup();
        autoAnswer(cpu);
        await player.finish({ reason: "normal", outcome: "draw" });
        await settle();
        await player.start(WHITE);
        await reply("PA");
        const waiting = player.requestMove(newGame());
        await reply("MOd6");
        expect(await waiting).toEqual({ kind: "move", square: "d6" });
        expect(notices).toEqual(["ignored a PA that arrived after the last game ended"]);
        await player.finish({ reason: "aborted", detail: "x" });
    });

    it("drops only one late PA, and none once the CPU has moved", async () => {
        const { cpu, player, reply, autoAnswer } = setup();
        autoAnswer(cpu);
        await player.finish({ reason: "normal", outcome: "black" });
        await settle();
        await player.start(BLACK);
        await reply("MOd3");
        expect(await player.requestMove(newGame())).toEqual({ kind: "move", square: "d3" });
        const waiting = player.requestMove(newGame());
        await reply("PA");
        expect(await waiting).toEqual({ kind: "pass" });
        await player.finish({ reason: "aborted", detail: "x" });
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
    ] as const)("sends the end of a normal game, then PI to mark the end: %s", async (outcome, line) => {
        const { player, received } = setup();
        await player.finish({ reason: "normal", outcome });
        await settle();
        expect(received).toEqual([line, "PI"]);
    });

    it("sends ED when a game is stopped, so the CPU goes back to idle (v0.3 draft)", async () => {
        const { cpu, player, received, timers, autoAnswer } = setup();
        autoAnswer(cpu);
        await player.start(BLACK);
        await player.finish({ reason: "aborted", detail: "quit" });
        await settle();
        expect(received).toEqual(["SB", "ED", "PI"]);
        // The heartbeat is stopped: nothing more is sent afterwards.
        await timers.advance(10_000);
        expect(received).toEqual(["SB", "ED", "PI"]);
    });

    it("answers the CPU's illegal move with -05 before stopping (v0.3 draft)", async () => {
        const { player, received } = setup();
        await player.start(WHITE);
        await player.finish({
            reason: "violation", by: WHITE, attempted: { kind: "move", square: "a1" }, error: "no-flips",
        });
        await settle();
        expect(received).toEqual(["SW", "-05 illegal move a1", "ED", "PI"]);
    });

    it("does not blame the CPU for the other player's violation", async () => {
        const { player, received } = setup();
        await player.start(WHITE);
        await player.finish({
            reason: "violation", by: BLACK, attempted: { kind: "pass" }, error: "pass-not-allowed",
        });
        await settle();
        expect(received).toEqual(["SW", "ED", "PI"]);
    });

    it("tells the CPU who won when a player resigned", async () => {
        const { player, received } = setup();
        await player.finish({ reason: "resign", by: BLACK });
        await settle();
        expect(received).toEqual(["EW", "PI"]);
    });

    it("sends nothing at the end when the connection is lost", async () => {
        const { cpu, player, received } = setup();
        await cpu.close();
        await player.finish({ reason: "aborted", detail: "disconnected" });
        await settle();
        expect(received).toEqual([]);
    });

    it("drops moves that arrive between the end of a game and the CPU's +PI", async () => {
        const { cpu, player, reply, notices } = setup();
        await player.start(BLACK);
        await player.finish({ reason: "aborted", detail: "new game" });
        // The CPU was still thinking: its old move comes first, then the answer to PI.
        await reply("MOc4", "+PI");
        const starting = player.start(WHITE);
        await settle();
        await starting;
        const waiting = player.requestMove(newGame());
        await reply("MOd6");
        expect(await waiting).toEqual({ kind: "move", square: "d6" });
        expect(notices).toEqual(["ignored MOc4: it arrived after the game ended"]);
        void cpu;
        await player.finish({ reason: "aborted", detail: "x" });
    });

    it("waits for the CPU's +PI before starting the next game", async () => {
        const { player, reply, received } = setup();
        await player.finish({ reason: "normal", outcome: "draw" });
        let started = false;
        const starting = player.start(BLACK).then(() => (started = true));
        await settle();
        expect(started).toBe(false);
        expect(received).toEqual(["ED", "PI"]);
        await reply("+PI");
        await starting;
        await settle();
        expect(received).toEqual(["ED", "PI", "SB"]);
        await player.finish({ reason: "aborted", detail: "x" });
    });

    it("starts the next game anyway when the CPU never answers the PI", async () => {
        const { player, timers, received } = setup();
        await player.finish({ reason: "normal", outcome: "draw" });
        const starting = player.start(BLACK);
        await timers.advance(3_000);
        await starting;
        await settle();
        expect(received.at(-1)).toBe("SB");
        await player.finish({ reason: "aborted", detail: "x" });
    });

    it("accepts RUP 02 and 03 without a warning", async () => {
        for (const version of ["02", "03"]) {
            const { cpu, player, notices } = setup();
            cpu.onLine((line) => {
                if (line === "PI") void cpu.sendLine("+PI");
                if (line === "VE") void cpu.sendLine(`+VE${version}x`);
                if (line === "CA") void cpu.sendLine("+CA PI VE CA");
            });
            await player.connect();
            expect(notices).toEqual([]);
        }
    });
});
