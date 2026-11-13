import { describe, expect, it } from "vitest";
import { MAX_LINE_LENGTH } from "../../../src/core/rup/codec";
import { LineSplitter } from "../../../src/core/rup/lines";

function feed(...chunks: string[]): { lines: string[]; dropped: number; splitter: LineSplitter } {
    const splitter = new LineSplitter();
    const lines: string[] = [];
    let dropped = 0;
    for (const chunk of chunks) {
        const result = splitter.push(chunk);
        lines.push(...result.lines);
        dropped += result.dropped;
    }
    return { lines, dropped, splitter };
}

describe("LineSplitter", () => {
    it("splits CR+LF lines", () => {
        expect(feed("PI\r\nVE\r\n").lines).toEqual(["PI", "VE"]);
    });

    it("joins a line that arrives in pieces", () => {
        expect(feed("+V", "E02na", "me\r\n").lines).toEqual(["+VE02name"]);
    });

    it("handles CR and LF arriving in different pieces", () => {
        expect(feed("MOd3\r", "\nPA\r\n").lines).toEqual(["MOd3", "PA"]);
    });

    it("accepts LF and CR alone as line ends", () => {
        expect(feed("MOd3\nPA\n").lines).toEqual(["MOd3", "PA"]);
        expect(feed("MOd3\rPA\r", "\r").lines).toEqual(["MOd3", "PA"]);
    });

    it("skips empty lines", () => {
        expect(feed("\r\n\r\nPI\r\n\n").lines).toEqual(["PI"]);
    });

    it("keeps an unfinished line until its end arrives", () => {
        const { lines, splitter } = feed("MOd");
        expect(lines).toEqual([]);
        expect(splitter.push("3\r\n").lines).toEqual(["MOd3"]);
    });

    it("drops a line that grows past the limit and carries on with the next", () => {
        const long = "X".repeat(MAX_LINE_LENGTH + 1);
        const result = feed(long, "YY\r\nPI\r\n");
        expect(result.lines).toEqual(["PI"]);
        expect(result.dropped).toBe(1);
    });

    it("drops a complete line that is too long", () => {
        const result = feed("A".repeat(MAX_LINE_LENGTH + 5) + "\r\nPI\r\n");
        expect(result.lines).toEqual(["PI"]);
        expect(result.dropped).toBe(1);
    });

    it("keeps a line of exactly the limit", () => {
        const line = "S".repeat(MAX_LINE_LENGTH);
        expect(feed(line + "\r\n").lines).toEqual([line]);
    });

    it("splits many lines from one piece", () => {
        expect(feed("MOd3\r\nBS" + "0".repeat(64) + "\r\nST x\r\n").lines).toHaveLength(3);
    });
});
