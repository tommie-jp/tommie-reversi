import { describe, expect, it } from "vitest";
import { createLoopbackPair } from "../../src/transport/loopback";
import { tapTransport } from "../../src/transport/tap";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLoopbackPair", () => {
    it("delivers a line sent on one end to the other", async () => {
        const [a, b] = createLoopbackPair();
        const got: string[] = [];
        b.onLine((line) => got.push(line));
        await a.sendLine("PI");
        await b.sendLine("+PI");
        expect(got).toEqual(["PI"]);
    });

    it("stops delivering to a listener that unsubscribed", async () => {
        const [a, b] = createLoopbackPair();
        const got: string[] = [];
        const stop = b.onLine((line) => got.push(line));
        stop();
        await a.sendLine("PI");
        expect(got).toEqual([]);
    });

    it("tells both ends when one closes, and refuses to send after that", async () => {
        const [a, b] = createLoopbackPair();
        const reasons: string[] = [];
        a.onClose((reason) => reasons.push(`a:${reason}`));
        b.onClose((reason) => reasons.push(`b:${reason}`));
        await a.close();
        await a.close();
        expect(reasons).toEqual(["a:closed", "b:closed by the other end"]);
        await expect(a.sendLine("PI")).rejects.toThrow("connection closed");
        await expect(b.sendLine("PI")).rejects.toThrow("connection closed");
    });
});

describe("tapTransport", () => {
    it("reports lines sent and received", async () => {
        const [a, b] = createLoopbackPair();
        const seen: string[] = [];
        const tapped = tapTransport(a, (direction, line) => seen.push(`${direction} ${line}`));
        const got: string[] = [];
        tapped.onLine((line) => got.push(line));
        await tapped.sendLine("PI");
        await b.sendLine("+PI");
        await settle();
        expect(seen).toEqual(["TX PI", "RX +PI"]);
        expect(got).toEqual(["+PI"]);
        const reasons: string[] = [];
        tapped.onClose((reason) => reasons.push(reason));
        await tapped.close();
        expect(reasons).toEqual(["closed"]);
    });
});
