"use strict";

const { Simulator, USBCDC, bootromB1 } = window.RP2040JS;
const $ = id => document.getElementById(id);
const term = new Terminal($("term"));
const FLASH_BASE = 0x10000000;
const panel = new BoardPanel($("board"));
let loopToken = 0;

/* ---------- UF2 パーサ → フラッシュへ書き込み ---------- */
function loadUF2(bytes, flash) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let blocks = 0;
  for (let o = 0; o + 512 <= bytes.length; o += 512) {
    if (dv.getUint32(o, true) !== 0x0a324655 || dv.getUint32(o + 4, true) !== 0x9e5d5157) continue;
    const addr = dv.getUint32(o + 12, true);
    const size = dv.getUint32(o + 16, true);
    if (addr < FLASH_BASE || addr - FLASH_BASE + size > flash.length) continue;
    flash.set(bytes.subarray(o + 32, o + 32 + size), addr - FLASH_BASE);
    blocks++;
  }
  if (!blocks) throw new Error("有効な RP2040 用 UF2 ではありません");
  return blocks;
}

/* ---------- ファームウェアの保存 (IndexedDB) ---------- */
const store = {
  open: () => new Promise((res, rej) => {
    const r = indexedDB.open("rp2040-repl", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("fw");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }),
  async get() {
    try {
      const db = await this.open();
      return await new Promise(res => {
        const q = db.transaction("fw").objectStore("fw").get("uf2");
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    } catch (_) { return null; }
  },
  async set(bytes) {
    try {
      const db = await this.open();
      db.transaction("fw", "readwrite").objectStore("fw").put(bytes, "uf2");
    } catch (_) {}
  },
};

/* ---------- エミュレータ ---------- */
let sim = null, cdc = null, firmware = null;
let txQueue = [];

function setRunning(on) {
  $("status").textContent = on ? "実行中" : "停止中";
  $("status").dataset.state = on ? "on" : "off";
  ["btn-interrupt", "btn-reset", "btn-hard", "btn-run"].forEach(id => ($(id).disabled = !on));
}

function boot() {
  if (sim) sim.stop();
  loopToken++;
  txQueue = [];
  term.reset();

  sim = new Simulator();
  const mcu = sim.rp2040;
  mcu.loadBootrom(bootromB1);
  loadUF2(firmware, mcu.flash);

  panel.bind(sim);

  cdc = new USBCDC(mcu.usbCtrl);
  cdc.onDeviceConnected = () => { send("\r\n"); };
  cdc.onSerialData = bytes => term.write(new TextDecoder().decode(bytes));

  mcu.core.PC = FLASH_BASE;
  startLoop(sim);
  setRunning(true);
  $("drop").hidden = true;
  $("term").focus();
}

/* 仮想時間を実時間に合わせて実行する。アイドル(WFI)中の時間ジャンプは最大 0.5ms に抑え、
   仮想時間が実時間より先に進んだら待つ。実機より遅いときは追いつこうとせず基準を取り直す。 */
function startLoop(sim) {
  const token = loopToken, clock = sim.clock, core = sim.rp2040.core;
  let wall0 = performance.now(), sim0 = clock.nanos;
  const ahead = () => (clock.nanos - sim0) / 1e6 - (performance.now() - wall0);
  const step = () => {
    if (token !== loopToken) return;
    for (let i = 0; i < 20000; i++) {
      if (core.waiting) {
        clock.tick(Math.min(clock.nanosToNextAlarm, 500000));
        i += 100;
        if (ahead() > 2) break;
      } else clock.tick(core.executeInstruction() * 8); // 125MHz = 8ns/サイクル
    }
    const a = ahead();
    if (a < -100) { wall0 = performance.now(); sim0 = clock.nanos; }
    setTimeout(step, a > 1 ? a : 0);
  };
  step();
}

/* 仮想基板の描画 */
(function raf(now) { panel.frame(now); requestAnimationFrame(raf); })(performance.now());

$("btn-sound").onclick = () => {
  const on = !panel.soundOn;
  panel.setSound(on);
  $("btn-sound").textContent = "ブザー音: " + (on ? "ON" : "OFF");
};

/* USB CDC の送信 FIFO は 512 バイトで溢れると捨てられるので、キューに積んで少しずつ流す */
function send(text) { txQueue.push(...new TextEncoder().encode(text)); }
setInterval(() => {
  if (!cdc) return;
  while (txQueue.length && cdc.txFIFO.itemCount < 256) cdc.sendSerialByte(txQueue.shift());
}, 10);

async function useFirmware(bytes, remember) {
  try {
    loadUF2(bytes.slice(), new Uint8Array(2 * 1024 * 1024)); // 検証のみ
  } catch (e) {
    $("drop").hidden = false;
    term.write("[" + e.message + "]\r\n");
    return;
  }
  firmware = bytes;
  if (remember) store.set(bytes);
  boot();
}
async function useFile(file) {
  if (file) useFirmware(new Uint8Array(await file.arrayBuffer()), true);
}

$("btn-fw").onclick = () => $("file").click();
$("file").onchange = e => useFile(e.target.files[0]);
["dragover", "dragleave", "drop"].forEach(ev =>
  window.addEventListener(ev, e => {
    e.preventDefault();
    $("drop").classList.toggle("over", ev === "dragover");
    if (ev === "drop") useFile(e.dataTransfer.files[0]);
  })
);

$("btn-interrupt").onclick = () => { send("\x03"); $("term").focus(); };
$("btn-reset").onclick = () => { send("\x04"); $("term").focus(); };
$("btn-hard").onclick = () => firmware && boot();
$("btn-clear").onclick = () => { term.reset(); $("term").focus(); };

/* ---------- キー入力 ---------- */
const KEYMAP = {
  Enter: "\r", Backspace: "\x7f", Tab: "\t", Escape: "\x1b",
  ArrowUp: "\x1b[A", ArrowDown: "\x1b[B", ArrowRight: "\x1b[C", ArrowLeft: "\x1b[D",
  Home: "\x1b[H", End: "\x1b[F", Delete: "\x1b[3~",
};
$("term").addEventListener("keydown", e => {
  if (!cdc) return;
  let seq = null;
  if (e.ctrlKey && !e.altKey && e.key.length === 1 && /[a-z]/i.test(e.key)) {
    if (e.key.toLowerCase() === "c" && getSelection().toString()) return;
    if (e.key.toLowerCase() === "v") return;
    seq = String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64);
  } else if (KEYMAP[e.key]) seq = KEYMAP[e.key];
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) seq = e.key;
  if (seq === null) return;
  e.preventDefault();
  send(seq);
});
$("term").addEventListener("paste", e => {
  e.preventDefault();
  const text = e.clipboardData.getData("text");
  if (!cdc || !text) return;
  text.includes("\n") ? runCode(text) : send(text);
});
$("term").addEventListener("focus", () => term.render());
$("term").addEventListener("blur", () => term.render());

/* ---------- エディタ (ペーストモードで実行) ---------- */
function runCode(code) { send("\x05" + code.replace(/\r?\n/g, "\r\n") + "\x04"); }

const SNIPPETS = {
  "オンボードLEDを点滅": `from machine import Pin
import time

led = Pin(25, Pin.OUT)
for _ in range(10):
    led.toggle()
    time.sleep(0.3)
`,
  "システム情報": `import sys, gc, machine
print(sys.implementation)
print("freq:", machine.freq() // 1_000_000, "MHz")
print("free mem:", gc.mem_free(), "bytes")
`,
  "7セグに 1 2 を表示": `from machine import Pin
import time

SEG = [Pin(i, Pin.OUT) for i in range(8)]   # a b c d e f g dp
SEL = [Pin(10, Pin.OUT), Pin(11, Pin.OUT)]
FONT = {1: 0b00000110, 2: 0b01011011}       # bit0=a ... bit6=g

def show(digit, value):
    SEL[0].value(0); SEL[1].value(0)
    for i, p in enumerate(SEG):
        p.value((FONT[value] >> i) & 1)
    SEL[digit].value(1)

for _ in range(300):
    show(0, 1); time.sleep_ms(3)
    show(1, 2); time.sleep_ms(3)
SEL[0].value(0); SEL[1].value(0)
`,
  "ブザーでドレミ (GP13)": `from machine import Pin, PWM
import time

bz = PWM(Pin(13))
for f in (262, 294, 330, 349, 392):
    bz.freq(f)
    bz.duty_u16(32768)
    time.sleep_ms(300)
bz.duty_u16(0)
`,
  "スイッチを読む (GP26-28)": `from machine import Pin
sw = [Pin(p, Pin.IN) for p in (26, 27, 28)]
print([s.value() for s in sw])
`,
  "DC モーター正転 (GP4/5 + ラッチ GP12)": `from machine import Pin
import time

bus = [Pin(i, Pin.OUT) for i in range(8)]
latch = Pin(12, Pin.OUT)

def drive(in1, in2):
    bus[4].value(in1); bus[5].value(in2)
    latch.value(0); latch.value(1)    # 立ち上がりでラッチ

drive(1, 0); time.sleep(3)   # 正転
drive(1, 1); time.sleep(1)   # ブレーキ
drive(0, 0)                  # 惰行
`,
  "ステッピングモーター (GP0-3 + ラッチ GP12)": `from machine import Pin
import time

bus = [Pin(i, Pin.OUT) for i in range(4)]
latch = Pin(12, Pin.OUT)
SEQ = [(1,1,0,0), (0,1,1,0), (0,0,1,1), (1,0,0,1)]  # GP0..GP3 (A+ B+ / A- B+ / A- B- / A+ B-)

for n in range(96):          # 96 ステップ = 72°
    for p, v in zip(bus, SEQ[n % 4]):
        p.value(v)
    latch.value(0); latch.value(1)
    time.sleep_ms(20)
`,
  "ファイル一覧": `import os
print(os.listdir())
`,
};
const sel = $("snippet");
Object.keys(SNIPPETS).forEach(k => sel.add(new Option(k, k)));
sel.onchange = () => { $("editor").value = SNIPPETS[sel.value]; };
$("editor").value = SNIPPETS[sel.value];
$("btn-run").onclick = () => { runCode($("editor").value); $("term").focus(); };
$("editor").addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (cdc) $("btn-run").click(); }
  if (e.key === "Tab") {
    e.preventDefault();
    const t = e.target, s = t.selectionStart;
    t.value = t.value.slice(0, s) + "    " + t.value.slice(t.selectionEnd);
    t.selectionStart = t.selectionEnd = s + 4;
  }
});

/* ---------- 起動時: 保存済み → ./firmware.uf2 の順に探す ---------- */
(async () => {
  const saved = await store.get();
  if (saved) return useFirmware(saved, false);
  try {
    const r = await fetch("firmware.uf2");
    if (r.ok) return useFirmware(new Uint8Array(await r.arrayBuffer()), true);
  } catch (_) {}
})();
