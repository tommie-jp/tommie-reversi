// Settings kept in the browser. Anything unreadable falls back to its default.

export type LanguageSetting = "auto" | "ja" | "en";

export interface Settings {
    /** Seconds per move shown on the clock (display only). */
    readonly clockSeconds: number;
    readonly sound: boolean;
    /** Mark the legal squares. */
    readonly hints: boolean;
    /** Tap twice to send a move to the CPU (there is no take-back). */
    readonly confirmMove: boolean;
    readonly language: LanguageSetting;
}

export const DEFAULT_SETTINGS: Settings = {
    clockSeconds: 60,
    sound: true,
    hints: true,
    confirmMove: true,
    language: "auto",
};

export const MAX_CLOCK_SECONDS = 3600;
const LANGUAGES: readonly LanguageSetting[] = ["auto", "ja", "en"];

export function parseSettings(raw: unknown): Settings {
    if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
    const value = raw as Record<string, unknown>;
    const flag = (key: "sound" | "hints" | "confirmMove") =>
        typeof value[key] === "boolean" ? (value[key] as boolean) : DEFAULT_SETTINGS[key];
    const seconds = value["clockSeconds"];
    const language = value["language"];
    return {
        clockSeconds:
            Number.isInteger(seconds) && (seconds as number) >= 1 && (seconds as number) <= MAX_CLOCK_SECONDS
                ? (seconds as number)
                : DEFAULT_SETTINGS.clockSeconds,
        sound: flag("sound"),
        hints: flag("hints"),
        confirmMove: flag("confirmMove"),
        language: LANGUAGES.includes(language as LanguageSetting) ? (language as LanguageSetting) : DEFAULT_SETTINGS.language,
    };
}
