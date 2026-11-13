// Carries lines between this app and a CPU: Web Serial, a Node serial port, or a
// loopback for tests. Lines are passed without their line end; the transport adds
// CR+LF when sending and removes it when receiving.

export interface LineTransport {
    sendLine(line: string): Promise<void>;
    /** Returns a function that stops listening. */
    onLine(listener: (line: string) => void): () => void;
    /** Called once when the connection ends, with the reason. */
    onClose(listener: (reason: string) => void): () => void;
    close(): Promise<void>;
}

/** A small set of listeners, used by the transports. */
export class Listeners<T> {
    private readonly listeners = new Set<(value: T) => void>();

    add(listener: (value: T) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    emit(value: T): void {
        for (const listener of [...this.listeners]) listener(value);
    }
}
