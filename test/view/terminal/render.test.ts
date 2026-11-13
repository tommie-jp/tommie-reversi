import { describe, expect, it } from "vitest";
import { BLACK, WHITE } from "../../../src/core/board";
import { newGame, playMove, type GameState } from "../../../src/core/game";
import {
    describeGameError,
    renderBoard,
    renderResult,
    renderStatus,
    stripAnsi,
} from "../../../src/view/terminal/render";

function after(...squares: string[]): GameState {
    let game = newGame();
    for (const square of squares) {
        const result = playMove(game, square);
        if (!result.ok) throw new Error(result.error);
        game = result.value;
    }
    return game;
}

const PLAIN = { hints: false, color: false } as const;

describe("renderBoard", () => {
    it("draws the initial board with hints for black", () => {
        expect(renderBoard(newGame(), { hints: true, color: false })).toBe(
            [
                "    a b c d e f g h",
                "  1 . . . . . . . .",
                "  2 . . . . . . . .",
                "  3 . . . * . . . .",
                "  4 . . * O X . . .",
                "  5 . . . X O * . .",
                "  6 . . . . * . . .",
                "  7 . . . . . . . .",
                "  8 . . . . . . . .",
            ].join("\n"),
        );
    });

    it("draws the initial board without hints", () => {
        expect(renderBoard(newGame(), PLAIN)).not.toContain("*");
    });

    it("puts brackets round the last move", () => {
        const lines = renderBoard(after("f5"), PLAIN).split("\n");
        expect(lines[5]).toBe("  5 . . . X X[X]. .");
    });

    it("closes the bracket after the h file", () => {
        // c4 by black, then white plays... use a game whose last move is on the h file
        const lines = renderBoard({ ...newGame(), lastSquare: "h8" }, PLAIN).split("\n");
        expect(lines[8]).toBe("  8 . . . . . . .[.]");
    });

    it("adds colors that do not change the text", () => {
        const colored = renderBoard(after("f5"), { hints: true, color: true });
        expect(colored).toContain("\u001b[");
        expect(stripAnsi(colored)).toBe(renderBoard(after("f5"), { hints: true, color: false }));
    });
});

describe("renderStatus", () => {
    it("shows counts, time left with a mark on the side to move, and the last move", () => {
        const game = after("f5");
        expect(renderStatus(game, { black: 60_000, white: 59_200 })).toBe(
            "  Black X  4  60s   White O  1 *60s   Move 1: f5 (Black)",
        );
    });

    it("shows move 0 before the first move", () => {
        expect(renderStatus(newGame(), { black: 5_000, white: 60_000 })).toBe(
            "  Black X  2 * 5s   White O  2  60s   Move 0",
        );
    });

    it("rounds the seconds up so that 0s means the time is really out", () => {
        expect(renderStatus(newGame(), { black: 100, white: 60_000 })).toContain("* 1s");
        expect(renderStatus(newGame(), { black: 0, white: 60_000 })).toContain("* 0s");
    });
});

describe("renderResult", () => {
    it("reports a normal end", () => {
        const game = { ...after("f5"), status: "finished" as const, outcome: "black" as const };
        expect(renderResult(game, { reason: "normal", outcome: "black" })).toBe(
            "Game over: Black 4 - White 1. Black wins.",
        );
    });

    it("reports a draw", () => {
        expect(renderResult(newGame(), { reason: "normal", outcome: "draw" })).toBe(
            "Game over: Black 2 - White 2. Draw.",
        );
    });

    it("reports a rule violation", () => {
        expect(
            renderResult(newGame(), {
                reason: "violation",
                by: WHITE,
                attempted: { kind: "move", square: "c3" },
                error: "no-flips",
            }),
        ).toBe("RULE VIOLATION by White: c3 (c3 does not flip any disc). Game stopped.");
    });

    it("reports a resignation and an abort", () => {
        expect(renderResult(newGame(), { reason: "resign", by: BLACK })).toBe("Black resigned. White wins.");
        expect(renderResult(newGame(), { reason: "aborted", detail: "quit" })).toBe("Game stopped: quit.");
    });
});

describe("describeGameError", () => {
    it.each([
        ["no-flips", "e6 does not flip any disc"],
        ["occupied", "e6 is already taken"],
        ["bad-square", "e6 is not a square"],
        ["must-pass", "no legal move: you have to pass"],
        ["pass-not-allowed", "you have a legal move, so you cannot pass"],
        ["not-playing", "the game is over"],
    ] as const)("explains %s", (error, text) => {
        expect(describeGameError(error, "e6")).toBe(text);
    });
});
