#!/usr/bin/env bash
# Runs the terminal version of tommie-reversi.
# Works from any directory; game records are written to ./logs of the current directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSX="$ROOT/node_modules/.bin/tsx"
MAIN="$ROOT/src/cli/main.ts"

usage() {
    "$TSX" "$MAIN" --help
    cat <<USAGE

Records and RUP logs go to ./logs of the current directory (change with --log-dir).

Examples:
  ./cli.sh                                        person against person
  ./cli.sh --list-ports                           list serial ports
  ./cli.sh --port /dev/ttyACM0                    you against the CPU (the CPU plays black)
  ./cli.sh --port /dev/ttyACM0 --fpga white       the CPU plays white
  ./cli.sh --port /dev/ttyACM0 --opponent random --games 10 --fpga alternate
USAGE
}

if ! command -v node >/dev/null 2>&1; then
    echo "error: node is not installed (Node.js 22 or later is needed)" >&2
    exit 1
fi
if [[ ! -x "$TSX" ]]; then
    echo "error: dependencies are missing; run: (cd \"$ROOT\" && npm install)" >&2
    exit 1
fi

for arg in "$@"; do
    if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
        usage
        exit 0
    fi
done

exec "$TSX" "$MAIN" "$@"
