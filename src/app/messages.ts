// The words on the screen, in Japanese and English. The language follows the browser.

import { type Color, BLACK } from "../core/board";
import type { GameError } from "../core/game";
import type { MatchResult } from "../core/match";
import type { LinkState } from "./cpu-link";

export type Language = "ja" | "en";

export function pickLanguage(languages: readonly string[]): Language {
    for (const language of languages) {
        const base = language.toLowerCase().split("-")[0];
        if (base === "ja") return "ja";
        if (base === "en") return "en";
    }
    return "en";
}

interface Counts {
    readonly black: number;
    readonly white: number;
}

export interface Messages {
    readonly title: string;
    readonly black: string;
    readonly white: string;
    readonly person: string;
    readonly newGame: string;
    readonly pass: string;
    readonly toMove: (color: Color) => string;
    readonly mustPass: (color: Color) => string;
    readonly confirmMove: (square: string) => string;
    readonly waitingFor: (name: string) => string;
    readonly confirmNewGame: string;
    readonly gameError: (error: GameError, square: string) => string;
    readonly records: string;
    readonly settings: string;
    readonly close: string;
    readonly save: string;
    readonly copy: string;
    readonly copied: string;
    readonly download: string;
    readonly share: string;
    readonly noGames: string;
    readonly playing: string;
    readonly clockSeconds: string;
    readonly sound: string;
    readonly hints: string;
    readonly confirmMoveSetting: string;
    readonly language: string;
    readonly languageAuto: string;
    readonly saveFailed: string;
    readonly soundBlocked: string;
    readonly baudRate: string;
    readonly opponent: string;
    readonly opponentPerson: string;
    readonly opponentCpu: string;
    readonly cpuColor: string;
    readonly cpuBlack: string;
    readonly cpuWhite: string;
    readonly connect: string;
    readonly disconnect: string;
    readonly start: string;
    readonly log: string;
    readonly hidePing: string;
    readonly emptyLog: string;
    readonly linkState: (state: LinkState) => string;
    readonly serialUnsupported: (reason: "no-api" | "insecure") => string;
    readonly result: (result: MatchResult, counts: Counts) => string;
}

const ja: Messages = {
    title: "tommie-reversi",
    black: "黒",
    white: "白",
    person: "人",
    newGame: "新しい対局",
    pass: "パス",
    toMove: (color) => `${color === BLACK ? "黒" : "白"}の番です`,
    mustPass: (color) => `${color === BLACK ? "黒" : "白"}は打てる所がありません。「パス」を押してください`,
    confirmMove: (square) => `${square} に打ちます。もう一度押すと決まります`,
    waitingFor: (name) => `${name} の手を待っています…`,
    confirmNewGame: "今の対局をやめて、新しく始めますか？",
    records: "棋譜",
    settings: "設定",
    close: "閉じる",
    save: "保存",
    copy: "コピー",
    copied: "コピーしました",
    download: "ファイルに保存",
    share: "共有",
    noGames: "保存した対局はありません",
    playing: "対局中",
    clockSeconds: "時計の秒数 (1 手)",
    sound: "音を出す",
    hints: "置ける所に印を付ける",
    confirmMoveSetting: "CPU に送る前に、もう一度押して確かめる",
    language: "言葉",
    languageAuto: "ブラウザに合わせる",
    saveFailed: "このブラウザには保存できません (プライベートモードなど)",
    soundBlocked: "音を出すには、画面をタップしてください",
    baudRate: "ボーレート (USB-UART 変換器のとき)",
    opponent: "相手",
    opponentPerson: "人",
    opponentCpu: "CPU (シリアル)",
    cpuColor: "CPU の色",
    cpuBlack: "黒 (先手)",
    cpuWhite: "白 (後手)",
    connect: "つなぐ",
    disconnect: "切る",
    start: "始める",
    log: "ログ",
    hidePing: "PI と +PI を隠す",
    emptyLog: "(まだ何も送受信していません)",
    linkState: (state) => {
        switch (state.kind) {
            case "idle": return "つながっていません";
            case "connecting": return "つないでいます…";
            case "connected": return `${state.name} (RUP ${state.version || "?"}, ${state.port})`;
            case "lost": return `切れました: ${state.reason}`;
            case "failed": return `つなげませんでした: ${state.message}`;
        }
    },
    serialUnsupported: (reason) =>
        reason === "no-api"
            ? "このブラウザでは CPU とつなげません (Web Serial がありません)。Android か PC の Chrome / Edge を使ってください"
            : "HTTPS のページでないと CPU とつなげません",
    gameError: (error, square) => {
        switch (error) {
            case "no-flips": return `${square} は 1 つも返せません`;
            case "occupied": return `${square} にはもう石があります`;
            case "bad-square": return `${square} はマスではありません`;
            case "must-pass": return "打てる所がありません。パスしてください";
            case "pass-not-allowed": return "打てる所があるので、パスはできません";
            case "not-playing": return "対局は終わっています";
        }
    },
    result: (result, counts) => {
        const name = (color: Color) => (color === BLACK ? "黒" : "白");
        switch (result.reason) {
            case "normal": {
                const winner = result.outcome === "draw" ? "引き分け" : `${result.outcome === "black" ? "黒" : "白"}の勝ち`;
                return `終局: 黒 ${counts.black} - 白 ${counts.white}。${winner}`;
            }
            case "resign":
                return `${name(result.by)}が投了しました。${name(result.by === BLACK ? 2 : 1)}の勝ち`;
            case "violation": {
                const tried = result.attempted.kind === "move" ? result.attempted.square : "パス";
                return `ルール違反 (${name(result.by)}): ${tried}。${ja.gameError(result.error, tried)}。対局をやめました`;
            }
            case "aborted":
                return result.detail === "stopped" ? "対局をやめました" : `対局が止まりました: ${result.detail}`;
        }
    },
};

const en: Messages = {
    title: "tommie-reversi",
    black: "Black",
    white: "White",
    person: "Person",
    newGame: "New game",
    pass: "Pass",
    toMove: (color) => `${color === BLACK ? "Black" : "White"} to move`,
    mustPass: (color) => `${color === BLACK ? "Black" : "White"} has no legal move. Press "Pass"`,
    confirmMove: (square) => `Play ${square}? Tap it again to confirm`,
    waitingFor: (name) => `Waiting for ${name}...`,
    confirmNewGame: "Stop this game and start a new one?",
    records: "Records",
    settings: "Settings",
    close: "Close",
    save: "Save",
    copy: "Copy",
    copied: "Copied",
    download: "Save as file",
    share: "Share",
    noGames: "No saved games",
    playing: "In progress",
    clockSeconds: "Clock seconds (per move)",
    sound: "Sound",
    hints: "Mark the legal squares",
    confirmMoveSetting: "Tap twice before a move goes to the CPU",
    language: "Language",
    languageAuto: "Same as the browser",
    saveFailed: "This browser cannot save (private mode?)",
    soundBlocked: "Tap the screen to turn on sound",
    baudRate: "Baud rate (for a USB-UART bridge)",
    opponent: "Opponent",
    opponentPerson: "Person",
    opponentCpu: "CPU (serial)",
    cpuColor: "CPU plays",
    cpuBlack: "Black (first)",
    cpuWhite: "White (second)",
    connect: "Connect",
    disconnect: "Disconnect",
    start: "Start",
    log: "Log",
    hidePing: "Hide PI and +PI",
    emptyLog: "(nothing sent or received yet)",
    linkState: (state) => {
        switch (state.kind) {
            case "idle": return "Not connected";
            case "connecting": return "Connecting...";
            case "connected": return `${state.name} (RUP ${state.version || "?"}, ${state.port})`;
            case "lost": return `Lost: ${state.reason}`;
            case "failed": return `Could not connect: ${state.message}`;
        }
    },
    serialUnsupported: (reason) =>
        reason === "no-api"
            ? "This browser cannot connect to a CPU (no Web Serial). Use Chrome or Edge on Android or a PC"
            : "Connecting to a CPU needs an HTTPS page",
    gameError: (error, square) => {
        switch (error) {
            case "no-flips": return `${square} does not flip any disc`;
            case "occupied": return `${square} is already taken`;
            case "bad-square": return `${square} is not a square`;
            case "must-pass": return "No legal move: you have to pass";
            case "pass-not-allowed": return "You have a legal move, so you cannot pass";
            case "not-playing": return "The game is over";
        }
    },
    result: (result, counts) => {
        const name = (color: Color) => (color === BLACK ? "Black" : "White");
        switch (result.reason) {
            case "normal": {
                const winner = result.outcome === "draw" ? "Draw" : `${result.outcome === "black" ? "Black" : "White"} wins`;
                return `Game over: Black ${counts.black} - White ${counts.white}. ${winner}`;
            }
            case "resign":
                return `${name(result.by)} resigned. ${name(result.by === BLACK ? 2 : 1)} wins`;
            case "violation": {
                const tried = result.attempted.kind === "move" ? result.attempted.square : "pass";
                return `Rule violation by ${name(result.by)}: ${tried}. ${en.gameError(result.error, tried)}. Game stopped`;
            }
            case "aborted":
                return result.detail === "stopped" ? "Game stopped" : `Game stopped: ${result.detail}`;
        }
    },
};

export function messagesFor(language: Language): Messages {
    return language === "ja" ? ja : en;
}
