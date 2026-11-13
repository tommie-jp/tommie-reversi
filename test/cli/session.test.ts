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

    it("puts RUP lines sent before the first game into the first game's log", async () => {
        const { session, files } = harness([], () => ({
            black: new ScriptedPlayer("b", [{ kind: "resign" }]),
            white: new ScriptedPlayer("w", []),
            humans: [],
        }));
        session.logRup("TX", "PI");
        session.logRup("RX", "+PI");
        const running = session.run();
        await tick();
        session.interaction.handleLine("quit");
        await running;
        expect(files[0]!.rupLines).toEqual(["TX PI", "RX +PI"]);
    });

    it("says whom it is waiting for when a person plays a CPU", async () => {
        const { session, text } = harness([], (_n, s) => ({
            black: new ScriptedPlayer("fpga", [move("f5"), { kind: "resign" }]),
            white: new HumanPlayer("you", s.interaction, () => s.timeLeftMs(), true),
            humans: [2],
        }));
        const running = session.run();
        await tick();
        expect(text()).toContain("waiting for Black (fpga)...");
        expect(text()).toContain("Black: f5");
        expect(text()).toContain("White (you) to move. (60s) > ");
        session.interaction.handleLine("d6");
        await tick();
        session.interaction.handleLine("quit");
        expect(await running).toBe(EXIT.ok);
    });

    it("keeps playing unattended games when the input ends", async () => {
        const { session, files } = harness(
            ["--port", "/dev/x", "--opponent", "random", "--games", "2", "--seed", "1"],
            (n) => ({ black: new RandomPlayer("b", seededRandom(n)), white: new RandomPlayer("w", seededRandom(n + 7)), humans: [] }),
        );
        session.endOfInput();
        expect(await session.run()).toBe(EXIT.ok);
        expect(files).toHaveLength(2);
    });

    it("sums up unattended games at the end", async () => {
        const { session, text } = harness(
            ["--port", "/dev/x", "--opponent", "random", "--games", "4", "--seed", "1"],
            (n) => ({
                black: new RandomPlayer("b", seededRandom(n)),
                white: new RandomPlayer("w", seededRandom(n + 100)),
                humans: [],
            }),
        );
        await session.run();
        expect(text()).toMatch(/Played 4 games: black won \d+, white won \d+, drawn \d+\./);
    });

    it("names the stopped game in the summary", async () => {
        const { session, text } = harness(
            ["--port", "/dev/x", "--opponent", "random", "--games", "3"],
            () => ({ black: new ScriptedPlayer("cpu", [move("a1")]), white: new ScriptedPlayer("r", []), humans: [] }),
        );
        await session.run();
        expect(text()).toContain("Played 1 game: stopped at game 1 (violation).");
    });

    it("returns 130 for Ctrl+C while waiting after a game", async () => {
        const { session } = harness([], () => ({
            black: new ScriptedPlayer("b", [{ kind: "resign" }]),
            white: new ScriptedPlayer("w", []),
            humans: [],
        }));
        const running = session.run();
        await tick();
        session.interrupt();
        expect(await running).toBe(EXIT.interrupted);
    });

    it("counts a resignation as a win in the summary", async () => {
        const { session, text } = harness(
            ["--port", "/dev/x", "--opponent", "random", "--games", "2"],
            () => ({ black: new ScriptedPlayer("cpu", [{ kind: "resign" }]), white: new ScriptedPlayer("r", []), humans: [] }),
        );
        expect(await session.run()).toBe(EXIT.ok);
        expect(text()).toContain("Played 2 games: black won 0, white won 2, drawn 0.");
    });

    it("returns 3 at the end when a game against a person was stopped by the CPU", async () => {
        const { session } = harness([], () => ({
            black: new ScriptedPlayer("cpu", [move("a1")]),
            white: new ScriptedPlayer("you", []),
            humans: [2],
        }));
        const running = session.run();
        await tick();
        session.interaction.handleLine("quit");
        expect(await running).toBe(EXIT.stopped);
    });

    it("returns 0 when the person stopped the game themselves", async () => {
        const { session } = harness([], (_n, s) => ({
            black: new HumanPlayer("Black", s.interaction, () => s.timeLeftMs(), false),
            white: new HumanPlayer("White", s.interaction, () => s.timeLeftMs(), false),
            humans: [1, 2],
        }));
        const running = session.run();
        await tick();
        session.interaction.handleLine("quit");
        session.interaction.handleLine("y");
        expect(await running).toBe(EXIT.ok);
    });

    it("judges whose turn it is by the new game as soon as it starts", async () => {
        let game = 0;
        const { session, text } = harness([], (_n, s) => {
            game++;
            // Game 1: a person is white and stops the game on their turn.
            // Game 2: the CPU is black and starts slowly, so input during its start must be ignored.
            if (game === 1) {
                return {
                    black: new ScriptedPlayer("cpu", [move("f5")]),
                    white: new HumanPlayer("you", s.interaction, () => s.timeLeftMs(), true),
                    humans: [2],
                };
            }
            const slow = new ScriptedPlayer("cpu", [{ kind: "resign" }]);
            slow.start = () => new Promise((resolve) => setTimeout(resolve, 20));
            return { black: slow, white: new HumanPlayer("you", s.interaction, () => s.timeLeftMs(), true), humans: [2] };
        });
        const running = session.run();
        await tick();
        session.interaction.handleLine("new");
        session.interaction.handleLine("y");
        await tick();
        session.interaction.handleLine("d6");
        expect(text()).toContain("Not your turn: input ignored.");
        await new Promise((resolve) => setTimeout(resolve, 40));
        session.interaction.handleLine("quit");
        expect(await running).toBe(EXIT.ok);
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
