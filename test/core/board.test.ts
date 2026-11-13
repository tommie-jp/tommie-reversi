import { describe, expect, it } from "vitest";
import {
    BLACK,
    WHITE,
    boardFromBO,
    boardToBO,
    countDiscs,
    indexToSquare,
    initialBoard,
    opponent,
    squareToIndex,
} from "../../src/core/board";

const INITIAL_BO = "0000000000000000000000000002100000012000000000000000000000000000";

describe("initialBoard", () => {
    it("places d4=white, e4=black, d5=black, e5=white and leaves the rest empty", () => {
        const board = initialBoard();
        expect(board).toHaveLength(64);
        expect(board[squareToIndex("d4")!]).toBe(WHITE);
        expect(board[squareToIndex("e4")!]).toBe(BLACK);
        expect(board[squareToIndex("d5")!]).toBe(BLACK);
        expect(board[squareToIndex("e5")!]).toBe(WHITE);
        expect(board.filter((cell) => cell === 0)).toHaveLength(60);
    });

    it("returns a new board each time", () => {
        expect(initialBoard()).not.toBe(initialBoard());
    });
});

describe("opponent", () => {
    it("swaps black and white", () => {
        expect(opponent(BLACK)).toBe(WHITE);
        expect(opponent(WHITE)).toBe(BLACK);
    });
});

describe("squareToIndex / indexToSquare", () => {
    it.each([
        ["a1", 0],
        ["h1", 7],
        ["a2", 8],
        ["f5", 37],
        ["a8", 56],
        ["h8", 63],
    ])("maps %s to %i and back", (square, index) => {
        expect(squareToIndex(square)).toBe(index);
        expect(indexToSquare(index)).toBe(square);
    });

    it.each(["", "a", "a10", "i1", "a0", "a9", "D3", "3d", " d3", "d3 "])(
        "rejects %j",
        (text) => {
            expect(squareToIndex(text)).toBeNull();
        },
    );

    it.each([-1, 64, 1.5])("throws for index %d", (index) => {
        expect(() => indexToSquare(index)).toThrow();
    });
});

describe("countDiscs", () => {
    it("counts two of each on the initial board", () => {
        expect(countDiscs(initialBoard())).toEqual({ black: 2, white: 2 });
    });
});

describe("boardToBO / boardFromBO", () => {
    it("writes the initial board as the RUP BO string", () => {
        expect(boardToBO(initialBoard())).toBe(INITIAL_BO);
    });

    it("round-trips the initial board", () => {
        expect(boardFromBO(INITIAL_BO)).toEqual(initialBoard());
    });

    it("reads a custom position", () => {
        const text = "1" + "0".repeat(62) + "2";
        const board = boardFromBO(text)!;
        expect(board[0]).toBe(BLACK);
        expect(board[63]).toBe(WHITE);
        expect(countDiscs(board)).toEqual({ black: 1, white: 1 });
    });

    it.each(["", "0".repeat(63), "0".repeat(65)])("rejects length %#", (text) => {
        expect(boardFromBO(text)).toBeNull();
    });

    it.each(["3", "x", " ", "-"])("rejects the character %j", (ch) => {
        expect(boardFromBO(ch + "0".repeat(63))).toBeNull();
    });
});
