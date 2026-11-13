// The per-move clock. It only shows the time left: reaching zero does nothing.
// The current time is passed in, so core never reads the system clock.

import type { Color } from "./board";

export interface ClockState {
    /** Time for one move, in milliseconds. */
    readonly limitMs: number;
    /** The side whose time is running, or null when stopped. */
    readonly running: Color | null;
    /** When the running side's turn started. */
    readonly startedAtMs: number;
}

export const DEFAULT_MOVE_LIMIT_MS = 60_000;

export function newClock(limitMs: number): ClockState {
    if (!Number.isFinite(limitMs) || limitMs <= 0) {
        throw new RangeError(`clock limit must be a positive number: ${limitMs}`);
    }
    return { limitMs, running: null, startedAtMs: 0 };
}

export function startTurn(clock: ClockState, color: Color, nowMs: number): ClockState {
    return { ...clock, running: color, startedAtMs: nowMs };
}

export function stopClock(clock: ClockState): ClockState {
    return { ...clock, running: null };
}

/** Time left for `color`. The side that is not running shows the full time. */
export function remainingMs(clock: ClockState, color: Color, nowMs: number): number {
    if (clock.running !== color) return clock.limitMs;
    return Math.max(0, clock.limitMs - (nowMs - clock.startedAtMs));
}
