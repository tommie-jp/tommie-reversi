// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { messagesFor } from "../../../src/app/messages";
import { LogView } from "../../../src/view/html/log-view";

function setup() {
    const root = document.createElement("div");
    document.body.append(root);
    const text = vi.fn((options: { hidePing: boolean }): string =>
        options.hidePing ? "[10:00:00.000] TX VE" : "[10:00:00.000] TX PI\n[10:00:00.000] TX VE",
    );
    const copy = vi.fn(async () => true);
    const view = new LogView(root, messagesFor("ja"), { text, copy });
    return { root, view, text, copy };
}

describe("LogView", () => {
    it("shows the log without PI when opened", () => {
        const { root, view } = setup();
        view.open();
        expect(root.querySelector("pre")!.textContent).toBe("[10:00:00.000] TX VE");
        expect(view.isOpen).toBe(true);
    });

    it("shows PI when asked", () => {
        const { root, view } = setup();
        view.open();
        const box = root.querySelector<HTMLInputElement>('input[name="hidePing"]')!;
        box.checked = false;
        box.dispatchEvent(new Event("change"));
        expect(root.querySelector("pre")!.textContent).toContain("TX PI");
    });

    it("refreshes while open and copies what is shown", async () => {
        const { root, view, text, copy } = setup();
        view.open();
        view.refresh();
        expect(text).toHaveBeenCalledTimes(2);
        root.querySelector<HTMLButtonElement>(".copy")!.click();
        await Promise.resolve();
        expect(copy).toHaveBeenCalledWith("[10:00:00.000] TX VE");
    });

    it("says so when there is nothing yet", () => {
        const { root, view, text } = setup();
        text.mockReturnValue("");
        view.open();
        expect(root.querySelector("pre")!.textContent).toBe("(まだ何も送受信していません)");
    });
});
