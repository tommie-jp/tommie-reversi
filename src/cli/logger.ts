// Files written for every game: the record, and the RUP lines when a CPU is connected.
// The RUP log uses "[HH:MM:SS.mmm] TX line" / "RX line", the replay format read by
// the RUP reference tools, so a log of a stopped game can be replayed as it is.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export { isoLocal, recordText, type RecordFields } from "../core/record-file";

export type Direction = "TX" | "RX";

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function formatLogLine(date: Date, direction: Direction, line: string): string {
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    return `[${time}] ${direction} ${line}`;
}

export function fileStem(date: Date, gameNumber: number): string {
    const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `${day}-${time}-${pad(gameNumber)}`;
}

/** Writes the files of one game. Lines are appended at once so a crash loses nothing. */
export class GameLogger {
    private readonly rupPath: string;

    constructor(
        private readonly dir: string,
        private readonly stem: string,
        private readonly withRup: boolean,
    ) {
        mkdirSync(dir, { recursive: true });
        this.rupPath = join(dir, `${stem}.rup.log`);
    }

    rup(direction: Direction, line: string, date: Date): void {
        if (!this.withRup) return;
        appendFileSync(this.rupPath, formatLogLine(date, direction, line) + "\n");
    }

    /** Writes the record file and returns its path. */
    saveRecord(text: string): string {
        const path = join(this.dir, `${this.stem}.txt`);
        writeFileSync(path, text);
        return path;
    }
}
