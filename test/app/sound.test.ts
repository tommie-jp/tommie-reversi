import { describe, expect, it, vi } from "vitest";
import { Sound, type AudioElement } from "../../src/app/sound";

class FakeAudio implements AudioElement {
    src = "";
    currentTime = 0;
    preload = "";
    readonly played: string[] = [];
    next: () => Promise<void> = () => Promise.resolve();
    play(): Promise<void> {
        this.played.push(this.src);
        return this.next();
    }
    pause(): void {}
}

function setup() {
    const audio = new FakeAudio();
    const changes: boolean[] = [];
    let n = 0;
    const sound = new Sound({
        element: audio,
        makeUrl: () => `blob:${++n}`,
        onBlockedChange: (blocked) => changes.push(blocked),
    });
    return { audio, sound, changes };
}

const refused = () => Promise.reject(Object.assign(new Error("not allowed"), { name: "NotAllowedError" }));

describe("Sound", () => {
    it("uses one audio element for every sound", async () => {
        const { audio, sound } = setup();
        await sound.unlock();
        sound.play("place");
        sound.play("end");
        expect(new Set(audio.played).size).toBe(3);
        expect(audio.played).toHaveLength(3);
    });

    it("unlocks by playing a silent clip, and reports ready", async () => {
        const { audio, sound } = setup();
        expect(sound.ready).toBe(false);
        expect(await sound.unlock()).toBe(true);
        expect(sound.ready).toBe(true);
        expect(audio.played).toHaveLength(1);
        expect(await sound.unlock()).toBe(true);
        expect(audio.played).toHaveLength(1);
    });

    it("plays nothing before it is unlocked, or when turned off", async () => {
        const { audio, sound } = setup();
        sound.play("place");
        expect(audio.played).toHaveLength(0);
        await sound.unlock();
        sound.enabled = false;
        sound.play("place");
        expect(audio.played).toHaveLength(1);
    });

    it("says sound is blocked when the browser refuses, and clears it when a play works", async () => {
        const { audio, sound, changes } = setup();
        audio.next = refused;
        expect(await sound.unlock()).toBe(false);
        expect(sound.blocked).toBe(true);
        audio.next = () => Promise.resolve();
        expect(await sound.unlock()).toBe(true);
        expect(sound.blocked).toBe(false);
        expect(changes).toEqual([true, false]);
    });

    it("ignores a play cut short by the next one", async () => {
        const { audio, sound, changes } = setup();
        await sound.unlock();
        audio.next = () => Promise.reject(Object.assign(new Error("interrupted"), { name: "AbortError" }));
        sound.play("place");
        await Promise.resolve();
        await Promise.resolve();
        expect(sound.blocked).toBe(false);
        expect(changes).toEqual([]);
    });

    it("marks sound as blocked when a later play is refused", async () => {
        const { audio, sound } = setup();
        await sound.unlock();
        audio.next = refused;
        sound.play("warn");
        await vi.waitFor(() => expect(sound.blocked).toBe(true));
    });

    it("plays each sound from its start", async () => {
        const { audio, sound } = setup();
        await sound.unlock();
        audio.currentTime = 3;
        sound.play("place");
        expect(audio.currentTime).toBe(0);
    });
});
