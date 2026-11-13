// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { messagesFor } from "../../../src/app/messages";
import { DEFAULT_SETTINGS } from "../../../src/app/settings";
import { SettingsView } from "../../../src/view/html/settings-view";

function setup() {
    const root = document.createElement("div");
    document.body.append(root);
    const onSave = vi.fn();
    const view = new SettingsView(root, messagesFor("ja"), onSave);
    const field = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[name="${name}"]`)!;
    return { root, view, onSave, field };
}

describe("SettingsView", () => {
    it("shows the current settings when opened", () => {
        const { view, field } = setup();
        view.open({ ...DEFAULT_SETTINGS, clockSeconds: 30, sound: false, language: "en" });
        expect(field<HTMLInputElement>("clockSeconds").value).toBe("30");
        expect(field<HTMLInputElement>("sound").checked).toBe(false);
        expect(field<HTMLInputElement>("hints").checked).toBe(true);
        expect(field<HTMLInputElement>("confirmMove").checked).toBe(true);
        expect(field<HTMLSelectElement>("language").value).toBe("en");
    });

    it("saves what was changed", () => {
        const { root, view, field, onSave } = setup();
        view.open(DEFAULT_SETTINGS);
        field<HTMLInputElement>("clockSeconds").value = "45";
        field<HTMLInputElement>("hints").checked = false;
        field<HTMLSelectElement>("language").value = "ja";
        root.querySelector<HTMLButtonElement>(".save")!.click();
        expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, clockSeconds: 45, hints: false, language: "ja" });
        expect(root.querySelector("dialog")!.open).toBe(false);
    });

    it("falls back to the default for a clock value that is out of range", () => {
        const { root, view, field, onSave } = setup();
        view.open(DEFAULT_SETTINGS);
        field<HTMLInputElement>("clockSeconds").value = "0";
        root.querySelector<HTMLButtonElement>(".save")!.click();
        expect(onSave.mock.calls[0]![0].clockSeconds).toBe(60);
    });

    it("closes without saving", () => {
        const { root, view, onSave } = setup();
        view.open(DEFAULT_SETTINGS);
        root.querySelector<HTMLButtonElement>(".close")!.click();
        expect(onSave).not.toHaveBeenCalled();
        expect(root.querySelector("dialog")!.open).toBe(false);
    });
});
