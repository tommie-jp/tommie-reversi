import type { Color } from "../../src/core/board";
import type { GameState, Move } from "../../src/core/game";
import type { MatchResult } from "../../src/core/match";
import type { Player, PlayerMove } from "../../src/core/player";

/** A player that plays the given moves in order and records what it was told. */
export class ScriptedPlayer implements Player {
    readonly calls: string[] = [];
    color: Color | null = null;
    result: MatchResult | null = null;
    private readonly script: PlayerMove[];

    constructor(readonly name: string, script: readonly PlayerMove[]) {
        this.script = [...script];
    }

    async start(color: Color): Promise<void> {
        this.color = color;
        this.calls.push(`start:${color}`);
    }

    async requestMove(_state: GameState): Promise<PlayerMove> {
        const move = this.script.shift();
        if (move === undefined) throw new Error(`${this.name} has no more moves`);
        this.calls.push(`move:${move.kind === "move" ? move.square : move.kind}`);
        return move;
    }

    async opponentMoved(move: Move, _state: GameState): Promise<void> {
        this.calls.push(`opponent:${move.kind === "move" ? move.square : "pass"}`);
    }

    async finish(result: MatchResult): Promise<void> {
        this.result = result;
        this.calls.push(`finish:${result.reason}`);
    }
}

export const move = (square: string): PlayerMove => ({ kind: "move", square });
export const PASS: PlayerMove = { kind: "pass" };
export const RESIGN: PlayerMove = { kind: "resign" };
