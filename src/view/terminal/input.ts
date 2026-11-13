// Reads one line typed by the person.

import { isSquare } from "../../core/board";

export type Command =
    | { readonly type: "move"; readonly square: string }
    | { readonly type: "pass" }
    | { readonly type: "empty" }
    | { readonly type: "board" }
    | { readonly type: "help" }
    | { readonly type: "new" }
    | { readonly type: "quit" }
    | { readonly type: "invalid"; readonly reason: string };

const WORDS: Readonly<Record<string, Command>> = {
    pass: { type: "pass" },
    board: { type: "board" },
    help: { type: "help" },
    "?": { type: "help" },
    new: { type: "new" },
    quit: { type: "quit" },
    q: { type: "quit" },
};
const ECHO_LIMIT = 20;

export function parseInput(text: string): Command {
    const word = text.trim().toLowerCase();
    if (word === "") return { type: "empty" };
    if (isSquare(word)) return { type: "move", square: word };
    const command = WORDS[word];
    if (command !== undefined) return command;
    const shown = word.length > ECHO_LIMIT ? word.slice(0, ECHO_LIMIT) + "..." : word;
    return { type: "invalid", reason: `unknown input: "${shown}" (type help)` };
}

export const HELP_TEXT = [
    "  f5        play on f5 (upper or lower case)",
    "  pass      pass (only when you have no legal move; Enter also works then)",
    "  board     show the board again",
    "  help, ?   show this list",
    "  new       stop this game and start a new one",
    "  quit, q   quit (Ctrl+C quits at once)",
].join("\n");
