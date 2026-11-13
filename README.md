# tommie-reversi

[English](README.md) | [日本語](README.ja.md)

A Reversi app for playing against a homebrew CPU (for example on an FPGA) over UART,
using the [Reversi UART Protocol (RUP)](https://github.com/tommie-jp/reversi-uart-protocol).

> Status: early development. Nothing is usable yet.

## Goals

- Connect a homebrew CPU directly over a serial port (Web Serial in the browser, `serialport` in Node).
- Work without a network connection.
- Run in the browser (Babylon.js view) and in a terminal (text view).
- Keep a game record and replay it.

## Layout

```text
src/
  core/        Pure TypeScript: rules, board state, game record, RUP codec, engine interface.
               No DOM, Node or Babylon imports (checked by tsconfig.core.json).
  transport/   Serial transports (web-serial, node-serial)            — planned
  view/        babylon/ (browser) and terminal/ (ANSI text)           — planned
  ui/          HTML/CSS controls laid over the canvas                 — planned
test/          Vitest tests
```

## Development

```bash
npm install
npm run check   # type-check (whole project, then core alone)
npm test        # run tests
npm run dev     # start the Vite dev server
```

## License

[MIT](LICENSE)
