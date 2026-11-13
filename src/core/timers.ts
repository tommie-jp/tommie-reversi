/**
 * Timers passed in from outside, because core has no DOM or Node types.
 * `set` returns a function that cancels the timer.
 */
export interface Timers {
    set(callback: () => void, ms: number): () => void;
}
