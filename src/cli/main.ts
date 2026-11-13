// Entry point of the CLI: reads the options, wires the keyboard and the files to a
// Session, and exits with the session's exit code.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseCliArgs, USAGE, type PlayOptions } from "./args";
import { HumanPlayer } from "./human";
import { GameLogger } from "./logger";
import { EXIT, Session, type Seats } from "./session";

async function main(): Promise<number> {
    const parsed = parseCliArgs(process.argv.slice(2), process.env);
    if (!parsed.ok) {
        process.stderr.write(`error: ${parsed.error}\nRun with --help for the options.\n`);
        return EXIT.usage;
    }
    const options = parsed.value;
    switch (options.kind) {
        case "help":
            process.stdout.write(USAGE + "\n");
            return EXIT.ok;
        case "version":
            process.stdout.write(`tommie-reversi ${version()}\n`);
            return EXIT.ok;
        case "list-ports":
            process.stderr.write("error: --list-ports is not available yet\n");
            return EXIT.usage;
        case "play":
            return play(options);
    }
}

async function play(options: PlayOptions): Promise<number> {
    if (options.port !== null) {
        process.stderr.write("error: --port is not available yet\n");
        return EXIT.usage;
    }
    const session = new Session(options, {
        write: (text) => process.stdout.write(text),
        now: () => new Date(),
        openFiles: (stem) => new GameLogger(options.logDir, stem, options.port !== null),
        seats: (_gameNumber, s) => localSeats(s),
    });
    process.stdout.write(`tommie-reversi ${version()}  black: human  white: human\n`);
    return withKeyboard(session, () => session.run());
}

function localSeats(session: Session): Seats {
    const human = (name: string) => new HumanPlayer(name, session.interaction, () => session.timeLeftMs(), false);
    return { black: human("human (Black)"), white: human("human (White)"), humans: [1, 2] };
}

/** Feeds typed lines to the session while `run` is going, then releases the keyboard. */
async function withKeyboard(session: Session, run: () => Promise<number>): Promise<number> {
    const keyboard = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    let interrupts = 0;
    keyboard.on("line", (line) => session.interaction.handleLine(line));
    keyboard.on("close", () => session.endOfInput());
    keyboard.on("SIGINT", () => {
        interrupts++;
        if (interrupts > 1) process.exit(EXIT.interrupted);
        process.stdout.write("\n");
        session.interrupt();
    });
    try {
        return await run();
    } finally {
        keyboard.removeAllListeners("close");
        keyboard.close();
    }
}

function version(): string {
    const text = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "version" in parsed && typeof parsed.version === "string") {
        return parsed.version;
    }
    return "unknown";
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(EXIT.connection);
    },
);
