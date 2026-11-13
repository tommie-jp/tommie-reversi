import { describe, expect, it } from "vitest";
import { SAMPLE_RATE, TONES, renderWav, silentWav } from "../../src/app/tones";

function text(bytes: Uint8Array, at: number, length: number): string {
    return String.fromCharCode(...bytes.slice(at, at + length));
}

function view(bytes: Uint8Array): DataView {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe("renderWav", () => {
    it("writes a 16-bit mono PCM WAV file", () => {
        const wav = renderWav(TONES.place);
        const v = view(wav);
        expect(text(wav, 0, 4)).toBe("RIFF");
        expect(v.getUint32(4, true)).toBe(wav.length - 8);
        expect(text(wav, 8, 4)).toBe("WAVE");
        expect(text(wav, 12, 4)).toBe("fmt ");
        expect(v.getUint16(20, true)).toBe(1);
        expect(v.getUint16(22, true)).toBe(1);
        expect(v.getUint32(24, true)).toBe(SAMPLE_RATE);
        expect(v.getUint16(34, true)).toBe(16);
        expect(text(wav, 36, 4)).toBe("data");
        expect(v.getUint32(40, true)).toBe(wav.length - 44);
    });

    it("lasts as long as its last tone", () => {
        const wav = renderWav(TONES.end);
        const samples = (wav.length - 44) / 2;
        const last = TONES.end.at(-1)!;
        expect(samples).toBe(Math.ceil((last.start + last.length) * SAMPLE_RATE));
    });

    it("is not silent, and stays within the 16-bit range", () => {
        for (const kind of ["place", "end", "warn", "timeout"] as const) {
            const wav = renderWav(TONES[kind]);
            const v = view(wav);
            let peak = 0;
            for (let at = 44; at < wav.length; at += 2) peak = Math.max(peak, Math.abs(v.getInt16(at, true)));
            expect(peak, kind).toBeGreaterThan(1000);
            expect(peak, kind).toBeLessThan(32768);
        }
    });

    it("leaves gaps between tones silent", () => {
        const wav = renderWav(TONES.warn);
        const v = view(wav);
        const gapAt = Math.round(((TONES.warn[0]!.start + TONES.warn[0]!.length + TONES.warn[1]!.start) / 2) * SAMPLE_RATE);
        expect(v.getInt16(44 + gapAt * 2, true)).toBe(0);
    });
});

describe("silentWav", () => {
    it("is a short WAV file of zeros", () => {
        const wav = silentWav(50);
        expect(text(wav, 0, 4)).toBe("RIFF");
        expect((wav.length - 44) / 2).toBe(Math.round(0.05 * SAMPLE_RATE));
        expect(wav.slice(44).every((byte) => byte === 0)).toBe(true);
    });
});
