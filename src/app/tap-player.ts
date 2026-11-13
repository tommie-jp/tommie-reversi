// A person who plays by tapping squares on the screen.
// With `confirm`, the first tap only marks the square; tapping it again sends the move
// (there is no take-back yet, so a move can be checked before it goes to the CPU).

import type { Color } from "../core/board";
import { mustPass, playMove, type GameError, type GameState, type Move } from "../core/game";
import type { MatchResult } from "../core/match";
import type { Player, PlayerMove } from "../core/player";

export type TapResult = "ok" | "pending" | "not-your-turn" | GameError;

export interface TapPlayerOptions {
    readonly confirm?: boolean;
    /** Called when the player starts or stops waiting, or the marked square changes. */
    readonly onChange?: () => void;
}

interface Pending {
    readonly state: GameState;
    readonly resolve: (move: PlayerMove) => void;
}

export class TapPlayer implements Player {
    private pending: Pending | null = null;
    private marked: string | null = null;

    constructor(
        readonly name: string,
        private readonly options: TapPlayerOptions = {},
    ) {}

    get waiting(): boolean {
        return this.pending !== null;
    }

    /** The square tapped once and waiting for the second tap (with `confirm`). */
    get pendingSquare(): string | null {
        return this.marked;
    }

    async start(_color: Color): Promise<void> {}

    requestMove(state: GameState): Promise<PlayerMove> {
        return new Promise((resolve) => {
            this.pending = { state, resolve };
            this.marked = null;
            this.options.onChange?.();
        });
    }

    tap(square: string): TapResult {
        const pending = this.pending;
        if (pending === null) return "not-your-turn";
        const checked = playMove(pending.state, square);
        if (!checked.ok) return checked.error;
        if (this.options.confirm && this.marked !== square) {
            this.marked = square;
            this.options.onChange?.();
            return "pending";
        }
        this.settle({ kind: "move", square });
        return "ok";
    }

    pass(): TapResult {
        const pending = this.pending;
        if (pending === null) return "not-your-turn";
        if (!mustPass(pending.state)) return "pass-not-allowed";
        this.settle({ kind: "pass" });
        return "ok";
    }

    /** Forgets the move request (the game was stopped). */
    cancel(): void {
        this.pending = null;
        this.marked = null;
    }

    async opponentMoved(_move: Move, _state: GameState): Promise<void> {}

    async finish(_result: MatchResult): Promise<void> {
        this.cancel();
        this.options.onChange?.();
    }

    private settle(move: PlayerMove): void {
        const pending = this.pending!;
        this.pending = null;
        this.marked = null;
        pending.resolve(move);
        this.options.onChange?.();
    }
}
