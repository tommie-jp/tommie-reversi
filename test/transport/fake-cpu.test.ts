import { describe, expect, it } from "vitest";
import { startFakeCpu, type FakeCpuOptions } from "../../src/transport/fake-cpu";
import { createLoopbackPair } from "../../src/transport/loopback";
import type { LineTransport } from "../../src/core/transport";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function talk(options: Partial<FakeCpuOptions>, lines: string[]): Promise<string[]> {
    const [host, cpu] = createLoopbackPair();
    startFakeCpu(cpu, { name: "fake", seed: 1, ...options });
    const got: string[] = [];
    host.onLine((line) => got.push(line));
    for (const line of lines) {
        await host.sendLine(line);
        await settle();
    }
    return got;
}

describe("startFakeCpu", () => {
    it("answers PI, VE and CA", async () => {
        expect(await talk({}, ["PI", "VE", "CA"])).toEqual([
            "+PI",
            "+VE03fake",
            "+CA PI VE CA SB SW MO PA BO EB EW ED EA",
        ]);
    });

    it("can act as a RUP v0.2 CPU, which does not know EA", async () => {
        expect(await talk({ version: "02" }, ["VE", "CA", "SW", "EA"])).toEqual([
            "+VE02fake",
            "+CA PI VE CA SB SW MO PA BO EB EW ED",
            "-01 unknown command",
        ]);
    });

    it("forgets the game after EA", async () => {
        const got = await talk({}, ["SW", "MOf5", "EA", "MOd6"]);
        expect(got).toHaveLength(2);
        expect(got[1]).toBe("-06 no game");
    });

    it("moves first after SB with a legal opening move", async () => {
        const [reply] = await talk({}, ["SB"]);
        expect(["MOd3", "MOc4", "MOf5", "MOe6"]).toContain(reply);
    });

    it("waits after SW and answers the host's move", async () => {
        const got = await talk({}, ["SW", "MOf5"]);
        expect(got).toHaveLength(1);
        expect(["MOd6", "MOf6", "MOf4"]).toContain(got[0]);
    });

    it("answers unknown and lowercase commands with an error", async () => {
        expect(await talk({}, ["ZZ", "pi"])).toEqual(["-01 unknown command", "-02 lowercase command"]);
    });

    it("answers an illegal move from the host with -05", async () => {
        expect(await talk({}, ["SW", "MOa1"])).toEqual(["-05 illegal move a1"]);
    });

    it("can be told to play an illegal move", async () => {
        const got = await talk({ misbehave: "illegal-move" }, ["SB"]);
        expect(got).toEqual(["MOa1"]);
    });

    it("can be told to pass when it has a move", async () => {
        expect(await talk({ misbehave: "bad-pass" }, ["SB"])).toEqual(["PA"]);
    });

    it("can be told to stay silent after the game starts", async () => {
        expect(await talk({ misbehave: "silent" }, ["PI", "SB", "PI"])).toEqual(["+PI", "+PI"]);
    });

    it("can be told to send BS after each move", async () => {
        const got = await talk({ misbehave: "board-after-move" }, ["SB"]);
        expect(got).toHaveLength(2);
        expect(got[1]).toMatch(/^BS[012]{64}$/);
    });

    it("can be told to reject the host's move with an error reply", async () => {
        expect(await talk({ misbehave: "error-reply" }, ["SW", "MOf5"])).toEqual(["-04 bad coord"]);
    });

    it("forgets the game after EB, EW or ED", async () => {
        const got = await talk({}, ["SW", "MOf5", "ED", "SW", "MOf5"]);
        expect(got).toHaveLength(2);
    });

    it("stops answering when the connection closes", async () => {
        const [host, cpu]: [LineTransport, LineTransport] = createLoopbackPair();
        startFakeCpu(cpu, { name: "fake", seed: 1 });
        await host.close();
        await expect(host.sendLine("PI")).rejects.toThrow();
    });
});
