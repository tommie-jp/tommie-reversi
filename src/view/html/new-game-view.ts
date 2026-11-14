// The New game dialog: play a person or the CPU, the CPU's color, the CPU's strategy (for a
// CPU with the XS extension), and the CPU connection.

import { BLACK, WHITE, type Color } from "../../core/board";
import type { LinkState } from "../../app/cpu-link";
import type { Messages } from "../../app/messages";
import type { GameChoice, Opponent } from "../../app/seats";
import type { WebSerialSupport } from "../../transport/web-serial";
import { closeDialog, makeDialog, openDialog } from "./dialog";
import { el } from "./dom";

export interface NewGameHandlers {
    /** Called from the tap, so Web Serial may show its port chooser. */
    onConnect(): void;
    onDisconnect(): void;
    onStart(choice: GameChoice): void;
}

export class NewGameView {
    private readonly dialog: HTMLDialogElement;
    private readonly radios: Record<Opponent, HTMLInputElement>;
    private readonly cpuOptions: HTMLElement;
    private readonly color: HTMLSelectElement;
    private readonly strategyField: HTMLElement;
    private readonly strategy: HTMLSelectElement;
    /** The strategy chosen last ("" leaves it to the CPU), kept while the list is rebuilt. */
    private chosenStrategy = "";
    private readonly linkState: HTMLElement;
    private readonly connectButton: HTMLButtonElement;
    private readonly disconnectButton: HTMLButtonElement;
    private readonly unsupported: HTMLElement;
    private readonly startButton: HTMLButtonElement;
    private link: LinkState = { kind: "idle" };

    constructor(root: HTMLElement, private readonly messages: Messages, private readonly handlers: NewGameHandlers) {
        const { dialog, body } = makeDialog(root, messages.newGame, messages.close);
        this.dialog = dialog;
        const m = messages;
        this.radios = { person: radio("person", m.opponentPerson), cpu: radio("cpu", m.opponentCpu) };
        const opponents = el("fieldset", "opponents");
        opponents.append(el("legend", "", m.opponent), this.radios.person.parentElement!, this.radios.cpu.parentElement!);
        opponents.addEventListener("change", () => this.refresh());
        this.unsupported = el("p", "unsupported");
        this.color = el("select", "cpu-color");
        this.color.name = "cpuColor";
        for (const [value, text] of [[BLACK, m.cpuBlack], [WHITE, m.cpuWhite]] as const) {
            const option = el("option", "", text);
            option.value = String(value);
            this.color.append(option);
        }
        const colorField = el("label", "field");
        colorField.append(el("span", "field-label", m.cpuColor), this.color);
        this.strategy = el("select", "");
        this.strategy.name = "cpuStrategy";
        this.strategy.addEventListener("change", () => (this.chosenStrategy = this.strategy.value));
        this.strategyField = el("label", "field cpu-strategy");
        this.strategyField.append(el("span", "field-label", m.cpuStrategy), this.strategy);
        this.linkState = el("p", "link-state");
        this.linkState.setAttribute("aria-live", "polite");
        this.connectButton = button("connect", m.connect, () => handlers.onConnect());
        this.disconnectButton = button("disconnect", m.disconnect, () => handlers.onDisconnect());
        const linkButtons = el("div", "item-buttons");
        linkButtons.append(this.connectButton, this.disconnectButton);
        this.cpuOptions = el("div", "cpu-options");
        this.cpuOptions.append(colorField, this.strategyField, this.linkState, linkButtons);
        this.startButton = button("start", m.start, () => this.start());
        body.append(opponents, this.unsupported, this.cpuOptions, this.startButton);
    }

    open(choice: GameChoice, link: LinkState, support: WebSerialSupport): void {
        const canUseCpu = support === "ok";
        this.radios.cpu.disabled = !canUseCpu;
        this.unsupported.hidden = canUseCpu;
        this.unsupported.textContent = support === "ok" ? "" : this.messages.serialUnsupported(support);
        const opponent: Opponent = canUseCpu ? choice.opponent : "person";
        this.radios[opponent].checked = true;
        this.color.value = String(choice.cpuColor);
        this.chosenStrategy = choice.cpuStrategy === undefined ? "" : String(choice.cpuStrategy);
        this.update(link);
        openDialog(this.dialog);
    }

    update(link: LinkState): void {
        this.link = link;
        this.refresh();
    }

    private refresh(): void {
        const cpu = this.radios.cpu.checked;
        this.cpuOptions.hidden = !cpu;
        this.linkState.textContent = this.messages.linkState(this.link);
        this.linkState.classList.toggle("bad", this.link.kind === "idle" || this.link.kind === "lost" || this.link.kind === "failed");
        const connected = this.link.kind === "connected";
        this.connectButton.disabled = this.link.kind === "connecting";
        this.disconnectButton.hidden = !connected;
        this.startButton.disabled = cpu && !connected;
        this.showStrategies();
    }

    /** The strategy choice, shown only for a connected CPU that has strategies. */
    private showStrategies(): void {
        const strategies = this.link.kind === "connected" ? (this.link.strategies ?? []) : [];
        this.strategyField.hidden = strategies.length === 0;
        const keep = el("option", "", this.messages.cpuStrategyKeep);
        keep.value = "";
        const options = strategies.map((s) => {
            const option = el("option", "", s.name);
            option.value = String(s.index);
            return option;
        });
        this.strategy.replaceChildren(keep, ...options);
        const known = options.some((o) => o.value === this.chosenStrategy);
        this.strategy.value = known ? this.chosenStrategy : "";
    }

    private start(): void {
        const opponent: Opponent = this.radios.cpu.checked ? "cpu" : "person";
        const cpuColor: Color = Number(this.color.value) === WHITE ? WHITE : BLACK;
        const strategy = this.strategyField.hidden || this.strategy.value === "" ? null : Number(this.strategy.value);
        closeDialog(this.dialog);
        this.handlers.onStart(strategy === null ? { opponent, cpuColor } : { opponent, cpuColor, cpuStrategy: strategy });
    }
}

function radio(value: Opponent, text: string): HTMLInputElement {
    const label = el("label", "check-field");
    const input = el("input", "");
    input.type = "radio";
    input.name = "opponent";
    input.value = value;
    label.append(input, el("span", "field-label", text));
    return input;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
    const b = el("button", className, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
}
