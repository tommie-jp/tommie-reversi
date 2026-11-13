// Puts the web app together: the controller, the board and the status, for a game
// between two people at this screen.

import { BLACK, WHITE } from "../../core/board";
import { GameController, type Seats, type Snapshot } from "../../app/controller";
import { messagesFor, pickLanguage } from "../../app/messages";
import { TapPlayer } from "../../app/tap-player";
import { BoardView } from "./board-view";
import { el } from "./dom";
import { StatusView } from "./status-view";
import "./style.css";

const CLOCK_LIMIT_MS = 60_000;

function main(): void {
    const root = document.getElementById("app");
    if (root === null) throw new Error("#app is missing");
    const language = pickLanguage(navigator.languages);
    document.documentElement.lang = language;
    const messages = messagesFor(language);

    const header = el("header", "top-bar");
    header.append(el("h1", "title", messages.title));
    const layout = el("main", "layout");
    const boardArea = el("section", "board-area");
    const side = el("section", "side");
    layout.append(boardArea, side);
    root.append(header, layout);

    let latest: Snapshot | null = null;
    const render = (snapshot: Snapshot) => {
        latest = snapshot;
        board.render(snapshot, { hints: true });
        status.render(snapshot);
    };
    const controller = new GameController({ onChange: render, now: () => Date.now(), clockLimitMs: CLOCK_LIMIT_MS });
    const board = new BoardView(boardArea, (square) => controller.tap(square));
    const status = new StatusView(side, messages, {
        onPass: () => controller.pass(),
        onNewGame: () => {
            const running = latest !== null && latest.result === null && latest.state.moves.length > 0;
            if (running && !window.confirm(messages.confirmNewGame)) return;
            controller.start(localSeats(messages.person, render, controller));
        },
    });
    controller.start(localSeats(messages.person, render, controller));
}

/** Two people taking turns at this screen. */
function localSeats(person: string, render: (s: Snapshot) => void, controller: GameController): Seats {
    const onChange = () => render(controller.snapshot());
    return {
        black: new TapPlayer(person, { onChange }),
        white: new TapPlayer(person, { onChange }),
        humans: [BLACK, WHITE],
    };
}

main();
