// Short sounds made with Web Audio (no sound files). Browsers allow sound only after a
// user gesture, and a touch counts only when the finger is lifted (pointerup, touchend,
// click), not when it lands (pointerdown). So `unlock` is tried on each gesture until the
// audio is running. Any failure is ignored: the game goes on without sound.

export type SoundKind = "place" | "end" | "warn" | "timeout";

interface Tone {
    readonly frequency: number;
    readonly endFrequency?: number;
    readonly start: number;
    readonly length: number;
    readonly volume: number;
}

const TONES: Record<SoundKind, readonly Tone[]> = {
    place: [{ frequency: 800, endFrequency: 400, start: 0, length: 0.1, volume: 0.15 }],
    end: [523, 659, 784].map((frequency, i) => ({ frequency, start: i * 0.15, length: 0.3, volume: 0.12 })),
    warn: [0, 0.2].map((start) => ({ frequency: 880, start, length: 0.12, volume: 0.12 })),
    timeout: [{ frequency: 440, start: 0, length: 0.7, volume: 0.15 }],
};

export class Sound {
    enabled = true;
    private context: AudioContext | null = null;

    /** True once sound can play. Call it from a user gesture; it is safe to call again. */
    get ready(): boolean {
        return this.context !== null && this.context.state === "running";
    }

    /** Creates or resumes the audio inside a user gesture. Resolves to `ready`. */
    async unlock(): Promise<boolean> {
        try {
            this.context ??= new AudioContext();
            if (this.context.state !== "running") await this.context.resume();
        } catch {
            // Not allowed yet; the next gesture tries again.
        }
        return this.ready;
    }

    play(kind: SoundKind): void {
        const context = this.context;
        if (!this.enabled || context === null) return;
        try {
            const now = context.currentTime;
            for (const tone of TONES[kind]) this.tone(context, now, tone);
        } catch {
            // No sound this time.
        }
    }

    private tone(context: AudioContext, now: number, tone: Tone): void {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + tone.start;
        const end = start + tone.length;
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        if (tone.endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
        gain.gain.setValueAtTime(tone.volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end);
    }
}
