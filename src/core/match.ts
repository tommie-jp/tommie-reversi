// Runs one game between two players: asks the side to move for a move, checks it,
// tells the other side, and stops on the first rule violation.
// The clock and the display listen to the events; the match itself knows neither.

import { BLACK, WHITE, opponent, type Color } from "./board";
import {
    newGame,
    playMove,
    playPass,
    type GameError,
    type GameState,
    type Move,
    type Outcome,
} from "./game";
import type { Player, PlayerMove } from "./player";
import type { Result } from "./result";

export type MatchEvent =
    | { readonly type: "started"; readonly state: GameState }
    | { readonly type: "moved"; readonly move: Move; readonly state: GameState }
    | {
          readonly type: "violation";
          readonly color: Color;
          readonly attempted: PlayerMove;
          readonly error: GameError;
      }
    | { readonly type: "finished"; readonly state: GameState; readonly result: MatchResult };

export type MatchResult =
    | { readonly reason: "normal"; readonly outcome: Outcome }
    | {
          readonly reason: "violation";
          readonly by: Color;
          readonly attempted: PlayerMove;
          readonly error: GameError;
      }
    | { readonly reason: "resign"; readonly by: Color }
    | { readonly reason: "aborted"; readonly detail: string };

/**
 * The part of `AbortSignal` that the match uses. Core has no DOM or Node types,
 * so it names the shape itself; a real `AbortSignal` fits it.
 */
export interface StopSignal {
    readonly aborted: boolean;
    readonly reason?: unknown;
    addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
    removeEventListener(type: "abort", listener: () => void): void;
}

export interface MatchOptions {
    readonly black: Player;
    readonly white: Player;
    readonly onEvent: (event: MatchEvent) => void;
    /** Aborting stops the match, even while a player is thinking. */
    readonly signal?: StopSignal;
}

export async function runMatch(options: MatchOptions): Promise<MatchResult> {
    // Kept up to date move by move, so an aborted game still reports where it stopped.
    const progress = { state: newGame() };
    let result: MatchResult;
    try {
        await Promise.all([options.black.start(BLACK), options.white.start(WHITE)]);
        options.onEvent({ type: "started", state: progress.state });
        result = await playUntilEnd(progress, options);
    } catch (error) {
        result = { reason: "aborted", detail: describe(error) };
    }
    await Promise.allSettled([options.black.finish(result), options.white.finish(result)]);
    options.onEvent({ type: "finished", state: progress.state, result });
    return result;
}

async function playUntilEnd(progress: { state: GameState }, options: MatchOptions): Promise<MatchResult> {
    const playerOf = (color: Color): Player => (color === BLACK ? options.black : options.white);
    while (progress.state.status === "playing") {
        const state = progress.state;
        const color = state.turn;
        const attempted = await abortable(playerOf(color).requestMove(state), options.signal);
        if (attempted.kind === "resign") return { reason: "resign", by: color };
        const next = apply(state, attempted);
        if (!next.ok) {
            options.onEvent({ type: "violation", color, attempted, error: next.error });
            return { reason: "violation", by: color, attempted, error: next.error };
        }
        progress.state = next.value;
        const move = next.value.moves.at(-1)!;
        options.onEvent({ type: "moved", move, state: next.value });
        await abortable(playerOf(opponent(color)).opponentMoved(move, next.value), options.signal);
    }
    return { reason: "normal", outcome: progress.state.outcome! };
}

function apply(state: GameState, attempted: Exclude<PlayerMove, { kind: "resign" }>): Result<GameState, GameError> {
    return attempted.kind === "pass" ? playPass(state) : playMove(state, attempted.square);
}

function abortable<T>(promise: Promise<T>, signal: StopSignal | undefined): Promise<T> {
    if (signal === undefined) return promise;
    if (signal.aborted) return Promise.reject(new AbortedError(signal.reason));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new AbortedError(signal.reason));
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

class AbortedError extends Error {
    constructor(reason: unknown) {
        super(typeof reason === "string" ? reason : "aborted");
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
