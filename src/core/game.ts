// One game: whose turn it is, playing a move, passing, and the end of the game.
//
// Passing is never automatic. When the side to move has no legal move, the turn still
// goes to them and they must pass, the same way RUP sends `PA`. When neither side can
// move, the game ends at once.

import {
    BLACK,
    countDiscs,
    initialBoard,
    opponent,
    squareToIndex,
    type Board,
    type Color,
} from "./board";
import { err, ok, type Result } from "./result";
import { applyMove, hasLegalMove } from "./rules";

export type Move =
    | { readonly kind: "move"; readonly color: Color; readonly square: string }
    | { readonly kind: "pass"; readonly color: Color };

export type Outcome = "black" | "white" | "draw";

export interface GameState {
    readonly board: Board;
    readonly turn: Color;
    readonly status: "playing" | "finished";
    /** Every move in order, passes included. */
    readonly moves: readonly Move[];
    /** The last square a disc was placed on (passes do not change it). */
    readonly lastSquare: string | null;
    /** Set when the game is finished. */
    readonly outcome: Outcome | null;
}

export type GameError =
    | "not-playing"
    | "bad-square"
    | "occupied"
    | "no-flips"
    | "must-pass"
    | "pass-not-allowed";

export function newGame(): GameState {
    return gameFromPosition(initialBoard(), BLACK);
}

/** A game that starts from any position. Finished at once if neither side can move. */
export function gameFromPosition(board: Board, turn: Color): GameState {
    return settle({ board, turn, status: "playing", moves: [], lastSquare: null, outcome: null });
}

export function mustPass(state: GameState): boolean {
    return state.status === "playing" && !hasLegalMove(state.board, state.turn);
}

export function playMove(state: GameState, square: string): Result<GameState, GameError> {
    if (state.status !== "playing") return err("not-playing");
    const index = squareToIndex(square);
    if (index === null) return err("bad-square");
    if (mustPass(state)) return err("must-pass");
    if (state.board[index] !== 0) return err("occupied");
    const board = applyMove(state.board, index, state.turn);
    if (board === null) return err("no-flips");
    return ok(settle({
        ...state,
        board,
        turn: opponent(state.turn),
        moves: [...state.moves, { kind: "move", color: state.turn, square }],
        lastSquare: square,
    }));
}

export function playPass(state: GameState): Result<GameState, GameError> {
    if (state.status !== "playing") return err("not-playing");
    if (!mustPass(state)) return err("pass-not-allowed");
    return ok({
        ...state,
        turn: opponent(state.turn),
        moves: [...state.moves, { kind: "pass", color: state.turn }],
    });
}

/** Ends the game when neither side has a legal move. */
function settle(state: GameState): GameState {
    if (hasLegalMove(state.board, state.turn) || hasLegalMove(state.board, opponent(state.turn))) {
        return state;
    }
    return { ...state, status: "finished", outcome: outcomeOf(state.board) };
}

function outcomeOf(board: Board): Outcome {
    const { black, white } = countDiscs(board);
    if (black > white) return "black";
    if (white > black) return "white";
    return "draw";
}
