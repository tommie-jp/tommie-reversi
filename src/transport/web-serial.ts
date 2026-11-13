// A serial port in the browser (Web Serial), as a LineTransport. Modelled on tommieChat's
// serial test page (public/js/test-web-serial-api.js):
// - the port is chosen with requestPort({}) (no filter), and kept for reconnecting
//   without the chooser; ports allowed before are listed by getPorts();
// - after open(), one writer is held and a read loop runs; lines go out with CR+LF;
// - closing goes in order: cancel the reader, release the writer, close the port, and
//   every step's failure is caught so the next step still runs;
// - a port is named by its USB ids, since Web Serial does not give the COM name.
// The WebUSB polyfill is not used (it did not find the Pico 2 in tommieChat's tests).

import { LineSplitter } from "../core/rup/lines";
import { Listeners, type LineTransport } from "../core/transport";

/** The part of the Web Serial SerialPort that is used (the DOM library has no types for it). */
export interface SerialPortLike {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerialLike {
    requestPort(options?: object): Promise<SerialPortLike>;
    getPorts(): Promise<SerialPortLike[]>;
}

export type WebSerialSupport = "ok" | "no-api" | "insecure";

/** Web Serial needs the API (Chrome, Edge; not iOS) and a secure page (HTTPS or localhost). */
export function webSerialSupport(nav: object, secure: boolean): WebSerialSupport {
    if (!("serial" in nav)) return "no-api";
    return secure ? "ok" : "insecure";
}

/** navigator.serial, when the browser has it. */
export function browserSerial(): SerialLike | null {
    return "serial" in navigator ? (navigator as unknown as { serial: SerialLike }).serial : null;
}

export function portLabel(port: SerialPortLike): string {
    const { usbVendorId, usbProductId } = port.getInfo();
    if (usbVendorId === undefined || usbProductId === undefined) return "serial port";
    const hex = (n: number) => n.toString(16).padStart(4, "0");
    return `${hex(usbVendorId)}:${hex(usbProductId)}`;
}

export async function openWebSerial(port: SerialPortLike, baudRate: number): Promise<LineTransport> {
    try {
        await port.open({ baudRate });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`cannot open the serial port (${portLabel(port)}): ${detail} Another app may be using it.`);
    }
    return new WebSerialTransport(port);
}

class WebSerialTransport implements LineTransport {
    private readonly lines = new Listeners<string>();
    private readonly closes = new Listeners<string>();
    private readonly splitter = new LineSplitter();
    private readonly encoder = new TextEncoder();
    private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private closing = false;
    private closed = false;
    private finished: Promise<void>;

    constructor(private readonly port: SerialPortLike) {
        if (port.writable === null || port.readable === null) throw new Error("the serial port is not open");
        this.writer = port.writable.getWriter();
        this.finished = this.readLoop(port.readable);
    }

    async sendLine(line: string): Promise<void> {
        if (this.closed || this.closing) throw new Error("connection closed");
        await this.writer.write(this.encoder.encode(line + "\r\n"));
    }

    onLine(listener: (line: string) => void): () => void {
        return this.lines.add(listener);
    }

    onClose(listener: (reason: string) => void): () => void {
        return this.closes.add(listener);
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closing = true;
        await this.reader?.cancel().catch(() => {});
        await this.finished;
    }

    private async readLoop(readable: ReadableStream<Uint8Array>): Promise<void> {
        const decoder = new TextDecoder();
        let reason = "closed";
        this.reader = readable.getReader();
        try {
            for (;;) {
                const { value, done } = await this.reader.read();
                if (done) break;
                for (const line of this.splitter.push(decoder.decode(value, { stream: true })).lines) this.lines.emit(line);
            }
        } catch (error) {
            if (!this.closing) reason = `the device has been unplugged (${error instanceof Error ? error.message : String(error)})`;
        }
        await this.shutDown();
        this.closed = true;
        this.closes.emit(reason);
    }

    /** Releases the reader and the writer, then closes the port. Each step's failure is ignored. */
    private async shutDown(): Promise<void> {
        try {
            this.reader?.releaseLock();
        } catch {
            // already released
        }
        try {
            this.writer.releaseLock();
        } catch {
            // already released
        }
        await this.port.close().catch(() => {});
    }
}
