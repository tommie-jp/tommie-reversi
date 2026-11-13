import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runMatch } from "../../src/core/match";
import { RandomPlayer } from "../../src/core/players/random";
import { seededRandom } from "../../src/core/random";
import { RupPlayer } from "../../src/core/rup/player";
import type { LineTransport } from "../../src/core/transport";
import { startFakeCpu } from "../../src/transport/fake-cpu";
import { listSerialPorts, openSerial } from "../../src/transport/node-serial";
import { systemTimers } from "../../src/transport/system-timers";

const hasSocat = spawnSync("socat", ["-V"]).status === 0;
const opened: LineTransport[] = [];
let socat: ChildProcess | null = null;

/** Starts socat with two joined pseudo-terminals and returns their paths. */
function virtualPortPair(): Promise<[string, string]> {
    return new Promise((resolve, reject) => {
        socat = spawn("socat", ["-d", "-d", "pty,raw,echo=0", "pty,raw,echo=0"]);
        const paths: string[] = [];
        socat.stderr?.on("data", (data: Buffer) => {
            for (const match of data.toString().matchAll(/PTY is (\S+)/g)) paths.push(match[1]!);
            if (paths.length === 2) resolve([paths[0]!, paths[1]!]);
        });
        socat.on("error", reject);
    });
}

afterEach(async () => {
    for (const transport of opened.splice(0)) await transport.close().catch(() => {});
    socat?.kill();
    socat = null;
});

describe.skipIf(!hasSocat)("openSerial over a socat pair", () => {
    it("sends and receives lines with CR+LF", async () => {
        const [a, b] = await virtualPortPair();
        const left = await openSerial(a, 115200);
        const right = await openSerial(b, 115200);
        opened.push(left, right);
        const got: string[] = [];
        right.onLine((line) => got.push(line));
        await left.sendLine("PI");
        await left.sendLine("MOf5");
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(got).toEqual(["PI", "MOf5"]);
    });

    it("plays a full game against the fake CPU", async () => {
        const [a, b] = await virtualPortPair();
        const host = await openSerial(a, 115200);
        const cpu = await openSerial(b, 115200);
        opened.push(host, cpu);
        startFakeCpu(cpu, { name: "fake-on-pty", seed: 2, misbehave: "board-after-move" });
        const player = new RupPlayer({ transport: host, timers: systemTimers, onNotice: () => {} });
        expect(await player.connect()).toEqual({ name: "fake-on-pty", version: "02" });
        const result = await runMatch({
            black: player,
            white: new RandomPlayer("random", seededRandom(4)),
            onEvent: () => {},
        });
        expect(result.reason).toBe("normal");
    });

    it("reports when the other end goes away", async () => {
        const [a] = await virtualPortPair();
        const port = await openSerial(a, 115200);
        opened.push(port);
        const reasons: string[] = [];
        port.onClose((reason) => reasons.push(reason));
        await port.close();
        expect(reasons).toEqual(["closed"]);
        await expect(port.sendLine("PI")).rejects.toThrow();
    });
});

describe("openSerial", () => {
    it("fails with a clear message for a port that does not exist", async () => {
        await expect(openSerial("/dev/does-not-exist-reversi", 115200)).rejects.toThrow(
            "cannot open /dev/does-not-exist-reversi",
        );
    });

    it("lists ports", async () => {
        const ports = await listSerialPorts();
        expect(Array.isArray(ports)).toBe(true);
    });
});
