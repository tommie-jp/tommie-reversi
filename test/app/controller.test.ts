import { describe, expect, it } from "vitest";
import { BLACK, WHITE, countDiscs } from "../../src/core/board";
import { GameController, type Snapshot } from "../../src/app/controller";
import { TapPlayer } from "../../src/app/tap-player";
import { RandomPlayer } from "../../src/core/players/random";
import { seededRandom } from "../../src/core/random";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
    const snapshots: Snapshot[] = [];
    let now = 0;
    const controller = new GameController({
        onChange: (snapshot) => snapshots.push(snapshot),
        now: () => now,
        clockLimitMs: 60_000,
    });
    return { controller, snapshots, advance: (ms: number) => (now += ms), last: () => snapshots.at(-1)! };
}

function people() {
    const black = new TapPlayer("Black");
    const white = new TapPlayer("White");
    return { black, white, seats: { black, white, humans: [BLACK, WHITE] } };
}

describe("GameController", () => {
    it("starts a game and reports it", async () => {
        const { controller, last } = setup();
        controller.start(people().seats);
        await tick();
        expect(last().state.status).toBe("playing");
        expect(last().names).toEqual({ black: "Black", white: "White" });
        expect(last().humanToMove).toBe(true);
        expect(last().result).toBeNull();
    });

    it("plays the moves tapped by two people", async () => {
        const { controller, last } = setup();
        controller.start(people().seats);
        await tick();
        expect(controller.tap("f5")).toBe("ok");
        await tick();
        expect(controller.tap("d6")).toBe("ok");
        await tick();
        expect(last().state.moves).toHaveLength(2);
        expect(countDiscs(last().state.board)).toEqual({ black: 3, white: 3 });
    });

    it("explains an illegal tap and leaves the game as it was", async () => {
        const { controller, last } = setup();
        controller.start(people().seats);
        await tick();
        expect(controller.tap("a1")).toBe("no-flips");
        expect(last().notice).toEqual({ kind: "illegal", square: "a1", error: "no-flips" });
        expect(last().state.moves).toHaveLength(0);
    });

    it("ignores taps while a non-human player moves", async () => {
        const { controller } = setup();
        let release: (() => void) | null = null;
        const slow = {
            name: "cpu",
            start: async () => {},
            requestMove: () => new Promise<never>((resolve) => (release = () => resolve({ kind: "resign" } as never))),
            opponentMoved: async () => {},
            finish: async () => {},
        };
        controller.start({ black: slow, white: new TapPlayer("you"), humans: [WHITE] });
        await tick();
        expect(controller.tap("f5")).toBe("not-your-turn");
        release!();
    });

    it("runs the clock of the side to move only", async () => {
        const { controller, advance } = setup();
        controller.start(people().seats);
        await tick();
        advance(10_000);
        expect(controller.timeLeftMs()).toEqual({ black: 50_000, white: 60_000 });
        controller.tap("f5");
        await tick();
        advance(5_000);
        expect(controller.timeLeftMs()).toEqual({ black: 60_000, white: 55_000 });
    });

    it("reports the result at the end of a game", async () => {
        const { controller, last } = setup();
        controller.start({
            black: new RandomPlayer("b", seededRandom(1)),
            white: new RandomPlayer("w", seededRandom(2)),
            humans: [],
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(last().state.status).toBe("finished");
        expect(last().result?.reason).toBe("normal");
        expect(last().humanToMove).toBe(false);
    });

    it("stops the running game when a new one starts", async () => {
        const { controller, last } = setup();
        const first = people();
        controller.start(first.seats);
        await tick();
        controller.tap("f5");
        await tick();
        controller.start(people().seats);
        await tick();
        await tick();
        expect(last().state.moves).toHaveLength(0);
        expect(last().state.status).toBe("playing");
        expect(first.white.waiting).toBe(false);
    });

    it("can be stopped", async () => {
        const { controller, last } = setup();
        controller.start(people().seats);
        await tick();
        controller.stop();
        await tick();
        expect(last().result).toEqual({ reason: "aborted", detail: "stopped" });
    });

    it("passes for a person who has no legal move, and refuses otherwise", async () => {
        const { controller } = setup();
        controller.start(people().seats);
        await tick();
        expect(controller.pass()).toBe("pass-not-allowed");
    });

    it("knows whether the person to move has to pass", async () => {
        const { controller, last } = setup();
        controller.start(people().seats);
        await tick();
        expect(last().mustPass).toBe(false);
    });
});
