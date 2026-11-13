// A serial port in Node, as a LineTransport. Lines are sent with CR+LF; received
// characters are cut into lines by LineSplitter (CR+LF, LF or CR).

import { SerialPort } from "serialport";
import { LineSplitter } from "../core/rup/lines";
import { Listeners, type LineTransport } from "../core/transport";

export interface PortInfo {
    readonly path: string;
    readonly description: string;
}

export async function listSerialPorts(): Promise<PortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
        path: port.path,
        description: [port.manufacturer, port.vendorId && `${port.vendorId}:${port.productId ?? ""}`]
            .filter(Boolean)
            .join(" "),
    }));
}

export async function openSerial(path: string, baudRate: number): Promise<LineTransport> {
    const port = new SerialPort({ path, baudRate, autoOpen: false });
    await new Promise<void>((resolve, reject) => {
        port.open((error) => (error ? reject(new Error(`cannot open ${path}: ${error.message}`)) : resolve()));
    });
    return new NodeSerialTransport(port);
}

class NodeSerialTransport implements LineTransport {
    private readonly lines = new Listeners<string>();
    private readonly closes = new Listeners<string>();
    private readonly splitter = new LineSplitter();
    private closed = false;
    private closeReason = "closed";

    constructor(private readonly port: SerialPort) {
        port.on("data", (data: Buffer) => {
            for (const line of this.splitter.push(data.toString("latin1")).lines) this.lines.emit(line);
        });
        port.on("error", (error: Error) => (this.closeReason = error.message));
        port.on("close", (error: { disconnected?: boolean; message?: string } | null) => {
            if (error?.disconnected) this.closeReason = "the port was unplugged";
            this.shut(this.closeReason);
        });
    }

    sendLine(line: string): Promise<void> {
        if (this.closed) return Promise.reject(new Error("connection closed"));
        return new Promise((resolve, reject) => {
            this.port.write(line + "\r\n", "latin1", (error) => {
                if (error) return reject(error);
                this.port.drain((drainError) => (drainError ? reject(drainError) : resolve()));
            });
        });
    }

    onLine(listener: (line: string) => void): () => void {
        return this.lines.add(listener);
    }

    onClose(listener: (reason: string) => void): () => void {
        return this.closes.add(listener);
    }

    close(): Promise<void> {
        if (this.closed || !this.port.isOpen) {
            this.shut("closed");
            return Promise.resolve();
        }
        return new Promise((resolve) => this.port.close(() => resolve()));
    }

    private shut(reason: string): void {
        if (this.closed) return;
        this.closed = true;
        this.closes.emit(reason);
    }
}
