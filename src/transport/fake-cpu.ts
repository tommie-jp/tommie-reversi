// A fake homebrew CPU that speaks RUP on one end of a transport: the v0.3 draft by
// default (it knows EA), or v0.2. It plays random
// legal moves, and can be told to break the rules in one of several ways, to test how
// the app reacts.

import { BLACK, WHITE, boardToBO, indexToSquare, type Color } from "../core/board";
import { mustPass, newGame, playMove, playPass, type GameState } from "../core/game";
import { seededRandom } from "../core/random";
import { legalMoves } from "../core/rules";
import type { LineTransport } from "../core/transport";

export type Misbehaviour =
    /** Plays a1 (illegal at the start) as its first move. */
    | "illegal-move"
    /** Sends PA as its first move although it has a legal move. */
    | "bad-pass"
    /** Answers PI but never moves. */
    | "silent"
    /** Sends a BS board line after every move, like the current FPGA. */
    | "board-after-move"
    /** Answers the host's first move with -04. */
    | "error-reply"
    /** Answers the last move of a game with PA, like the current FPGA does. */
    | "pass-after-end";

export interface FakeCpuOptions {
    readonly name: string;
    readonly seed: number;
    readonly misbehave?: Misbehaviour;
    /** RUP version to act as. Default "03". */
    readonly version?: "02" | "03";
    /**
     * With names here, the CPU has the XS extension (like the FPGA Reversi): XS<n> picks
     * strategy n outside a game, and VE answers with that strategy's name. It plays random
     * moves whatever the strategy.
     */
    readonly strategies?: readonly string[];
}

const CAPABILITIES_V02 = "PI VE CA SB SW MO PA BO EB EW ED";

export function startFakeCpu(transport: LineTransport, options: FakeCpuOptions): void {
    const random = seededRandom(options.seed);
    const version = options.version ?? "03";
    const strategies = options.strategies ?? [];
    const base = version === "03" ? `${CAPABILITIES_V02} EA` : CAPABILITIES_V02;
    const capabilities = strategies.length > 0 ? `${base} XS` : base;
    let strategy = 0;
    let game: GameState | null = null;
    let color: Color = BLACK;
    let misbehaved = false;
    const send = (line: string) => void transport.sendLine(line).catch(() => {});

    const once = (kind: Misbehaviour): boolean => {
        if (options.misbehave !== kind || misbehaved) return false;
        misbehaved = true;
        return true;
    };

    const myMove = (): void => {
        if (game !== null && game.status === "finished" && options.misbehave === "pass-after-end") return send("PA");
        if (game === null || game.status !== "playing" || game.turn !== color) return;
        if (options.misbehave === "silent") return;
        if (once("illegal-move")) return send("MOa1");
        if (once("bad-pass")) return send("PA");
        if (mustPass(game)) {
            game = unwrap(playPass(game));
            return send("PA");
        }
        const moves = legalMoves(game.board, color);
        const square = indexToSquare(moves[Math.floor(random() * moves.length)]!);
        game = unwrap(playMove(game, square));
        send("MO" + square);
        if (options.misbehave === "board-after-move") send("BS" + boardToBO(game.board));
    };

    const opponentMoved = (line: string): void => {
        if (game === null) return send("-06 no game");
        if (once("error-reply")) return send("-04 bad coord");
        const result = line === "PA" ? playPass(game) : playMove(game, line.slice(2));
        if (!result.ok) return send(`-05 illegal move ${line === "PA" ? "PA" : line.slice(2)}`);
        game = result.value;
        myMove();
    };

    const start = (as: Color): void => {
        game = newGame();
        color = as;
        myMove();
    };

    transport.onLine((line) => {
        if (/^[a-z]{2}/i.test(line) && !/^[A-Z]{2}/.test(line)) return send("-02 lowercase command");
        const command = line.slice(0, 2);
        switch (command) {
            case "PI": return send("+PI");
            case "VE": return send(`+VE${version}${strategies[strategy] ?? options.name}`);
            case "CA": return send(`+CA ${capabilities}`);
            case "SB": return start(BLACK);
            case "SW": return start(WHITE);
            case "MO":
            case "PA": return opponentMoved(line);
            case "BO": return;
            case "XS": {
                if (strategies.length === 0) return send("-01 unknown command");
                if (line === "XS") return send(`+XS${strategy}`);
                const n = /^XS(\d)$/.test(line) ? Number(line.slice(2)) : -1;
                if (n < 0 || n >= strategies.length) return send("-00 bad arg");
                if (game !== null) return send("-06 in game");
                strategy = n;
                return send(`+XS${n}`);
            }
            case "EA":
                if (version === "02") return send("-01 unknown command");
                game = null;
                return;
            case "EB":
            case "EW":
            case "ED":
                game = null;
                return;
            default:
                return send("-01 unknown command");
        }
    });
}

function unwrap(result: ReturnType<typeof playMove>): GameState {
    if (!result.ok) throw new Error(`fake cpu: ${result.error}`);
    return result.value;
}
