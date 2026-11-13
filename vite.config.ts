import { defineConfig } from "vite";

export default defineConfig({
    base: "/",
    build: {
        outDir: "dist",
        target: "es2022",
    },
    server: {
        // Reachable from other devices on the LAN while developing.
        host: true,
    },
});
