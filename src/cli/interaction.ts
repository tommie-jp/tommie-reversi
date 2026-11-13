// What to do with each line the person types. Kept apart from readline so it can be tested.
//
// While the person is asked for a move, a square or a pass is checked against the rules
// and asked again if it is illegal. A move typed a little early, while a person is about
// to move (lines pasted or piped in), is kept and used in order. A move typed while the
// CPU is to move is ignored. board, help, new and quit work at any time; new and quit
// ask first during a game.

import type { PlayerMove } from "../core/player";
import { mustPass, playMove, type GameState } from "../core/game";
import { HELP_TEXT, parseInput } from "../view/terminal/input";
import { describeGameError } from "../view/terminal/render";

export interface InteractionHandlers {
    onQuit(): void;
    onNew(): void;
    onBoard(): void;
    /** True when the side to move is a person at this keyboard. */
    isHumanTurn(): boolean;
}

interface Pending {
    readonly state: GameState;
    readonly prompt: string;
    readonly resolve: (move: PlayerMove) => void;
}

const YES = new Set(["y", "yes"]);

export class Interaction {
    private pending: Pending | null = null;
    private early: string[] = [];
    private idleListener: (() => void) | null = null;
    private confirming: (() => void) | null = null;
    private inGame = false;

    constructor(
        private readonly write: (text: string) => void,
        private readonly handlers: InteractionHandlers,
    ) {}

    setInGame(inGame: boolean): void {
        this.inGame = inGame;
    }

    requestMove(state: GameState, prompt: string): Promise<PlayerMove> {
        return new Promise((resolve) => {
            this.pending = { state, prompt, resolve };
            this.write(prompt);
            while (this.pending !== null && this.early.length > 0) this.handleMove(this.early.shift()!);
            if (this.pending !== null) this.idleListener?.();
        });
    }

    /** True while moves typed early are still waiting to be played. */
    hasEarlyInput(): boolean {
        return this.early.length > 0;
    }

    /** Called whenever a person is asked to move and no early input is left. */
    onIdle(listener: (() => void) | null): void {
        this.idleListener = listener;
    }

    /** Forgets the move request (the game was stopped). */
    cancel(): void {
        this.pending = null;
        this.early = [];
    }

    handleLine(line: string): void {
        if (this.confirming !== null) {
            const action = this.confirming;
            this.confirming = null;
            if (YES.has(line.trim().toLowerCase())) action();
            else this.write("Cancelled.\n");
            this.reprompt();
            return;
        }
        this.handleCommand(line);
    }

    private handleCommand(line: string): void {
        const command = parseInput(line);
        switch (command.type) {
            case "help":
                this.write(HELP_TEXT + "\n");
                return this.reprompt();
            case "board":
                this.handlers.onBoard();
                return this.reprompt();
            case "new":
                return this.confirmIfInGame("Stop this game and start a new one? (y/N) ", () => this.handlers.onNew());
            case "quit":
                return this.confirmIfInGame("Quit? (y/N) ", () => this.handlers.onQuit());
            case "invalid":
                this.write(command.reason + "\n");
                return this.reprompt();
            default:
                return this.handleMove(command.type === "move" ? command.square : command.type);
        }
    }

    private confirmIfInGame(question: string, action: () => void): void {
        if (!this.inGame) return action();
        this.confirming = action;
        this.write(question);
    }

    /** `input` is a square, "pass" or "empty". */
    private handleMove(input: string): void {
        const pending = this.pending;
        if (pending === null) {
            if (this.inGame && this.handlers.isHumanTurn()) {
                if (input !== "empty") this.early.push(input);
                return;
            }
            this.write("Not your turn: input ignored.\n");
            return;
        }
        const choice = this.check(pending.state, input);
        if (choice === null) return this.reprompt();
        this.pending = null;
        pending.resolve(choice);
    }

    private check(state: GameState, input: string): PlayerMove | null {
        if (mustPass(state)) {
            if (input === "pass" || input === "empty") return { kind: "pass" };
            this.write(`illegal: ${describeGameError("must-pass", input)}\n`);
            return null;
        }
        if (input === "empty") return null;
        if (input === "pass") {
            this.write(`illegal: ${describeGameError("pass-not-allowed", input)}\n`);
            return null;
        }
        const result = playMove(state, input);
        if (result.ok) return { kind: "move", square: input };
        this.write(`illegal: ${describeGameError(result.error, input)}\n`);
        return null;
    }

    private reprompt(): void {
        if (this.pending !== null && this.confirming === null) this.write(this.pending.prompt);
    }
}
