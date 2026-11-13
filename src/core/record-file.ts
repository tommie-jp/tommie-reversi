// The text of a game record file: "# key: value" header lines, then the record line.
// Shared by the CLI (files in logs/) and the web app (downloads).

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** Local time with its UTC offset, e.g. 2026-11-17T15:30:12+09:00. */
export function isoLocal(date: Date): string {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
    );
}

export interface RecordFields {
    /** A Date, or a date already written as local time with its offset. */
    readonly date: Date | string;
    readonly black: string;
    readonly white: string;
    readonly result: string;
    /** The record line, e.g. "f5d6c3". */
    readonly record: string;
}

export function recordText(fields: RecordFields): string {
    const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ");
    return [
        `# date: ${typeof fields.date === "string" ? oneLine(fields.date) : isoLocal(fields.date)}`,
        `# black: ${oneLine(fields.black)}`,
        `# white: ${oneLine(fields.white)}`,
        `# result: ${oneLine(fields.result)}`,
        fields.record,
        "",
    ].join("\n");
}
