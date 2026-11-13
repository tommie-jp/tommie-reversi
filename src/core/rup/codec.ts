// Reversi UART Protocol (RUP) v0.2: one line at a time, without the CR+LF line end.
// https://github.com/tommie-jp/reversi-uart-protocol
//
// decode never throws. A line that breaks the rules becomes `invalid` with the RUP
// error code (section 7.3) that a strict receiver would answer with.

import { boardFromBO, boardToBO, isSquare, type Board } from "../board";

/** Lines the host (this app) sends to the CPU. */
export type RupOut =
    | { readonly type: "SB" }
    | { readonly type: "SW" }
    | { readonly type: "MO"; readonly square: string }
    | { readonly type: "PA" }
    | { readonly type: "BO"; readonly board: Board }
    | { readonly type: "EB" }
    | { readonly type: "EW" }
    | { readonly type: "ED" }
    | { readonly type: "PI" }
    | { readonly type: "VE" }
    | { readonly type: "CA" };

/** Lines the CPU sends to the host. */
export type RupIn =
    | { readonly type: "MO"; readonly square: string }
    | { readonly type: "PA" }
    | { readonly type: "EN" }
    | { readonly type: "RE" }
    | { readonly type: "RS" }
    | { readonly type: "BS"; readonly board: Board }
    | { readonly type: "ST"; readonly text: string }
    | { readonly type: "NC"; readonly text: string }
    | { readonly type: "+PI" }
    | { readonly type: "+VE"; readonly version: string; readonly name: string }
    | { readonly type: "+CA"; readonly commands: readonly string[] }
    /** Any other success reply, e.g. `+SB` or `+XB clk=...`. */
    | { readonly type: "+"; readonly command: string; readonly data: string }
    /** An error reply `-NN [reason]`. */
    | { readonly type: "-"; readonly code: string; readonly reason: string }
    /** The `X*` extension space: logged, never an error. */
    | { readonly type: "X"; readonly raw: string }
    | { readonly type: "invalid"; readonly code: RupErrorCode; readonly raw: string };

/** RUP section 7.3: 00 generic, 01 unknown command, 02 lowercase command, 04 bad coordinate. */
export type RupErrorCode = "00" | "01" | "02" | "04";

export const MAX_LINE_LENGTH = 128;

const PRINTABLE = /^[\x20-\x7e]*$/;
const SIMPLE: Readonly<Record<string, RupIn>> = {
    PA: { type: "PA" },
    EN: { type: "EN" },
    RE: { type: "RE" },
    RS: { type: "RS" },
};
const KNOWN_COMMANDS = new Set([
    "SB", "SW", "MO", "PA", "BO", "EB", "EW", "ED", "VE", "PI", "CA", "EN", "RE", "RS", "BS", "ST", "NC",
]);

export function encode(message: RupOut): string {
    switch (message.type) {
        case "MO":
            if (!isSquare(message.square)) throw new RangeError(`not a RUP square: ${message.square}`);
            return "MO" + message.square;
        case "BO":
            return "BO" + boardToBO(message.board);
        default:
            return message.type;
    }
}

export function decode(line: string): RupIn {
    const invalid = (code: RupErrorCode): RupIn => ({ type: "invalid", code, raw: line });
    if (!PRINTABLE.test(line) || line.length < 2 || line.length > MAX_LINE_LENGTH) return invalid("00");
    if (line[0] === "+") return decodeSuccess(line) ?? invalid("00");
    if (line[0] === "-") return decodeError(line) ?? invalid("00");
    const command = line.slice(0, 2);
    const rest = line.slice(2);
    if (!/^[A-Z]{2}$/.test(command)) return invalid(/^[A-Za-z]{2}$/.test(command) ? "02" : "00");
    if (command[0] === "X") return { type: "X", raw: line };
    return decodeCommand(command, rest) ?? invalid(errorCodeFor(command));
}

function decodeCommand(command: string, rest: string): RupIn | null {
    switch (command) {
        case "MO":
            return isSquare(rest) ? { type: "MO", square: rest } : null;
        case "BS": {
            const board = boardFromBO(rest);
            return board === null ? null : { type: "BS", board };
        }
        case "ST":
        case "NC":
            return { type: command, text: rest.trimStart() };
        default:
            return rest === "" ? (SIMPLE[command] ?? null) : null;
    }
}

function errorCodeFor(command: string): RupErrorCode {
    if (command === "MO" || command === "BS") return "04";
    return KNOWN_COMMANDS.has(command) ? "00" : "01";
}

function decodeSuccess(line: string): RupIn | null {
    const command = line.slice(1, 3);
    const data = line.slice(3);
    if (!/^[A-Z]{2}$/.test(command)) return null;
    if (command === "PI" && data === "") return { type: "+PI" };
    if (command === "VE") {
        // RUP allows a name of up to 16 characters, but real CPUs send longer ones
        // (e.g. "SW-FPGA-pico2-reversi-03-corner.57"), so any length is accepted.
        const match = /^(\d{2})(.*)$/.exec(data);
        return match === null ? null : { type: "+VE", version: match[1]!, name: match[2]! };
    }
    if (command === "CA") return { type: "+CA", commands: data.trim().split(/\s+/).filter((c) => c !== "") };
    return { type: "+", command, data };
}

function decodeError(line: string): RupIn | null {
    const match = /^-(\d{2})(?: (.*))?$/.exec(line);
    return match === null ? null : { type: "-", code: match[1]!, reason: match[2] ?? "" };
}
