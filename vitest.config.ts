import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        passWithNoTests: true,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            // Thin wrappers around the terminal and the serial port are checked by hand.
            exclude: ["src/cli/main.ts", "src/cli/human.ts", "src/transport/node-serial.ts", "src/view/html/main.ts", "src/vite-env.d.ts"],
            thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
        },
    },
});
