// Settings and game records kept in the browser (localStorage). The store is passed in,
// so tests use a map. Reading or writing can fail (private mode, a full store): reads
// then give the defaults, and writes report false, so the game itself never stops.

import { parseSettings, type Settings } from "./settings";

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const SETTINGS_KEY = "tommie-reversi:settings";
const GAMES_KEY = "tommie-reversi:games";
export const MAX_SAVED_GAMES = 200;

export interface SavedGame {
    /** Unique per game; the same id saved again replaces the entry. */
    readonly id: string;
    /** Local time with its offset, e.g. 2026-11-17T15:30:12+09:00. */
    readonly startedAt: string;
    readonly black: string;
    readonly white: string;
    /** The record line, e.g. "f5d6c3". */
    readonly record: string;
    /** The result as shown on the screen, or "" while the game goes on. */
    readonly result: string;
    readonly finished: boolean;
}

export class SettingsStore {
    constructor(private readonly store: KeyValueStore) {}

    load(): Settings {
        return parseSettings(readJson(this.store, SETTINGS_KEY));
    }

    save(settings: Settings): boolean {
        return writeJson(this.store, SETTINGS_KEY, settings);
    }
}

export class GameStore {
    constructor(
        private readonly store: KeyValueStore,
        private readonly limit = MAX_SAVED_GAMES,
    ) {}

    /** Newest first. */
    list(): SavedGame[] {
        const raw = readJson(this.store, GAMES_KEY);
        return Array.isArray(raw) ? raw.filter(isSavedGame) : [];
    }

    save(game: SavedGame): boolean {
        const others = this.list().filter((saved) => saved.id !== game.id);
        return writeJson(this.store, GAMES_KEY, [game, ...others].slice(0, this.limit));
    }

    clear(): void {
        try {
            this.store.removeItem(GAMES_KEY);
        } catch {
            // Nothing to clear when the store cannot be used.
        }
    }
}

function isSavedGame(value: unknown): value is SavedGame {
    if (typeof value !== "object" || value === null) return false;
    const game = value as Record<string, unknown>;
    return (
        ["id", "startedAt", "black", "white", "record", "result"].every((key) => typeof game[key] === "string") &&
        typeof game["finished"] === "boolean"
    );
}

function readJson(store: KeyValueStore, key: string): unknown {
    try {
        const text = store.getItem(key);
        return text === null ? undefined : JSON.parse(text);
    } catch {
        return undefined;
    }
}

function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
    try {
        store.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}
