# tommie-reversi

[English](README.md) | [日本語](README.ja.md)

自作 CPU (FPGA など) と UART でつないで対局するリバーシのアプリです。
通信には [Reversi UART Protocol (RUP)](https://github.com/tommie-jp/reversi-uart-protocol) を使います。

> 状態: 開発中。ターミナル版 (CLI) は動きます。ブラウザ版はまだありません。

## 目標

- 自作 CPU とシリアルポートで直接つなぐ (ブラウザでは Web Serial、Node では `serialport`)。
- ネットワークにつながなくても動く。
- ブラウザ (Babylon.js の表示) とターミナル (テキストの表示) の両方で動く。
- 棋譜を保存し、再生できる。

## ターミナル版 (CLI)

Node.js 22 の入った PC で動かすデバッグ用の道具です。最初に 1 度 `npm install` してから `./cli.sh` で動かします
(どのディレクトリからでも動きます。`npm run cli -- [オプション]` でも同じです)。

```bash
./cli.sh                                          # 人 対 人
./cli.sh --list-ports                             # シリアルのポートを出す
./cli.sh --port /dev/ttyACM0                      # 人 対 CPU (CPU が黒)
./cli.sh --port /dev/ttyACM0 --fpga white         # CPU が白
./cli.sh --port /dev/ttyACM0 --opponent random --games 10 --fpga alternate
                                                  # CPU と でたらめに打つ相手 を 10 局
./cli.sh -h                                       # オプションの一覧
```

- `f5` のようにマスを打って着手します。打てる所がないときは `pass` (または Enter) でパスします。
  `board`、`help`、`new`、`quit` はいつでも使えます。
- CPU の手は確かめます。ルール違反、エラー応答 (`-NN`)、接続が切れたときは対局を止めます。
- 1 局ごとに棋譜 (`logs/<日付>-<時刻>-<番号>.txt`。`f5d6c3...` の形で、パスは書かない) と、
  CPU とつないだときは RUP のログ (`.rup.log`。`[HH:MM:SS.mmm] TX/RX 行` の形で、RUP の道具の再生形式) を書きます。
- 終了コード: 0 は終わった、1 はオプションの誤り、2 はつながらない、3 は対局が止まった、130 は Ctrl+C。

## 構成

```text
src/
  core/        純粋な TypeScript。盤面、ルール、1 局の進行、棋譜、時計、プレイヤー、対局の取り持ち、
               RUP のエンコード/デコード、RUP のプレイヤー。DOM・Node・Babylon を import しない (tsconfig.core.json で確かめる)。
  transport/   行を運ぶ口。node-serial、テスト用のループバックと偽の RUP CPU (web-serial は予定)
  view/        terminal/ (テキスト)。babylon/ (ブラウザ) は予定
  cli/         ターミナル版
  ui/          キャンバスに重ねる HTML/CSS の操作部品                — 予定
test/          Vitest のテスト
```

## 開発

```bash
npm install
npm run check     # 型チェック (ブラウザのコード、Node のコードとテスト、最後に core だけ)
npm test          # テスト (シリアルのテストは socat が要る。なければ飛ばす)
npm run coverage  # 網羅率つきのテスト (80% 以上)
npm run dev     # Vite の開発サーバー
```

## ライセンス

[MIT](LICENSE)
