import { el } from "./dom";

/** A modal dialog with a title and a close button. */
export function makeDialog(root: HTMLElement, title: string, closeLabel: string): { dialog: HTMLDialogElement; body: HTMLElement } {
    const dialog = el("dialog", "panel");
    const head = el("div", "panel-head");
    head.append(el("h2", "panel-title", title));
    const close = el("button", "close", closeLabel);
    close.type = "button";
    close.addEventListener("click", () => closeDialog(dialog));
    head.append(close);
    const body = el("div", "panel-body");
    dialog.append(head, body);
    root.append(dialog);
    return { dialog, body };
}

export function openDialog(dialog: HTMLDialogElement): void {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

export function closeDialog(dialog: HTMLDialogElement): void {
    if (typeof dialog.close === "function") dialog.close();
    dialog.removeAttribute("open");
}
