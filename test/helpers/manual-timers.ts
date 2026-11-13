import type { Timers } from "../../src/core/timers";

/** Timers that only move when the test calls advance(). */
export class ManualTimers implements Timers {
    private now = 0;
    private nextId = 0;
    private readonly pending = new Map<number, { at: number; callback: () => void }>();

    set(callback: () => void, ms: number): () => void {
        const id = this.nextId++;
        this.pending.set(id, { at: this.now + ms, callback });
        return () => this.pending.delete(id);
    }

    /** Moves time forward, running every timer that falls due, in order. */
    async advance(ms: number): Promise<void> {
        const end = this.now + ms;
        for (;;) {
            const due = [...this.pending.entries()]
                .filter(([, t]) => t.at <= end)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (due === undefined) break;
            this.pending.delete(due[0]);
            this.now = due[1].at;
            due[1].callback();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        this.now = end;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
