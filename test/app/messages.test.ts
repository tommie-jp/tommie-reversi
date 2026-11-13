import { describe, expect, it } from "vitest";
import { messagesFor, pickLanguage } from "../../src/app/messages";

describe("pickLanguage", () => {
    it.each([
        [["ja-JP", "en"], "ja"],
        [["ja"], "ja"],
        [["en-US"], "en"],
        [["fr", "ja"], "ja"],
        [["fr"], "en"],
        [[], "en"],
    ] as const)("picks from %j", (languages, expected) => {
        expect(pickLanguage(languages)).toBe(expected);
    });
});

describe("messagesFor", () => {
    it("has the same keys in Japanese and English", () => {
        expect(Object.keys(messagesFor("ja")).sort()).toEqual(Object.keys(messagesFor("en")).sort());
    });

    it("explains every game error in both languages", () => {
        for (const language of ["ja", "en"] as const) {
            const m = messagesFor(language);
            for (const error of ["no-flips", "occupied", "bad-square", "must-pass", "pass-not-allowed", "not-playing"] as const) {
                expect(m.gameError(error, "e6").length).toBeGreaterThan(0);
            }
        }
        expect(messagesFor("ja").gameError("no-flips", "e6")).toBe("e6 は 1 つも返せません");
        expect(messagesFor("en").gameError("no-flips", "e6")).toBe("e6 does not flip any disc");
    });

    it("uses the same phrases in English", () => {
        const en = messagesFor("en");
        expect(en.toMove(1)).toBe("Black to move");
        expect(en.mustPass(2)).toBe('White has no legal move. Press "Pass"');
        expect(en.confirmMove("f5")).toBe("Play f5? Tap it again to confirm");
        expect(en.waitingFor("cpu")).toBe("Waiting for cpu...");
        for (const error of ["occupied", "bad-square", "must-pass", "pass-not-allowed", "not-playing"] as const) {
            expect(en.gameError(error, "e6")).not.toBe(messagesFor("ja").gameError(error, "e6"));
        }
        expect(en.result({ reason: "normal", outcome: "white" }, { black: 20, white: 44 })).toBe("Game over: Black 20 - White 44. White wins");
        expect(en.result({ reason: "normal", outcome: "draw" }, { black: 32, white: 32 })).toBe("Game over: Black 32 - White 32. Draw");
        expect(en.result({ reason: "resign", by: 2 }, { black: 2, white: 2 })).toBe("White resigned. Black wins");
        expect(en.result({ reason: "aborted", detail: "stopped" }, { black: 2, white: 2 })).toBe("Game stopped");
        expect(en.result({ reason: "aborted", detail: "disconnected" }, { black: 2, white: 2 })).toBe("Game stopped: disconnected");
        expect(
            en.result({ reason: "violation", by: 1, attempted: { kind: "pass" }, error: "pass-not-allowed" }, { black: 2, white: 2 }),
        ).toBe("Rule violation by Black: pass. You have a legal move, so you cannot pass. Game stopped");
    });

    it("explains the Japanese phrases for every turn state", () => {
        const ja = messagesFor("ja");
        expect(ja.toMove(2)).toBe("白の番です");
        expect(ja.mustPass(1)).toBe("黒は打てる所がありません。「パス」を押してください");
        for (const error of ["occupied", "bad-square", "must-pass", "pass-not-allowed", "not-playing"] as const) {
            expect(ja.gameError(error, "e6").length).toBeGreaterThan(3);
        }
        expect(ja.result({ reason: "normal", outcome: "white" }, { black: 20, white: 44 })).toBe("終局: 黒 20 - 白 44。白の勝ち");
        expect(ja.result({ reason: "resign", by: 2 }, { black: 2, white: 2 })).toBe("白が投了しました。黒の勝ち");
        expect(ja.result({ reason: "aborted", detail: "disconnected" }, { black: 2, white: 2 })).toBe("対局が止まりました: disconnected");
        expect(
            ja.result({ reason: "violation", by: 1, attempted: { kind: "pass" }, error: "pass-not-allowed" }, { black: 2, white: 2 }),
        ).toBe("ルール違反 (黒): パス。打てる所があるので、パスはできません。対局をやめました");
    });

    it("describes results", () => {
        const ja = messagesFor("ja");
        expect(ja.result({ reason: "normal", outcome: "black" }, { black: 36, white: 28 })).toBe("終局: 黒 36 - 白 28。黒の勝ち");
        expect(ja.result({ reason: "normal", outcome: "draw" }, { black: 32, white: 32 })).toBe("終局: 黒 32 - 白 32。引き分け");
        expect(ja.result({ reason: "resign", by: 1 }, { black: 2, white: 2 })).toBe("黒が投了しました。白の勝ち");
        expect(ja.result({ reason: "aborted", detail: "stopped" }, { black: 2, white: 2 })).toBe("対局をやめました");
        expect(
            ja.result(
                { reason: "violation", by: 2, attempted: { kind: "move", square: "c3" }, error: "no-flips" },
                { black: 2, white: 2 },
            ),
        ).toBe("ルール違反 (白): c3。c3 は 1 つも返せません。対局をやめました");
    });
});
