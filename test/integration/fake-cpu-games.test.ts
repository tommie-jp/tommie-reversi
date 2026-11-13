import { describe, expect, it } from "vitest";
import { runMatch, type MatchResult } from "../../src/core/match";
import type { Player } from "../../src/core/player";
import { RandomPlayer } from "../../src/core/players/random";
import { seededRandom } from "../../src/core/random";
import { RupPlayer } from "../../src/core/rup/player";
import { startFakeCpu, type Misbehaviour } from "../../src/transport/fake-cpu";
import { createLoopbackPair } from "../../src/transport/loopback";
import { tapTransport } from "../../src/transport/tap";
import { ManualTimers } from "../helpers/manual-timers";

async function connectedCpu(misbehave?: Misbehaviour) {
    const [host, cpu] = createLoopbackPair();
    startFakeCpu(cpu, { name: "fake-cpu", seed: 5, ...(misbehave ? { misbehave } : {}) });
    const lines: string[] = [];
    const timers = new ManualTimers();
    const notices: string[] = [];
    const player = new RupPlayer({
        transport: tapTransport(host, (direction, line) => lines.push(`${direction} ${line}`)),
        timers,
        onNotice: (text) => notices.push(text),
    });
    await player.connect();
    return { player, host, cpu, lines, timers, notices };
}

function play(black: Player, white: Player, signal?: AbortSignal): Promise<MatchResult> {
    return runMatch({ black, white, onEvent: () => {}, ...(signal ? { signal } : {}) });
}

describe("games against the fake RUP CPU", () => {
    it("plays a full game with the CPU as black, then as white", async () => {
        const { player, lines } = await connectedCpu();
        const asBlack = await play(player, new RandomPlayer("random", seededRandom(1)));
        expect(asBlack.reason).toBe("normal");
        const asWhite = await play(new RandomPlayer("random", seededRandom(2)), player);
        expect(asWhite.reason).toBe("normal");
        expect(lines.filter((l) => l === "TX SB")).toHaveLength(1);
        expect(lines.filter((l) => l === "TX SW")).toHaveLength(1);
        expect(lines.filter((l) => /^TX E[BWD]$/.test(l))).toHaveLength(2);
    });

    it("plays 100 games in a row over one connection without stopping", async () => {
        const { player } = await connectedCpu();
        for (let game = 1; game <= 100; game++) {
            const random = new RandomPlayer("random", seededRandom(game));
            const result = game % 2 === 1 ? await play(player, random) : await play(random, player);
            expect(result.reason, `game ${game}`).toBe("normal");
        }
    });

    it("reads past the BS lines the current FPGA sends after its moves", async () => {
        const { player, notices } = await connectedCpu("board-after-move");
        expect((await play(player, new RandomPlayer("r", seededRandom(3)))).reason).toBe("normal");
        expect(notices).toEqual([]);
    });

    it("stops with a rule violation when the CPU plays an illegal move", async () => {
        const { player, lines } = await connectedCpu("illegal-move");
        const result = await play(player, new RandomPlayer("r", seededRandom(1)));
        expect(result).toMatchObject({ reason: "violation", by: 1, error: "no-flips" });
        expect(lines.some((l) => /^TX E[BWD]$/.test(l))).toBe(false);
    });

    it("stops with a rule violation when the CPU passes with a legal move", async () => {
        const { player } = await connectedCpu("bad-pass");
        const result = await play(player, new RandomPlayer("r", seededRandom(1)));
        expect(result).toMatchObject({ reason: "violation", by: 1, error: "pass-not-allowed" });
    });

    it("stops when the CPU answers a move with an error", async () => {
        const { player } = await connectedCpu("error-reply");
        const result = await play(new RandomPlayer("r", seededRandom(1)), player);
        expect(result).toEqual({ reason: "aborted", detail: "CPU error -04: bad coord" });
    });

    it("stops when the connection is lost in the middle of a game", async () => {
        const { player, cpu } = await connectedCpu("silent");
        const running = play(player, new RandomPlayer("r", seededRandom(1)));
        await new Promise((resolve) => setTimeout(resolve, 0));
        await cpu.close();
        expect(await running).toEqual({ reason: "aborted", detail: "disconnected: closed by the other end" });
    });

    it("keeps waiting for a silent CPU, says so after 90 s, and can be stopped", async () => {
        const { player, timers, notices, cpu } = await connectedCpu("silent");
        cpu.onLine((line) => {
            if (line === "PI") void cpu.sendLine("+PI");
        });
        const controller = new AbortController();
        const running = play(player, new RandomPlayer("r", seededRandom(1)), controller.signal);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await timers.advance(90_000);
        expect(notices).toContain("the CPU has not moved for 90s (still waiting)");
        controller.abort("quit");
        expect(await running).toEqual({ reason: "aborted", detail: "quit" });
    });
});
