// A fake homebrew CPU that speaks RUP v0.2 on one end of a transport. It plays random
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
    | "error-reply";

export interface FakeCpuOptions {
    readonly name: string;
    readonly seed: number;
    readonly misbehave?: Misbehaviour;
}

const CAPABILITIES = "PI VE CA SB SW MO PA BO EB EW ED";

export function startFakeCpu(transport: LineTransport, options: FakeCpuOptions): void {
    const random = seededRandom(options.seed);
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
            case "VE": return send(`+VE02${options.name}`);
            case "CA": return send(`+CA ${CAPABILITIES}`);
            case "SB": return start(BLACK);
            case "SW": return start(WHITE);
            case "MO":
            case "PA": return opponentMoved(line);
            case "BO": return;
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
