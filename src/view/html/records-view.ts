// The list of saved games: copy the record, save it as a file, or share it.

import type { Messages } from "../../app/messages";
import type { SavedGame } from "../../app/storage";
import { recordText } from "../../core/record-file";
import { makeDialog, openDialog } from "./dialog";
import { el } from "./dom";

export interface RecordsActions {
    list(): SavedGame[];
    copy(text: string): Promise<boolean>;
    download(fileName: string, text: string): void;
    /** Present only where the browser can share. */
    share?(text: string): Promise<void>;
}

export class RecordsView {
    private readonly dialog: HTMLDialogElement;
    private readonly body: HTMLElement;

    constructor(root: HTMLElement, private readonly messages: Messages, private readonly actions: RecordsActions) {
        const { dialog, body } = makeDialog(root, messages.records, messages.close);
        this.dialog = dialog;
        this.body = body;
    }

    open(): void {
        this.body.replaceChildren(...this.items());
        openDialog(this.dialog);
    }

    private items(): HTMLElement[] {
        const games = this.actions.list();
        if (games.length === 0) return [el("p", "empty", this.messages.noGames)];
        const list = el("ul", "games");
        list.append(...games.map((game) => this.item(game)));
        return [list];
    }

    private item(game: SavedGame): HTMLElement {
        const m = this.messages;
        const item = el("li", "game");
        item.append(
            el("div", "when", game.startedAt.slice(0, 16).replace("T", " ")),
            el("div", "players", `${game.black} - ${game.white}`),
            el("div", "result", game.finished ? game.result : m.playing),
            el("code", "record", game.record),
        );
        const buttons = el("div", "item-buttons");
        const file = fileText(game);
        const copy = button("copy", m.copy, async () => {
            if (await this.actions.copy(game.record)) copy.textContent = m.copied;
        });
        buttons.append(copy, button("download", m.download, () => this.actions.download(fileName(game), file)));
        const share = this.actions.share;
        if (share !== undefined) buttons.append(button("share", m.share, () => void share(file)));
        item.append(buttons);
        return item;
    }
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el("button", className, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
}

/** e.g. reversi-20261114-100000.txt, from the start time in the saved game. */
function fileName(game: SavedGame): string {
    const digits = game.startedAt.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    return `reversi-${digits}.txt`;
}

function fileText(game: SavedGame): string {
    return recordText({
        date: game.startedAt,
        black: game.black,
        white: game.white,
        result: game.finished ? game.result : "",
        record: game.record,
    });
}
