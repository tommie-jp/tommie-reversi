// Turns the characters arriving from a serial port into lines.
//
// RUP sends CR+LF, but the receiving side is lenient, like the RUP reference tools:
// LF alone and CR alone also end a line. A CR ends the line at once; an LF that comes
// right after it (even in the next piece) is part of the same line end.
// A line longer than MAX_LINE_LENGTH is dropped and counted.

import { MAX_LINE_LENGTH } from "./codec";

export interface Pushed {
    readonly lines: readonly string[];
    /** Lines dropped for being too long. */
    readonly dropped: number;
}

export class LineSplitter {
    private pending = "";
    /** The last character seen was a CR, so a following LF belongs to it. */
    private afterCR = false;
    /** True while the characters of a too-long line are being thrown away. */
    private skipping = false;

    push(chunk: string): Pushed {
        const lines: string[] = [];
        let dropped = 0;
        for (const ch of chunk) {
            const wasCR = this.afterCR;
            this.afterCR = ch === "\r";
            if (ch === "\n" && wasCR) continue;
            if (ch === "\r" || ch === "\n") {
                if (!this.skipping && this.pending !== "") lines.push(this.pending);
                this.pending = "";
                this.skipping = false;
                continue;
            }
            if (this.skipping) continue;
            this.pending += ch;
            if (this.pending.length > MAX_LINE_LENGTH) {
                dropped++;
                this.pending = "";
                this.skipping = true;
            }
        }
        return { lines, dropped };
    }
}
