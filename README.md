# tommie-reversi

[English](README.md) | [日本語](README.ja.md)

A Reversi app for playing against a homebrew CPU (for example on an FPGA) over UART,
using the [Reversi UART Protocol (RUP)](https://github.com/tommie-jp/reversi-uart-protocol).

> Status: early development. The terminal version (CLI) works; the browser version is not written yet.

## Goals

- Connect a homebrew CPU directly over a serial port (Web Serial in the browser, `serialport` in Node).
- Work without a network connection.
- Run in the browser (Babylon.js view) and in a terminal (text view).
- Keep a game record and replay it.

## Terminal version (CLI)

A debugging tool that runs on a PC with Node.js 22. Run `npm install` once, then use `./cli.sh`
(it works from any directory; `npm run cli -- [options]` does the same).

```bash
./cli.sh                                          # person against person
./cli.sh --list-ports                             # list serial ports
./cli.sh --port /dev/ttyACM0                      # you against the CPU (the CPU plays black)
./cli.sh --port /dev/ttyACM0 --fpga white         # the CPU plays white
./cli.sh --port /dev/ttyACM0 --opponent random --games 10 --fpga alternate
                                                  # the CPU against random moves, 10 games
./cli.sh -h                                       # all options
```

- Type a square such as `f5` to play. `pass` (or Enter) passes when you have no legal move.
  `board`, `help`, `new` and `quit` work at any time.
- The CPU's moves are checked. A rule violation, an error reply (`-NN`) or a lost connection stops the game.
- It works with RUP v0.2 CPUs and follows the v0.3 draft on the host side: a stopped game ends with `EA`
  (END ABORT; `ED` for a CPU whose `+CA` reply does not list `EA`) so the CPU goes back to idle, an illegal move is answered with `-05`, and after each game a `PI` / `+PI`
  exchange marks the point before which late moves are dropped.
- Each game writes a record (`logs/<date>-<time>-<n>.txt`, `f5d6c3...` with no passes) and,
  with a CPU, a RUP log (`.rup.log`, `[HH:MM:SS.mmm] TX/RX line`, the replay format of the RUP tools).
- Exit codes: 0 done, 1 bad options, 2 cannot connect, 3 a game was stopped, 130 Ctrl+C.

## Layout

```text
src/
  core/        Pure TypeScript: board, rules, game, record, clock, players, match,
               RUP codec and RUP player. No DOM, Node or Babylon imports (checked by tsconfig.core.json).
  transport/   Line transports: node-serial, loopback and a fake RUP CPU for tests (web-serial planned)
  view/        terminal/ (text); babylon/ (browser) planned
  cli/         The terminal version
  ui/          HTML/CSS controls laid over the canvas                 — planned
test/          Vitest tests
```

## Development

```bash
npm install
npm run check     # type-check (browser code, Node code and tests, then core alone)
npm test          # run tests (the serial tests need socat, and are skipped without it)
npm run coverage  # tests with coverage (80% minimum)
npm run dev     # start the Vite dev server
```

## License

[MIT](LICENSE)
