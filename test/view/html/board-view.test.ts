// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BLACK, WHITE } from "../../../src/core/board";
import { newGame, playMove, type GameState } from "../../../src/core/game";
import type { Snapshot } from "../../../src/app/controller";
import { BoardView } from "../../../src/view/html/board-view";

function snapshot(state: GameState, extra: Partial<Snapshot> = {}): Snapshot {
    return {
        state,
        names: { black: "b", white: "w" },
        humans: [BLACK, WHITE],
        humanToMove: true,
        mustPass: false,
        markedSquare: null,
        result: null,
        notice: null,
        ...extra,
    };
}

function after(square: string): GameState {
    const result = playMove(newGame(), square);
    if (!result.ok) throw new Error(result.error);
    return result.value;
}

function setup() {
    const root = document.createElement("div");
    const onTap = vi.fn();
    const view = new BoardView(root, onTap);
    const cell = (square: string) => root.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)!;
    return { root, onTap, view, cell };
}

describe("BoardView", () => {
    it("draws 64 squares with file and rank labels", () => {
        const { root, view } = setup();
        view.render(snapshot(newGame()), { hints: true });
        expect(root.querySelectorAll("[data-square]")).toHaveLength(64);
        expect(root.querySelector(".board")!.getAttribute("aria-label")).toBeTruthy();
        expect([...root.querySelectorAll(".file-label")].map((e) => e.textContent).join("")).toBe("abcdefgh");
        expect([...root.querySelectorAll(".rank-label")].map((e) => e.textContent).join("")).toBe("12345678");
    });

    it("shows the discs of the initial board", () => {
        const { view, cell } = setup();
        view.render(snapshot(newGame()), { hints: false });
        expect(cell("d4").classList.contains("white")).toBe(true);
        expect(cell("e4").classList.contains("black")).toBe(true);
        expect(cell("a1").classList.contains("black")).toBe(false);
        expect(cell("a1").classList.contains("white")).toBe(false);
    });

    it("marks the legal squares when a person is to move and hints are on", () => {
        const { root, view } = setup();
        view.render(snapshot(newGame()), { hints: true });
        const hints = [...root.querySelectorAll(".hint")].map((e) => (e as HTMLElement).dataset["square"]);
        expect(hints.sort()).toEqual(["c4", "d3", "e6", "f5"]);
        view.render(snapshot(newGame(), { humanToMove: false }), { hints: true });
        expect(root.querySelectorAll(".hint")).toHaveLength(0);
        view.render(snapshot(newGame()), { hints: false });
        expect(root.querySelectorAll(".hint")).toHaveLength(0);
    });

    it("marks the last move and the square waiting for a second tap", () => {
        const { root, view, cell } = setup();
        view.render(snapshot(after("f5"), { markedSquare: "d6" }), { hints: true });
        expect(cell("f5").classList.contains("last")).toBe(true);
        expect(root.querySelectorAll(".last")).toHaveLength(1);
        expect(cell("d6").classList.contains("marked")).toBe(true);
    });

    it("names each square for screen readers", () => {
        const { view, cell } = setup();
        view.render(snapshot(newGame()), { hints: true });
        expect(cell("e4").getAttribute("aria-label")).toBe("e4 black");
        expect(cell("d3").getAttribute("aria-label")).toBe("d3 empty, legal");
    });

    it("reports the tapped square", () => {
        const { view, cell, onTap } = setup();
        view.render(snapshot(newGame()), { hints: true });
        cell("f5").click();
        expect(onTap).toHaveBeenCalledWith("f5");
    });

    it("keeps the same square elements between renders", () => {
        const { view, cell } = setup();
        view.render(snapshot(newGame()), { hints: true });
        const before = cell("a1");
        view.render(snapshot(after("f5")), { hints: true });
        expect(cell("a1")).toBe(before);
    });
});
