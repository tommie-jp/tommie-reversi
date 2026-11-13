import { describe, expect, it } from "vitest";
import { parseInput } from "../../../src/view/terminal/input";

describe("parseInput", () => {
    it.each([
        ["f5", { type: "move", square: "f5" }],
        ["F5", { type: "move", square: "f5" }],
        ["  d3  ", { type: "move", square: "d3" }],
        ["pass", { type: "pass" }],
        ["PASS", { type: "pass" }],
        ["", { type: "empty" }],
        ["   ", { type: "empty" }],
        ["board", { type: "board" }],
        ["help", { type: "help" }],
        ["?", { type: "help" }],
        ["new", { type: "new" }],
        ["quit", { type: "quit" }],
        ["q", { type: "quit" }],
    ] as const)("reads %j", (text, expected) => {
        expect(parseInput(text)).toEqual(expected);
    });

    it.each(["z9", "f", "f55", "hello", "a0"])("rejects %j with a reason", (text) => {
        const command = parseInput(text);
        expect(command.type).toBe("invalid");
        if (command.type === "invalid") expect(command.reason).toContain("help");
    });

    it("rejects a very long line without echoing all of it", () => {
        const command = parseInput("x".repeat(500));
        expect(command.type).toBe("invalid");
        if (command.type === "invalid") expect(command.reason.length).toBeLessThan(80);
    });
});
