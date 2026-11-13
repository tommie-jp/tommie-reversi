// Wraps a transport so that every line sent and received is also reported (for the RUP log).

import type { LineTransport } from "../core/transport";

export type TapDirection = "TX" | "RX";

export function tapTransport(
    inner: LineTransport,
    report: (direction: TapDirection, line: string) => void,
): LineTransport {
    inner.onLine((line) => report("RX", line));
    return {
        async sendLine(line) {
            report("TX", line);
            await inner.sendLine(line);
        },
        onLine: (listener) => inner.onLine(listener),
        onClose: (listener) => inner.onClose(listener),
        close: () => inner.close(),
    };
}
