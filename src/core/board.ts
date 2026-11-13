// Board and coordinates.
//
// The board is 64 cells in row-major order: index = row * 8 + column,
// so a1 = 0, h1 = 7, a8 = 56, h8 = 63. This is the same order as the RUP `BO` line.

/** 1 = black, 2 = white (the same digits as the RUP `BO` line). */
export type Color = 1 | 2;
/** 0 = empty. */
export type Cell = 0 | Color;
/** Always 64 cells. Never mutated: every change makes a new board. */
export type Board = readonly Cell[];

export const BLACK: Color = 1;
export const WHITE: Color = 2;
export const BOARD_SIZE = 8;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const BO_PATTERN = /^[012]{64}$/;

export function initialBoard(): Board {
    const cells: Cell[] = new Array<Cell>(CELL_COUNT).fill(0);
    cells[27] = WHITE; // d4
    cells[28] = BLACK; // e4
    cells[35] = BLACK; // d5
    cells[36] = WHITE; // e5
    return cells;
}

export function opponent(color: Color): Color {
    return color === BLACK ? WHITE : BLACK;
}

/** "f5" → 37. Lowercase only, as in RUP. Returns null for anything else. */
export function squareToIndex(square: string): number | null {
    if (!SQUARE_PATTERN.test(square)) return null;
    const column = square.charCodeAt(0) - "a".charCodeAt(0);
    const row = square.charCodeAt(1) - "1".charCodeAt(0);
    return row * BOARD_SIZE + column;
}

/** 37 → "f5". Throws for an index outside the board (a programming error). */
export function indexToSquare(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
        throw new RangeError(`square index out of range: ${index}`);
    }
    const column = String.fromCharCode("a".charCodeAt(0) + (index % BOARD_SIZE));
    const row = String(Math.floor(index / BOARD_SIZE) + 1);
    return column + row;
}

export function countDiscs(board: Board): { readonly black: number; readonly white: number } {
    let black = 0;
    let white = 0;
    for (const cell of board) {
        if (cell === BLACK) black++;
        else if (cell === WHITE) white++;
    }
    return { black, white };
}

/** The 64-character RUP `BO` string: 0 = empty, 1 = black, 2 = white. */
export function boardToBO(board: Board): string {
    return board.join("");
}

/** Reads a 64-character `BO` string. Returns null if the length or a character is wrong. */
export function boardFromBO(text: string): Board | null {
    if (!BO_PATTERN.test(text)) return null;
    return Array.from(text, (ch) => Number(ch) as Cell);
}
