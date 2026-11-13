import { describe, expect, it } from "vitest";
import {
    BLACK,
    WHITE,
    countDiscs,
    indexToSquare,
    initialBoard,
    squareToIndex,
} from "../../src/core/board";
import { boardOf } from "../helpers/board";
import { applyMove, flipsFor, hasLegalMove, legalMoves } from "../../src/core/rules";

const at = (square: string): number => squareToIndex(square)!;
const squares = (indexes: readonly number[]): string[] => indexes.map(indexToSquare);


describe("flipsFor", () => {
    it("flips d4 when black plays d3 on the initial board", () => {
        expect(squares(flipsFor(initialBoard(), at("d3"), BLACK))).toEqual(["d4"]);
    });

    it("returns nothing for an occupied square", () => {
        expect(flipsFor(initialBoard(), at("d4"), BLACK)).toEqual([]);
    });

    it("returns nothing for a square that flips no disc", () => {
        expect(flipsFor(initialBoard(), at("a1"), BLACK)).toEqual([]);
        expect(flipsFor(initialBoard(), at("c3"), BLACK)).toEqual([]);
    });

    it("flips in all eight directions at once", () => {
        const board = boardOf([
            "X..X..X.",
            ".O.O.O..",
            "..OOO...",
            "XOO.OOX.",
            "..OOO...",
            ".O.O.O..",
            "X..X..X.",
            "........",
        ]);
        expect(flipsFor(board, at("d4"), BLACK)).toHaveLength(16);
    });

    it("does not wrap around the edge of the board", () => {
        // h1 is white and a2 is black: they are next to each other in the array, not on the board.
        const board = boardOf([
            ".......O",
            "XO......",
            "........",
            "........",
            "........",
            "........",
            "........",
            "........",
        ]);
        expect(flipsFor(board, at("g1"), BLACK)).toEqual([]);
    });

    it("needs a disc of its own color at the end of the line", () => {
        const board = boardOf([
            "OOOOOOO.",
            "........",
            "........",
            "........",
            "........",
            "........",
            "........",
            "........",
        ]);
        expect(flipsFor(board, at("h1"), BLACK)).toEqual([]);
    });
});

describe("legalMoves", () => {
    it("gives black d3, c4, f5, e6 on the initial board, in index order", () => {
        expect(squares(legalMoves(initialBoard(), BLACK))).toEqual(["d3", "c4", "f5", "e6"]);
    });

    it("gives white e3, f4, c5, d6 on the initial board", () => {
        expect(squares(legalMoves(initialBoard(), WHITE))).toEqual(["e3", "f4", "c5", "d6"]);
    });

    it("is empty when the color has no move", () => {
        const board = boardOf([
            "XXXXXXXX",
            "XXXXXXXX",
            "XXXXXXXX",
            "XXXXXXXX",
            "XXXXXXXX",
            "XXXXXXXX",
            "XXXXXXXX",
            "XXXXXXX.",
        ]);
        expect(legalMoves(board, BLACK)).toEqual([]);
        expect(hasLegalMove(board, BLACK)).toBe(false);
        expect(hasLegalMove(board, WHITE)).toBe(false);
    });
});

describe("applyMove", () => {
    it("places the disc and flips, without changing the original board", () => {
        const before = initialBoard();
        const after = applyMove(before, at("f5"), BLACK)!;
        expect(after[at("f5")]).toBe(BLACK);
        expect(after[at("e5")]).toBe(BLACK);
        expect(countDiscs(after)).toEqual({ black: 4, white: 1 });
        expect(countDiscs(before)).toEqual({ black: 2, white: 2 });
    });

    it("returns null for an illegal move", () => {
        expect(applyMove(initialBoard(), at("a1"), BLACK)).toBeNull();
        expect(applyMove(initialBoard(), at("d4"), BLACK)).toBeNull();
    });
});
