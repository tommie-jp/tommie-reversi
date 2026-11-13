import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** The commit the app was built from, so an old cached version can be told apart. */
function commit(): string {
    try {
        const hash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
        const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() !== "";
        return dirty ? `${hash}+` : hash;
    } catch {
        return "unknown";
    }
}

export default defineConfig({
    base: "/",
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_COMMIT__: JSON.stringify(commit()),
    },
    build: {
        outDir: "dist",
        target: "es2022",
    },
    server: {
        // Reachable from other devices on the LAN while developing.
        host: true,
    },
});
