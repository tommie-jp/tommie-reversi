import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/app/settings";
import { GameStore, SettingsStore, type KeyValueStore, type SavedGame } from "../../src/app/storage";

class MemoryStore implements KeyValueStore {
    readonly data = new Map<string, string>();
    failWrites = false;
    failReads = false;
    getItem(key: string): string | null {
        if (this.failReads) throw new Error("blocked");
        return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        if (this.failWrites) throw new Error("quota");
        this.data.set(key, value);
    }
    removeItem(key: string): void {
        this.data.delete(key);
    }
}

function game(id: string, extra: Partial<SavedGame> = {}): SavedGame {
    return { id, startedAt: "2026-11-14T10:00:00+09:00", black: "b", white: "w", record: "f5", result: "", finished: false, ...extra };
}

describe("SettingsStore", () => {
    it("loads the defaults when nothing is saved, and round-trips", () => {
        const store = new SettingsStore(new MemoryStore());
        expect(store.load()).toEqual(DEFAULT_SETTINGS);
        expect(store.save({ ...DEFAULT_SETTINGS, sound: false })).toBe(true);
        expect(store.load().sound).toBe(false);
    });

    it("survives broken data and a store that cannot be read or written", () => {
        const memory = new MemoryStore();
        memory.data.set("tommie-reversi:settings", "{broken");
        const store = new SettingsStore(memory);
        expect(store.load()).toEqual(DEFAULT_SETTINGS);
        memory.failReads = true;
        expect(store.load()).toEqual(DEFAULT_SETTINGS);
        memory.failWrites = true;
        expect(store.save(DEFAULT_SETTINGS)).toBe(false);
    });
});

describe("GameStore", () => {
    it("lists saved games, newest first, and replaces a game with the same id", () => {
        const store = new GameStore(new MemoryStore());
        store.save(game("a"));
        store.save(game("b"));
        store.save(game("a", { record: "f5d6", finished: true, result: "done" }));
        expect(store.list().map((g) => g.id)).toEqual(["a", "b"]);
        expect(store.list()[0]).toMatchObject({ record: "f5d6", finished: true });
    });

    it("keeps only the newest games up to the limit", () => {
        const store = new GameStore(new MemoryStore(), 3);
        for (const id of ["1", "2", "3", "4"]) store.save(game(id));
        expect(store.list().map((g) => g.id)).toEqual(["4", "3", "2"]);
    });

    it("drops entries that are not games", () => {
        const memory = new MemoryStore();
        memory.data.set("tommie-reversi:games", JSON.stringify([game("ok"), { id: 3 }, "x", null]));
        expect(new GameStore(memory).list().map((g) => g.id)).toEqual(["ok"]);
        memory.data.set("tommie-reversi:games", "not json");
        expect(new GameStore(memory).list()).toEqual([]);
        memory.data.set("tommie-reversi:games", "{}");
        expect(new GameStore(memory).list()).toEqual([]);
    });

    it("reports a failed write and keeps working", () => {
        const memory = new MemoryStore();
        const store = new GameStore(memory);
        memory.failWrites = true;
        expect(store.save(game("a"))).toBe(false);
        memory.failReads = true;
        expect(store.list()).toEqual([]);
    });

    it("removes all games", () => {
        const store = new GameStore(new MemoryStore());
        store.save(game("a"));
        store.clear();
        expect(store.list()).toEqual([]);
    });
});
