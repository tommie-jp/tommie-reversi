import { describe, expect, it, vi } from "vitest";
import { BLACK, WHITE } from "../../src/core/board";
import { gameFromPosition, newGame } from "../../src/core/game";
import { Interaction } from "../../src/cli/interaction";
import { topRows } from "../helpers/board";

function setup() {
    const output: string[] = [];
    const handlers = { onQuit: vi.fn(), onNew: vi.fn(), onBoard: vi.fn(), isHumanTurn: vi.fn(() => false) };
    const interaction = new Interaction((text) => output.push(text), handlers);
    return { interaction, output, handlers, text: () => output.join("") };
}

/** White to move with no legal move (black still has c3). */
const WHITE_MUST_PASS = gameFromPosition(topRows("XXX.....", "........", "XO......"), WHITE);

describe("Interaction", () => {
    it("returns a legal move typed by the person", async () => {
        const { interaction } = setup();
        const pending = interaction.requestMove(newGame(), "> ");
        interaction.handleLine("F5");
        expect(await pending).toEqual({ kind: "move", square: "f5" });
    });

    it("asks again after an illegal move and explains why", async () => {
        const { interaction, text } = setup();
        const pending = interaction.requestMove(newGame(), "> ");
        interaction.handleLine("a1");
        interaction.handleLine("zz");
        interaction.handleLine("d3");
        expect(await pending).toEqual({ kind: "move", square: "d3" });
        expect(text()).toContain("illegal: a1 does not flip any disc");
        expect(text()).toContain('unknown input: "zz"');
    });

    it("does not accept a pass when a move is possible, nor an empty line", async () => {
        const { interaction, text } = setup();
        const pending = interaction.requestMove(newGame(), "> ");
        interaction.handleLine("pass");
        interaction.handleLine("");
        interaction.handleLine("c4");
        expect(await pending).toEqual({ kind: "move", square: "c4" });
        expect(text()).toContain("you have a legal move, so you cannot pass");
    });

    it("accepts pass or Enter when there is no legal move, and refuses a square", async () => {
        const { interaction, text } = setup();
        const first = interaction.requestMove(WHITE_MUST_PASS, "> ");
        interaction.handleLine("c3");
        interaction.handleLine("");
        expect(await first).toEqual({ kind: "pass" });
        expect(text()).toContain("no legal move: you have to pass");
        const second = interaction.requestMove(WHITE_MUST_PASS, "> ");
        interaction.handleLine("pass");
        expect(await second).toEqual({ kind: "pass" });
    });

    it("ignores a move typed while it is not the person's turn", () => {
        const { interaction, text } = setup();
        interaction.handleLine("f5");
        expect(text()).toContain("Not your turn");
    });

    it("keeps moves typed early when a person moves next, and uses them in order", async () => {
        const { interaction, handlers, text } = setup();
        handlers.isHumanTurn.mockReturnValue(true);
        interaction.setInGame(true);
        interaction.handleLine("a1");
        interaction.handleLine("f5");
        expect(text()).not.toContain("Not your turn");
        const pending = interaction.requestMove(newGame(), "> ");
        expect(await pending).toEqual({ kind: "move", square: "f5" });
        expect(text()).toContain("illegal: a1 does not flip any disc");
    });

    it("forgets early moves when the game is stopped", async () => {
        const { interaction, handlers } = setup();
        handlers.isHumanTurn.mockReturnValue(true);
        interaction.setInGame(true);
        interaction.handleLine("f5");
        interaction.cancel();
        const pending = interaction.requestMove(newGame(), "> ");
        let settled = false;
        void pending.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);
    });

    it("reports when it is waiting for typed input with nothing kept", async () => {
        const { interaction, handlers } = setup();
        handlers.isHumanTurn.mockReturnValue(true);
        interaction.setInGame(true);
        interaction.handleLine("f5");
        expect(interaction.hasEarlyInput()).toBe(true);
        let idle = 0;
        interaction.onIdle(() => idle++);
        await interaction.requestMove(newGame(), "> ");
        expect(idle).toBe(0);
        void interaction.requestMove(newGame(), "> ");
        expect(idle).toBe(1);
        expect(interaction.hasEarlyInput()).toBe(false);
    });

    it("runs board and help at any time", () => {
        const { interaction, handlers, text } = setup();
        interaction.handleLine("board");
        interaction.handleLine("?");
        expect(handlers.onBoard).toHaveBeenCalledTimes(1);
        expect(text()).toContain("quit");
    });

    it("asks before quitting during a game", () => {
        const { interaction, handlers } = setup();
        interaction.setInGame(true);
        interaction.handleLine("quit");
        expect(handlers.onQuit).not.toHaveBeenCalled();
        interaction.handleLine("n");
        expect(handlers.onQuit).not.toHaveBeenCalled();
        interaction.handleLine("q");
        interaction.handleLine("y");
        expect(handlers.onQuit).toHaveBeenCalledTimes(1);
    });

    it("quits and starts a new game without asking when no game is running", () => {
        const { interaction, handlers } = setup();
        interaction.handleLine("new");
        interaction.handleLine("quit");
        expect(handlers.onNew).toHaveBeenCalledTimes(1);
        expect(handlers.onQuit).toHaveBeenCalledTimes(1);
    });

    it("does not show the move prompt again after a confirmed quit", () => {
        const { interaction, text } = setup();
        interaction.setInGame(true);
        void interaction.requestMove(newGame(), "PROMPT> ");
        interaction.handleLine("quit");
        interaction.handleLine("y");
        expect(text().split("PROMPT> ")).toHaveLength(2);
    });

    it("asks before abandoning a game for a new one", () => {
        const { interaction, handlers } = setup();
        interaction.setInGame(true);
        interaction.handleLine("new");
        interaction.handleLine("yes");
        expect(handlers.onNew).toHaveBeenCalledTimes(1);
    });

    it("drops a pending request when cancelled", async () => {
        const { interaction, text } = setup();
        const pending = interaction.requestMove(newGame(), "> ");
        interaction.cancel();
        interaction.handleLine("f5");
        expect(text()).toContain("Not your turn");
        let settled = false;
        void pending.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);
    });

    it("shows the prompt when asking for a move", () => {
        const { interaction, text } = setup();
        void interaction.requestMove(newGame(), "Black (you) to move. > ");
        expect(text()).toContain("Black (you) to move. > ");
        expect(BLACK).toBe(1);
    });
});
