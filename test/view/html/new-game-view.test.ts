// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BLACK, WHITE } from "../../../src/core/board";
import { messagesFor } from "../../../src/app/messages";
import { NewGameView } from "../../../src/view/html/new-game-view";

function setup() {
    const root = document.createElement("div");
    document.body.append(root);
    const handlers = { onConnect: vi.fn(), onDisconnect: vi.fn(), onStart: vi.fn() };
    const view = new NewGameView(root, messagesFor("ja"), handlers);
    const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
    const choose = (value: string) => {
        const radio = q<HTMLInputElement>(`input[name="opponent"][value="${value}"]`);
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
    };
    return { root, view, handlers, q, choose };
}

const CONNECTED = { kind: "connected", name: "SW-FPGA", version: "02", port: "2e8a:000a" } as const;

describe("NewGameView", () => {
    it("starts a game between people", () => {
        const { view, q, handlers } = setup();
        view.open({ opponent: "person", cpuColor: BLACK }, { kind: "idle" }, "ok");
        expect(q(".cpu-options").hidden).toBe(true);
        q<HTMLButtonElement>(".start").click();
        expect(handlers.onStart).toHaveBeenCalledWith({ opponent: "person", cpuColor: BLACK });
        expect(q<HTMLDialogElement>("dialog").open).toBe(false);
    });

    it("shows the CPU options, and waits for a connection before starting", () => {
        const { view, q, choose, handlers } = setup();
        view.open({ opponent: "person", cpuColor: BLACK }, { kind: "idle" }, "ok");
        choose("cpu");
        expect(q(".cpu-options").hidden).toBe(false);
        expect(q(".link-state").textContent).toBe("つながっていません");
        expect(q<HTMLButtonElement>(".start").disabled).toBe(true);
        q<HTMLButtonElement>(".connect").click();
        expect(handlers.onConnect).toHaveBeenCalledTimes(1);
        view.update(CONNECTED);
        expect(q(".link-state").textContent).toBe("SW-FPGA (RUP 02, 2e8a:000a)");
        expect(q<HTMLButtonElement>(".start").disabled).toBe(false);
        q<HTMLSelectElement>('select[name="cpuColor"]').value = String(WHITE);
        q<HTMLButtonElement>(".start").click();
        expect(handlers.onStart).toHaveBeenCalledWith({ opponent: "cpu", cpuColor: WHITE });
    });

    it.each([
        [{ kind: "connecting" } as const, "つないでいます…"],
        [{ kind: "lost", reason: "the device has been unplugged", port: "x" } as const, "切れました: the device has been unplugged"],
        [{ kind: "failed", message: "no reply to PI (3 tries)" } as const, "つなげませんでした: no reply to PI (3 tries)"],
    ])("describes the connection: %j", (state, text) => {
        const { view, q } = setup();
        view.open({ opponent: "cpu", cpuColor: BLACK }, state, "ok");
        expect(q(".link-state").textContent).toBe(text);
        expect(q(".link-state").classList.contains("bad")).toBe(state.kind !== "connecting");
    });

    it("offers to disconnect while connected", () => {
        const { view, q, handlers } = setup();
        view.open({ opponent: "cpu", cpuColor: BLACK }, CONNECTED, "ok");
        expect(q<HTMLButtonElement>(".disconnect").hidden).toBe(false);
        q<HTMLButtonElement>(".disconnect").click();
        expect(handlers.onDisconnect).toHaveBeenCalledTimes(1);
    });

    it("explains why the CPU cannot be chosen in a browser without Web Serial", () => {
        const { view, q } = setup();
        view.open({ opponent: "cpu", cpuColor: BLACK }, { kind: "idle" }, "no-api");
        expect(q<HTMLInputElement>('input[name="opponent"][value="cpu"]').disabled).toBe(true);
        expect(q<HTMLInputElement>('input[name="opponent"][value="person"]').checked).toBe(true);
        expect(q(".unsupported").textContent).toContain("Web Serial");
        expect(q(".unsupported").hidden).toBe(false);
    });

    it("offers the CPU's strategies (XS extension) and passes the chosen one on", () => {
        const { view, q, choose, handlers } = setup();
        const strategies = [{ index: 0, name: "fpga-01-lsb" }, { index: 1, name: "fpga-02-max_gain" }];
        view.open({ opponent: "cpu", cpuColor: BLACK }, { ...CONNECTED, strategies, strategy: 0 }, "ok");
        choose("cpu");
        const select = q<HTMLSelectElement>('select[name="cpuStrategy"]');
        expect(q(".cpu-strategy").hidden).toBe(false);
        expect([...select.options].map((o) => o.textContent)).toEqual(["CPU に任せる", "fpga-01-lsb", "fpga-02-max_gain"]);
        select.value = "1";
        q<HTMLButtonElement>(".start").click();
        expect(handlers.onStart).toHaveBeenCalledWith({ opponent: "cpu", cpuColor: BLACK, cpuStrategy: 1 });
    });

    it("keeps the last chosen strategy when opened again, and leaves it to the CPU by default", () => {
        const { view, q } = setup();
        const strategies = [{ index: 0, name: "a" }, { index: 1, name: "b" }];
        view.open({ opponent: "cpu", cpuColor: BLACK, cpuStrategy: 1 }, { ...CONNECTED, strategies, strategy: 0 }, "ok");
        expect(q<HTMLSelectElement>('select[name="cpuStrategy"]').value).toBe("1");
        view.open({ opponent: "cpu", cpuColor: BLACK }, { ...CONNECTED, strategies, strategy: 0 }, "ok");
        expect(q<HTMLSelectElement>('select[name="cpuStrategy"]').value).toBe("");
    });

    it("hides the strategy choice for a CPU without strategies", () => {
        const { view, q, handlers } = setup();
        view.open({ opponent: "cpu", cpuColor: BLACK }, CONNECTED, "ok");
        expect(q(".cpu-strategy").hidden).toBe(true);
        q<HTMLButtonElement>(".start").click();
        expect(handlers.onStart).toHaveBeenCalledWith({ opponent: "cpu", cpuColor: BLACK });
    });
});
