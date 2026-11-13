// Game records in the usual Reversi form: the squares in the order they were played,
// lowercase, with no separators, e.g. "f5d6c3". Passes are left out because they can
// be worked out from the board. Reading is lenient: uppercase, spaces, `#` comment
// lines and the pass tokens `pa` / `ps` are accepted, the same as Edax.

import { mustPass, newGame, playMove, playPass, type GameError, type GameState, type Move } from "./game";
import { err, ok, type Result } from "./result";

export interface RecordError {
    /** Offset of the bad token in the text (0-based). */
    readonly at: number;
    readonly reason: GameError | "bad-token";
}

interface Token {
    readonly text: string;
    readonly at: number;
}

const PASS_TOKENS = new Set(["pa", "ps"]);
const SQUARE_TOKEN = /^[a-h][1-8]$/;

export function formatRecord(moves: readonly Move[]): string {
    return moves.map((move) => (move.kind === "move" ? move.square : "")).join("");
}

export function parseRecord(text: string): Result<GameState, RecordError> {
    let game = newGame();
    for (const token of tokenize(text)) {
        const step = playToken(game, token);
        if (!step.ok) return step;
        game = step.value;
    }
    return ok(game);
}

function playToken(game: GameState, token: Token): Result<GameState, RecordError> {
    const fail = (reason: RecordError["reason"]) => err({ at: token.at, reason });
    if (PASS_TOKENS.has(token.text)) {
        const passed = playPass(game);
        return passed.ok ? passed : fail(passed.error);
    }
    if (!SQUARE_TOKEN.test(token.text)) return fail("bad-token");
    // A pass that is not written down is filled in here.
    const ready = mustPass(game) ? playPass(game) : ok(game);
    if (!ready.ok) return fail(ready.error);
    const played = playMove(ready.value, token.text);
    return played.ok ? played : fail(played.error);
}

/** Splits the text into two-character tokens, skipping spaces and `#` comment lines. */
function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let offset = 0;
    for (const line of text.split("\n")) {
        if (!line.trimStart().startsWith("#")) tokens.push(...lineTokens(line, offset));
        offset += line.length + 1;
    }
    return tokens;
}

function lineTokens(line: string, offset: number): Token[] {
    const tokens: Token[] = [];
    let pending = "";
    let start = 0;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (/\s/.test(ch)) continue;
        if (pending === "") start = offset + i;
        pending += ch.toLowerCase();
        if (pending.length === 2) {
            tokens.push({ text: pending, at: start });
            pending = "";
        }
    }
    if (pending !== "") tokens.push({ text: pending, at: start });
    return tokens;
}
