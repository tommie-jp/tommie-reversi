import { describe, expect, it } from "vitest";
import { BLACK, WHITE } from "../../src/core/board";
import { newGame } from "../../src/core/game";
import { RandomPlayer } from "../../src/core/players/random";
import { seededRandom } from "../../src/core/random";
import { buildSeats } from "../../src/app/seats";
import { TapPlayer } from "../../src/app/tap-player";

const cpu = new RandomPlayer("SW-FPGA", seededRandom(1));
const base = { person: "人", cpu, confirm: true, onChange: () => {} };

describe("buildSeats", () => {
    it("seats two people for a game between people, without the second tap", async () => {
        const seats = buildSeats({ opponent: "person", cpuColor: BLACK }, base)!;
        expect(seats.humans).toEqual([BLACK, WHITE]);
        expect(seats.black).toBeInstanceOf(TapPlayer);
        expect(seats.white).toBeInstanceOf(TapPlayer);
        const black = seats.black as TapPlayer;
        void black.requestMove(newGame());
        expect(black.tap("f5")).toBe("ok");
    });

    it("seats the CPU as black and the person as white", () => {
        const seats = buildSeats({ opponent: "cpu", cpuColor: BLACK }, base)!;
        expect(seats.black).toBe(cpu);
        expect(seats.white).toBeInstanceOf(TapPlayer);
        expect(seats.white.name).toBe("人");
        expect(seats.humans).toEqual([WHITE]);
    });

    it("seats the CPU as white and the person as black", () => {
        const seats = buildSeats({ opponent: "cpu", cpuColor: WHITE }, base)!;
        expect(seats.white).toBe(cpu);
        expect(seats.black).toBeInstanceOf(TapPlayer);
        expect(seats.humans).toEqual([BLACK]);
    });

    it("asks the person to tap twice against a CPU when the setting says so", () => {
        const seats = buildSeats({ opponent: "cpu", cpuColor: WHITE }, base)!;
        const person = seats.black as TapPlayer;
        void person.requestMove(newGame());
        expect(person.tap("f5")).toBe("pending");
        const once = buildSeats({ opponent: "cpu", cpuColor: WHITE }, { ...base, confirm: false })!;
        const quick = once.black as TapPlayer;
        void quick.requestMove(newGame());
        expect(quick.tap("f5")).toBe("ok");
    });

    it("cannot seat a CPU that is not connected", () => {
        expect(buildSeats({ opponent: "cpu", cpuColor: BLACK }, { ...base, cpu: null })).toBeNull();
    });
});
