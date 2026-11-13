# tommie-reversi

[English](README.md) | [日本語](README.ja.md)

自作 CPU (FPGA など) と UART でつないで対局するリバーシのアプリです。
通信には [Reversi UART Protocol (RUP)](https://github.com/tommie-jp/reversi-uart-protocol) を使います。

> 状態: 開発を始めたところで、まだ使えません。

## 目標

- 自作 CPU とシリアルポートで直接つなぐ (ブラウザでは Web Serial、Node では `serialport`)。
- ネットワークにつながなくても動く。
- ブラウザ (Babylon.js の表示) とターミナル (テキストの表示) の両方で動く。
- 棋譜を保存し、再生できる。

## 構成

```text
src/
  core/        純粋な TypeScript。ルール、盤面、棋譜、RUP のエンコード/デコード、思考エンジンのインターフェース。
               DOM・Node・Babylon を import しない (tsconfig.core.json で確かめる)。
  transport/   シリアル接続 (web-serial、node-serial)                — 予定
  view/        babylon/ (ブラウザ) と terminal/ (ANSI のテキスト)    — 予定
  ui/          キャンバスに重ねる HTML/CSS の操作部品                — 予定
test/          Vitest のテスト
```

## 開発

```bash
npm install
npm run check   # 型チェック (全体のあと、core だけ)
npm test        # テスト
npm run dev     # Vite の開発サーバー
```

## ライセンス

[MIT](LICENSE)
