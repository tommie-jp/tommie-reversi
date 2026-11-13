// The game's sounds as small WAV files (16-bit mono PCM), made once when the page opens.
// No sound files are shipped, and WAV plays in every browser's <audio> element.

export type SoundKind = "place" | "end" | "warn" | "timeout";

export interface Tone {
    readonly frequency: number;
    /** Slides to this frequency over the tone (optional). */
    readonly endFrequency?: number;
    /** Seconds from the start of the sound. */
    readonly start: number;
    /** Seconds. */
    readonly length: number;
    /** 0 to 1. */
    readonly volume: number;
}

export const SAMPLE_RATE = 22_050;

export const TONES: Record<SoundKind, readonly Tone[]> = {
    place: [{ frequency: 800, endFrequency: 400, start: 0, length: 0.1, volume: 0.5 }],
    end: [523, 659, 784].map((frequency, i) => ({ frequency, start: i * 0.15, length: 0.3, volume: 0.4 })),
    warn: [0, 0.2].map((start) => ({ frequency: 880, start, length: 0.12, volume: 0.4 })),
    timeout: [{ frequency: 440, start: 0, length: 0.7, volume: 0.5 }],
};

const HEADER_BYTES = 44;
const PEAK = 32767;

/** Mixes the tones into a WAV file. Each tone fades out so it does not click. */
export function renderWav(tones: readonly Tone[]): Uint8Array {
    const seconds = Math.max(...tones.map((tone) => tone.start + tone.length));
    const samples = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    for (const tone of tones) addTone(samples, tone);
    return wavFile(samples);
}

/** A short silent WAV file, played inside a tap to let later sounds play. */
export function silentWav(milliseconds: number): Uint8Array {
    return wavFile(new Float32Array(Math.round((milliseconds / 1000) * SAMPLE_RATE)));
}

function addTone(samples: Float32Array, tone: Tone): void {
    const first = Math.round(tone.start * SAMPLE_RATE);
    const count = Math.round(tone.length * SAMPLE_RATE);
    const end = tone.endFrequency ?? tone.frequency;
    let phase = 0;
    for (let i = 0; i < count && first + i < samples.length; i++) {
        const t = i / count;
        // The frequency slides exponentially, like the earlier Web Audio sounds.
        const frequency = tone.frequency * Math.pow(end / tone.frequency, t);
        phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
        const envelope = Math.pow(0.001, t);
        samples[first + i]! += Math.sin(phase) * tone.volume * envelope;
    }
}

function wavFile(samples: Float32Array): Uint8Array {
    const bytes = new Uint8Array(HEADER_BYTES + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const ascii = (at: number, text: string) => [...text].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
    ascii(0, "RIFF");
    view.setUint32(4, bytes.length - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true); // size of the fmt chunk
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
    view.setUint16(32, 2, true); // bytes per sample
    view.setUint16(34, 16, true); // bits per sample
    ascii(36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((value, i) => {
        const clipped = Math.max(-1, Math.min(1, value));
        view.setInt16(HEADER_BYTES + i * 2, Math.round(clipped * PEAK), true);
    });
    return bytes;
}
