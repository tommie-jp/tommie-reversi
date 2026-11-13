import { describe, expect, it } from "vitest";
import { openWebSerial, portLabel, webSerialSupport } from "../../src/transport/web-serial";
import { FakePort } from "./fake-serial";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("webSerialSupport", () => {
    it("needs navigator.serial and a secure page", () => {
        expect(webSerialSupport({ serial: {} }, true)).toBe("ok");
        expect(webSerialSupport({}, true)).toBe("no-api");
        expect(webSerialSupport({ serial: {} }, false)).toBe("insecure");
    });
});

describe("portLabel", () => {
    it("names a port by its USB vendor and product ids", () => {
        expect(portLabel(new FakePort())).toBe("2e8a:000a");
        expect(portLabel(new FakePort({}))).toBe("serial port");
    });
});

describe("openWebSerial", () => {
    it("opens the port at the baud rate", async () => {
        const port = new FakePort();
        await openWebSerial(port, 115200);
        expect(port.opened).toEqual({ baudRate: 115200 });
    });

    it("sends lines with CR+LF", async () => {
        const port = new FakePort();
        const transport = await openWebSerial(port, 115200);
        await transport.sendLine("PI");
        await transport.sendLine("MOf5");
        expect(port.written).toEqual(["PI\r\n", "MOf5\r\n"]);
    });

    it("receives lines, joining pieces and accepting any line end", async () => {
        const port = new FakePort();
        const transport = await openWebSerial(port, 115200);
        const lines: string[] = [];
        transport.onLine((line) => lines.push(line));
        port.feed("+P");
        port.feed("I\r\nMOd3\r");
        port.feed("\nBS0000\n");
        await settle();
        expect(lines).toEqual(["+PI", "MOd3", "BS0000"]);
    });

    it("reports the end of the connection when the device is unplugged", async () => {
        const port = new FakePort();
        const transport = await openWebSerial(port, 115200);
        const reasons: string[] = [];
        transport.onClose((reason) => reasons.push(reason));
        port.unplug();
        await settle();
        expect(reasons).toEqual(["the device has been unplugged (The device has been lost.)"]);
        await expect(transport.sendLine("PI")).rejects.toThrow("connection closed");
        expect(port.closed).toBe(true);
    });

    it("closes in order: stop reading, release the writer, close the port", async () => {
        const port = new FakePort();
        const transport = await openWebSerial(port, 115200);
        const reasons: string[] = [];
        transport.onClose((reason) => reasons.push(reason));
        await transport.close();
        await transport.close();
        expect(port.closed).toBe(true);
        expect(reasons).toEqual(["closed"]);
    });

    it("fails with a clear message when the port cannot be opened", async () => {
        const port = new FakePort();
        port.failOpen = Object.assign(new Error("Failed to open serial port."), { name: "NetworkError" });
        await expect(openWebSerial(port, 115200)).rejects.toThrow(
            "cannot open the serial port (2e8a:000a): Failed to open serial port. Another app may be using it.",
        );
    });
});
