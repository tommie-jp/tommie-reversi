// Names, disc counts, the message line (whose turn, illegal taps, the result),
// and the Pass and New game buttons.

import { BLACK, WHITE, countDiscs, type Color } from "../../core/board";
import type { Snapshot } from "../../app/controller";
import type { Messages } from "../../app/messages";
import { el } from "./dom";

export interface StatusHandlers {
    onPass(): void;
    onNewGame(): void;
}

interface PlayerRow {
    readonly row: HTMLElement;
    readonly name: HTMLElement;
    readonly count: HTMLElement;
}

export class StatusView {
    private readonly players: Record<Color, PlayerRow>;
    private readonly message: HTMLElement;
    private readonly passButton: HTMLButtonElement;

    constructor(root: HTMLElement, private readonly messages: Messages, handlers: StatusHandlers) {
        this.players = { [BLACK]: this.playerRow(root, "black"), [WHITE]: this.playerRow(root, "white") } as Record<Color, PlayerRow>;
        this.message = el("p", "message");
        this.message.setAttribute("aria-live", "polite");
        const buttons = el("div", "buttons");
        this.passButton = el("button", "pass", messages.pass);
        this.passButton.type = "button";
        this.passButton.hidden = true;
        this.passButton.addEventListener("click", () => handlers.onPass());
        const newGame = el("button", "new-game", messages.newGame);
        newGame.type = "button";
        newGame.addEventListener("click", () => handlers.onNewGame());
        buttons.append(this.passButton, newGame);
        root.append(this.message, buttons);
    }

    render(snapshot: Snapshot): void {
        const counts = countDiscs(snapshot.state.board);
        const playing = snapshot.result === null && snapshot.state.status === "playing";
        for (const color of [BLACK, WHITE] as const) {
            const player = this.players[color];
            player.name.textContent = color === BLACK ? snapshot.names.black : snapshot.names.white;
            player.count.textContent = String(color === BLACK ? counts.black : counts.white);
            player.row.classList.toggle("to-move", playing && snapshot.state.turn === color);
        }
        const alert = snapshot.result?.reason === "violation";
        this.message.textContent = this.messageText(snapshot, counts);
        this.message.classList.toggle("result", snapshot.result !== null);
        this.message.classList.toggle("alert", alert);
        if (alert) this.message.setAttribute("role", "alert");
        else this.message.removeAttribute("role");
        this.passButton.hidden = !snapshot.mustPass;
    }

    private messageText(snapshot: Snapshot, counts: { black: number; white: number }): string {
        const m = this.messages;
        if (snapshot.result !== null) return m.result(snapshot.result, counts);
        if (snapshot.notice !== null) return m.gameError(snapshot.notice.error, snapshot.notice.square);
        if (snapshot.markedSquare !== null) return m.confirmMove(snapshot.markedSquare);
        const turn = snapshot.state.turn;
        if (snapshot.mustPass) return m.mustPass(turn);
        if (snapshot.humanToMove) return m.toMove(turn);
        return m.waitingFor(turn === BLACK ? snapshot.names.black : snapshot.names.white);
    }

    private playerRow(root: HTMLElement, colorName: "black" | "white"): PlayerRow {
        const row = el("div", `player ${colorName}`);
        const stone = el("span", "stone");
        stone.setAttribute("aria-hidden", "true");
        const label = el("span", "color", colorName === "black" ? this.messages.black : this.messages.white);
        const name = el("span", "name");
        const count = el("span", "count");
        row.append(stone, label, name, count);
        root.append(row);
        return { row, name, count };
    }
}
