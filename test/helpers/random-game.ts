import { indexToSquare } from "../../src/core/board";
import { mustPass, newGame, playMove, playPass, type GameState } from "../../src/core/game";
import { legalMoves } from "../../src/core/rules";

/** A small seeded random number generator (mulberry32) so that test games repeat. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Plays random legal moves until the game ends. */
export function randomGame(seed: number): GameState {
    const random = seededRandom(seed);
    let game = newGame();
    while (game.status === "playing") {
        const result = mustPass(game)
            ? playPass(game)
            : playMove(game, pick(legalMoves(game.board, game.turn), random));
        if (!result.ok) throw new Error(result.error);
        game = result.value;
    }
    return game;
}

function pick(moves: readonly number[], random: () => number): string {
    return indexToSquare(moves[Math.floor(random() * moves.length)]!);
}
