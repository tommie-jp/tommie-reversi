// The game's sounds, played the way tommieVoice plays audio:
// - one <audio> element is made once and used for every sound (iOS allows later plays
//   on an element whose first play started from a tap);
// - the first play happens inside a tap (`unlock` plays a silent clip);
// - a refused play is caught: an interrupted one (AbortError) is ignored, any other marks
//   sound as blocked so the screen can ask for a tap. The game itself never waits for sound.
// An <audio> element is also heard on iOS when the ring/silent switch is off, unlike Web Audio.

import { TONES, renderWav, silentWav, type SoundKind } from "./tones";

export type { SoundKind } from "./tones";

/** The part of HTMLAudioElement that is used, so tests can pass a fake. */
export interface AudioElement {
    src: string;
    currentTime: number;
    preload: string;
    play(): Promise<void>;
    pause(): void;
}

export interface SoundOptions {
    readonly element: AudioElement;
    /** Turns WAV bytes into a URL the element can play (a blob: URL in the browser). */
    readonly makeUrl: (wav: Uint8Array) => string;
    readonly onBlockedChange?: (blocked: boolean) => void;
}

const UNLOCK_CLIP_MS = 50;

export class Sound {
    enabled = true;
    private unlocked = false;
    private isBlocked = false;
    private readonly urls: Record<SoundKind, string>;
    private readonly silence: string;

    constructor(private readonly options: SoundOptions) {
        options.element.preload = "auto";
        this.silence = options.makeUrl(silentWav(UNLOCK_CLIP_MS));
        this.urls = {
            place: options.makeUrl(renderWav(TONES.place)),
            end: options.makeUrl(renderWav(TONES.end)),
            warn: options.makeUrl(renderWav(TONES.warn)),
            timeout: options.makeUrl(renderWav(TONES.timeout)),
        };
    }

    /** Sound has been allowed by a tap. */
    get ready(): boolean {
        return this.unlocked;
    }

    /** The browser refused the last play; a tap is needed. */
    get blocked(): boolean {
        return this.isBlocked;
    }

    /** Call from a tap. Plays a silent clip; resolves to `ready`. Safe to call again. */
    async unlock(): Promise<boolean> {
        if (this.unlocked) return true;
        try {
            await this.start(this.silence);
            this.unlocked = true;
            this.setBlocked(false);
        } catch (error) {
            if (!isAbort(error)) this.setBlocked(true);
        }
        return this.unlocked;
    }

    play(kind: SoundKind): void {
        if (!this.enabled || !this.unlocked) return;
        this.start(this.urls[kind]).then(
            () => this.setBlocked(false),
            (error: unknown) => {
                if (!isAbort(error)) this.setBlocked(true);
            },
        );
    }

    private start(url: string): Promise<void> {
        const element = this.options.element;
        element.src = url;
        element.currentTime = 0;
        try {
            return element.play();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private setBlocked(blocked: boolean): void {
        if (blocked === this.isBlocked) return;
        this.isBlocked = blocked;
        this.options.onBlockedChange?.(blocked);
    }
}

function isAbort(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}
