/* 星烬：最后一夜 — WebAudio 程序化音效与背景律动 */
'use strict';

const Sfx = {
  ctx: null, master: null, musicGain: null,
  enabled: true, ready: false,
  musicNext: 0, musicStep: 0,
  lastShoot: 0, lastGem: 0,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.55 : 0.0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.ready = true;
    } catch (e) { this.ready = false; }
  },
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setEnabled(v) {
    this.enabled = v;
    try { localStorage.setItem('se_sound', v ? '1' : '0'); } catch (e) { /* 忽略存储异常 */ }
    if (this.master) this.master.gain.value = v ? 0.55 : 0.0;
  },
  tone(freq, dur, o = {}) {
    if (!this.ready || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol || 0.1, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.music ? this.musicGain : this.master);
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  noise(dur, o = {}) {
    if (!this.ready || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const len = Math.max(1, (dur * c.sampleRate) | 0);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = c.createBiquadFilter();
    f.type = o.hp ? 'highpass' : 'lowpass';
    f.frequency.value = o.cut || 900;
    src.connect(f); f.connect(g);
    g.connect(o.music ? this.musicGain : this.master);
    src.start(t); src.stop(t + dur + 0.03);
  },

  /* —— 具名音效 —— */
  shoot() { const n = performance.now(); if (n - this.lastShoot < 75) return; this.lastShoot = n; this.tone(740, 0.06, { type: 'square', vol: 0.032, slide: 330 }); },
  hit() { this.noise(0.05, { vol: 0.08, cut: 2400 }); },
  crit() { this.tone(1180, 0.07, { type: 'square', vol: 0.05, slide: 520 }); this.noise(0.05, { vol: 0.07, cut: 3200 }); },
  die() { this.tone(320, 0.16, { type: 'square', vol: 0.055, slide: 66 }); },
  hurt() { this.tone(150, 0.28, { type: 'sawtooth', vol: 0.14, slide: 52 }); this.noise(0.2, { vol: 0.12, cut: 650 }); },
  dash() { this.noise(0.15, { vol: 0.09, cut: 2400, hp: true }); this.tone(500, 0.13, { type: 'sine', vol: 0.05, slide: 950 }); },
  gem() { const n = performance.now(); if (n - this.lastGem < 90) return; this.lastGem = n; this.tone(1240, 0.05, { type: 'sine', vol: 0.03 }); },
  heart() { this.tone(660, 0.09, { type: 'sine', vol: 0.08 }); this.tone(990, 0.12, { type: 'sine', vol: 0.07, delay: 0.07 }); },
  select() { this.tone(880, 0.06, { type: 'square', vol: 0.055 }); },
  levelup() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.14, { type: 'square', vol: 0.065, delay: i * 0.07 })); },
  bossWarn() { this.tone(88, 0.7, { type: 'sawtooth', vol: 0.15, slide: 58 }); this.tone(132, 0.7, { type: 'sawtooth', vol: 0.09, slide: 92, delay: 0.05 }); },
  bossDie() { for (let i = 0; i < 7; i++) this.noise(0.3, { vol: 0.15, cut: 1300 - i * 130, delay: i * 0.12 }); this.tone(210, 0.9, { type: 'sawtooth', vol: 0.13, slide: 38 }); },
  victory() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.065, delay: i * 0.13 })); },
  gameover() { [392, 330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.1, delay: i * 0.16 })); },

  /* —— 极简背景律动（约 100BPM）：kick + 低音 + 琶音 —— */
  BASS: [55, 55, 65.41, 49],
  ARP: [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63],
  updateMusic(intensity) {  // 0 关闭 / 1 常规 / 2 首领战
    if (!this.ready) return;
    if (!this.enabled || intensity <= 0) { this.musicNext = 0; if (this.musicGain) this.musicGain.gain.value = 0; return; }
    const c = this.ctx;
    this.musicGain.gain.value = intensity === 2 ? 0.5 : 0.32;
    if (this.musicNext < c.currentTime) this.musicNext = c.currentTime + 0.05;
    const half = 0.3;
    while (this.musicNext < c.currentTime + 0.3) {
      const s = this.musicStep;
      const t = this.musicNext - c.currentTime;
      if (s % 2 === 0) this.tone(110, 0.12, { type: 'sine', vol: 0.32, slide: 34, delay: t, music: true });
      if (s % 8 === 0) this.noise(0.03, { vol: 0.05, cut: 5000, delay: t, music: true });
      if (s % 2 === 1) this.noise(0.03, { vol: 0.026, cut: 6000, delay: t, hp: true, music: true });
      if (s % 4 === 0) this.tone(this.BASS[(s >> 2) % 4], 0.25, { type: 'triangle', vol: 0.22, delay: t, music: true });
      const arp = this.ARP[s % 8] * ((intensity === 2 && s % 8 >= 4) ? 2 : 1);
      this.tone(arp, 0.12, { type: 'square', vol: 0.042, delay: t, music: true });
      this.musicStep++;
      this.musicNext += half;
    }
  }
};

/* 恢复持久化的声音设置 */
(function () {
  try { Sfx.enabled = localStorage.getItem('se_sound') !== '0'; } catch (e) { /* 默认开启 */ }
})();
