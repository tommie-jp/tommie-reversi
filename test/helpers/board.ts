import { boardFromBO, type Board } from "../../src/core/board";

/** Builds a board from 8 rows of 8 characters: . = empty, X = black, O = white. */
export function boardOf(rows: readonly string[]): Board {
    const text = rows.join("").replace(/\./g, "0").replace(/X/g, "1").replace(/O/g, "2");
    const board = boardFromBO(text);
    if (board === null) throw new Error(`bad test board: ${rows.join("/")}`);
    return board;
}

export const EMPTY_ROW = "........";

/** A board whose first rows are given and the rest are empty. */
export function topRows(...rows: string[]): Board {
    return boardOf([...rows, ...Array<string>(8 - rows.length).fill(EMPTY_ROW)]);
}
