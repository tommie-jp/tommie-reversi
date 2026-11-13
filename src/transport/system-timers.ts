import type { Timers } from "../core/timers";

/** Timers backed by the platform's setTimeout (browser or Node). */
export const systemTimers: Timers = {
    set(callback, ms) {
        const handle = setTimeout(callback, ms);
        return () => clearTimeout(handle);
    },
};
