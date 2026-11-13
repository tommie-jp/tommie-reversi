import { describe, expect, it } from "vitest";
import { parseCliArgs, type PlayOptions } from "../../src/cli/args";

function play(argv: string[], env: Record<string, string | undefined> = {}): PlayOptions {
    const result = parseCliArgs(argv, env);
    if (!result.ok) throw new Error(result.error);
    if (result.value.kind !== "play") throw new Error(`not play: ${result.value.kind}`);
    return result.value;
}

function error(argv: string[]): string {
    const result = parseCliArgs(argv, {});
    if (result.ok) throw new Error("expected an error");
    return result.error;
}

describe("parseCliArgs", () => {
    it("defaults to a person against a person", () => {
        expect(play([])).toEqual({
            kind: "play",
            port: null,
            baud: 115200,
            fpga: "black",
            opponent: "human",
            games: 1,
            seed: null,
            seconds: 60,
            log: false,
            logDir: "logs",
            hints: true,
            color: true,
        });
    });

    it("reads every play option", () => {
        expect(
            play([
                "--port", "/dev/ttyACM0", "--baud", "9600", "--fpga", "alternate", "--opponent", "random",
                "--games", "10", "--seed", "7", "--seconds", "30", "--log", "--log-dir", "out",
                "--no-hints", "--no-color",
            ]),
        ).toEqual({
            kind: "play",
            port: "/dev/ttyACM0",
            baud: 9600,
            fpga: "alternate",
            opponent: "random",
            games: 10,
            seed: 7,
            seconds: 30,
            log: true,
            logDir: "out",
            hints: false,
            color: false,
        });
    });

    it("turns color off when NO_COLOR is set", () => {
        expect(play([], { NO_COLOR: "1" }).color).toBe(false);
        expect(play([], { NO_COLOR: "" }).color).toBe(true);
    });

    it.each([
        [["--help"], "help"],
        [["-h"], "help"],
        [["--version"], "version"],
        [["-v"], "version"],
        [["--list-ports"], "list-ports"],
    ])("reads %j", (argv, kind) => {
        const result = parseCliArgs(argv, {});
        expect(result.ok && result.value.kind).toBe(kind);
    });

    it.each([
        [["--fpga", "white"], "--fpga needs --port"],
        [["--opponent", "random"], "--opponent needs --port"],
        [["--baud", "9600"], "--baud needs --port"],
        [["--port", "/dev/x", "--games", "2"], "--games above 1 needs --opponent random"],
        [["--port", "/dev/x", "--seed", "1"], "--seed needs --opponent random"],
        [["--port", "/dev/x", "--fpga", "red"], "--fpga must be one of black, white, alternate"],
        [["--port", "/dev/x", "--opponent", "edax"], "--opponent must be one of human, random"],
        [["--port", "/dev/x", "--baud", "1234"], "--baud must be one of"],
        [["--port", "/dev/x", "--opponent", "random", "--games", "0"], "--games must be an integer from 1 to 1000"],
        [["--port", "/dev/x", "--opponent", "random", "--games", "1001"], "--games must be an integer from 1 to 1000"],
        [["--seconds", "0"], "--seconds must be an integer from 1 to 3600"],
        [["--seconds", "1.5"], "--seconds must be an integer from 1 to 3600"],
        [["--port", "/dev/x", "--opponent", "random", "--seed=-1"], "--seed must be an integer from 0"],
        [["--port", ""], "--port must not be empty"],
        [["--bogus"], "Unknown option"],
        [["extra"], "Unexpected argument"],
    ])("rejects %j", (argv, message) => {
        expect(error(argv)).toContain(message);
    });
});
