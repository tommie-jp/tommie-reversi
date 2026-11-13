import { describe, expect, it } from "vitest";
import { BLACK, WHITE } from "../../../src/core/board";
import { gameFromPosition, newGame } from "../../../src/core/game";
import { RandomPlayer } from "../../../src/core/players/random";
import { seededRandom } from "../../../src/core/random";
import { topRows } from "../../helpers/board";

describe("RandomPlayer", () => {
    it("plays one of the legal moves", async () => {
        const player = new RandomPlayer("random", seededRandom(1));
        const choice = await player.requestMove(newGame());
        expect(choice.kind).toBe("move");
        if (choice.kind === "move") expect(["d3", "c4", "f5", "e6"]).toContain(choice.square);
    });

    it("passes when it has no legal move", async () => {
        // White to move, but white's only disc (b3) cannot flank anything.
        const game = gameFromPosition(topRows("XXX.....", "........", "XO......"), WHITE);
        const player = new RandomPlayer("random", seededRandom(1));
        expect(await player.requestMove(game)).toEqual({ kind: "pass" });
    });

    it("repeats its choices for the same seed", async () => {
        const a = new RandomPlayer("a", seededRandom(9));
        const b = new RandomPlayer("b", seededRandom(9));
        expect(await a.requestMove(newGame())).toEqual(await b.requestMove(newGame()));
    });

    it("does nothing on start, opponentMoved and finish", async () => {
        const player = new RandomPlayer("random", seededRandom(1));
        await expect(player.start(BLACK)).resolves.toBeUndefined();
        await expect(player.opponentMoved({ kind: "pass", color: BLACK }, newGame())).resolves.toBeUndefined();
        await expect(player.finish({ reason: "aborted", detail: "x" })).resolves.toBeUndefined();
    });
});
