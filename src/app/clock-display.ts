// How the per-move clock looks, and when it should sound. Both are pure so they can be tested.

export type ClockLevel = "ok" | "caution" | "warning" | "danger";

export interface ClockFace {
    /** Whole seconds left, rounded up, so 0 means the time is really out. */
    readonly seconds: number;
    /** Part of the time left, from 1 (full) to 0. */
    readonly fraction: number;
    readonly level: ClockLevel;
}

/** Levels by the part of the time left: more than 1/2, 1/3, 1/6 (30, 20, 10 s of 60 s). */
export function clockFace(remainingMs: number, limitMs: number): ClockFace {
    const fraction = Math.max(0, Math.min(1, remainingMs / limitMs));
    const level: ClockLevel =
        fraction > 1 / 2 ? "ok" : fraction > 1 / 3 ? "caution" : fraction > 1 / 6 ? "warning" : "danger";
    return { seconds: Math.ceil(Math.max(0, remainingMs) / 1000), fraction, level };
}

export type ClockAlert = "warn" | "timeout";

/** Says once per turn when the time left reaches `warnAtMs`, and once when it reaches zero. */
export class ClockAlerts {
    private turn: string | null = null;
    private warned = false;
    private timedOut = false;

    constructor(private readonly warnAtMs: number) {}

    /** `turn` names the current turn (a new value starts again); null when no clock runs. */
    check(turn: string | null, remainingMs: number): ClockAlert | null {
        if (turn === null) return null;
        if (turn !== this.turn) {
            this.turn = turn;
            this.warned = false;
            this.timedOut = false;
        }
        if (remainingMs <= 0 && !this.timedOut) {
            this.timedOut = true;
            this.warned = true;
            return "timeout";
        }
        if (remainingMs <= this.warnAtMs && !this.warned) {
            this.warned = true;
            return "warn";
        }
        return null;
    }
}
