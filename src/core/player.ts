// A player sits on one side of the board: a person, a homebrew CPU over RUP,
// a random mover, and later a network opponent. The match only talks to this shape.

import type { Color } from "./board";
import type { GameState, Move } from "./game";
import type { MatchResult } from "./match";

export type PlayerMove =
    | { readonly kind: "move"; readonly square: string }
    | { readonly kind: "pass" }
    | { readonly kind: "resign" };

export interface Player {
    readonly name: string;
    /** The game starts and this player has `color`. */
    start(color: Color): Promise<void>;
    /** It is this player's turn. */
    requestMove(state: GameState): Promise<PlayerMove>;
    /** The other player made `move`; `state` is the game after it. */
    opponentMoved(move: Move, state: GameState): Promise<void>;
    /** The game is over, normally or not. */
    finish(result: MatchResult): Promise<void>;
}
