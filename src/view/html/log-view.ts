// The RUP log: every line sent (TX) and received (RX), in the replay format.

import type { Messages } from "../../app/messages";
import { makeDialog, openDialog } from "./dialog";
import { el } from "./dom";

export interface LogSource {
    text(options: { readonly hidePing: boolean }): string;
    copy(text: string): Promise<boolean>;
}

export class LogView {
    private readonly dialog: HTMLDialogElement;
    private readonly pre: HTMLPreElement;
    private readonly hidePing: HTMLInputElement;

    constructor(root: HTMLElement, private readonly messages: Messages, private readonly source: LogSource) {
        const { dialog, body } = makeDialog(root, messages.log, messages.close);
        this.dialog = dialog;
        this.hidePing = el("input", "check");
        this.hidePing.type = "checkbox";
        this.hidePing.name = "hidePing";
        this.hidePing.checked = true;
        this.hidePing.addEventListener("change", () => this.refresh());
        const option = el("label", "check-field");
        option.append(this.hidePing, el("span", "field-label", messages.hidePing));
        const copy = el("button", "copy", messages.copy);
        copy.type = "button";
        copy.addEventListener("click", () => {
            void this.source.copy(this.currentText()).then((done) => {
                if (done) copy.textContent = messages.copied;
            });
        });
        const tools = el("div", "item-buttons");
        tools.append(option, copy);
        this.pre = el("pre", "log");
        body.append(tools, this.pre);
    }

    get isOpen(): boolean {
        return this.dialog.open;
    }

    open(): void {
        this.refresh();
        openDialog(this.dialog);
    }

    refresh(): void {
        const atBottom = this.pre.scrollTop + this.pre.clientHeight >= this.pre.scrollHeight - 20;
        const text = this.currentText();
        this.pre.textContent = text === "" ? this.messages.emptyLog : text;
        if (atBottom) this.pre.scrollTop = this.pre.scrollHeight;
    }

    private currentText(): string {
        return this.source.text({ hidePing: this.hidePing.checked });
    }
}
