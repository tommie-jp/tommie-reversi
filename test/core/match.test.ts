import { describe, expect, it } from "vitest";
import { BLACK, WHITE, boardToBO, initialBoard } from "../../src/core/board";
import { runMatch, type MatchEvent } from "../../src/core/match";
import type { Player } from "../../src/core/player";
import { RandomPlayer } from "../../src/core/players/random";
import { seededRandom } from "../../src/core/random";
import { PASS, RESIGN, ScriptedPlayer, move } from "../helpers/scripted-player";

function collect(): { events: MatchEvent[]; onEvent: (e: MatchEvent) => void } {
    const events: MatchEvent[] = [];
    return { events, onEvent: (e) => events.push(e) };
}

describe("runMatch", () => {
    it("plays 100 random games to a normal end", async () => {
        for (let seed = 1; seed <= 100; seed++) {
            const { events, onEvent } = collect();
            const result = await runMatch({
                black: new RandomPlayer("b", seededRandom(seed)),
                white: new RandomPlayer("w", seededRandom(seed + 1000)),
                onEvent,
            });
            expect(result.reason).toBe("normal");
            expect(events[0]!.type).toBe("started");
            expect(events.at(-1)!.type).toBe("finished");
            expect(events.slice(1, -1).every((e) => e.type === "moved")).toBe(true);
        }
    });

    it("tells each player its color and the other player's moves", async () => {
        const black = new ScriptedPlayer("black", [move("f5"), RESIGN]);
        const white = new ScriptedPlayer("white", [move("d6")]);
        await runMatch({ black, white, onEvent: () => {} });
        expect(black.calls).toEqual(["start:1", "move:f5", "opponent:d6", "move:resign", "finish:resign"]);
        expect(white.calls).toEqual(["start:2", "opponent:f5", "move:d6", "finish:resign"]);
    });

    it("stops on an illegal move without changing the board", async () => {
        const { events, onEvent } = collect();
        const black = new ScriptedPlayer("black", [move("a1")]);
        const white = new ScriptedPlayer("white", []);
        const result = await runMatch({ black, white, onEvent });
        expect(result).toEqual({ reason: "violation", by: BLACK, attempted: move("a1"), error: "no-flips" });
        expect(events.map((e) => e.type)).toEqual(["started", "violation", "finished"]);
        const finished = events.at(-1)!;
        if (finished.type === "finished") expect(boardToBO(finished.state.board)).toBe(boardToBO(initialBoard()));
        expect(white.result).toEqual(result);
    });

    it("stops on a pass that is not allowed", async () => {
        const black = new ScriptedPlayer("black", [PASS]);
        const result = await runMatch({ black, white: new ScriptedPlayer("white", []), onEvent: () => {} });
        expect(result).toMatchObject({ reason: "violation", by: BLACK, error: "pass-not-allowed" });
    });

    it("ends with a resignation", async () => {
        const black = new ScriptedPlayer("black", [move("f5")]);
        const white = new ScriptedPlayer("white", [RESIGN]);
        const result = await runMatch({ black, white, onEvent: () => {} });
        expect(result).toEqual({ reason: "resign", by: WHITE });
    });

    it("is aborted when a player throws, and still tells both players", async () => {
        const black = new ScriptedPlayer("black", []);
        const white = new ScriptedPlayer("white", []);
        const result = await runMatch({ black, white, onEvent: () => {} });
        expect(result).toEqual({ reason: "aborted", detail: "black has no more moves" });
        expect(black.result).toEqual(result);
        expect(white.result).toEqual(result);
    });

    it("is aborted by the signal while waiting for a move", async () => {
        const controller = new AbortController();
        const waiting: Player = {
            name: "slow",
            start: async () => {},
            requestMove: () => new Promise(() => {}),
            opponentMoved: async () => {},
            finish: async () => {},
        };
        const running = runMatch({
            black: waiting,
            white: new ScriptedPlayer("white", []),
            onEvent: () => {},
            signal: controller.signal,
        });
        controller.abort("quit");
        expect(await running).toEqual({ reason: "aborted", detail: "quit" });
    });

    it("ignores errors from finish", async () => {
        const black = new ScriptedPlayer("black", [RESIGN]);
        const white = new ScriptedPlayer("white", []);
        white.finish = async () => {
            throw new Error("port closed");
        };
        expect(await runMatch({ black, white, onEvent: () => {} })).toEqual({ reason: "resign", by: BLACK });
    });

    it("reports the outcome of a finished game", async () => {
        const { events, onEvent } = collect();
        const result = await runMatch({
            black: new RandomPlayer("b", seededRandom(3)),
            white: new RandomPlayer("w", seededRandom(4)),
            onEvent,
        });
        const finished = events.at(-1)!;
        expect(finished.type).toBe("finished");
        if (finished.type === "finished" && result.reason === "normal") {
            expect(result.outcome).toBe(finished.state.outcome);
        }
    });
});
