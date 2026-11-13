// The settings form: clock seconds, sound, hints, tap-twice confirmation, language.

import type { Messages } from "../../app/messages";
import { BAUD_RATES, MAX_CLOCK_SECONDS, parseSettings, type Settings } from "../../app/settings";
import { closeDialog, makeDialog, openDialog } from "./dialog";
import { el } from "./dom";

export class SettingsView {
    private readonly dialog: HTMLDialogElement;
    private readonly form: HTMLFormElement;

    constructor(root: HTMLElement, private readonly messages: Messages, private readonly onSave: (settings: Settings) => void) {
        const { dialog, body } = makeDialog(root, messages.settings, messages.close);
        this.dialog = dialog;
        this.form = el("form", "settings-form");
        this.form.addEventListener("submit", (event) => event.preventDefault());
        this.form.append(
            this.numberField("clockSeconds", messages.clockSeconds),
            this.checkField("sound", messages.sound),
            this.checkField("hints", messages.hints),
            this.checkField("confirmMove", messages.confirmMoveSetting),
            this.languageField(),
            this.baudField(),
        );
        const save = el("button", "save", messages.save);
        save.type = "button";
        save.addEventListener("click", () => this.save());
        this.form.append(save);
        body.append(this.form);
    }

    open(settings: Settings): void {
        this.input("clockSeconds").value = String(settings.clockSeconds);
        this.input("sound").checked = settings.sound;
        this.input("hints").checked = settings.hints;
        this.input("confirmMove").checked = settings.confirmMove;
        this.form.querySelector<HTMLSelectElement>('[name="language"]')!.value = settings.language;
        this.form.querySelector<HTMLSelectElement>('[name="baudRate"]')!.value = String(settings.baudRate);
        openDialog(this.dialog);
    }

    private save(): void {
        this.onSave(
            parseSettings({
                clockSeconds: Number(this.input("clockSeconds").value),
                sound: this.input("sound").checked,
                hints: this.input("hints").checked,
                confirmMove: this.input("confirmMove").checked,
                language: this.form.querySelector<HTMLSelectElement>('[name="language"]')!.value,
                baudRate: Number(this.form.querySelector<HTMLSelectElement>('[name="baudRate"]')!.value),
            }),
        );
        closeDialog(this.dialog);
    }

    private input(name: string): HTMLInputElement {
        return this.form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    }

    private numberField(name: string, label: string): HTMLElement {
        const input = el("input", "number");
        input.type = "number";
        input.name = name;
        input.min = "1";
        input.max = String(MAX_CLOCK_SECONDS);
        input.inputMode = "numeric";
        return labelled(label, input);
    }

    private checkField(name: string, label: string): HTMLElement {
        const input = el("input", "check");
        input.type = "checkbox";
        input.name = name;
        return labelled(label, input, true);
    }

    private baudField(): HTMLElement {
        const select = el("select", "baud");
        select.name = "baudRate";
        for (const rate of BAUD_RATES) {
            const option = el("option", "", rate.toLocaleString("en-US"));
            option.value = String(rate);
            select.append(option);
        }
        return labelled(this.messages.baudRate, select);
    }

    private languageField(): HTMLElement {
        const select = el("select", "language");
        select.name = "language";
        for (const [value, text] of [["auto", this.messages.languageAuto], ["ja", "日本語"], ["en", "English"]] as const) {
            const option = el("option", "", text);
            option.value = value;
            select.append(option);
        }
        return labelled(this.messages.language, select);
    }
}

function labelled(text: string, control: HTMLElement, controlFirst = false): HTMLElement {
    const label = el("label", controlFirst ? "field check-field" : "field");
    const span = el("span", "field-label", text);
    if (controlFirst) label.append(control, span);
    else label.append(span, control);
    return label;
}
