// The board as 64 buttons in a grid, with file (a-h) and rank (1-8) labels.
// The buttons are made once and only their classes change between renders.

import { CELL_COUNT, indexToSquare, type Cell } from "../../core/board";
import { legalMoves } from "../../core/rules";
import type { Snapshot } from "../../app/controller";
import { el } from "./dom";

export interface BoardOptions {
    readonly hints: boolean;
}

const FILES = "abcdefgh";
const CELL_NAMES: Record<Cell, string> = { 0: "empty", 1: "black", 2: "white" };

export class BoardView {
    private readonly cells: HTMLButtonElement[] = [];

    constructor(root: HTMLElement, onTap: (square: string) => void) {
        const board = el("div", "board");
        board.setAttribute("role", "grid");
        board.setAttribute("aria-label", "Reversi board");
        board.append(el("span", "corner"));
        for (const file of FILES) board.append(el("span", "file-label", file));
        for (let row = 0; row < 8; row++) {
            board.append(el("span", "rank-label", String(row + 1)));
            for (let column = 0; column < 8; column++) {
                const square = indexToSquare(row * 8 + column);
                const cell = el("button", "cell");
                cell.type = "button";
                cell.dataset["square"] = square;
                cell.append(el("span", "disc"));
                cell.addEventListener("click", () => onTap(square));
                board.append(cell);
                this.cells.push(cell);
            }
        }
        root.append(board);
    }

    render(snapshot: Snapshot, options: BoardOptions): void {
        const { state } = snapshot;
        const showHints = options.hints && snapshot.humanToMove && state.status === "playing";
        const hints = new Set(showHints ? legalMoves(state.board, state.turn) : []);
        for (let index = 0; index < CELL_COUNT; index++) {
            const cell = this.cells[index]!;
            const square = cell.dataset["square"]!;
            const value = state.board[index]!;
            cell.classList.toggle("black", value === 1);
            cell.classList.toggle("white", value === 2);
            cell.classList.toggle("hint", hints.has(index));
            cell.classList.toggle("last", square === state.lastSquare);
            cell.classList.toggle("marked", square === snapshot.markedSquare);
            const label = `${square} ${CELL_NAMES[value]}${hints.has(index) ? ", legal" : ""}`;
            cell.setAttribute("aria-label", label);
        }
    }
}
