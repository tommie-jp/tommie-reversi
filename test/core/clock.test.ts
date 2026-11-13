import { describe, expect, it } from "vitest";
import { BLACK, WHITE } from "../../src/core/board";
import { newClock, remainingMs, startTurn, stopClock } from "../../src/core/clock";

describe("clock", () => {
    it("shows the full time on both sides before it starts", () => {
        const clock = newClock(60_000);
        expect(clock.running).toBeNull();
        expect(remainingMs(clock, BLACK, 5_000)).toBe(60_000);
        expect(remainingMs(clock, WHITE, 5_000)).toBe(60_000);
    });

    it("counts down only the side to move", () => {
        const clock = startTurn(newClock(60_000), BLACK, 1_000);
        expect(remainingMs(clock, BLACK, 11_000)).toBe(50_000);
        expect(remainingMs(clock, WHITE, 11_000)).toBe(60_000);
    });

    it("starts again from the full time when the turn changes", () => {
        let clock = startTurn(newClock(60_000), BLACK, 0);
        clock = startTurn(clock, WHITE, 30_000);
        expect(remainingMs(clock, WHITE, 40_000)).toBe(50_000);
        expect(remainingMs(clock, BLACK, 40_000)).toBe(60_000);
    });

    it("never goes below zero and does nothing else at zero", () => {
        const clock = startTurn(newClock(60_000), WHITE, 0);
        expect(remainingMs(clock, WHITE, 90_000)).toBe(0);
        expect(clock.running).toBe(WHITE);
    });

    it("stops counting when stopped", () => {
        const clock = stopClock(startTurn(newClock(60_000), BLACK, 0));
        expect(clock.running).toBeNull();
        expect(remainingMs(clock, BLACK, 30_000)).toBe(60_000);
    });

    it("does not change the clock it was given", () => {
        const before = newClock(60_000);
        startTurn(before, BLACK, 0);
        expect(before.running).toBeNull();
    });

    it("rejects a limit that is not a positive number", () => {
        expect(() => newClock(0)).toThrow();
        expect(() => newClock(Number.NaN)).toThrow();
    });
});
