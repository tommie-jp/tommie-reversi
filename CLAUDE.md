# CLAUDE.md

Public repository [tommie-jp/tommie-reversi](https://github.com/tommie-jp/tommie-reversi):
a Reversi app that plays against a homebrew CPU over UART using
[RUP](https://github.com/tommie-jp/reversi-uart-protocol).

## Rules

- **This repository is public.** Do not write private project names, personal plans or
  unpublished context here. Write so that the text makes sense without outside context.
- **`src/core/` stays pure TypeScript.** No DOM, Node or Babylon imports.
  `npm run check` type-checks core alone with `tsconfig.core.json` (no DOM lib, no `@types/node`).
  Core gets time and randomness from outside (`Timers`, a seeded random function).
- **Browser and Node code are checked apart.** `tsconfig.json` is browser code (DOM, no Node);
  `tsconfig.node.json` is the CLI, the Node serial transport and the tests (Node, no DOM).
- **Core never mutates.** Every change returns a new board or game state.
- **Say "Reversi", not "Othello"** (Othello is a registered trademark).
- **TDD**: write the failing test first (`test/**/*.test.ts`), then the code.
- Keep `README.md` and `README.ja.md` in sync.
- Commits use conventional commits (`feat:` / `fix:` / `docs:` / `test:` / `chore:` ...).
  Fast-forward merges only.

## Commands

```bash
npm run check    # type-check (browser, Node, core)
npm test         # vitest (serial tests need socat)
npm run coverage # vitest with coverage (80% minimum)
npm run cli      # the terminal version
npm run lint:md  # markdownlint
```

## Note on npm

`npm install <new package>` with npm 10.9 can fail with
`Cannot read properties of null (reading 'edgesOut')` when vitest is involved.
Use `npx --yes npm@11 install -D <package>` to add packages. Plain `npm install`
from the lockfile works with npm 10.
