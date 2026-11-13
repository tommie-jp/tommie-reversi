// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BLACK, WHITE } from "../../../src/core/board";
import { gameFromPosition, newGame, type GameState } from "../../../src/core/game";
import type { Snapshot } from "../../../src/app/controller";
import { messagesFor } from "../../../src/app/messages";
import { StatusView } from "../../../src/view/html/status-view";
import { topRows } from "../../helpers/board";

function snapshot(state: GameState, extra: Partial<Snapshot> = {}): Snapshot {
    return {
        state,
        names: { black: "SW-FPGA", white: "you" },
        humans: [WHITE],
        humanToMove: false,
        mustPass: false,
        markedSquare: null,
        result: null,
        notice: null,
        gameNumber: 1,
        startedAtMs: 0,
        ...extra,
    };
}

function setup() {
    const root = document.createElement("div");
    const handlers = { onPass: vi.fn(), onNewGame: vi.fn() };
    const view = new StatusView(root, messagesFor("ja"), handlers);
    const text = (selector: string) => root.querySelector(selector)!.textContent;
    const passButton = () => root.querySelector<HTMLButtonElement>(".pass")!;
    return { root, handlers, view, text, passButton };
}

describe("StatusView", () => {
    it("shows names and disc counts", () => {
        const { view, text } = setup();
        view.render(snapshot(newGame()));
        expect(text(".player.black .name")).toBe("SW-FPGA");
        expect(text(".player.white .name")).toBe("you");
        expect(text(".player.black .count")).toBe("2");
        expect(text(".player.white .count")).toBe("2");
    });

    it("marks the side to move", () => {
        const { root, view } = setup();
        view.render(snapshot(newGame()));
        expect(root.querySelector(".player.black")!.classList.contains("to-move")).toBe(true);
        expect(root.querySelector(".player.white")!.classList.contains("to-move")).toBe(false);
    });

    it.each<[string, Partial<Snapshot>, string]>([
        ["waiting for a CPU", {}, "SW-FPGA の手を待っています…"],
        ["a person to move", { humanToMove: true }, "黒の番です"],
        ["a marked square", { humanToMove: true, markedSquare: "f5" }, "f5 に打ちます。もう一度押すと決まります"],
        ["an illegal tap", { humanToMove: true, notice: { kind: "illegal", square: "a1", error: "no-flips" } }, "a1 は 1 つも返せません"],
        ["the result", { result: { reason: "aborted", detail: "stopped" } }, "対局をやめました"],
    ])("shows the message for %s", (_name, extra, message) => {
        const { view, text } = setup();
        view.render(snapshot(newGame(), extra));
        expect(text(".message")).toBe(message);
    });

    it("shows the result in place of the turn after the game", () => {
        const { root, view } = setup();
        const finished = gameFromPosition(topRows("XX......"), BLACK);
        view.render(snapshot(finished, { result: { reason: "normal", outcome: "black" } }));
        expect(root.querySelector(".message")!.textContent).toBe("終局: 黒 2 - 白 0。黒の勝ち");
        expect(root.querySelector(".message")!.classList.contains("result")).toBe(true);
    });

    it("marks a rule violation as an alert", () => {
        const { root, view } = setup();
        view.render(
            snapshot(newGame(), {
                result: { reason: "violation", by: BLACK, attempted: { kind: "move", square: "a1" }, error: "no-flips" },
            }),
        );
        expect(root.querySelector(".message")!.classList.contains("alert")).toBe(true);
        expect(root.querySelector(".message")!.getAttribute("role")).toBe("alert");
    });

    it("shows the pass button only when the person has to pass", () => {
        const { view, passButton, handlers } = setup();
        view.render(snapshot(newGame(), { humanToMove: true }));
        expect(passButton().hidden).toBe(true);
        view.render(snapshot(newGame(), { humanToMove: true, mustPass: true }));
        expect(passButton().hidden).toBe(false);
        passButton().click();
        expect(handlers.onPass).toHaveBeenCalledTimes(1);
    });

    it("shows both clocks, with the running side marked and colored by the time left", () => {
        const { root, view } = setup();
        view.render(snapshot(newGame()));
        view.renderClocks({ black: 9_000, white: 60_000 }, 60_000, BLACK);
        const black = root.querySelector<HTMLElement>(".player.black .clock")!;
        const white = root.querySelector<HTMLElement>(".player.white .clock")!;
        expect(black.textContent).toBe("9");
        expect(white.textContent).toBe("60");
        expect(black.dataset["level"]).toBe("danger");
        expect(white.dataset["level"]).toBe("ok");
        expect(black.classList.contains("running")).toBe(true);
        expect(white.classList.contains("running")).toBe(false);
        expect(black.style.getPropertyValue("--fraction")).toBe("0.15");
        view.renderClocks({ black: 60_000, white: 60_000 }, 60_000, null);
        expect(black.classList.contains("running")).toBe(false);
    });

    it("shows a note from the CPU link, and clears it", () => {
        const { root, view } = setup();
        view.setNote("the CPU has not moved for 90s (still waiting)");
        expect(root.querySelector<HTMLElement>(".note")!.hidden).toBe(false);
        expect(root.querySelector(".note")!.textContent).toBe("the CPU has not moved for 90s (still waiting)");
        view.setNote(null);
        expect(root.querySelector<HTMLElement>(".note")!.hidden).toBe(true);
    });

    it("asks for a new game", () => {
        const { root, view, handlers } = setup();
        view.render(snapshot(newGame()));
        root.querySelector<HTMLButtonElement>(".new-game")!.click();
        expect(handlers.onNewGame).toHaveBeenCalledTimes(1);
    });
});
