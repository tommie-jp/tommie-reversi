// Move rules: which squares are legal and which discs a move flips.

import { BOARD_SIZE, CELL_COUNT, opponent, type Board, type Cell, type Color } from "./board";

const DIRECTIONS: readonly (readonly [number, number])[] = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
];

function inside(row: number, column: number): boolean {
    return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
}

function flipsInDirection(
    board: Board, row: number, column: number, [dr, dc]: readonly [number, number], color: Color,
): number[] {
    const other = opponent(color);
    const line: number[] = [];
    let r = row + dr;
    let c = column + dc;
    while (inside(r, c) && board[r * BOARD_SIZE + c] === other) {
        line.push(r * BOARD_SIZE + c);
        r += dr;
        c += dc;
    }
    const closed = inside(r, c) && board[r * BOARD_SIZE + c] === color;
    return closed ? line : [];
}

/** The discs that `color` would flip by playing at `index`. Empty if the move is illegal. */
export function flipsFor(board: Board, index: number, color: Color): readonly number[] {
    if (board[index] !== 0) return [];
    const row = Math.floor(index / BOARD_SIZE);
    const column = index % BOARD_SIZE;
    return DIRECTIONS.flatMap((direction) => flipsInDirection(board, row, column, direction, color));
}

/** Legal squares for `color`, in index order (a1, b1, ... h8). */
export function legalMoves(board: Board, color: Color): readonly number[] {
    const moves: number[] = [];
    for (let index = 0; index < CELL_COUNT; index++) {
        if (flipsFor(board, index, color).length > 0) moves.push(index);
    }
    return moves;
}

export function hasLegalMove(board: Board, color: Color): boolean {
    for (let index = 0; index < CELL_COUNT; index++) {
        if (flipsFor(board, index, color).length > 0) return true;
    }
    return false;
}

/** A new board after `color` plays at `index`, or null if the move is illegal. */
export function applyMove(board: Board, index: number, color: Color): Board | null {
    const flips = flipsFor(board, index, color);
    if (flips.length === 0) return null;
    const next: Cell[] = [...board];
    next[index] = color;
    for (const flipped of flips) next[flipped] = color;
    return next;
}
