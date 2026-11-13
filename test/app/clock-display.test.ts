import { describe, expect, it } from "vitest";
import { ClockAlerts, clockFace } from "../../src/app/clock-display";

describe("clockFace", () => {
    it.each([
        [60_000, 60, 1, "ok"],
        [31_000, 31, 31 / 60, "ok"],
        [30_000, 30, 0.5, "caution"],
        [20_000, 20, 1 / 3, "warning"],
        [10_000, 10, 1 / 6, "danger"],
        [100, 1, 100 / 60_000, "danger"],
        [0, 0, 0, "danger"],
    ] as const)("shows %d ms of 60 s as %d s", (ms, seconds, fraction, level) => {
        const face = clockFace(ms, 60_000);
        expect(face.seconds).toBe(seconds);
        expect(face.fraction).toBeCloseTo(fraction);
        expect(face.level).toBe(level);
    });

    it("scales the levels with the limit", () => {
        expect(clockFace(15_000, 30_000).level).toBe("caution");
        expect(clockFace(4_000, 30_000).level).toBe("danger");
    });
});

describe("ClockAlerts", () => {
    it("warns once at 10 s left and says time is up once at 0", () => {
        const alerts = new ClockAlerts(10_000);
        expect(alerts.check("t1", 30_000)).toBeNull();
        expect(alerts.check("t1", 10_000)).toBe("warn");
        expect(alerts.check("t1", 9_000)).toBeNull();
        expect(alerts.check("t1", 0)).toBe("timeout");
        expect(alerts.check("t1", 0)).toBeNull();
    });

    it("starts again for a new turn", () => {
        const alerts = new ClockAlerts(10_000);
        alerts.check("t1", 5_000);
        expect(alerts.check("t2", 5_000)).toBe("warn");
    });

    it("says only that time is up when both points are passed at once", () => {
        const alerts = new ClockAlerts(10_000);
        expect(alerts.check("t1", 0)).toBe("timeout");
        expect(alerts.check("t1", 0)).toBeNull();
    });

    it("stays quiet when there is no turn", () => {
        expect(new ClockAlerts(10_000).check(null, 0)).toBeNull();
    });
});
