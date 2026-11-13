// Puts the web app together: settings, the controller, the board, the status with the
// clocks, sound, saved records, and the screen lock, for a game between two people.

import { BLACK, WHITE, countDiscs } from "../../core/board";
import { formatRecord } from "../../core/record";
import { isoLocal } from "../../core/record-file";
import { ClockAlerts } from "../../app/clock-display";
import { GameController, type Seats, type Snapshot } from "../../app/controller";
import { messagesFor, pickLanguage, type Messages } from "../../app/messages";
import { Sound } from "../../app/sound";
import { GameStore, SettingsStore, type KeyValueStore } from "../../app/storage";
import { TapPlayer } from "../../app/tap-player";
import { BoardView } from "./board-view";
import { APP_COMMIT, APP_VERSION } from "./build-info";
import { el } from "./dom";
import { RecordsView } from "./records-view";
import { SettingsView } from "./settings-view";
import { StatusView } from "./status-view";
import { ScreenLock } from "./wake-lock";
import "./style.css";

const CLOCK_TICK_MS = 250;
const CLOCK_WARN_MS = 10_000;

function main(): void {
    const root = document.getElementById("app");
    if (root === null) throw new Error("#app is missing");
    const store = browserStore();
    const settingsStore = new SettingsStore(store);
    const games = new GameStore(store);
    let settings = settingsStore.load();
    const language = settings.language === "auto" ? pickLanguage(navigator.languages) : settings.language;
    document.documentElement.lang = language;
    const messages = messagesFor(language);

    const header = topBar(messages);
    const sound = new Sound({
        element: new Audio(),
        makeUrl: (wav) => URL.createObjectURL(new Blob([wav as BlobPart], { type: "audio/wav" })),
        onBlockedChange: (blocked) => (header.soundNote.hidden = !blocked || !sound.enabled),
    });
    sound.enabled = settings.sound;
    const screenLock = new ScreenLock();
    const alerts = new ClockAlerts(CLOCK_WARN_MS);
    unlockOnGesture(sound);

    const layout = el("main", "layout");
    const boardArea = el("section", "board-area");
    const side = el("section", "side");
    layout.append(boardArea, side);
    root.append(header.bar, layout);

    let latest: Snapshot | null = null;
    let saveWarned = false;
    const render = (snapshot: Snapshot) => {
        const previous = latest;
        latest = snapshot;
        board.render(snapshot, { hints: settings.hints });
        status.render(snapshot);
        playSounds(previous, snapshot, sound);
        screenLock.set(snapshot.result === null && snapshot.state.status === "playing");
        if (changed(previous, snapshot) && !saveGame(games, snapshot, messages) && !saveWarned) {
            saveWarned = true;
            window.alert(messages.saveFailed);
        }
    };
    const controller = new GameController({ onChange: render, now: () => Date.now(), clockLimitMs: settings.clockSeconds * 1000 });
    const board = new BoardView(boardArea, (square) => controller.tap(square));
    const startLocal = () => controller.start(localSeats(messages.person, () => render(controller.snapshot())));
    const status = new StatusView(side, messages, {
        onPass: () => controller.pass(),
        onNewGame: () => {
            const running = latest !== null && latest.result === null && latest.state.moves.length > 0;
            if (running && !window.confirm(messages.confirmNewGame)) return;
            startLocal();
        },
    });
    const records = new RecordsView(root, messages, {
        list: () => games.list(),
        copy: copyText,
        download: downloadText,
        ...(typeof navigator.share === "function" ? { share: (text: string) => navigator.share({ text }).catch(() => {}) } : {}),
    });
    const settingsView = new SettingsView(root, messages, (next) => {
        const reload = next.language !== settings.language;
        settings = next;
        if (!settingsStore.save(next)) window.alert(messages.saveFailed);
        if (reload) return window.location.reload();
        sound.enabled = next.sound;
        header.soundNote.hidden = !(sound.enabled && sound.blocked);
        controller.setClockLimit(next.clockSeconds * 1000);
        if (latest !== null) render(latest);
    });
    header.records.addEventListener("click", () => records.open());
    header.settings.addEventListener("click", () => settingsView.open(settings));

    window.setInterval(() => {
        if (latest === null) return;
        const playing = latest.result === null && latest.state.status === "playing";
        const running = playing ? latest.state.turn : null;
        const timeLeft = controller.timeLeftMs();
        status.renderClocks(timeLeft, controller.clockLimitMs(), running);
        const turn = running === null ? null : `${latest.gameNumber}:${latest.state.moves.length}`;
        const alert = alerts.check(turn, running === BLACK ? timeLeft.black : timeLeft.white);
        if (alert !== null) sound.play(alert);
    }, CLOCK_TICK_MS);

    startLocal();
}

interface TopBar {
    readonly bar: HTMLElement;
    readonly records: HTMLButtonElement;
    readonly settings: HTMLButtonElement;
    readonly soundNote: HTMLElement;
}

function topBar(messages: Messages): TopBar {
    const bar = el("header", "top-bar");
    const title = el("h1", "title", messages.title);
    const version = el("span", "version", `v${APP_VERSION}`);
    version.title = `build ${APP_COMMIT}`;
    const commit = el("span", "commit", APP_COMMIT);
    const records = el("button", "top-button", messages.records);
    const settings = el("button", "top-button", messages.settings);
    records.type = "button";
    settings.type = "button";
    const soundNote = el("span", "sound-note", messages.soundBlocked);
    soundNote.hidden = true;
    soundNote.setAttribute("role", "status");
    bar.append(title, version, commit, el("span", "spacer"), soundNote, records, settings);
    return { bar, records, settings, soundNote };
}

/** Two people taking turns at this screen. */
function localSeats(person: string, onChange: () => void): Seats {
    return {
        black: new TapPlayer(person, { onChange }),
        white: new TapPlayer(person, { onChange }),
        humans: [BLACK, WHITE],
    };
}

function changed(previous: Snapshot | null, next: Snapshot): boolean {
    if (next.state.moves.length === 0 && next.result === null) return false;
    return (
        previous === null ||
        previous.gameNumber !== next.gameNumber ||
        previous.state.moves.length !== next.state.moves.length ||
        previous.result !== next.result
    );
}

function saveGame(games: GameStore, snapshot: Snapshot, messages: Messages): boolean {
    return games.save({
        id: String(snapshot.startedAtMs),
        startedAt: isoLocal(new Date(snapshot.startedAtMs)),
        black: snapshot.names.black,
        white: snapshot.names.white,
        record: formatRecord(snapshot.state.moves),
        result: snapshot.result === null ? "" : messages.result(snapshot.result, countDiscs(snapshot.state.board)),
        finished: snapshot.result !== null,
    });
}

function playSounds(previous: Snapshot | null, next: Snapshot, sound: Sound): void {
    if (previous === null || previous.gameNumber !== next.gameNumber) return;
    if (next.result !== null && previous.result === null) return sound.play("end");
    if (next.state.moves.length > previous.state.moves.length) sound.play("place");
}

/** Events that count as a user gesture for audio (a touch counts when lifted). */
const GESTURES = ["pointerup", "touchend", "click", "keydown"] as const;

/** Tries to allow sound on each gesture, and stops listening once it is allowed. */
function unlockOnGesture(sound: Sound): void {
    const onGesture = () => {
        void sound.unlock().then((ready) => {
            if (ready) for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
        });
    };
    for (const type of GESTURES) document.addEventListener(type, onGesture, true);
}

/** localStorage, or a store that keeps nothing when the browser refuses it. */
function browserStore(): KeyValueStore {
    try {
        const storage = window.localStorage;
        storage.getItem("tommie-reversi:probe");
        return storage;
    } catch {
        return { getItem: () => null, setItem: () => { throw new Error("no storage"); }, removeItem: () => {} };
    }
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function downloadText(fileName: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = el("a", "");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

main();
