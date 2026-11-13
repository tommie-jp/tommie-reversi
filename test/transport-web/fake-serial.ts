import type { SerialPortLike } from "../../src/transport/web-serial";

/** A serial port made of real web streams. `feed` sends bytes as if from the device. */
export class FakePort implements SerialPortLike {
    readable: ReadableStream<Uint8Array> | null = null;
    writable: WritableStream<Uint8Array> | null = null;
    readonly written: string[] = [];
    opened: { baudRate: number } | null = null;
    closed = false;
    failOpen: Error | null = null;
    private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

    constructor(private readonly info: { usbVendorId?: number; usbProductId?: number } = { usbVendorId: 0x2e8a, usbProductId: 0x000a }) {}

    getInfo() {
        return this.info;
    }

    async open(options: { baudRate: number }): Promise<void> {
        if (this.failOpen) throw this.failOpen;
        this.opened = options;
        this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (this.controller = c) });
        const decoder = new TextDecoder();
        this.writable = new WritableStream<Uint8Array>({ write: (chunk) => void this.written.push(decoder.decode(chunk)) });
    }

    async close(): Promise<void> {
        if (this.readable?.locked || this.writable?.locked) throw new Error("streams are still locked");
        this.closed = true;
        this.readable = null;
        this.writable = null;
    }

    feed(text: string): void {
        this.controller?.enqueue(new TextEncoder().encode(text));
    }

    /** The device goes away: the read stream fails. */
    unplug(): void {
        this.controller?.error(new Error("The device has been lost."));
    }
}
