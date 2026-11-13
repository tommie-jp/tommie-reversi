import { describe, expect, it } from "vitest";
import { parseCliArgs, type PlayOptions } from "../../src/cli/args";
import { HumanPlayer } from "../../src/cli/human";
import { EXIT, Session, type GameFiles, type SessionDeps } from "../../src/cli/session";
import { RandomPlayer } from "../../src/core/players/random";
import { seededRandom } from "../../src/core/random";
import { stripAnsi } from "../../src/view/terminal/render";
import { ScriptedPlayer, move } from "../helpers/scripted-player";

function options(argv: string[]): PlayOptions {
    const result = parseCliArgs(argv, {});
    if (!result.ok || result.value.kind !== "play") throw new Error("bad options");
    return result.value;
}

class MemoryFiles implements GameFiles {
    readonly rupLines: string[] = [];
    record = "";
    constructor(readonly stem: string) {}
    rup(direction: string, line: string): void {
        this.rupLines.push(`${direction} ${line}`);
    }
    saveRecord(text: string): string {
        this.record = text;
        return `logs/${this.stem}.txt`;
    }
}

function harness(argv: string[], seats: SessionDeps["seats"]) {
    const out: string[] = [];
    const files: MemoryFiles[] = [];
    const deps: SessionDeps = {
        write: (text) => out.push(text),
        now: () => new Date(2026, 10, 17, 15, 30, 12),
        openFiles: (stem) => {
            const f = new MemoryFiles(stem);
            files.push(f);
            return f;
        },
        seats,
    };
    const session = new Session(options(argv), deps);
    return { session, files, text: () => stripAnsi(out.join("")) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Session", () => {
    it("plays person against person from typed lines and saves the record", async () => {
        const { session, files, text } = harness(["--no-color"], (_n, s) => ({
            black: new HumanPlayer("Black", s.interaction, () => s.timeLeftMs(), false),
            white: new HumanPlayer("White", s.interaction, () => s.timeLeftMs(), false),
            humans: [1, 2],
        }));
        const running = session.run();
        for (const line of ["f5", "d6", "quit", "y"]) {
            await tick();
            session.interaction.handleLine(line);
        }
        expect(await running).toBe(EXIT.ok);
        expect(text()).toContain("Black to move. (60s) > ");
        expect(text()).toContain("  5 . . . X X[X]. .");
        expect(files[0]!.record).toContain("# result: Black 3 - White 3 (aborted)");
        expect(files[0]!.record.trim().split("\n").at(-1)).toBe("f5d6");
        expect(text()).toContain("saved: logs/20261117-153012-01.txt");
    });

    it("plays moves piped in before the end of the input, then quits", async () => {
        const { session, files } = harness([], (_n, s) => ({
            black: new HumanPlayer("Black", s.interaction, () => s.timeLeftMs(), false),
            white: new HumanPlayer("White", s.interaction, () => s.timeLeftMs(), false),
            humans: [1, 2],
        }));
        const running = session.run();
        for (const line of ["f5", "d6", "c3"]) session.interaction.handleLine(line);
        session.endOfInput();
        expect(await running).toBe(EXIT.ok);
        expect(files[0]!.record.trim().split("\n").at(-1)).toBe("f5d6c3");
    });

    it("waits for new or quit after a game against a person", async () => {
        let games = 0;
        const { session, text } = harness([], () => {
            games++;
            return {
                black: new ScriptedPlayer("b", [{ kind: "resign" }]),
                white: new ScriptedPlayer("w", []),
                humans: [],
            };
        });
        const running = session.run();
        await tick();
        expect(text()).toContain('Type "new" for another game, or "quit".');
        session.interaction.handleLine("new");
        await tick();
        session.interaction.handleLine("quit");
        expect(await running).toBe(EXIT.ok);
        expect(games).toBe(2);
    });

    it("plays several unattended games and announces the moves of non-human players", async () => {
        const { session, files, text } = harness(
            ["--port", "/dev/x", "--opponent", "random", "--games", "3", "--seed", "1"],
            (n) => ({
                black: new RandomPlayer("b", seededRandom(n)),
                white: new RandomPlayer("w", seededRandom(n + 100)),
                humans: [],
            }),
        );
        expect(await session.run()).toBe(EXIT.ok);
        expect(files).toHaveLength(3);
        expect(text()).toContain("=== Game 3 of 3 ===");
        expect(text()).toMatch(/Black: [a-h][1-8]\n/);
        expect(text()).toContain("Game over:");
    });

    it("stops unattended games at the first stopped game with exit code 3", async () => {
        let games = 0;
        const { session, text } = harness(
            ["--port", "/dev/x", "--opponent", "random", "--games", "5"],
            () => {
                games++;
                return { black: new ScriptedPlayer("cpu", [move("a1")]), white: new ScriptedPlayer("r", []), humans: [] };
            },
        );
        expect(await session.run()).toBe(EXIT.stopped);
        expect(games).toBe(1);
        expect(text()).toContain("RULE VIOLATION by Black: a1");
    });

    it("returns 130 on Ctrl+C during a game, after saving the record", async () => {
        const { session, files } = harness([], (_n, s) => ({
            black: new HumanPlayer("Black", s.interaction, () => s.timeLeftMs(), false),
            white: new HumanPlayer("White", s.interaction, () => s.timeLeftMs(), false),
            humans: [1, 2],
        }));
        const running = session.run();
        await tick();
        session.interrupt();
        expect(await running).toBe(EXIT.interrupted);
        expect(files[0]!.record).toContain("(aborted)");
    });

    it("starts a new game when new is confirmed during a game", async () => {
        let games = 0;
        const { session } = harness([], (_n, s) => {
            games++;
            return {
                black: new HumanPlayer("Black", s.interaction, () => s.timeLeftMs(), false),
                white: new HumanPlayer("White", s.interaction, () => s.timeLeftMs(), false),
                humans: [1, 2],
            };
        });
        const running = session.run();
        await tick();
        session.interaction.handleLine("new");
        session.interaction.handleLine("y");
        await tick();
        session.endOfInput();
        expect(await running).toBe(EXIT.ok);
        expect(games).toBe(2);
    });

    it("shows the board again on request and logs RUP lines to the current game", async () => {
        const { session, files, text } = harness([], (_n, s) => ({
            black: new HumanPlayer("Black", s.interaction, () => s.timeLeftMs(), false),
            white: new HumanPlayer("White", s.interaction, () => s.timeLeftMs(), false),
            humans: [1, 2],
        }));
        const running = session.run();
        await tick();
        session.logRup("TX", "PI");
        session.interaction.handleLine("board");
        session.endOfInput();
        await running;
        expect(files[0]!.rupLines).toEqual(["TX PI"]);
        expect(text().split("    a b c d e f g h").length - 1).toBe(2);
    });
});
