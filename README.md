# RP2040 エミュレータ REPL

ブラウザだけで動く Raspberry Pi Pico (RP2040) のエミュレータです。
[rp2040js](https://github.com/wokwi/rp2040js) で MicroPython を動かし、REPL とコードエディタ、仮想基板を付けています。
インストール不要で、実機がなくても Pico のプログラムを試せます。

**公開ページ:** `https://<ユーザー名>.github.io/<リポジトリ名>/` (公開後に書き換えてください)

## できること

- MicroPython の REPL (履歴 ↑↓、Tab 補完、Ctrl+C / Ctrl+D が使えます)
- 右のエディタに複数行のコードを書いて実行 (Ctrl+Enter)
- 仮想基板
  - 上段: DC モーター / ステッピングモーター / トグルスイッチ 3 個
  - 下段 (緑の基板): ブザー / 7 セグ LED 2 桁 / オンボード LED
- ブザー音を Web Audio で再生 (ヘッダーの「ブザー音」ボタンで ON)

## 使い方

1. 公開ページを Chrome / Edge / Firefox / Safari で開きます。
2. `firmware.uf2` が自動で読み込まれ、`>>>` が表示されます。
3. ターミナルをクリックして入力するか、右のエディタのスニペットを実行します。

別のファームウェアを使いたいときは、UF2 を画面にドロップするか「ファームウェア選択」から読み込んでください。
読み込んだ UF2 はブラウザに保存されます。

## 仮想基板の配線

| 部品 | GPIO | 備考 |
|---|---|---|
| 7 セグのセグメント a〜g, dp | GP0〜GP7 | 左右の桁で共通 |
| 7 セグの桁選択 (左 / 右) | GP10 / GP11 | HIGH で表示 |
| ラッチ | GP12 | 立ち上がりで GP0〜GP5 を取り込む |
| DC モーター IN1 / IN2 | GP4 / GP5 | ラッチした値で動作を決定 (正転 1,0 / 逆転 0,1 / ブレーキ 1,1 / 惰行 0,0) |
| ステッピングモーター | GP0〜GP3 | コイル A = (GP0, GP2)、コイル B = (GP1, GP3)、1 ステップ 0.75° |
| ブザー | GP13 | PWM でも手動のオンオフでも可 |
| トグルスイッチ | GP26 / GP27 / GP28 | ON = 3V3、OFF = GND |
| オンボード LED | GP25 | |

ステッピングモーターの励磁順 (GP0, GP1, GP2, GP3 の順):
`(1,1,0,0) → (0,1,1,0) → (0,0,1,1) → (1,0,0,1)` で正転します。

## 制限

- 実機の完全な再現ではありません。ステッピングモーターの脱調などは再現していません。
- ブザー音はブラウザの仕様上、ボタンを押すまで鳴りません。
- エミュレータはメインスレッドで動くため、重い処理中は画面が重くなることがあります。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `index.html` | 画面 |
| `style.css` | 見た目 |
| `terminal.js` | 簡易ターミナル |
| `app.js` | エミュレータの制御、キー入力、エディタ |
| `board.js` | 仮想基板 |
| `rp2040js.bundle.js` | rp2040js とブートROMを 1 ファイルにまとめたもの |
| `firmware.uf2` | MicroPython (RPI_PICO) |

`firmware.uf2` のバージョン: **MicroPython v1.29.0.uf2 (RPI_PICO)** ← 配置したファイルに合わせて書き換えてください

## `rp2040js.bundle.js` の作り方

```sh
npm init -y
npm i rp2040js esbuild
# ブートROM: https://github.com/wokwi/rp2040js の demo/bootrom.ts を bootrom.js として保存
cat > entry.js <<'JS'
import { Simulator, USBCDC, GPIOPinState } from 'rp2040js';
import { bootromB1 } from './bootrom.js';
window.RP2040JS = { Simulator, USBCDC, GPIOPinState, bootromB1 };
JS
npx esbuild entry.js --bundle --format=iife --minify --outfile=rp2040js.bundle.js
```

## ローカルで動かす

`file://` で開くと `firmware.uf2` の自動読み込みができません。フォルダ内で次を実行してください。

```sh
python -m http.server 8000
# http://localhost:8000 を開く
```

## ライセンス

- このプロジェクトのコード (`index.html`, `style.css`, `terminal.js`, `app.js`, `board.js`): MIT License ([LICENSE](LICENSE))
- rp2040js、RP2040 ブートROM、MicroPython: それぞれのライセンスに従います。全文は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) にあります。

## 謝辞

- [rp2040js](https://github.com/wokwi/rp2040js) (Uri Shaked / Wokwi)
- [MicroPython](https://micropython.org/)
