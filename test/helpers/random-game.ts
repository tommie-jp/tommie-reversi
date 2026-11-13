import { indexToSquare } from "../../src/core/board";
import { mustPass, newGame, playMove, playPass, type GameState } from "../../src/core/game";
import { seededRandom } from "../../src/core/random";
import { legalMoves } from "../../src/core/rules";

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
