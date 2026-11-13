import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GameLogger, fileStem, formatLogLine, isoLocal, recordText } from "../../src/cli/logger";

const DATE = new Date(2026, 10, 17, 15, 30, 12, 345);
const dirs: string[] = [];

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "reversi-log-"));
    dirs.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("formatLogLine", () => {
    it("writes [time] TX/RX line, the replay format of the RUP tools", () => {
        expect(formatLogLine(DATE, "TX", "PI")).toBe("[15:30:12.345] TX PI");
        expect(formatLogLine(DATE, "RX", "+PI")).toBe("[15:30:12.345] RX +PI");
    });
});

describe("fileStem", () => {
    it("names files by date, time and game number", () => {
        expect(fileStem(DATE, 1)).toBe("20261117-153012-01");
        expect(fileStem(DATE, 12)).toBe("20261117-153012-12");
    });
});

describe("isoLocal", () => {
    it("writes the local time with its offset", () => {
        expect(isoLocal(DATE)).toMatch(/^2026-11-17T15:30:12[+-]\d{2}:\d{2}$/);
    });
});

describe("recordText", () => {
    it("writes # header lines and the record on the last line", () => {
        expect(
            recordText({ date: DATE, black: "human", white: "cpu", result: "Black 4 - White 1 (normal)", record: "f5" }),
        ).toBe(
            [
                `# date: ${isoLocal(DATE)}`,
                "# black: human",
                "# white: cpu",
                "# result: Black 4 - White 1 (normal)",
                "f5",
                "",
            ].join("\n"),
        );
    });

    it("keeps names on one line", () => {
        const text = recordText({ date: DATE, black: "a\nb", white: "c\rd", result: "x", record: "" });
        expect(text).toContain("# black: a b\n");
        expect(text).toContain("# white: c d\n");
    });
});

describe("GameLogger", () => {
    it("creates the directory and writes the RUP log and the record", () => {
        const dir = join(tempDir(), "nested", "logs");
        const logger = new GameLogger(dir, fileStem(DATE, 1), true);
        logger.rup("TX", "PI", DATE);
        logger.rup("RX", "+PI", DATE);
        const path = logger.saveRecord("# x\nf5\n");
        expect(readdirSync(dir).sort()).toEqual(["20261117-153012-01.rup.log", "20261117-153012-01.txt"]);
        expect(readFileSync(join(dir, "20261117-153012-01.rup.log"), "utf8")).toBe(
            "[15:30:12.345] TX PI\n[15:30:12.345] RX +PI\n",
        );
        expect(path).toBe(join(dir, "20261117-153012-01.txt"));
    });

    it("writes no RUP log when there is no serial port", () => {
        const dir = tempDir();
        const logger = new GameLogger(dir, "game", false);
        logger.rup("TX", "PI", DATE);
        logger.saveRecord("f5\n");
        expect(readdirSync(dir)).toEqual(["game.txt"]);
    });
});
