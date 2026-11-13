// Turns the characters arriving from a serial port into lines.
//
// RUP sends CR+LF, but the receiving side is lenient, like the RUP reference tools:
// LF alone and CR alone also end a line. A CR at the end of a piece is held until the
// next piece, so a CR+LF split across two pieces is not read as two line ends.
// A line longer than MAX_LINE_LENGTH is dropped and counted.

import { MAX_LINE_LENGTH } from "./codec";

export interface Pushed {
    readonly lines: readonly string[];
    /** Lines dropped for being too long. */
    readonly dropped: number;
}

export class LineSplitter {
    private pending = "";
    /** True while the characters of a too-long line are being thrown away. */
    private skipping = false;

    push(chunk: string): Pushed {
        const text = this.pending + chunk;
        const lines: string[] = [];
        let dropped = 0;
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch !== "\r" && ch !== "\n") continue;
            if (ch === "\r" && i === text.length - 1) break; // wait: an LF may follow
            const line = text.slice(start, i);
            if (this.skipping) this.skipping = false;
            else if (line.length > MAX_LINE_LENGTH) dropped++;
            else if (line !== "") lines.push(line);
            if (ch === "\r" && text[i + 1] === "\n") i++;
            start = i + 1;
        }
        this.pending = text.slice(start);
        if (!this.skipping && this.pending.length > MAX_LINE_LENGTH + 1) {
            dropped++;
            this.skipping = true;
        }
        if (this.skipping) this.pending = this.pending.endsWith("\r") ? "\r" : "";
        return { lines, dropped };
    }
}
