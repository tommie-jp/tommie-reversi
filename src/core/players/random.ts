import { indexToSquare, type Color } from "../board";
import { mustPass, type GameState, type Move } from "../game";
import type { MatchResult } from "../match";
import type { Player, PlayerMove } from "../player";
import { legalMoves } from "../rules";

/** Plays a random legal move, or passes when it has none. */
export class RandomPlayer implements Player {
    constructor(
        readonly name: string,
        private readonly random: () => number,
    ) {}

    async start(_color: Color): Promise<void> {}

    async requestMove(state: GameState): Promise<PlayerMove> {
        if (mustPass(state)) return { kind: "pass" };
        const moves = legalMoves(state.board, state.turn);
        const index = moves[Math.floor(this.random() * moves.length)]!;
        return { kind: "move", square: indexToSquare(index) };
    }

    async opponentMoved(_move: Move, _state: GameState): Promise<void> {}

    async finish(_result: MatchResult): Promise<void> {}
}
