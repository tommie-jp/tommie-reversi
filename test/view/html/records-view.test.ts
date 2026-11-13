// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { messagesFor } from "../../../src/app/messages";
import type { SavedGame } from "../../../src/app/storage";
import { RecordsView } from "../../../src/view/html/records-view";

const GAMES: SavedGame[] = [
    { id: "2", startedAt: "2026-11-14T10:05:00+09:00", black: "SW-FPGA", white: "人", record: "f5d6", result: "", finished: false },
    { id: "1", startedAt: "2026-11-14T10:00:00+09:00", black: "人", white: "人", record: "f5d6c3", result: "終局: 黒 40 - 白 24。黒の勝ち", finished: true },
];

function setup(options: { share?: boolean; games?: SavedGame[] } = {}) {
    const root = document.createElement("div");
    document.body.append(root);
    const actions = {
        list: vi.fn(() => options.games ?? GAMES),
        copy: vi.fn(async () => true),
        download: vi.fn(),
        ...(options.share ? { share: vi.fn(async () => {}) } : {}),
    };
    const view = new RecordsView(root, messagesFor("ja"), actions);
    return { root, view, actions };
}

describe("RecordsView", () => {
    it("lists the saved games, newest first, when opened", () => {
        const { root, view } = setup();
        view.open();
        const items = root.querySelectorAll(".game");
        expect(items).toHaveLength(2);
        expect(items[0]!.querySelector(".players")!.textContent).toBe("SW-FPGA - 人");
        expect(items[0]!.querySelector(".result")!.textContent).toBe("対局中");
        expect(items[1]!.querySelector(".result")!.textContent).toBe("終局: 黒 40 - 白 24。黒の勝ち");
        expect(items[1]!.querySelector(".record")!.textContent).toBe("f5d6c3");
        expect(items[1]!.querySelector(".when")!.textContent).toBe("2026-11-14 10:00");
    });

    it("says so when there is no game", () => {
        const { root, view } = setup({ games: [] });
        view.open();
        expect(root.querySelector(".empty")!.textContent).toBe("保存した対局はありません");
    });

    it("copies the record and says it was copied", async () => {
        const { root, view, actions } = setup();
        view.open();
        root.querySelector<HTMLButtonElement>(".game .copy")!.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(actions.copy).toHaveBeenCalledWith("f5d6");
        expect(root.querySelector(".game .copy")!.textContent).toBe("コピーしました");
    });

    it("downloads the record file with header lines", () => {
        const { root, view, actions } = setup();
        view.open();
        root.querySelectorAll<HTMLButtonElement>(".game .download")[1]!.click();
        const [name, text] = actions.download.mock.calls[0] as unknown as [string, string];
        expect(name).toBe("reversi-20261114-100000.txt");
        expect(text).toBe(
            "# date: 2026-11-14T10:00:00+09:00\n# black: 人\n# white: 人\n# result: 終局: 黒 40 - 白 24。黒の勝ち\nf5d6c3\n",
        );
    });

    it("offers sharing only where the browser can share", () => {
        const without = setup();
        without.view.open();
        expect(without.root.querySelector(".game .share")).toBeNull();
        const withShare = setup({ share: true });
        withShare.view.open();
        withShare.root.querySelector<HTMLButtonElement>(".game .share")!.click();
        expect(withShare.actions.share).toHaveBeenCalledWith(expect.stringContaining("f5d6"));
    });

    it("closes", () => {
        const { root, view } = setup();
        view.open();
        root.querySelector<HTMLButtonElement>(".close")!.click();
        expect(root.querySelector("dialog")!.open).toBe(false);
    });
});
