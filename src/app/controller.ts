// Runs one game at a time for the screen: starts and stops matches, keeps the clock,
// passes taps to the person whose turn it is, and reports a snapshot after each change.
// It does not touch the DOM, so the same controller can drive any view.

import { BLACK, WHITE, type Color } from "../core/board";
import { newClock, remainingMs, startTurn, stopClock, type ClockState } from "../core/clock";
import { mustPass, newGame, type GameError, type GameState } from "../core/game";
import { runMatch, type MatchEvent, type MatchResult } from "../core/match";
import type { Player } from "../core/player";
import { TapPlayer, type TapResult } from "./tap-player";

export interface Seats {
    readonly black: Player;
    readonly white: Player;
    /** Colors played by a person at this screen. */
    readonly humans: readonly Color[];
}

export type Notice = { readonly kind: "illegal"; readonly square: string; readonly error: GameError } | null;

export interface Snapshot {
    readonly state: GameState;
    readonly names: { readonly black: string; readonly white: string };
    readonly humans: readonly Color[];
    /** A person at this screen is asked for a move now. */
    readonly humanToMove: boolean;
    /** That person has no legal move and must pass. */
    readonly mustPass: boolean;
    /** The square tapped once, waiting for the second tap. */
    readonly markedSquare: string | null;
    readonly result: MatchResult | null;
    readonly notice: Notice;
}

export interface ControllerOptions {
    readonly onChange: (snapshot: Snapshot) => void;
    readonly now: () => number;
    readonly clockLimitMs: number;
}

export class GameController {
    private state: GameState = newGame();
    private seats: Seats | null = null;
    private clock: ClockState;
    private result: MatchResult | null = null;
    private notice: Notice = null;
    private controller: AbortController | null = null;

    constructor(private readonly options: ControllerOptions) {
        this.clock = newClock(options.clockLimitMs);
    }

    /** Starts a new game, stopping the one that is running. */
    start(seats: Seats): void {
        this.controller?.abort("stopped");
        const controller = new AbortController();
        this.controller = controller;
        this.seats = seats;
        this.state = newGame();
        this.result = null;
        this.notice = null;
        this.clock = stopClock(this.clock);
        void runMatch({
            black: seats.black,
            white: seats.white,
            onEvent: (event) => {
                if (this.controller === controller) this.onEvent(event);
            },
            signal: controller.signal,
        });
    }

    stop(): void {
        this.controller?.abort("stopped");
    }

    tap(square: string): TapResult {
        const player = this.playerToMove();
        if (player === null) return "not-your-turn";
        const result = player.tap(square);
        this.notice = isGameError(result) ? { kind: "illegal", square, error: result } : null;
        this.report();
        return result;
    }

    pass(): TapResult {
        const player = this.playerToMove();
        if (player === null) return "not-your-turn";
        const result = player.pass();
        this.notice = null;
        this.report();
        return result;
    }

    timeLeftMs(): { readonly black: number; readonly white: number } {
        const now = this.options.now();
        return { black: remainingMs(this.clock, BLACK, now), white: remainingMs(this.clock, WHITE, now) };
    }

    snapshot(): Snapshot {
        const player = this.playerToMove();
        return {
            state: this.state,
            names: { black: this.seats?.black.name ?? "", white: this.seats?.white.name ?? "" },
            humans: this.seats?.humans ?? [],
            humanToMove: player !== null,
            mustPass: player !== null && mustPass(this.state),
            markedSquare: player?.pendingSquare ?? null,
            result: this.result,
            notice: this.notice,
        };
    }

    private onEvent(event: MatchEvent): void {
        const now = this.options.now();
        switch (event.type) {
            case "started":
            case "moved":
                this.state = event.state;
                this.clock = event.state.status === "playing"
                    ? startTurn(this.clock, event.state.turn, now)
                    : stopClock(this.clock);
                break;
            case "violation":
                break;
            case "finished":
                this.state = event.state;
                this.result = event.result;
                this.clock = stopClock(this.clock);
                break;
        }
        // Let the next player's requestMove run before reporting, so the snapshot
        // already shows whether a person is asked to move.
        queueMicrotask(() => this.report());
    }

    /** The person at this screen who is asked for a move now, if any. */
    private playerToMove(): TapPlayer | null {
        if (this.seats === null || this.result !== null) return null;
        const player = this.state.turn === BLACK ? this.seats.black : this.seats.white;
        return player instanceof TapPlayer && player.waiting ? player : null;
    }

    private report(): void {
        this.options.onChange(this.snapshot());
    }
}

const GAME_ERRORS = new Set<TapResult>(["no-flips", "occupied", "bad-square", "must-pass", "pass-not-allowed", "not-playing"]);

function isGameError(result: TapResult): result is GameError {
    return GAME_ERRORS.has(result);
}
