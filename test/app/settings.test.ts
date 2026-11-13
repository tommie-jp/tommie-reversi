import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/app/settings";

describe("parseSettings", () => {
    it("gives the defaults for nothing", () => {
        expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
        expect(DEFAULT_SETTINGS).toEqual({
            clockSeconds: 60, sound: true, hints: true, confirmMove: true, language: "auto", baudRate: 115200,
        });
    });

    it("keeps valid values", () => {
        const value = { clockSeconds: 30, sound: false, hints: false, confirmMove: false, language: "en", baudRate: 9600 };
        expect(parseSettings(value)).toEqual(value);
    });

    it("replaces each invalid value with its default and keeps the rest", () => {
        expect(parseSettings({ clockSeconds: 0, sound: "yes", hints: false, language: "fr", extra: 1 })).toEqual({
            ...DEFAULT_SETTINGS,
            hints: false,
        });
        expect(parseSettings({ clockSeconds: 3601 }).clockSeconds).toBe(60);
        expect(parseSettings({ clockSeconds: 1.5 }).clockSeconds).toBe(60);
        expect(parseSettings({ clockSeconds: 3600 }).clockSeconds).toBe(3600);
        expect(parseSettings({ baudRate: 1234 }).baudRate).toBe(115200);
        expect(parseSettings({ baudRate: 921600 }).baudRate).toBe(921600);
    });
});
