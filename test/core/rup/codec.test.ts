import { describe, expect, it } from "vitest";
import { initialBoard } from "../../../src/core/board";
import { decode, encode, type RupIn, type RupOut } from "../../../src/core/rup/codec";

const INITIAL_BO = "0000000000000000000000000002100000012000000000000000000000000000";

describe("encode", () => {
    it.each<[RupOut, string]>([
        [{ type: "SB" }, "SB"],
        [{ type: "SW" }, "SW"],
        [{ type: "MO", square: "f5" }, "MOf5"],
        [{ type: "PA" }, "PA"],
        [{ type: "BO", board: initialBoard() }, "BO" + INITIAL_BO],
        [{ type: "EB" }, "EB"],
        [{ type: "EW" }, "EW"],
        [{ type: "ED" }, "ED"],
        [{ type: "PI" }, "PI"],
        [{ type: "VE" }, "VE"],
        [{ type: "CA" }, "CA"],
        [{ type: "-", code: "05", reason: "illegal move a1" }, "-05 illegal move a1"],
        [{ type: "-", code: "05", reason: "" }, "-05"],
    ])("writes %j as %s", (message, line) => {
        expect(encode(message)).toBe(line);
    });

    it("refuses an error code that is not two digits", () => {
        expect(() => encode({ type: "-", code: "5", reason: "" })).toThrow();
    });

    it("refuses a square that RUP does not allow", () => {
        expect(() => encode({ type: "MO", square: "D3" })).toThrow();
    });
});

describe("decode: messages from the CPU", () => {
    it.each<[string, RupIn]>([
        ["MOd3", { type: "MO", square: "d3" }],
        ["MOh8", { type: "MO", square: "h8" }],
        ["PA", { type: "PA" }],
        ["EN", { type: "EN" }],
        ["RE", { type: "RE" }],
        ["RS", { type: "RS" }],
        ["BS" + INITIAL_BO, { type: "BS", board: initialBoard() }],
        ["ST d=12 n=45000", { type: "ST", text: "d=12 n=45000" }],
        ["ST BO" + INITIAL_BO, { type: "ST", text: "BO" + INITIAL_BO }],
        ["NC125000,450", { type: "NC", text: "125000,450" }],
        ["XB", { type: "X", raw: "XB" }],
        ["XI pf=rp2350", { type: "X", raw: "XI pf=rp2350" }],
    ])("reads %s", (line, message) => {
        expect(decode(line)).toEqual(message);
    });
});

describe("decode: replies", () => {
    it.each<[string, RupIn]>([
        ["+PI", { type: "+PI" }],
        ["+VE02SW-FPGA-pico2-reversi-03", { type: "+VE", version: "02", name: "SW-FPGA-pico2-reversi-03" }],
        ["+VE02", { type: "+VE", version: "02", name: "" }],
        [
            "+VE02SW-FPGA-pico2-reversi-03-corner.57",
            { type: "+VE", version: "02", name: "SW-FPGA-pico2-reversi-03-corner.57" },
        ],
        ["+VE01tommie-py-cpu", { type: "+VE", version: "01", name: "tommie-py-cpu" }],
        ["+CA PI VE CA SB SW MO PA", { type: "+CA", commands: ["PI", "VE", "CA", "SB", "SW", "MO", "PA"] }],
        ["+SB", { type: "+", command: "SB", data: "" }],
        ["+XB clk=1.795MHz", { type: "+", command: "XB", data: " clk=1.795MHz" }],
        ["-04 bad coord", { type: "-", code: "04", reason: "bad coord" }],
        ["-00", { type: "-", code: "00", reason: "" }],
    ])("reads %s", (line, message) => {
        expect(decode(line)).toEqual(message);
    });
});

describe("decode: lines that break the rules", () => {
    it.each<[string, string]>([
        ["ZZ", "01"],
        ["AA", "01"],
        ["pi", "02"],
        ["Pi", "02"],
        ["mOd3", "02"],
        ["MOD3", "04"],
        ["MOz9", "04"],
        ["MO9d", "04"],
        ["MO", "04"],
        ["MOd3x", "04"],
        ["BS123", "04"],
        ["BS" + "3".repeat(64), "04"],
        ["+VE2x", "00"],
        ["+VE1", "00"],
        ["-4 bad", "00"],
        ["-", "00"],
        ["+", "00"],
        ["P", "00"],
        ["", "00"],
        ["PA extra", "00"],
        ["MOd3\u0007", "00"],
        ["MOd３", "00"],
    ])("reads %j as invalid with code %s", (line, code) => {
        expect(decode(line)).toEqual({ type: "invalid", code, raw: line });
    });
});
