// Command-line options of the CLI (docs: CLI command specification).

import { parseArgs } from "node:util";
import { err, ok, type Result } from "../core/result";

export type FpgaColor = "black" | "white" | "alternate";
export type Opponent = "human" | "random";

export interface PlayOptions {
    readonly kind: "play";
    readonly port: string | null;
    readonly baud: number;
    readonly fpga: FpgaColor;
    readonly opponent: Opponent;
    readonly games: number;
    readonly seed: number | null;
    readonly seconds: number;
    readonly log: boolean;
    readonly logDir: string;
    readonly hints: boolean;
    readonly color: boolean;
}

export type CliOptions = PlayOptions | { readonly kind: "help" | "version" | "list-ports" };

export const BAUD_RATES: readonly number[] = [9600, 38400, 115200, 230400, 460800, 921600];
const FPGA_COLORS: readonly FpgaColor[] = ["black", "white", "alternate"];
const OPPONENTS: readonly Opponent[] = ["human", "random"];
const MAX_GAMES = 1000;
const MAX_SECONDS = 3600;

const OPTIONS = {
    port: { type: "string" },
    baud: { type: "string" },
    fpga: { type: "string" },
    opponent: { type: "string" },
    games: { type: "string" },
    seed: { type: "string" },
    seconds: { type: "string" },
    log: { type: "boolean" },
    "log-dir": { type: "string" },
    "no-hints": { type: "boolean" },
    "no-color": { type: "boolean" },
    "list-ports": { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];

export function parseCliArgs(
    argv: readonly string[],
    env: Readonly<Record<string, string | undefined>>,
): Result<CliOptions, string> {
    let values: Values;
    try {
        values = parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: false }).values;
    } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
    }
    if (values.help) return ok({ kind: "help" });
    if (values.version) return ok({ kind: "version" });
    if (values["list-ports"]) return ok({ kind: "list-ports" });
    return playOptions(values, env);
}

function playOptions(values: Values, env: Readonly<Record<string, string | undefined>>): Result<CliOptions, string> {
    const port = values.port ?? null;
    if (port === "") return err("--port must not be empty");
    const needsPort = (["fpga", "opponent", "baud"] as const).find((name) => values[name] !== undefined);
    if (port === null && needsPort !== undefined) return err(`--${needsPort} needs --port`);

    const fpga = oneOf(values.fpga ?? "black", FPGA_COLORS, "--fpga");
    const opponent = oneOf(values.opponent ?? "human", OPPONENTS, "--opponent");
    const baud = oneOf(values.baud ?? "115200", BAUD_RATES.map(String), "--baud");
    const games = integer(values.games ?? "1", 1, MAX_GAMES, "--games");
    const seconds = integer(values.seconds ?? "60", 1, MAX_SECONDS, "--seconds");
    const seed = values.seed === undefined ? ok(null) : integer(values.seed, 0, Number.MAX_SAFE_INTEGER, "--seed");
    for (const checked of [fpga, opponent, baud, games, seconds, seed]) {
        if (!checked.ok) return checked;
    }
    if (!fpga.ok || !opponent.ok || !baud.ok || !games.ok || !seconds.ok || !seed.ok) return err("unreachable");

    if (games.value > 1 && opponent.value !== "random") return err("--games above 1 needs --opponent random");
    if (seed.value !== null && opponent.value !== "random") return err("--seed needs --opponent random");

    return ok({
        kind: "play",
        port,
        baud: Number(baud.value),
        fpga: fpga.value,
        opponent: opponent.value,
        games: games.value,
        seed: seed.value,
        seconds: seconds.value,
        log: values.log ?? false,
        logDir: values["log-dir"] ?? "logs",
        hints: !(values["no-hints"] ?? false),
        color: !(values["no-color"] ?? false) && !env["NO_COLOR"],
    });
}

function oneOf<T extends string>(value: string, allowed: readonly T[], name: string): Result<T, string> {
    return (allowed as readonly string[]).includes(value)
        ? ok(value as T)
        : err(`${name} must be one of ${allowed.join(", ")} (got "${value}")`);
}

function integer(value: string, min: number, max: number, name: string): Result<number, string> {
    const number = /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
    if (Number.isSafeInteger(number) && number >= min && number <= max) return ok(number);
    const range = max === Number.MAX_SAFE_INTEGER ? `from ${min}` : `from ${min} to ${max}`;
    return err(`${name} must be an integer ${range} (got "${value}")`);
}

export const USAGE = `Usage: npm run cli -- [options]

Play Reversi in the terminal: person against person, or against a homebrew CPU over RUP.

Options:
  --port <path>          serial port of the CPU (e.g. /dev/ttyACM0); without it, person vs person
  --baud <n>             ${BAUD_RATES.join(", ")} (default 115200)
  --fpga <color>         black, white or alternate (default black)
  --opponent <who>       human or random (default human)
  --games <n>            games in a row, 1-${MAX_GAMES} (default 1; above 1 needs --opponent random)
  --seed <n>             seed for the random opponent (default: current time)
  --seconds <n>          seconds per move shown on the clock, 1-${MAX_SECONDS} (default 60)
  --log                  also print the RUP lines on screen (PI/+PI are left out)
  --log-dir <path>       where records and RUP logs are written (default ./logs)
  --no-hints             do not mark the legal squares
  --no-color             no colors (also when NO_COLOR is set)
  --list-ports           list serial ports and exit
  -h, --help             show this help and exit
  -v, --version          show the version and exit`;
