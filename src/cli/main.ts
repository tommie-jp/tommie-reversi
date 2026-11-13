// Entry point of the CLI: reads the options, wires the keyboard and the files to a
// Session, and exits with the session's exit code.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { BLACK, WHITE, type Color } from "../core/board";
import type { Player } from "../core/player";
import { RandomPlayer } from "../core/players/random";
import { seededRandom } from "../core/random";
import { RupPlayer } from "../core/rup/player";
import type { LineTransport } from "../core/transport";
import { listSerialPorts, openSerial } from "../transport/node-serial";
import { systemTimers } from "../transport/system-timers";
import { tapTransport } from "../transport/tap";
import { parseCliArgs, USAGE, type PlayOptions } from "./args";
import { HumanPlayer } from "./human";
import { GameLogger } from "./logger";
import { EXIT, Session, type Seats } from "./session";

const HEARTBEAT = new Set(["PI", "+PI"]);

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
            return listPorts();
        case "play":
            return play(options);
    }
}

async function listPorts(): Promise<number> {
    const ports = await listSerialPorts();
    if (ports.length === 0) process.stdout.write("No serial ports found.\n");
    for (const port of ports) process.stdout.write(`${port.path}${port.description ? `  ${port.description}` : ""}\n`);
    return EXIT.ok;
}

async function play(options: PlayOptions): Promise<number> {
    const write = (text: string) => process.stdout.write(text);
    let cpu: RupPlayer | null = null;
    const seed = options.seed ?? Date.now() % 1_000_000;
    const session = new Session(options, {
        write,
        now: () => new Date(),
        openFiles: (stem) => new GameLogger(options.logDir, stem, options.port !== null),
        seats: (gameNumber, s) => (cpu === null ? localSeats(s) : cpuSeats(options, gameNumber, s, cpu, seed)),
    });
    if (options.port === null) {
        write(`tommie-reversi ${version()}  black: human  white: human\n`);
        return withKeyboard(session, () => session.run());
    }

    write(`tommie-reversi ${version()}  CPU on ${options.port} (${options.baud})  CPU plays: ${options.fpga}  ` +
        `opponent: ${options.opponent}${options.opponent === "random" ? ` (seed ${seed})` : ""}\n`);
    let serial: LineTransport;
    try {
        serial = await openSerial(options.port, options.baud);
    } catch (error) {
        process.stderr.write(`error: ${errorMessage(error)}\n`);
        return EXIT.connection;
    }
    const transport = tapTransport(serial, (direction, line) => {
        session.logRup(direction, line);
        if (options.log && !HEARTBEAT.has(line)) write(`  ${direction} ${line}\n`);
    });
    const player = new RupPlayer({ transport, timers: systemTimers, onNotice: (text) => write(`note: ${text}\n`) });
    try {
        const { name, version: rup } = await player.connect();
        write(`connected: ${name}${rup ? ` (RUP ${rup})` : ""}\n`);
        cpu = player;
        return await withKeyboard(session, () => session.run());
    } catch (error) {
        process.stderr.write(`error: ${errorMessage(error)} from ${options.port}\n`);
        return EXIT.connection;
    } finally {
        await transport.close().catch(() => {});
    }
}

function localSeats(session: Session): Seats {
    const human = (name: string) => new HumanPlayer(name, session.interaction, () => session.timeLeftMs(), false);
    return { black: human("human (Black)"), white: human("human (White)"), humans: [BLACK, WHITE] };
}

function cpuSeats(options: PlayOptions, gameNumber: number, session: Session, cpu: Player, seed: number): Seats {
    const cpuColor: Color =
        options.fpga === "white" || (options.fpga === "alternate" && gameNumber % 2 === 0) ? WHITE : BLACK;
    const opponent: Player =
        options.opponent === "random"
            ? new RandomPlayer("random", seededRandom(seed + gameNumber))
            : new HumanPlayer("you", session.interaction, () => session.timeLeftMs(), true);
    const humans: Color[] = options.opponent === "human" ? [cpuColor === BLACK ? WHITE : BLACK] : [];
    return cpuColor === BLACK ? { black: cpu, white: opponent, humans } : { black: opponent, white: cpu, humans };
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

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
        process.stderr.write(`error: ${errorMessage(error)}\n`);
        process.exit(EXIT.connection);
    },
);
