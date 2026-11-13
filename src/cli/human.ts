// A person at the keyboard. The typing itself is handled by Interaction.

import type { Color } from "../core/board";
import { mustPass, type GameState, type Move } from "../core/game";
import type { MatchResult } from "../core/match";
import type { Player, PlayerMove } from "../core/player";
import { colorName } from "../view/terminal/render";
import type { Interaction } from "./interaction";

export class HumanPlayer implements Player {
    constructor(
        readonly name: string,
        private readonly interaction: Interaction,
        /** Milliseconds left on the clock for the side to move. */
        private readonly timeLeftMs: () => number,
        /** Say "(you)" in the prompt, for games against a CPU. */
        private readonly sayYou: boolean,
    ) {}

    async start(_color: Color): Promise<void> {}

    requestMove(state: GameState): Promise<PlayerMove> {
        const seconds = Math.ceil(this.timeLeftMs() / 1000);
        const who = `${colorName(state.turn)}${this.sayYou ? " (you)" : ""}`;
        const prompt = mustPass(state)
            ? `${who} has no legal move. Type "pass" or press Enter. (${seconds}s) > `
            : `${who} to move. (${seconds}s) > `;
        return this.interaction.requestMove(state, prompt);
    }

    async opponentMoved(_move: Move, _state: GameState): Promise<void> {}

    async finish(_result: MatchResult): Promise<void> {
        this.interaction.cancel();
    }
}
