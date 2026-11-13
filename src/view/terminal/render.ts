// Text view of the game for the terminal. Every function returns a string;
// writing it to the screen is the caller's job.

import { BLACK, countDiscs, squareToIndex, type Cell, type Color } from "../../core/board";
import type { GameError, GameState } from "../../core/game";
import type { MatchResult } from "../../core/match";
import { legalMoves } from "../../core/rules";

export interface RenderOptions {
    /** Mark the legal squares of the side to move with `*`. */
    readonly hints: boolean;
    readonly color: boolean;
}

export interface TimeLeft {
    readonly black: number;
    readonly white: number;
}

const FILES = "abcdefgh";
const SYMBOL: Record<Cell, string> = { 0: ".", 1: "X", 2: "O" };
const HINT = "*";

const ANSI = {
    black: "\u001b[30;47m",
    white: "\u001b[1;97m",
    hint: "\u001b[32m",
    last: "\u001b[33m",
    reset: "\u001b[0m",
} as const;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function colorName(color: Color): string {
    return color === BLACK ? "Black" : "White";
}

export function stripAnsi(text: string): string {
    return text.replace(ANSI_PATTERN, "");
}

export function renderBoard(state: GameState, options: RenderOptions): string {
    const hints = new Set(
        options.hints && state.status === "playing" ? legalMoves(state.board, state.turn) : [],
    );
    const last = state.lastSquare === null ? -1 : (squareToIndex(state.lastSquare) ?? -1);
    const paint = (code: string, text: string) => (options.color ? code + text + ANSI.reset : text);
    const lines = ["    " + FILES.split("").join(" ")];
    for (let row = 0; row < 8; row++) {
        let line = `  ${row + 1}`;
        for (let column = 0; column < 8; column++) {
            const index = row * 8 + column;
            line += separator(index, last, paint) + symbol(state.board[index]!, hints.has(index), paint);
        }
        if (last === row * 8 + 7) line += paint(ANSI.last, "]");
        lines.push(line);
    }
    return lines.join("\n");
}

function separator(index: number, last: number, paint: (code: string, text: string) => string): string {
    if (index === last) return paint(ANSI.last, "[");
    if (index === last + 1 && index % 8 !== 0) return paint(ANSI.last, "]");
    return " ";
}

function symbol(cell: Cell, isHint: boolean, paint: (code: string, text: string) => string): string {
    if (cell === 1) return paint(ANSI.black, SYMBOL[1]);
    if (cell === 2) return paint(ANSI.white, SYMBOL[2]);
    return isHint ? paint(ANSI.hint, HINT) : SYMBOL[0];
}

export function renderStatus(state: GameState, timeLeft: TimeLeft, color: boolean): string {
    const { black, white } = countDiscs(state.board);
    const running = state.status === "playing" ? state.turn : null;
    const side = (c: Color, count: number, ms: number) =>
        `${colorName(c)} ${c === BLACK ? "X" : "O"} ${String(count).padStart(2)} ` +
        `${running === c ? "*" : " "}${String(Math.ceil(ms / 1000)).padStart(2)}s`;
    const text = `  ${side(1, black, timeLeft.black)}   ${side(2, white, timeLeft.white)}   ${lastMoveText(state)}`;
    return color ? text : stripAnsi(text);
}

function lastMoveText(state: GameState): string {
    const placed = state.moves.filter((move) => move.kind === "move");
    const last = placed.at(-1);
    if (last === undefined || last.kind !== "move") return "Move 0";
    return `Move ${placed.length}: ${last.square} (${colorName(last.color)})`;
}

export function renderResult(state: GameState, result: MatchResult): string {
    const { black, white } = countDiscs(state.board);
    switch (result.reason) {
        case "normal": {
            const winner = result.outcome === "draw" ? "Draw" : `${result.outcome === "black" ? "Black" : "White"} wins`;
            return `Game over: Black ${black} - White ${white}. ${winner}.`;
        }
        case "violation": {
            const tried = result.attempted.kind === "move" ? result.attempted.square : result.attempted.kind;
            return `RULE VIOLATION by ${colorName(result.by)}: ${tried} (${describeGameError(result.error, tried)}). Game stopped.`;
        }
        case "resign":
            return `${colorName(result.by)} resigned. ${colorName(result.by === BLACK ? 2 : 1)} wins.`;
        case "aborted":
            return `Game stopped: ${result.detail}.`;
    }
}

export function describeGameError(error: GameError, square: string): string {
    switch (error) {
        case "no-flips":
            return `${square} does not flip any disc`;
        case "occupied":
            return `${square} is already taken`;
        case "bad-square":
            return `${square} is not a square`;
        case "must-pass":
            return "no legal move: you have to pass";
        case "pass-not-allowed":
            return "you have a legal move, so you cannot pass";
        case "not-playing":
            return "the game is over";
    }
}
