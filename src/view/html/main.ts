// Puts the web app together: settings, the controller, the board, the status with the
// clocks, sound, saved records, the screen lock, and the CPU link (Web Serial).
// With ?cpu=fake in the URL, a fake RUP CPU in the page stands in for Web Serial.

import { BLACK, countDiscs } from "../../core/board";
import { formatRecord } from "../../core/record";
import { isoLocal } from "../../core/record-file";
import { ClockAlerts } from "../../app/clock-display";
import { CpuLink, type OpenedPort } from "../../app/cpu-link";
import { GameController, type Snapshot } from "../../app/controller";
import { buildSeats, type GameChoice } from "../../app/seats";
import { startFakeCpu } from "../../transport/fake-cpu";
import { createLoopbackPair } from "../../transport/loopback";
import { systemTimers } from "../../transport/system-timers";
import { browserSerial, openWebSerial, portLabel, webSerialSupport } from "../../transport/web-serial";
import { LogView } from "./log-view";
import { NewGameView } from "./new-game-view";
import { messagesFor, pickLanguage, type Messages } from "../../app/messages";
import { Sound } from "../../app/sound";
import { GameStore, SettingsStore, type KeyValueStore } from "../../app/storage";
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

    const fakeCpu = new URLSearchParams(window.location.search).get("cpu") === "fake";
    const support = fakeCpu ? "ok" : webSerialSupport(navigator, window.isSecureContext);
    const link = new CpuLink({
        timers: systemTimers,
        now: () => Date.now(),
        onChange: () => {
            newGame.update(link.state);
            showLink(header.link, link, messages);
        },
        onNotice: (text) => status.setNote(text),
    });
    let choice: GameChoice = { opponent: "person", cpuColor: BLACK };
    const startGame = (next: GameChoice) => {
        link.player?.chooseStrategy(next.cpuStrategy ?? null);
        const seats = buildSeats(next, {
            person: messages.person,
            cpu: link.player,
            confirm: settings.confirmMove,
            onChange: () => render(controller.snapshot()),
        });
        if (seats === null) return;
        choice = next;
        status.setNote(null);
        controller.start(seats);
    };
    const newGame = new NewGameView(root, messages, {
        onConnect: () => void link.connect(() => openPort(fakeCpu, settings.baudRate)),
        onDisconnect: () => void link.disconnect(),
        onStart: (next) => {
            const running = latest !== null && latest.result === null && latest.state.moves.length > 0;
            if (running && !window.confirm(messages.confirmNewGame)) return;
            startGame(next);
        },
    });
    const status = new StatusView(side, messages, {
        onPass: () => controller.pass(),
        onNewGame: () => newGame.open(choice, link.state, support),
    });
    const logView = new LogView(root, messages, { text: (options) => link.logText(options), copy: copyText });
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
    header.log.addEventListener("click", () => logView.open());
    showLink(header.link, link, messages);
    header.settings.addEventListener("click", () => settingsView.open(settings));

    window.setInterval(() => {
        if (logView.isOpen) logView.refresh();
        if (latest === null) return;
        const playing = latest.result === null && latest.state.status === "playing";
        const running = playing ? latest.state.turn : null;
        const timeLeft = controller.timeLeftMs();
        status.renderClocks(timeLeft, controller.clockLimitMs(), running);
        const turn = running === null ? null : `${latest.gameNumber}:${latest.state.moves.length}`;
        const alert = alerts.check(turn, running === BLACK ? timeLeft.black : timeLeft.white);
        if (alert !== null) sound.play(alert);
    }, CLOCK_TICK_MS);

    startGame(choice);
}

/** Opens the serial port chosen by the person, or a fake CPU with ?cpu=fake. */
async function openPort(fake: boolean, baudRate: number): Promise<OpenedPort> {
    if (fake) {
        const [host, cpu] = createLoopbackPair();
        startFakeCpu(cpu, { name: "fake-cpu", seed: Date.now() % 1_000_000 });
        return { transport: host, label: "fake" };
    }
    const serial = browserSerial();
    if (serial === null) throw new Error("this browser has no Web Serial");
    // Called from the Connect tap, so the browser may show its port chooser.
    const port = await serial.requestPort({});
    return { transport: await openWebSerial(port, baudRate), label: portLabel(port) };
}

function showLink(target: HTMLElement, link: CpuLink, messages: Messages): void {
    const state = link.state;
    target.textContent = state.kind === "connected" ? `CPU: ${state.name}` : state.kind === "idle" ? "" : `CPU: ${messages.linkState(state)}`;
    target.classList.toggle("bad", state.kind === "lost" || state.kind === "failed");
    target.hidden = state.kind === "idle";
}

interface TopBar {
    readonly bar: HTMLElement;
    readonly link: HTMLElement;
    readonly log: HTMLButtonElement;
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
    const log = el("button", "top-button", messages.log);
    records.type = "button";
    settings.type = "button";
    log.type = "button";
    const link = el("span", "link");
    link.hidden = true;
    const soundNote = el("span", "sound-note", messages.soundBlocked);
    soundNote.hidden = true;
    soundNote.setAttribute("role", "status");
    bar.append(title, version, commit, el("span", "spacer"), link, soundNote, log, records, settings);
    return { bar, link, log, records, settings, soundNote };
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
