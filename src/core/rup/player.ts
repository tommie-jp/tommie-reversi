// A homebrew CPU on the other end of a transport, speaking RUP, seated as a Player.
// Works with RUP v0.2 CPUs and follows the v0.3 draft on the host side.
//
//   connect()            PI (up to 3 tries, 1 s each), then VE, then CA (does the CPU know EA?)
//                        a CPU that lists XS: its strategies, by name (see below)
//   start(black/white)   SB / SW, and PI every 3 s from then on
//   opponentMoved()      MOxx / PA
//   requestMove()        waits for MOxx / PA / EN
//   finish()             normal end or resignation: EB / EW / ED
//                        stopped game: EA (END ABORT, v0.3 draft) so the CPU goes back to
//                        idle; ED for a CPU that does not list EA in its +CA reply
//                        the CPU broke the rules: -05 first (v0.3 draft)
//
// After the end of a game the host sends PI. Moves that arrive before the CPU's +PI
// belong to the old game and are dropped, and the next game waits for that +PI
// (v0.3 draft: a CPU answers PI at once, so +PI marks "nothing older is on the way").
// A CPU that answers its last MO with PA can still be late by one line when the +PI
// that ends the wait was an older one; one such PA is dropped as well.
//
// The XS extension (an `X*` command some CPUs have, e.g. the FPGA Reversi): XS answers +XS<n>
// with the CPU's strategy, XS<n> picks strategy n outside a game, and VE then names it.
// connect() walks XS0, XS1, ... asking VE each time until the CPU refuses, then puts the
// CPU back on the strategy it had. A strategy chosen with chooseStrategy() is set with XS<n>
// at the start of a game, after the end of the last one has settled.
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
    /** Called when the CPU's name changes after connect() (a new strategy was set). */
    readonly onIdentity?: (name: string) => void;
}

/** One of the strategies of a CPU with the XS extension. */
export interface CpuStrategy {
    /** The number for XS<n>. */
    readonly index: number;
    /** The CPU's name (its VE reply) while playing this strategy. */
    readonly name: string;
}

/** How ask() treats an error reply `-NN`: let it through, answer "no", or hand it back. */
type OnError = "pass" | "no" | "reply";

export const RUP_VERSIONS: readonly string[] = ["02", "03"];
const SETTLE_TRIES = 3;
const REPLY_MS = 1_000;
const CONNECT_TRIES = 3;
const PING_INTERVAL_MS = 3_000;
const PING_MISSES = 3;
const SLOW_MOVE_MS = 90_000;
const MAX_STRATEGY_INDEX = 9;
const XS_IN_GAME = "06";

interface Waiter {
    readonly resolve: (move: PlayerMove) => void;
    readonly reject: (error: Error) => void;
}

export class RupPlayer implements Player {
    name = "RUP CPU";
    /** The CPU's strategies (XS extension), empty for a CPU without XS. */
    strategies: readonly CpuStrategy[] = [];
    /** The CPU's current strategy, or null when it has no XS. */
    strategy: number | null = null;
    /** The strategy to set at the start of the next game, or null for "leave it". */
    private wanted: number | null = null;
    private readonly inbox: PlayerMove[] = [];
    private waiter: Waiter | null = null;
    /** A lost connection: every later request fails. */
    private disconnected: Error | null = null;
    /** An error reply from the CPU: fails the current game only. */
    private cpuError: Error | null = null;
    /** Returns true when it has dealt with the message and nothing else should. */
    private replyListener: ((message: RupIn) => boolean) | null = null;
    private stopPing: (() => void) | null = null;
    private missedPings = 0;
    /** A normal game just ended; a PA arriving before the CPU's next move is a late answer. */
    private latePassPossible = false;
    private color: Color = BLACK;
    /** The CPU listed EA in its +CA reply. */
    private knowsAbort = false;
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
        // CA is optional in RUP: no answer, or an error answer, means "no EA".
        const ca = await this.ask({ type: "CA" }, (m) => m.type === "+CA", "no");
        const commands = ca !== null && ca.type === "+CA" ? ca.commands : [];
        this.knowsAbort = commands.includes("EA");
        if (ve === null || ve.type !== "+VE") {
            this.options.onNotice("no reply to VE; going on without a name");
            this.name = "unknown CPU";
            return { name: this.name, version: "" };
        }
        if (!RUP_VERSIONS.includes(ve.version)) {
            this.options.onNotice(`the CPU speaks RUP ${ve.version}; this app speaks RUP ${RUP_VERSIONS.join(" and ")}`);
        }
        this.name = ve.name === "" ? "unnamed CPU" : ve.name;
        if (commands.includes("XS")) await this.listStrategies();
        return { name: this.name, version: ve.version };
    }

    /** The strategy (XS extension) to set at the start of the next game; null leaves the CPU's own. */
    chooseStrategy(index: number | null): void {
        this.wanted = index;
    }

    async start(color: Color): Promise<void> {
        await this.settling;
        await this.applyStrategy();
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
        await this.send({ type: endLine(result, this.knowsAbort) }).catch(() => {});
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

    /** Walks XS0, XS1, ... naming each strategy with VE, then puts the CPU back as it was. */
    private async listStrategies(): Promise<void> {
        const current = await this.askXs();
        if (typeof current !== "number") return;
        const found: CpuStrategy[] = [];
        for (let index = 0; index <= MAX_STRATEGY_INDEX; index++) {
            let picked = await this.askXs(index);
            if (picked === "in-game" && index === 0) {
                // The CPU is still in a game (e.g. the page was reloaded): end it, then go on.
                await this.send({ type: this.knowsAbort ? "EA" : "ED" });
                picked = await this.askXs(index);
            }
            if (picked !== index) break;
            const ve = await this.ask({ type: "VE" }, (m) => m.type === "+VE");
            found.push({ index, name: ve?.type === "+VE" && ve.name !== "" ? ve.name : `strategy ${index}` });
        }
        this.strategies = found;
        if (found.length === 0) return;
        const restored = await this.askXs(current);
        this.strategy = typeof restored === "number" ? restored : found[found.length - 1]!.index;
        this.name = found.find((s) => s.index === this.strategy)?.name ?? this.name;
    }

    /** Sets the chosen strategy with XS<n> when it differs from the CPU's, and takes the new name. */
    private async applyStrategy(): Promise<void> {
        const wanted = this.wanted;
        if (wanted === null || this.strategy === null || wanted === this.strategy) return;
        if ((await this.askXs(wanted)) !== wanted) {
            this.options.onNotice(`the CPU refused XS${wanted}; it keeps its own strategy`);
            return;
        }
        this.strategy = wanted;
        const ve = await this.ask({ type: "VE" }, (m) => m.type === "+VE");
        if (ve?.type !== "+VE" || ve.name === "") return;
        this.name = ve.name;
        this.options.onIdentity?.(this.name);
    }

    /** XS (or XS<n>): the CPU's strategy afterwards, "in-game" for -06, null for no answer or another error. */
    private async askXs(index?: number): Promise<number | "in-game" | null> {
        const message: RupOut = index === undefined ? { type: "XS" } : { type: "XS", index };
        const reply = await this.ask(message, (m) => m.type === "+" && m.command === "XS", "reply");
        if (reply === null) return null;
        if (reply.type === "-") return reply.code === XS_IN_GAME ? "in-game" : null;
        if (reply.type !== "+" || !/^\d$/.test(reply.data)) return null;
        return Number(reply.data);
    }

    private send(message: RupOut): Promise<void> {
        return this.options.transport.sendLine(encode(message));
    }

    /**
     * Sends a query and waits up to a second for the reply that `matches`.
     * An error reply (`-NN`) is let through by default (it becomes a notice); with "no" it
     * ends the wait at once as "no", and with "reply" it ends the wait and is returned;
     * neither of those two makes a notice.
     */
    private ask(message: RupOut, matches: (reply: RupIn) => boolean, onError: OnError = "pass"): Promise<RupIn | null> {
        return new Promise((resolve) => {
            const cancel = this.options.timers.set(() => {
                this.replyListener = null;
                resolve(null);
            }, REPLY_MS);
            this.replyListener = (reply) => {
                const caught = reply.type === "-" && onError !== "pass";
                if (!caught && !matches(reply)) return false;
                cancel();
                this.replyListener = null;
                resolve(caught && onError === "no" ? null : reply);
                return caught;
            };
            this.send(message).catch(() => {});
        });
    }

    private receive(message: RupIn): void {
        if (message.type === "+PI") this.missedPings = 0;
        if (this.replyListener?.(message) === true) return;
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

/**
 * The end-of-game line for the CPU. A stopped game ends with EA (v0.3 draft); a CPU that
 * does not know EA gets ED, the end line that names no winner.
 */
function endLine(result: MatchResult, knowsAbort: boolean): "EB" | "EW" | "ED" | "EA" {
    if (result.reason === "normal") return ({ black: "EB", white: "EW", draw: "ED" } as const)[result.outcome];
    if (result.reason === "resign") return result.by === BLACK ? "EW" : "EB";
    return knowsAbort ? "EA" : "ED";
}
