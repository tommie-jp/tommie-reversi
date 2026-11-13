// One line of a RUP log: "[HH:MM:SS.mmm] TX line" or "RX line", the replay format read
// by the RUP reference tools. Shared by the CLI (files) and the web app (the log panel).

export type Direction = "TX" | "RX";

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function formatLogLine(date: Date, direction: Direction, line: string): string {
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    return `[${time}] ${direction} ${line}`;
}
