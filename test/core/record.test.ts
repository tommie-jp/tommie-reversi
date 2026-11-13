import { describe, expect, it } from "vitest";
import { boardToBO } from "../../src/core/board";
import { newGame, playMove, type GameState } from "../../src/core/game";
import { formatRecord, parseRecord } from "../../src/core/record";
import { randomGame } from "../helpers/random-game";

function parsed(text: string): GameState {
    const result = parseRecord(text);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
}

describe("formatRecord", () => {
    it("writes nothing for a new game", () => {
        expect(formatRecord(newGame().moves)).toBe("");
    });

    it("writes lowercase squares with no separators", () => {
        let game = newGame();
        for (const square of ["f5", "d6", "c3"]) {
            const result = playMove(game, square);
            if (!result.ok) throw new Error(result.error);
            game = result.value;
        }
        expect(formatRecord(game.moves)).toBe("f5d6c3");
    });

    it("leaves passes out", () => {
        expect(
            formatRecord([
                { kind: "move", color: 1, square: "c1" },
                { kind: "pass", color: 2 },
                { kind: "move", color: 1, square: "c3" },
            ]),
        ).toBe("c1c3");
    });
});

describe("parseRecord", () => {
    it("reads an empty record as a new game", () => {
        expect(parsed("")).toEqual(newGame());
    });

    it("reads moves in order", () => {
        const game = parsed("f5d6c3");
        expect(game.lastSquare).toBe("c3");
        expect(game.moves).toHaveLength(3);
    });

    it("accepts uppercase, spaces, newlines and # comment lines", () => {
        const plain = parsed("f5d6c3d3");
        const messy = parsed("# black: human\n F5 D6\r\nc3D3 \n");
        expect(messy).toEqual(plain);
    });

    it("accepts pa and ps as an explicit pass", () => {
        const ok = randomGamesWithPass()[0]!;
        const explicit = ok.moves.map((m) => (m.kind === "move" ? m.square : "PA")).join(" ");
        expect(parsed(explicit)).toEqual(ok);
        expect(parsed(explicit.replace(/PA/g, "ps"))).toEqual(ok);
    });

    it("reports a move that is not legal, with its position", () => {
        expect(parseRecord("f5a1")).toEqual({ ok: false, error: { at: 2, reason: "no-flips" } });
        expect(parseRecord("f5 f5")).toEqual({ ok: false, error: { at: 3, reason: "occupied" } });
    });

    it("reports a token that is not a square", () => {
        expect(parseRecord("f5z9")).toEqual({ ok: false, error: { at: 2, reason: "bad-token" } });
        expect(parseRecord("f5d")).toEqual({ ok: false, error: { at: 2, reason: "bad-token" } });
    });

    it("reports a pass that is not allowed", () => {
        expect(parseRecord("pa")).toEqual({ ok: false, error: { at: 0, reason: "pass-not-allowed" } });
    });

    it("reports moves after the end of the game", () => {
        const game = randomGame(1);
        const text = formatRecord(game.moves) + "a1";
        const result = parseRecord(text);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toBe("not-playing");
    });
});

describe("round trip", () => {
    it("rebuilds 200 random games, filling in the passes", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const game = randomGame(seed);
            const back = parsed(formatRecord(game.moves));
            expect(back.moves).toEqual(game.moves);
            expect(boardToBO(back.board)).toBe(boardToBO(game.board));
            expect(back.outcome).toBe(game.outcome);
        }
    });

    it("includes games with passes, so the fill-in is really tested", () => {
        expect(randomGamesWithPass().length).toBeGreaterThan(0);
    });
});

function randomGamesWithPass(): GameState[] {
    const games: GameState[] = [];
    for (let seed = 1; seed <= 200; seed++) {
        const game = randomGame(seed);
        if (game.moves.some((m) => m.kind === "pass")) games.push(game);
    }
    return games;
}
