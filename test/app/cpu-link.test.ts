import { describe, expect, it } from "vitest";
import { CpuLink } from "../../src/app/cpu-link";
import type { LineTransport } from "../../src/core/transport";
import { startFakeCpu } from "../../src/transport/fake-cpu";
import { createLoopbackPair } from "../../src/transport/loopback";
import { systemTimers } from "../../src/transport/system-timers";
import { ManualTimers } from "../helpers/manual-timers";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function setup(options: { logLimit?: number } = {}) {
    let now = 0;
    const notices: string[] = [];
    let changes = 0;
    const link = new CpuLink({
        timers: systemTimers,
        now: () => (now += 1),
        onChange: () => changes++,
        onNotice: (text) => notices.push(text),
        ...options,
    });
    let cpuEnd: LineTransport | null = null;
    const open = async () => {
        const [host, cpu] = createLoopbackPair();
        cpuEnd = cpu;
        startFakeCpu(cpu, { name: "fake-fpga", seed: 1 });
        return { transport: host, label: "2e8a:000a" };
    };
    return { link, notices, open, cpu: () => cpuEnd!, changes: () => changes };
}

describe("CpuLink", () => {
    it("starts with no connection", () => {
        const { link } = setup();
        expect(link.state).toEqual({ kind: "idle" });
        expect(link.player).toBeNull();
    });

    it("connects, checks the CPU and shows its name", async () => {
        const { link, open, changes } = setup();
        expect(await link.connect(open)).toBe(true);
        expect(link.state).toEqual({ kind: "connected", name: "fake-fpga", version: "03", port: "2e8a:000a" });
        expect(link.player?.name).toBe("fake-fpga");
        expect(changes()).toBeGreaterThanOrEqual(2);
    });

    it("keeps a log of the lines sent and received", async () => {
        const { link, open } = setup();
        await link.connect(open);
        expect(link.log.map((e) => `${e.direction} ${e.line}`)).toEqual([
            "TX PI", "RX +PI", "TX VE", "RX +VE03fake-fpga", "TX CA", "RX +CA PI VE CA SB SW MO PA BO EB EW ED EA",
        ]);
        expect(link.logText({ hidePing: true }).split("\n")[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] TX VE$/);
        expect(link.logText({ hidePing: false }).split("\n")).toHaveLength(6);
    });

    it("keeps only the newest log lines", async () => {
        const { link, open } = setup({ logLimit: 3 });
        await link.connect(open);
        expect(link.log.map((e) => e.line)).toEqual(["RX +VE03fake-fpga", "TX CA", "RX +CA PI VE CA SB SW MO PA BO EB EW ED EA"].map((l) => l.slice(3)));
    });

    it("reports a port that cannot be opened", async () => {
        const { link } = setup();
        const ok = await link.connect(async () => {
            throw new Error("cannot open the serial port (2e8a:000a): busy");
        });
        expect(ok).toBe(false);
        expect(link.state).toEqual({ kind: "failed", message: "cannot open the serial port (2e8a:000a): busy" });
    });

    it("reports a CPU that does not answer, and closes the port", async () => {
        const timers = new ManualTimers();
        const link = new CpuLink({ timers, now: () => 0, onChange: () => {}, onNotice: () => {} });
        const [host] = createLoopbackPair();
        let closed = false;
        host.onClose(() => (closed = true));
        const connecting = link.connect(async () => ({ transport: host, label: "x" }));
        await settle();
        await timers.advance(3_000);
        expect(await connecting).toBe(false);
        expect(link.state).toEqual({ kind: "failed", message: "no reply to PI (3 tries)" });
        expect(closed).toBe(true);
        expect(link.player).toBeNull();
    });

    it("says the connection is lost when the device goes away", async () => {
        const { link, open, cpu } = setup();
        await link.connect(open);
        await cpu().close();
        await settle();
        expect(link.state).toEqual({ kind: "lost", reason: "closed by the other end", port: "2e8a:000a" });
        expect(link.player).toBeNull();
    });

    it("goes back to idle when disconnected on purpose", async () => {
        const { link, open } = setup();
        await link.connect(open);
        await link.disconnect();
        await settle();
        expect(link.state).toEqual({ kind: "idle" });
        expect(link.player).toBeNull();
    });

    it("closes the old connection before a new one", async () => {
        const { link, open } = setup();
        await link.connect(open);
        const first = link.player;
        await link.connect(open);
        expect(link.player).not.toBe(first);
        expect(link.state.kind).toBe("connected");
    });

    it("passes on notices from the CPU player", async () => {
        const { link, open, notices, cpu } = setup();
        await link.connect(open);
        await cpu().sendLine("MOD3");
        await settle();
        expect(notices).toEqual(['ignored a line that breaks RUP (-04): "MOD3"']);
    });
});
