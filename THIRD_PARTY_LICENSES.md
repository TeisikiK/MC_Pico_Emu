# サードパーティのライセンス

このプロジェクトには、次のソフトウェアが含まれる、または一緒に配布されます。
ライセンス条件(著作権表示と許諾文の保持)に従い、全文を以下に記載します。

1. rp2040js — `rp2040js.bundle.js` に含まれる
2. Raspberry Pi RP2040 ブートROM (B1) — `rp2040js.bundle.js` に含まれる
3. MicroPython — `firmware.uf2` に含まれる

---

## 1. rp2040js

- 配布元: https://github.com/wokwi/rp2040js
- バージョン: 1.4.1

```
The MIT License (MIT)

Copyright (c) 2021 Uri Shaked

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 2. Raspberry Pi RP2040 ブートROM (B1)

- 配布元: https://github.com/raspberrypi/pico-bootrom
- rp2040js のデモ (`demo/bootrom.ts`) に収録されているバイナリを、`rp2040js.bundle.js` に埋め込んでいます。
- 以下は上記リポジトリの `LICENSE.TXT` の全文です。

```
NOTE: this license applies to the contents of this repository, EXCLUDING the contents of the files bootrom/mufplib.S
and bootrom/mufplib-double.S, which are licensed separately:

Copyright 2020 (c) 2020 Raspberry Pi (Trading) Ltd.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
   disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
   disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 3. MicroPython

- 配布元: https://github.com/micropython/micropython
- 本プロジェクトの `firmware.uf2` は MicroPython の `RPI_PICO` 向け公式ビルドです (版数は README を参照)。
- MicroPython 本体は MIT ライセンスです。

```
The MIT License (MIT)

Copyright (c) 2013-2026 Damien P. George and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

UF2 には、MicroPython のほかに Raspberry Pi Pico SDK (BSD-3-Clause)、TinyUSB (MIT)、
その他のコンポーネントが含まれます。それぞれの著作権表示とライセンスは、
MicroPython リポジトリの次のファイルに記載されています。

- https://github.com/micropython/micropython/blob/master/LICENSE
- https://github.com/micropython/micropython/tree/master/ports/rp2

※ 上記 URL は 2026年10月時点のものです。配布元の構成が変わっている場合があります。
