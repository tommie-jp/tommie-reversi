import { describe, expect, it } from "vitest";
import { BLACK, WHITE, countDiscs } from "../../src/core/board";
import {
    gameFromPosition,
    mustPass,
    newGame,
    playMove,
    playPass,
    type GameState,
} from "../../src/core/game";
import { topRows } from "../helpers/board";

function unwrap(result: ReturnType<typeof playMove>): GameState {
    if (!result.ok) throw new Error(`unexpected error: ${result.error}`);
    return result.value;
}

/**
 * Black to move. After black plays c1, white has no legal move but black still has c3.
 *   row 1: X O . . . . . .
 *   row 3: X O . . . . . .
 */
const PASS_POSITION = topRows("XO......", "........", "XO......");

describe("newGame", () => {
    it("starts with black to move on the initial board", () => {
        const game = newGame();
        expect(game.turn).toBe(BLACK);
        expect(game.status).toBe("playing");
        expect(game.moves).toEqual([]);
        expect(game.lastSquare).toBeNull();
        expect(game.outcome).toBeNull();
        expect(countDiscs(game.board)).toEqual({ black: 2, white: 2 });
    });
});

describe("playMove", () => {
    it("plays a legal move, flips and hands the turn to white", () => {
        const before = newGame();
        const after = unwrap(playMove(before, "d3"));
        expect(countDiscs(after.board)).toEqual({ black: 4, white: 1 });
        expect(after.turn).toBe(WHITE);
        expect(after.lastSquare).toBe("d3");
        expect(after.moves).toEqual([{ kind: "move", color: BLACK, square: "d3" }]);
        expect(before.moves).toEqual([]);
        expect(countDiscs(before.board)).toEqual({ black: 2, white: 2 });
    });

    it.each([
        ["z9", "bad-square"],
        ["D3", "bad-square"],
        ["d4", "occupied"],
        ["a1", "no-flips"],
    ])("rejects %s with %s and leaves the game unchanged", (square, error) => {
        const game = newGame();
        expect(playMove(game, square)).toEqual({ ok: false, error });
    });

    it("rejects a move when the player has to pass", () => {
        const game = unwrap(playMove(gameFromPosition(PASS_POSITION, BLACK), "c1"));
        expect(playMove(game, "c3")).toEqual({ ok: false, error: "must-pass" });
    });

    it("rejects a move after the game is over", () => {
        const game = unwrap(playMove(gameFromPosition(topRows("XO......"), BLACK), "c1"));
        expect(game.status).toBe("finished");
        expect(playMove(game, "d1")).toEqual({ ok: false, error: "not-playing" });
    });
});

describe("passing", () => {
    it("hands the turn to a player with no legal move instead of skipping them", () => {
        const game = unwrap(playMove(gameFromPosition(PASS_POSITION, BLACK), "c1"));
        expect(game.turn).toBe(WHITE);
        expect(mustPass(game)).toBe(true);
    });

    it("returns the turn after a pass and records the pass", () => {
        const before = unwrap(playMove(gameFromPosition(PASS_POSITION, BLACK), "c1"));
        const after = unwrap(playPass(before));
        expect(after.turn).toBe(BLACK);
        expect(after.moves.at(-1)).toEqual({ kind: "pass", color: WHITE });
        expect(after.lastSquare).toBe("c1");
        expect(mustPass(after)).toBe(false);
    });

    it("rejects a pass when the player has a legal move", () => {
        expect(playPass(newGame())).toEqual({ ok: false, error: "pass-not-allowed" });
    });

    it("rejects a pass after the game is over", () => {
        const game = unwrap(playMove(gameFromPosition(topRows("XO......"), BLACK), "c1"));
        expect(playPass(game)).toEqual({ ok: false, error: "not-playing" });
    });

    it("plays on to the end after a pass", () => {
        let game = unwrap(playMove(gameFromPosition(PASS_POSITION, BLACK), "c1"));
        game = unwrap(playPass(game));
        game = unwrap(playMove(game, "c3"));
        expect(game.status).toBe("finished");
        expect(game.outcome).toBe("black");
        expect(game.moves.map((m) => (m.kind === "move" ? m.square : "pass"))).toEqual([
            "c1",
            "pass",
            "c3",
        ]);
    });
});

describe("game over", () => {
    it("ends at once when neither side can move, with no passes", () => {
        const game = unwrap(playMove(gameFromPosition(topRows("XO......"), BLACK), "c1"));
        expect(game.status).toBe("finished");
        expect(game.outcome).toBe("black");
        expect(mustPass(game)).toBe(false);
        expect(game.moves).toHaveLength(1);
    });

    it("gives the win to white when white has more discs", () => {
        const game = unwrap(playMove(gameFromPosition(topRows("OX......"), WHITE), "c1"));
        expect(game.outcome).toBe("white");
    });

    it("is a draw when the counts are equal", () => {
        // After c1, black has a1 b1 c1 and white has g8 h7 h8; nobody can move.
        const board = topRows("XO......", "........", "........", "........", "........", "........",
            ".......O", "......OO");
        const game = unwrap(playMove(gameFromPosition(board, BLACK), "c1"));
        expect(game.status).toBe("finished");
        expect(countDiscs(game.board)).toEqual({ black: 3, white: 3 });
        expect(game.outcome).toBe("draw");
    });

    it("plays a full random-free game to the end using the first legal move", () => {
        let game = newGame();
        for (let ply = 0; ply < 200 && game.status === "playing"; ply++) {
            game = mustPass(game) ? unwrap(playPass(game)) : unwrap(playMove(game, firstMove(game)));
        }
        expect(game.status).toBe("finished");
        const { black, white } = countDiscs(game.board);
        expect(black + white).toBeLessThanOrEqual(64);
        expect(game.outcome).not.toBeNull();
    });
});

describe("gameFromPosition", () => {
    it("finishes at once when neither side can move", () => {
        const game = gameFromPosition(topRows("XX......"), BLACK);
        expect(game.status).toBe("finished");
        expect(game.outcome).toBe("black");
    });
});

function firstMove(game: GameState): string {
    for (const file of "abcdefgh") {
        for (const rank of "12345678") {
            const square = file + rank;
            if (playMove(game, square).ok) return square;
        }
    }
    throw new Error("no legal move");
}
