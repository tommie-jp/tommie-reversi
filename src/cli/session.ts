// Runs the games of one CLI run: the clock, the screen, the files, and what the
// person types between and during games. Reading the keyboard and opening ports is
// left to main.ts, so this can be tested with scripted players.

import { BLACK, WHITE, countDiscs, type Color } from "../core/board";
import { newClock, remainingMs, startTurn, stopClock, type ClockState } from "../core/clock";
import { newGame, type GameState } from "../core/game";
import { runMatch, type MatchEvent, type MatchResult } from "../core/match";
import type { Player } from "../core/player";
import { formatRecord } from "../core/record";
import { colorName, renderBoard, renderResult, renderStatus } from "../view/terminal/render";
import type { PlayOptions } from "./args";
import { Interaction } from "./interaction";
import { fileStem, recordText, type Direction } from "./logger";

export interface Seats {
    readonly black: Player;
    readonly white: Player;
    /** Colors played by a person at this keyboard (hints are shown on their turn). */
    readonly humans: readonly Color[];
}

export interface GameFiles {
    rup(direction: Direction, line: string, date: Date): void;
    saveRecord(text: string): string;
}

export interface SessionDeps {
    write(text: string): void;
    now(): Date;
    openFiles(stem: string): GameFiles;
    /** The players of game `gameNumber` (1-based). */
    seats(gameNumber: number, session: Session): Seats;
}

export const EXIT = { ok: 0, usage: 1, connection: 2, stopped: 3, interrupted: 130 } as const;

type NextStep = "new" | "quit";

export class Session {
    readonly interaction: Interaction;
    private clock: ClockState;
    private state: GameState = newGame();
    private humans: readonly Color[] = [];
    private controller: AbortController | null = null;
    private files: GameFiles | null = null;
    private afterGame: ((step: NextStep) => void) | null = null;
    private stopReason: "new" | "quit" | "interrupted" | null = null;
    private quitWhenIdle = false;

    constructor(
        private readonly options: PlayOptions,
        private readonly deps: SessionDeps,
    ) {
        this.clock = newClock(options.seconds * 1000);
        this.interaction = new Interaction((text) => deps.write(text), {
            onQuit: () => this.stop("quit"),
            onNew: () => this.stop("new"),
            onBoard: () => this.showBoard(),
            isHumanTurn: () => this.state.status === "playing" && this.humans.includes(this.state.turn),
        });
    }

    /** Milliseconds left for the side to move. */
    timeLeftMs(): number {
        return remainingMs(this.clock, this.state.turn, this.deps.now().getTime());
    }

    /** Sends a RUP line to the log of the current game. */
    logRup(direction: Direction, line: string): void {
        this.files?.rup(direction, line, this.deps.now());
    }

    /** Ctrl+C. */
    interrupt(): void {
        this.stop("interrupted");
    }

    /** Ctrl+D or the end of the input. Moves typed or piped in before it are played first. */
    endOfInput(): void {
        if (!this.interaction.hasEarlyInput()) return this.stop("quit");
        this.quitWhenIdle = true;
        this.interaction.onIdle(() => this.stop("quit"));
    }

    async run(): Promise<number> {
        let stoppedGames = 0;
        for (let gameNumber = 1; ; gameNumber++) {
            const result = await this.playOne(gameNumber);
            if (this.stopReason === "interrupted") return EXIT.interrupted;
            if (this.stopReason === "quit") return EXIT.ok;
            if (this.stopReason === "new") {
                this.stopReason = null;
                continue;
            }
            if (result.reason !== "normal") stoppedGames++;
            const unattended = this.options.opponent === "random";
            if (unattended) {
                if (result.reason !== "normal" && result.reason !== "resign") return EXIT.stopped;
                if (gameNumber >= this.options.games) return stoppedGames > 0 ? EXIT.stopped : EXIT.ok;
                continue;
            }
            if ((await this.waitAfterGame()) === "quit") return EXIT.ok;
        }
    }

    private async playOne(gameNumber: number): Promise<MatchResult> {
        const started = this.deps.now();
        this.files = this.deps.openFiles(fileStem(started, gameNumber));
        const seats = this.deps.seats(gameNumber, this);
        this.humans = seats.humans;
        this.controller = new AbortController();
        this.interaction.setInGame(true);
        if (this.options.games > 1) this.deps.write(`\n=== Game ${gameNumber} of ${this.options.games} ===\n`);
        this.deps.write(`Black: ${seats.black.name}   White: ${seats.white.name}\n`);
        const result = await runMatch({
            black: seats.black,
            white: seats.white,
            onEvent: (event) => this.onEvent(event),
            signal: this.controller.signal,
        });
        this.interaction.setInGame(false);
        this.interaction.cancel();
        this.saveRecord(started, seats, result);
        return result;
    }

    private onEvent(event: MatchEvent): void {
        const now = this.deps.now().getTime();
        switch (event.type) {
            case "started":
            case "moved":
                this.state = event.state;
                this.clock = event.state.status === "playing"
                    ? startTurn(this.clock, event.state.turn, now)
                    : stopClock(this.clock);
                if (event.type === "moved") this.announceMove(event);
                this.showBoard();
                return;
            case "violation":
                return;
            case "finished":
                this.state = event.state;
                this.clock = stopClock(this.clock);
                this.deps.write(renderResult(event.state, event.result) + "\n");
                return;
        }
    }

    private announceMove(event: Extract<MatchEvent, { type: "moved" }>): void {
        const { move } = event;
        if (this.humans.includes(move.color)) return;
        const what = move.kind === "move" ? move.square : "pass";
        this.deps.write(`${colorName(move.color)}: ${what}\n`);
    }

    private showBoard(): void {
        const now = this.deps.now().getTime();
        const hints = this.options.hints && this.humans.includes(this.state.turn);
        const board = renderBoard(this.state, { hints, color: this.options.color });
        const status = renderStatus(
            this.state,
            { black: remainingMs(this.clock, BLACK, now), white: remainingMs(this.clock, WHITE, now) },
            this.options.color,
        );
        this.deps.write(`\n${board}\n${status}\n`);
    }

    private saveRecord(started: Date, seats: Seats, result: MatchResult): void {
        if (this.files === null) return;
        const { black, white } = countDiscs(this.state.board);
        const path = this.files.saveRecord(
            recordText({
                date: started,
                black: seats.black.name,
                white: seats.white.name,
                result: `Black ${black} - White ${white} (${result.reason})`,
                record: formatRecord(this.state.moves),
            }),
        );
        this.deps.write(`saved: ${path}\n`);
    }

    private waitAfterGame(): Promise<NextStep> {
        if (this.quitWhenIdle) return Promise.resolve("quit");
        this.deps.write('Type "new" for another game, or "quit".\n');
        return new Promise((resolve) => {
            this.afterGame = (step) => {
                this.afterGame = null;
                resolve(step);
            };
        });
    }

    private stop(reason: "new" | "quit" | "interrupted"): void {
        if (this.afterGame !== null) {
            this.afterGame(reason === "new" ? "new" : "quit");
            if (reason === "interrupted") this.stopReason = "interrupted";
            return;
        }
        this.stopReason = reason;
        this.controller?.abort(reason === "new" ? "new game" : reason);
    }
}
