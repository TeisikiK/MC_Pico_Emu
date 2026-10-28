/* ---------- 簡易ターミナルエミュレータ ---------- */
class Terminal {
  constructor(el) {
    this.el = el;
    this.maxLines = 2000;
    this.reset();
    this._pending = false;
  }
  reset() {
    this.lines = [[]];
    this.row = 0;
    this.col = 0;
    this.state = "text"; // text | esc | csi
    this.csi = "";
    this.render();
  }
  write(text) {
    for (const ch of text) this._put(ch);
    this._schedule();
  }
  _put(ch) {
    const c = ch.charCodeAt(0);
    if (this.state === "esc") {
      if (ch === "[") { this.state = "csi"; this.csi = ""; }
      else this.state = "text";
      return;
    }
    if (this.state === "csi") {
      if (c >= 0x40 && c <= 0x7e) { this._csi(ch, this.csi); this.state = "text"; }
      else this.csi += ch;
      return;
    }
    switch (ch) {
      case "\x1b": this.state = "esc"; return;
      case "\r": this.col = 0; return;
      case "\n": this._newline(); return;
      case "\b": if (this.col > 0) this.col--; return;
      case "\x07": return;
      case "\t": {
        const n = 8 - (this.col % 8);
        for (let i = 0; i < n; i++) this._char(" ");
        return;
      }
    }
    if (c < 0x20) return;
    this._char(ch);
  }
  _char(ch) {
    const line = this.lines[this.row];
    while (line.length < this.col) line.push(" ");
    line[this.col++] = ch;
  }
  _newline() {
    this.row++;
    if (this.row >= this.lines.length) this.lines.push([]);
    if (this.lines.length > this.maxLines) { this.lines.shift(); this.row--; }
  }
  _csi(cmd, params) {
    const n = parseInt(params, 10);
    const line = this.lines[this.row];
    switch (cmd) {
      case "K": // 行消去
        if (params === "" || params === "0") line.length = Math.min(line.length, this.col);
        else if (params === "2") line.length = 0;
        break;
      case "D": this.col = Math.max(0, this.col - (n || 1)); break;
      case "C": this.col += n || 1; break;
      case "J": // 画面消去
        if (params === "2" || params === "3") { this.lines = [[]]; this.row = 0; this.col = 0; }
        break;
      case "H": this.col = 0; break;
    }
  }
  _schedule() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => { this._pending = false; this.render(); });
  }
  render() {
    const atBottom = this.el.scrollTop + this.el.clientHeight >= this.el.scrollHeight - 24;
    const out = [];
    const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    this.lines.forEach((chars, r) => {
      if (r !== this.row) { out.push(esc(chars.join(""))); return; }
      const padded = chars.slice();
      while (padded.length <= this.col) padded.push(" ");
      out.push(
        esc(padded.slice(0, this.col).join("")) +
        '<span class="cursor">' + esc(padded[this.col]) + "</span>" +
        esc(padded.slice(this.col + 1).join(""))
      );
    });
    this.el.innerHTML = out.join("\n");
    if (atBottom) this.el.scrollTop = this.el.scrollHeight;
  }
}

