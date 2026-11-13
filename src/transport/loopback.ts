// Two transports joined back to back: a line sent on one arrives on the other.
// Used to run the app against a fake CPU without hardware.

import { Listeners, type LineTransport } from "../core/transport";

class LoopbackEnd implements LineTransport {
    peer: LoopbackEnd | null = null;
    private readonly lines = new Listeners<string>();
    private readonly closes = new Listeners<string>();
    private closed = false;

    async sendLine(line: string): Promise<void> {
        if (this.closed) throw new Error("connection closed");
        const peer = this.peer;
        // Deliver later, as a real port would.
        await Promise.resolve();
        peer?.receive(line);
    }

    onLine(listener: (line: string) => void): () => void {
        return this.lines.add(listener);
    }

    onClose(listener: (reason: string) => void): () => void {
        return this.closes.add(listener);
    }

    async close(): Promise<void> {
        this.shut("closed");
        this.peer?.shut("closed by the other end");
    }

    private receive(line: string): void {
        if (!this.closed) this.lines.emit(line);
    }

    private shut(reason: string): void {
        if (this.closed) return;
        this.closed = true;
        this.closes.emit(reason);
    }
}

export function createLoopbackPair(): [LineTransport, LineTransport] {
    const a = new LoopbackEnd();
    const b = new LoopbackEnd();
    a.peer = b;
    b.peer = a;
    return [a, b];
}
