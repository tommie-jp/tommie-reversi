// The connection to a homebrew CPU: open a transport, check the CPU over RUP, keep a log of
// every line, and notice when the connection is lost. The transport is opened by a function
// passed in (Web Serial in the browser, a loopback with a fake CPU in tests).

import { formatLogLine, type Direction } from "../core/rup/log-format";
import { RupPlayer } from "../core/rup/player";
import type { Timers } from "../core/timers";
import type { LineTransport } from "../core/transport";
import { tapTransport } from "../transport/tap";

export type LinkState =
    | { readonly kind: "idle" }
    | { readonly kind: "connecting" }
    | { readonly kind: "connected"; readonly name: string; readonly version: string; readonly port: string }
    | { readonly kind: "lost"; readonly reason: string; readonly port: string }
    | { readonly kind: "failed"; readonly message: string };

export interface LogEntry {
    readonly timeMs: number;
    readonly direction: Direction;
    readonly line: string;
}

export interface OpenedPort {
    readonly transport: LineTransport;
    /** A short name for the port, e.g. its USB ids. */
    readonly label: string;
}

export interface CpuLinkOptions {
    readonly timers: Timers;
    readonly now: () => number;
    readonly onChange: () => void;
    readonly onNotice: (text: string) => void;
    readonly logLimit?: number;
}

const DEFAULT_LOG_LIMIT = 2000;
const HEARTBEAT = new Set(["PI", "+PI"]);

export class CpuLink {
    private current: LinkState = { kind: "idle" };
    private entries: LogEntry[] = [];
    private transport: LineTransport | null = null;
    private cpu: RupPlayer | null = null;
    private closingOnPurpose = false;

    constructor(private readonly options: CpuLinkOptions) {}

    get state(): LinkState {
        return this.current;
    }

    /** The CPU, ready to be seated in a game, while connected. */
    get player(): RupPlayer | null {
        return this.cpu;
    }

    get log(): readonly LogEntry[] {
        return this.entries;
    }

    logText(options: { readonly hidePing: boolean }): string {
        return this.entries
            .filter((entry) => !(options.hidePing && HEARTBEAT.has(entry.line)))
            .map((entry) => formatLogLine(new Date(entry.timeMs), entry.direction, entry.line))
            .join("\n");
    }

    /** Opens the port with `open` (call it from a tap for Web Serial) and checks the CPU. */
    async connect(open: () => Promise<OpenedPort>): Promise<boolean> {
        await this.disconnect();
        this.set({ kind: "connecting" });
        let opened: OpenedPort;
        try {
            opened = await open();
        } catch (error) {
            this.set({ kind: "failed", message: messageOf(error) });
            return false;
        }
        const transport = tapTransport(opened.transport, (direction, line) => this.record(direction, line));
        transport.onClose((reason) => this.onClosed(transport, reason, opened.label));
        const player = new RupPlayer({ transport, timers: this.options.timers, onNotice: this.options.onNotice });
        this.transport = transport;
        try {
            const { name, version } = await player.connect();
            this.cpu = player;
            this.set({ kind: "connected", name, version, port: opened.label });
            return true;
        } catch (error) {
            await this.disconnect();
            this.set({ kind: "failed", message: messageOf(error) });
            return false;
        }
    }

    async disconnect(): Promise<void> {
        const transport = this.transport;
        if (transport === null) return;
        this.closingOnPurpose = true;
        this.transport = null;
        this.cpu = null;
        await transport.close().catch(() => {});
        this.closingOnPurpose = false;
        this.set({ kind: "idle" });
    }

    private onClosed(transport: LineTransport, reason: string, port: string): void {
        if (this.closingOnPurpose || transport !== this.transport) return;
        this.transport = null;
        this.cpu = null;
        this.set({ kind: "lost", reason, port });
    }

    private record(direction: Direction, line: string): void {
        this.entries.push({ timeMs: this.options.now(), direction, line });
        const limit = this.options.logLimit ?? DEFAULT_LOG_LIMIT;
        if (this.entries.length > limit) this.entries = this.entries.slice(-limit);
    }

    private set(state: LinkState): void {
        this.current = state;
        this.options.onChange();
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
