// A homebrew CPU on the other end of a transport, speaking RUP, seated as a Player.
// Works with RUP v0.2 CPUs and follows the v0.3 draft on the host side.
//
//   connect()            PI (up to 3 tries, 1 s each), then VE
//   start(black/white)   SB / SW, and PI every 3 s from then on
//   opponentMoved()      MOxx / PA
//   requestMove()        waits for MOxx / PA / EN
//   finish()             normal end or resignation: EB / EW / ED
//                        stopped game: ED, so the CPU goes back to idle (v0.3 draft)
//                        the CPU broke the rules: -05 first (v0.3 draft)
//
// After the end of a game the host sends PI. Moves that arrive before the CPU's +PI
// belong to the old game and are dropped, and the next game waits for that +PI
// (v0.3 draft: a CPU answers PI at once, so +PI marks "nothing older is on the way").
// A CPU that answers its last MO with PA can still be late by one line when the +PI
// that ends the wait was an older one; one such PA is dropped as well.
//
// Other lines (BS, ST, NC, +XX, X*) are read past. An error reply `-NN` or a lost
// connection stops the game. The match checks whether the CPU's moves are legal.

import type { Color } from "../board";
import { BLACK } from "../board";
import type { GameState, Move } from "../game";
import type { MatchResult } from "../match";
import type { Player, PlayerMove } from "../player";
import type { Timers } from "../timers";
import type { LineTransport } from "../transport";
import { decode, encode, type RupIn, type RupOut } from "./codec";

export interface RupPlayerOptions {
    readonly transport: LineTransport;
    readonly timers: Timers;
    /** Things worth telling the person that do not stop the game. */
    readonly onNotice: (text: string) => void;
}

export const RUP_VERSIONS: readonly string[] = ["02", "03"];
const SETTLE_TRIES = 3;
const REPLY_MS = 1_000;
const CONNECT_TRIES = 3;
const PING_INTERVAL_MS = 3_000;
const PING_MISSES = 3;
const SLOW_MOVE_MS = 90_000;

interface Waiter {
    readonly resolve: (move: PlayerMove) => void;
    readonly reject: (error: Error) => void;
}

export class RupPlayer implements Player {
    name = "RUP CPU";
    private readonly inbox: PlayerMove[] = [];
    private waiter: Waiter | null = null;
    /** A lost connection: every later request fails. */
    private disconnected: Error | null = null;
    /** An error reply from the CPU: fails the current game only. */
    private cpuError: Error | null = null;
    private replyListener: ((message: RupIn) => void) | null = null;
    private stopPing: (() => void) | null = null;
    private missedPings = 0;
    /** A normal game just ended; a PA arriving before the CPU's next move is a late answer. */
    private latePassPossible = false;
    private color: Color = BLACK;
    /** Set after a game ends, until the CPU's +PI: moves arriving meanwhile are stale. */
    private settling: Promise<void> | null = null;

    constructor(private readonly options: RupPlayerOptions) {
        options.transport.onLine((line) => this.receive(decode(line)));
        options.transport.onClose((reason) => this.disconnect(`disconnected: ${reason}`));
    }

    async connect(): Promise<{ readonly name: string; readonly version: string }> {
        let alive = false;
        for (let attempt = 0; attempt < CONNECT_TRIES && !alive; attempt++) {
            alive = (await this.ask({ type: "PI" }, (m) => m.type === "+PI")) !== null;
        }
        if (!alive) throw new Error(`no reply to PI (${CONNECT_TRIES} tries)`);
        const ve = await this.ask({ type: "VE" }, (m) => m.type === "+VE");
        if (ve === null || ve.type !== "+VE") {
            this.options.onNotice("no reply to VE; going on without a name");
            this.name = "unknown CPU";
            return { name: this.name, version: "" };
        }
        if (!RUP_VERSIONS.includes(ve.version)) {
            this.options.onNotice(`the CPU speaks RUP ${ve.version}; this app speaks RUP ${RUP_VERSIONS.join(" and ")}`);
        }
        this.name = ve.name === "" ? "unnamed CPU" : ve.name;
        return { name: this.name, version: ve.version };
    }

    async start(color: Color): Promise<void> {
        await this.settling;
        this.color = color;
        this.cpuError = null;
        this.inbox.length = 0;
        await this.send({ type: color === BLACK ? "SB" : "SW" });
        this.startPing();
    }

    requestMove(_state: GameState): Promise<PlayerMove> {
        const failure = this.disconnected ?? this.cpuError;
        if (failure !== null) return Promise.reject(failure);
        const ready = this.inbox.shift();
        if (ready !== undefined) return Promise.resolve(ready);
        return new Promise((resolve, reject) => {
            const cancelSlow = this.options.timers.set(
                () => this.options.onNotice(`the CPU has not moved for ${SLOW_MOVE_MS / 1000}s (still waiting)`),
                SLOW_MOVE_MS,
            );
            this.waiter = {
                resolve: (move) => {
                    cancelSlow();
                    resolve(move);
                },
                reject: (error) => {
                    cancelSlow();
                    reject(error);
                },
            };
        });
    }

    async opponentMoved(move: Move, _state: GameState): Promise<void> {
        await this.send(move.kind === "move" ? { type: "MO", square: move.square } : { type: "PA" });
    }

    async finish(result: MatchResult): Promise<void> {
        this.stopHeartbeat();
        this.rejectWaiter(new Error("the game is over"));
        this.inbox.length = 0;
        if (this.disconnected !== null) return;
        if (result.reason === "violation" && result.by === this.color) {
            const tried = result.attempted.kind === "move" ? result.attempted.square : "PA";
            await this.send({ type: "-", code: "05", reason: `illegal move ${tried}` }).catch(() => {});
        }
        this.latePassPossible = result.reason === "normal";
        await this.send({ type: endLine(result) }).catch(() => {});
        this.settling = this.settle();
    }

    /** Sends PI and drops moves until the CPU answers, or gives up after a few tries. */
    private async settle(): Promise<void> {
        for (let attempt = 0; attempt < SETTLE_TRIES; attempt++) {
            if (this.disconnected !== null) break;
            if ((await this.ask({ type: "PI" }, (m) => m.type === "+PI")) !== null) break;
        }
        this.settling = null;
    }

    private send(message: RupOut): Promise<void> {
        return this.options.transport.sendLine(encode(message));
    }

    /** Sends a query and waits up to a second for the reply that `matches`. */
    private ask(message: RupOut, matches: (reply: RupIn) => boolean): Promise<RupIn | null> {
        return new Promise((resolve) => {
            const cancel = this.options.timers.set(() => {
                this.replyListener = null;
                resolve(null);
            }, REPLY_MS);
            this.replyListener = (reply) => {
                if (!matches(reply)) return;
                cancel();
                this.replyListener = null;
                resolve(reply);
            };
            this.send(message).catch(() => {});
        });
    }

    private receive(message: RupIn): void {
        if (message.type === "+PI") this.missedPings = 0;
        this.replyListener?.(message);
        switch (message.type) {
            case "MO":
            case "PA":
            case "EN":
                if (this.settling !== null) {
                    const line = message.type === "MO" ? `MO${message.square}` : message.type;
                    return this.options.onNotice(`ignored ${line}: it arrived after the game ended`);
                }
                return this.receiveMove(message);
            case "-": {
                const detail = `-${message.code}${message.reason ? `: ${message.reason}` : ""}`;
                // While connecting, an error answers a query (e.g. VE not supported): not fatal.
                if (this.replyListener !== null) return this.options.onNotice(`the CPU answered ${detail}`);
                this.cpuError ??= new Error(`CPU error ${detail}`);
                return this.rejectWaiter(this.cpuError);
            }
            case "RE":
                return this.options.onNotice("the CPU sent RE (restarted); not handled, ignored");
            case "RS":
                return this.options.onNotice("the CPU sent RS (resync); not handled, ignored");
            case "invalid":
                return this.options.onNotice(`ignored a line that breaks RUP (-${message.code}): "${message.raw}"`);
            default:
                return;
        }
    }

    private receiveMove(message: Extract<RupIn, { type: "MO" | "PA" | "EN" }>): void {
        if (message.type === "PA" && this.latePassPossible) {
            this.latePassPossible = false;
            return this.options.onNotice("ignored a PA that arrived after the last game ended");
        }
        this.latePassPossible = false;
        if (message.type === "MO") return this.deliver({ kind: "move", square: message.square });
        return this.deliver({ kind: message.type === "PA" ? "pass" : "resign" });
    }

    private deliver(move: PlayerMove): void {
        const waiter = this.waiter;
        if (waiter === null) {
            this.inbox.push(move);
            return;
        }
        this.waiter = null;
        waiter.resolve(move);
    }

    private disconnect(reason: string): void {
        this.stopHeartbeat();
        this.disconnected ??= new Error(reason);
        this.rejectWaiter(this.disconnected);
    }

    private rejectWaiter(error: Error): void {
        const waiter = this.waiter;
        this.waiter = null;
        waiter?.reject(error);
    }

    private stopHeartbeat(): void {
        this.stopPing?.();
        this.stopPing = null;
    }

    private startPing(): void {
        this.missedPings = 0;
        const tick = () => {
            if (this.missedPings >= PING_MISSES) {
                this.stopPing = null;
                return this.disconnect(`disconnected: no reply to PI (${PING_MISSES} times)`);
            }
            this.missedPings++;
            this.send({ type: "PI" }).catch(() => {});
            this.stopPing = this.options.timers.set(tick, PING_INTERVAL_MS);
        };
        this.stopPing = this.options.timers.set(tick, PING_INTERVAL_MS);
    }
}

/** The end-of-game line for the CPU. A stopped game ends as a draw: RUP has no "abort" line yet. */
function endLine(result: MatchResult): "EB" | "EW" | "ED" {
    if (result.reason === "normal") return ({ black: "EB", white: "EW", draw: "ED" } as const)[result.outcome];
    if (result.reason === "resign") return result.by === BLACK ? "EW" : "EB";
    return "ED";
}
