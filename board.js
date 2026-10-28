"use strict";
/* 仮想基板: GP25 LED / 7セグ2桁 (ダイナミック点灯) / ブザー / トグルスイッチ / DCモーター / ステッピングモーター
   ピン割り当ては pico_emulator.py と同じ。信号の集計はすべて仮想時間 (clock.nanos) で行う。 */

const BOARD = {
  led: 25,
  seg: [0, 1, 2, 3, 4, 5, 6, 7],      // a b c d e f g dp (左右共通)
  sel: [10, 11],                       // 桁選択 [左, 右]
  selActiveHigh: true,
  buzzer: 13,
  switches: [26, 27, 28],              // ON=3V3 / OFF=GND (切替スイッチ)
  latch: 12,                           // 立ち上がりで GP0-5 をラッチ
  motorPins: [4, 5],                   // IN1, IN2
  motorTable: { "1,0": "cw", "0,1": "ccw", "1,1": "brake", "0,0": "coast" },
  stepperCoils: [[0, 2], [1, 3]],      // [A+, A-], [B+, B-]
  stepDeg: 0.75,
};

/* ---------- 集計 (仮想時間) ---------- */
class MuxTracker {
  constructor(clock) {
    this.clock = clock;
    this.high = {};
    [...BOARD.seg, ...BOARD.sel].forEach(p => (this.high[p] = false));
    this.reset(clock.nanos);
  }
  reset(t) { this.acc = BOARD.sel.map(() => BOARD.seg.map(() => 0)); this.t = t; this.t0 = t; }
  selected(d) { const h = this.high[BOARD.sel[d]]; return BOARD.selActiveHigh ? h : !h; }
  advance(t) {
    const dt = t - this.t;
    if (dt > 0) BOARD.sel.forEach((_, d) => {
      if (this.selected(d)) BOARD.seg.forEach((p, s) => { if (this.high[p]) this.acc[d][s] += dt; });
    });
    this.t = t;
  }
  set(pin, h) { if (pin in this.high) { this.advance(this.clock.nanos); this.high[pin] = h; } }
  take(minNs) {
    const t = this.clock.nanos, w = t - this.t0;
    if (w < minNs) return null;
    this.advance(t);
    const duty = this.acc.map(r => r.map(a => Math.min(1, a / w)));
    this.reset(t);
    return duty;
  }
}

class BuzzerTracker {
  constructor(clock) { this.clock = clock; this.high = false; this.reset(clock.nanos); }
  reset(t) { this.t0 = t; this.t = t; this.accHigh = 0; this.first = null; this.last = null; this.count = 0; this.highAtLast = 0; }
  advance(t) { if (this.high && this.first !== null) this.accHigh += t - this.t; this.t = t; }
  set(h) {
    if (h === this.high) return;
    const t = this.clock.nanos;
    this.advance(t);
    if (h) { if (this.first === null) this.first = t; this.last = t; this.count++; this.highAtLast = this.accHigh; }
    this.high = h;
  }
  take(minNs, maxNs) {
    const t = this.clock.nanos, w = t - this.t0;
    if (w < minNs) return null;
    let r;
    if (this.count >= 2 && this.last > this.first) {
      const span = this.last - this.first;
      r = [(this.count - 1) * 1e9 / span, Math.min(1, this.highAtLast / span)];
    } else if (this.count === 1 && w < maxNs) return null;
    else r = [0, 0];
    this.advance(t); this.reset(t);
    return r;
  }
}

class MotorTracker {
  constructor(clock) {
    this.clock = clock; this.bus = { 4: false, 5: false }; this.latchHigh = false;
    this.bits = [0, 0]; this.mode = "coast"; this.reset(clock.nanos);
  }
  reset(t) { this.acc = { cw: 0, ccw: 0, brake: 0, coast: 0 }; this.t = t; this.t0 = t; }
  advance(t) { if (t > this.t) this.acc[this.mode] += t - this.t; this.t = t; }
  set(pin, h) {
    if (pin in this.bus) this.bus[pin] = h;
    else if (pin === BOARD.latch) {
      if (h && !this.latchHigh) {
        this.advance(this.clock.nanos);
        this.bits = BOARD.motorPins.map(p => +this.bus[p]);
        this.mode = BOARD.motorTable[this.bits.join(",")] || "coast";
      }
      this.latchHigh = h;
    }
  }
  take(minNs) {
    const t = this.clock.nanos, w = t - this.t0;
    if (w < minNs) return null;
    this.advance(t);
    const a = this.acc, f = [a.cw / w, a.ccw / w, a.brake / w, a.coast / w];
    this.reset(t);
    return f;
  }
}

class StepperTracker {
  constructor() {
    this.bus = {}; BOARD.stepperCoils.flat().forEach(p => (this.bus[p] = false));
    this.latchHigh = false; this.bits = [0, 0, 0, 0]; this.energized = false;
    this.theta = null; this.theta0 = null; this.field = 0; this.steps = 0;
  }
  set(pin, h) {
    if (pin in this.bus) this.bus[pin] = h;
    else if (pin === BOARD.latch) { if (h && !this.latchHigh) this.latch(); this.latchHigh = h; }
  }
  latch() {
    const [[ap, am], [bp, bm]] = BOARD.stepperCoils;
    this.bits = [ap, am, bp, bm].map(p => +this.bus[p]);
    const ia = this.bits[0] - this.bits[1], ib = this.bits[2] - this.bits[3];
    if (!ia && !ib) { this.energized = false; return; }
    this.energized = true;
    const target = ((Math.atan2(ib, ia) * 180 / Math.PI) % 360 + 360) % 360;
    this.field = target;
    if (this.theta === null) { this.theta = this.theta0 = target; return; }
    const delta = (((target - this.theta + 180) % 360) + 360) % 360 - 180;
    if (Math.abs(delta) < 179.99) { this.theta += delta; this.steps++; }
  }
  get angle() { return this.theta === null ? 0 : (this.theta - this.theta0) * BOARD.stepDeg / 90; }
}

/* ---------- ブザー音 (Web Audio) ---------- */
class BuzzerSound {
  constructor() { this.ctx = null; this.waves = {}; this.bucket = -1; }
  enable() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.osc = this.ctx.createOscillator();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.osc.connect(this.gain).connect(this.ctx.destination);
      this.osc.start();
    }
    this.ctx.resume();
  }
  disable() { if (this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.004); }
  wave(duty) { // デューティ比 duty のパルス波 (フーリエ級数)
    const b = Math.min(19, Math.max(1, Math.round(duty * 20)));
    if (!this.waves[b]) {
      const d = b / 20, N = 64, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) {
        re[n] = Math.sin(2 * Math.PI * n * d) / (Math.PI * n);
        im[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (Math.PI * n);
      }
      this.waves[b] = this.ctx.createPeriodicWave(re, im);
    }
    return [b, this.waves[b]];
  }
  set(freq, duty, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!on || freq <= 0 || freq > 20000) { this.gain.gain.setTargetAtTime(0, t, 0.004); return; }
    const [b, w] = this.wave(duty);
    if (b !== this.bucket) { this.osc.setPeriodicWave(w); this.bucket = b; }
    this.osc.frequency.setTargetAtTime(freq, t, 0.002);
    this.gain.gain.setTargetAtTime(0.18 * Math.min(1, 4 * duty * (1 - duty)), t, 0.004);
  }
}

/* ---------- 画面 (SVG) ---------- */
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const hseg = (x, y) => `${x - 14},${y} ${x - 11},${y - 3} ${x + 11},${y - 3} ${x + 14},${y} ${x + 11},${y + 3} ${x - 11},${y + 3}`;
const vseg = (x, y) => `${x},${y - 14} ${x + 3},${y - 11} ${x + 3},${y + 11} ${x},${y + 14} ${x - 3},${y + 11} ${x - 3},${y - 11}`;
const SEG_SHAPES = [hseg(20, 5), vseg(35, 20), vseg(35, 50), hseg(20, 65), vseg(5, 50), vseg(5, 20), hseg(20, 35)];

class BoardPanel {
  constructor(host) {
    this.sound = new BuzzerSound();
    this.soundOn = false;
    this.sw = BOARD.switches.map(() => false);
    this.motor = { omega: 0, angle: 0, f: [0, 0, 0, 1], bits: [0, 0], t: performance.now() };
    this.step = { shown: 0, sps: 0, prevAngle: 0, lastMove: 0, t: performance.now() };
    this.buzz = { freq: 0, duty: 0 };
    this.sim = null;
    this.build(host);
  }

  build(host) {
    const svg = el("svg", { viewBox: "0 0 400 300", class: "vb", role: "img", "aria-label": "仮想基板" }, host);
    this.svg = svg;
    const text = (x, y, s, cls = "vb-text", anchor = "start", p = svg) =>
      Object.assign(el("text", { x, y, class: cls, "text-anchor": anchor }, p), { textContent: s });

    /* ===== 上段: DC モーター / ステッピングモーター / スイッチ群 ===== */
    this.dcC = [58, 66];
    const [dx, dy] = this.dcC;
    el("circle", { cx: dx, cy: dy, r: 42, class: "vb-body" }, svg);
    this.dcRotor = el("g", {}, svg);
    for (let k = 0; k < 4; k++) el("line", { x1: dx, y1: dy, x2: dx, y2: dy - 36, transform: `rotate(${k * 90} ${dx} ${dy})`, class: "vb-spoke" }, this.dcRotor);
    el("circle", { cx: dx, cy: dy - 30, r: 5, class: "vb-mark" }, this.dcRotor);
    el("circle", { cx: dx, cy: dy, r: 5, class: "vb-hub" }, svg);
    text(dx, 126, "DC モーター", "vb-strong", "middle");
    this.dcText = text(dx, 141, "惰行 0%", "vb-text", "middle");
    this.dcSub = text(dx, 154, "IN1=0 IN2=0", "vb-text", "middle");
    text(dx, 167, `GP${BOARD.motorPins.join("/")} · ラッチ GP${BOARD.latch}`, "vb-text", "middle");

    this.stC = [176, 66];
    const [sx, sy] = this.stC;
    el("circle", { cx: sx, cy: sy, r: 42, class: "vb-body" }, svg);
    this.coils = [
      el("rect", { x: sx - 44, y: sy - 6, width: 8, height: 12, class: "vb-coil" }, svg),
      el("rect", { x: sx + 36, y: sy - 6, width: 8, height: 12, class: "vb-coil" }, svg),
      el("rect", { x: sx - 6, y: sy - 44, width: 12, height: 8, class: "vb-coil" }, svg),
      el("rect", { x: sx - 6, y: sy + 36, width: 12, height: 8, class: "vb-coil" }, svg),
    ];
    this.stRotor = el("g", {}, svg);
    el("line", { x1: sx, y1: sy, x2: sx, y2: sy - 32, class: "vb-spoke" }, this.stRotor);
    el("line", { x1: sx - 32, y1: sy, x2: sx + 32, y2: sy, class: "vb-spoke" }, this.stRotor);
    el("circle", { cx: sx, cy: sy - 28, r: 4, class: "vb-mark" }, this.stRotor);
    el("circle", { cx: sx, cy: sy, r: 5, class: "vb-hub" }, svg);
    text(sx, 126, "ステッピング", "vb-strong", "middle");
    this.stText = text(sx, 141, "+0.00° +0 st", "vb-text", "middle");
    this.stSub = text(sx, 154, "0 st/s FREE", "vb-text", "middle");
    text(sx, 167, `GP${BOARD.stepperCoils.flat().sort((a, b) => a - b).join(",")}`, "vb-text", "middle");

    el("rect", { x: 266, y: 10, width: 126, height: 100, rx: 8, class: "vb-group" }, svg);
    this.swEls = BOARD.switches.map((pin, i) => {
      const x = 280 + i * 38;
      const g = el("g", { class: "vb-sw", tabindex: 0, role: "switch", "aria-checked": "false", "aria-label": `GP${pin} スイッチ` }, svg);
      el("rect", { x, y: 22, width: 26, height: 56, rx: 5, class: "vb-body" }, g);
      const knob = el("rect", { x: x + 3, y: 25, width: 20, height: 24, rx: 4, class: "vb-knob" }, g);
      g.addEventListener("click", () => this.toggle(i));
      g.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); this.toggle(i); } });
      text(x + 13, 94, `GP${pin}`, "vb-text", "middle");
      return { g, knob };
    });
    this.swEls.forEach((_, i) => this.drawSwitch(i));

    /* ===== 下段: 緑の基板 (ブザー / LED / 7セグ) ===== */
    const pcb = el("g", {}, svg);
    el("rect", { x: 6, y: 182, width: 388, height: 112, rx: 8, class: "vb-pcb" }, pcb);
    [[16, 192], [384, 192], [16, 284], [384, 284]].forEach(([x, y]) => el("circle", { cx: x, cy: y, r: 3.5, class: "vb-hole" }, pcb));
    const ptext = (x, y, s, a = "middle") => text(x, y, s, "vb-ptext", a, pcb);

    // ブザー
    el("circle", { cx: 58, cy: 224, r: 17, class: "vb-pbody" }, pcb);
    el("circle", { cx: 58, cy: 224, r: 3, class: "vb-pbody" }, pcb);
    this.waves = [el("path", { d: "M80 215 q7 9 0 18", class: "vb-wave" }, pcb), el("path", { d: "M88 210 q11 14 0 28", class: "vb-wave" }, pcb)];
    ptext(58, 256, "ブザー");
    ptext(58, 270, `GP${BOARD.buzzer}`);
    this.buzzText = ptext(58, 284, "—");

    // 7セグ
    this.segs = [];
    [0, 1].forEach(d => {
      const g = el("g", { transform: `translate(${150 + d * 64},198)` }, pcb);
      el("rect", { x: -6, y: -6, width: 58, height: 82, rx: 4, class: "vb-seg-bg" }, g);
      const row = SEG_SHAPES.map(p => el("polygon", { points: p }, g));
      row.push(el("circle", { cx: 44, cy: 66, r: 3 }, g));
      this.segs.push(row);
    });
    ptext(214, 286, `セグ GP${BOARD.seg[0]}-${BOARD.seg[7]} · 桁 GP${BOARD.sel.join(" / GP")}`);

    // LED
    this.led = el("circle", { cx: 352, cy: 224, r: 9, class: "vb-led" }, pcb);
    ptext(352, 248, "LED");
    ptext(352, 262, `GP${BOARD.led}`);
  }

  drawSwitch(i) {
    const s = this.swEls[i], on = this.sw[i];
    s.knob.setAttribute("y", on ? 25 : 49);
    s.knob.classList.toggle("on", on);
    s.g.setAttribute("aria-checked", String(on));
  }
  toggle(i) { this.sw[i] = !this.sw[i]; this.drawSwitch(i); this.applySwitch(i); }
  applySwitch(i) { if (this.sim) this.sim.rp2040.gpio[BOARD.switches[i]].setInputValue(this.sw[i]); }

  setSound(on) {
    this.soundOn = on;
    if (on) this.sound.enable(); else this.sound.disable();
    this.sound.set(this.buzz.freq, this.buzz.duty, on);
  }

  /* エミュレータへ接続 (起動のたびに呼ぶ) */
  bind(sim) {
    this.sim = sim;
    const clock = sim.clock, gpio = sim.rp2040.gpio;
    this.mux = new MuxTracker(clock);
    this.bz = new BuzzerTracker(clock);
    this.dc = new MotorTracker(clock);
    this.stp = new StepperTracker();
    this.step.prevAngle = 0; this.step.shown = 0;
    this.led.classList.remove("on");
    this.motor.f = [0, 0, 0, 1];
    const pins = new Set([BOARD.led, ...BOARD.seg, ...BOARD.sel, BOARD.buzzer, BOARD.latch]);
    pins.forEach(p => gpio[p].addListener(state => {
      const h = state === 1; // GPIOPinState.High
      this.mux.set(p, h); this.dc.set(p, h); this.stp.set(p, h);
      if (p === BOARD.buzzer) this.bz.set(h);
      if (p === BOARD.led) this.led.classList.toggle("on", h);
    }));
    this.sw.forEach((_, i) => this.applySwitch(i));
  }

  /* 毎フレーム呼ぶ */
  frame(now) {
    if (!this.sim) return;
    const MIN = 25e6;

    const duty = this.mux.take(MIN);
    if (duty) duty.forEach((row, d) => row.forEach((v, s) => {
      const c = this.segs[d][s];
      c.style.fill = `rgb(${Math.round(70 + 185 * v)},${Math.round(14 + 40 * v)},${Math.round(14 + 40 * v)})`;
      c.style.filter = v > 0.5 ? "drop-shadow(0 0 3px #ff3030)" : "none";
    }));

    const bz = this.bz.take(MIN, 250e6);
    if (bz) {
      this.buzz = { freq: bz[0], duty: bz[1] };
      this.sound.set(bz[0], bz[1], this.soundOn);
      this.waves.forEach(w => w.classList.toggle("on", bz[0] > 0));
      this.buzzText.textContent = bz[0] > 0 ? `${bz[0].toFixed(0)} Hz · ${(bz[1] * 100).toFixed(0)}%` : "—";
    }

    const f = this.dc.take(MIN);
    const m = this.motor, dt = Math.min((now - m.t) / 1000, 0.2);
    m.t = now;
    if (f) { m.f = f; m.bits = this.dc.bits; }
    const [cw, ccw, brake, coast] = m.f, active = cw + ccw, MAX = 3; // 最高 3 回転/秒
    if (active > 0) m.omega += (MAX * (cw - ccw) / active - m.omega) * (1 - Math.exp(-active / 0.35 * dt));
    m.omega *= Math.exp(-(8 * brake + 0.6 * coast) * dt);
    if (Math.abs(m.omega) < 1e-3) m.omega = 0;
    m.angle = (m.angle + m.omega * 360 * dt) % 360;
    this.dcRotor.setAttribute("transform", `rotate(${m.angle} ${this.dcC[0]} ${this.dcC[1]})`);
    const label = ["正転", "逆転", "ブレーキ", "惰行"][m.f.indexOf(Math.max(...m.f))];
    this.dcText.textContent = `${label} ${(Math.abs(m.omega) / MAX * 100).toFixed(0)}%`;
    this.dcSub.textContent = `IN1=${m.bits[0]} IN2=${m.bits[1]} (ラッチ済み)`;

    const st = this.step, target = this.stp.angle;
    st.shown += (target - st.shown) * (1 - Math.exp(-dt / 0.06));
    this.stRotor.setAttribute("transform", `rotate(${st.shown} ${this.stC[0]} ${this.stC[1]})`);
    const sdt = Math.max((now - st.t) / 1000, 1e-3); st.t = now;
    if (target !== st.prevAngle) st.lastMove = now;
    const raw = (target - st.prevAngle) / BOARD.stepDeg / sdt; st.prevAngle = target;
    st.sps = now - st.lastMove > 300 ? 0 : st.sps + (raw - st.sps) * (1 - Math.exp(-sdt / 0.15));
    const state = now - st.lastMove <= 300 ? "STEP" : this.stp.energized ? "HOLD" : "FREE";
    const [ap, am, bp, bm] = this.stp.bits;
    [ap, am, bp, bm].forEach((b, i) => this.coils[i].classList.toggle("on", !!b));
    this.stText.textContent = `${target >= 0 ? "+" : ""}${target.toFixed(2)}° ${Math.round(target / BOARD.stepDeg)} st`;
    this.stSub.textContent = `${Math.abs(st.sps).toFixed(0)} st/s ${state}`;
  }
}
