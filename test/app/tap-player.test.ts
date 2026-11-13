import { describe, expect, it } from "vitest";
import { WHITE } from "../../src/core/board";
import { gameFromPosition, newGame } from "../../src/core/game";
import { TapPlayer } from "../../src/app/tap-player";
import { topRows } from "../helpers/board";

const WHITE_MUST_PASS = gameFromPosition(topRows("XXX.....", "........", "XO......"), WHITE);

describe("TapPlayer", () => {
    it("is not waiting before it is asked for a move", () => {
        const player = new TapPlayer("you");
        expect(player.waiting).toBe(false);
        expect(player.tap("f5")).toBe("not-your-turn");
    });

    it("returns a legal tapped square as its move", async () => {
        const player = new TapPlayer("you");
        const pending = player.requestMove(newGame());
        expect(player.waiting).toBe(true);
        expect(player.tap("f5")).toBe("ok");
        expect(await pending).toEqual({ kind: "move", square: "f5" });
        expect(player.waiting).toBe(false);
    });

    it("refuses an illegal square and keeps waiting", async () => {
        const player = new TapPlayer("you");
        const pending = player.requestMove(newGame());
        expect(player.tap("a1")).toBe("no-flips");
        expect(player.tap("d4")).toBe("occupied");
        expect(player.waiting).toBe(true);
        expect(player.tap("d3")).toBe("ok");
        expect(await pending).toEqual({ kind: "move", square: "d3" });
    });

    it("passes only when there is no legal move", async () => {
        const player = new TapPlayer("you");
        void player.requestMove(newGame());
        expect(player.pass()).toBe("pass-not-allowed");
        player.cancel();
        const pending = player.requestMove(WHITE_MUST_PASS);
        expect(player.tap("c3")).toBe("must-pass");
        expect(player.pass()).toBe("ok");
        expect(await pending).toEqual({ kind: "pass" });
    });

    it("needs a second tap on the same square when asked to confirm", async () => {
        const player = new TapPlayer("you", { confirm: true });
        const pending = player.requestMove(newGame());
        expect(player.tap("f5")).toBe("pending");
        expect(player.pendingSquare).toBe("f5");
        expect(player.tap("d3")).toBe("pending");
        expect(player.pendingSquare).toBe("d3");
        expect(player.tap("d3")).toBe("ok");
        expect(await pending).toEqual({ kind: "move", square: "d3" });
        expect(player.pendingSquare).toBeNull();
    });

    it("forgets the move request when the game ends", async () => {
        const player = new TapPlayer("you", { confirm: true });
        void player.requestMove(newGame());
        player.tap("f5");
        await player.finish({ reason: "aborted", detail: "x" });
        expect(player.waiting).toBe(false);
        expect(player.pendingSquare).toBeNull();
        expect(player.tap("f5")).toBe("not-your-turn");
    });

    it("tells a listener when it starts and stops waiting", async () => {
        const changes: boolean[] = [];
        const player = new TapPlayer("you", { onChange: () => changes.push(player.waiting) });
        const pending = player.requestMove(newGame());
        player.tap("f5");
        await pending;
        expect(changes).toEqual([true, false]);
    });
});
