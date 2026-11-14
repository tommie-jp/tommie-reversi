// Who sits on each side: two people at this screen, or a person and the connected CPU.

import { BLACK, WHITE, type Color } from "../core/board";
import type { Player } from "../core/player";
import type { Seats } from "./controller";
import { TapPlayer } from "./tap-player";

export type Opponent = "person" | "cpu";

export interface GameChoice {
    readonly opponent: Opponent;
    /** The CPU's color, when the opponent is the CPU. */
    readonly cpuColor: Color;
    /** The CPU's strategy (XS extension) to set before the game; absent leaves it to the CPU. */
    readonly cpuStrategy?: number;
}

export interface SeatOptions {
    /** The name shown for a person. */
    readonly person: string;
    /** The connected CPU, or null. */
    readonly cpu: Player | null;
    /** Tap twice before a move goes to the CPU (there is no take-back). */
    readonly confirm: boolean;
    readonly onChange: () => void;
}

/** The seats for the choice, or null when the CPU is chosen but not connected. */
export function buildSeats(choice: GameChoice, options: SeatOptions): Seats | null {
    if (choice.opponent === "person") {
        const person = () => new TapPlayer(options.person, { onChange: options.onChange });
        return { black: person(), white: person(), humans: [BLACK, WHITE] };
    }
    if (options.cpu === null) return null;
    const person = new TapPlayer(options.person, { confirm: options.confirm, onChange: options.onChange });
    return choice.cpuColor === BLACK
        ? { black: options.cpu, white: person, humans: [WHITE] }
        : { black: person, white: options.cpu, humans: [BLACK] };
}
