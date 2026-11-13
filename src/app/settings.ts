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
    /** For Web Serial. A Pico 2 on USB ignores it; a USB-UART bridge needs the CPU's rate. */
    readonly baudRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
    clockSeconds: 60,
    sound: true,
    hints: true,
    confirmMove: true,
    language: "auto",
    baudRate: 115200,
};

export const BAUD_RATES: readonly number[] = [9600, 38400, 115200, 230400, 460800, 921600];

export const MAX_CLOCK_SECONDS = 3600;
const LANGUAGES: readonly LanguageSetting[] = ["auto", "ja", "en"];

export function parseSettings(raw: unknown): Settings {
    if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
    const value = raw as Record<string, unknown>;
    const flag = (key: "sound" | "hints" | "confirmMove") =>
        typeof value[key] === "boolean" ? (value[key] as boolean) : DEFAULT_SETTINGS[key];
    const seconds = value["clockSeconds"];
    const language = value["language"];
    const baudRate = value["baudRate"];
    return {
        clockSeconds:
            Number.isInteger(seconds) && (seconds as number) >= 1 && (seconds as number) <= MAX_CLOCK_SECONDS
                ? (seconds as number)
                : DEFAULT_SETTINGS.clockSeconds,
        sound: flag("sound"),
        hints: flag("hints"),
        confirmMove: flag("confirmMove"),
        language: LANGUAGES.includes(language as LanguageSetting) ? (language as LanguageSetting) : DEFAULT_SETTINGS.language,
        baudRate: BAUD_RATES.includes(baudRate as number) ? (baudRate as number) : DEFAULT_SETTINGS.baudRate,
    };
}
