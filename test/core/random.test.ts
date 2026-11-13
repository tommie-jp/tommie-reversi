import { describe, expect, it } from "vitest";
import { seededRandom } from "../../src/core/random";

describe("seededRandom", () => {
    it("repeats the same sequence for the same seed", () => {
        const a = seededRandom(42);
        const b = seededRandom(42);
        const first = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(first);
    });

    it("gives a different sequence for another seed", () => {
        expect(seededRandom(1)()).not.toBe(seededRandom(2)());
    });

    it("stays in [0, 1)", () => {
        const random = seededRandom(7);
        for (let i = 0; i < 1000; i++) {
            const value = random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});
