// Keeps the screen on during a game. The browser drops the lock when the page is hidden,
// so it is taken again when the page comes back. Browsers without the API are left alone.

export class ScreenLock {
    private wanted = false;
    private sentinel: WakeLockSentinel | null = null;

    constructor() {
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") void this.apply();
        });
    }

    set(wanted: boolean): void {
        if (wanted === this.wanted) return;
        this.wanted = wanted;
        void this.apply();
    }

    private async apply(): Promise<void> {
        try {
            if (this.wanted && this.sentinel === null && "wakeLock" in navigator) {
                this.sentinel = await navigator.wakeLock.request("screen");
                this.sentinel.addEventListener("release", () => (this.sentinel = null));
            } else if (!this.wanted && this.sentinel !== null) {
                await this.sentinel.release();
                this.sentinel = null;
            }
        } catch {
            this.sentinel = null;
        }
    }
}
