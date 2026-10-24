/* 星烬：最后一夜 — 全局状态、常量与输入 */
'use strict';

const VIEW_W = 640, VIEW_H = 360;          // 内部渲染分辨率
const WORLD_W = 1760, WORLD_H = 1120;      // 竞技场世界尺寸
const STEP = 1 / 60;                        // 固定物理步长

/* 全局可变状态（resetGame 会整体重建其中大部分字段） */
const G = {
  state: 'menu',            // menu | playing | paused | levelup | over | victory
  time: 0, kills: 0, bossKills: 0,
  player: null, boss: null,
  enemies: [], bullets: [], ebullets: [], gems: [], hearts: [],
  parts: [], dnums: [],
  cam: { x: 0, y: 0 }, shake: 0,
  props: [], embers: [],
  seed: 1, rng: null,
  spawnAcc: 0, waveIdx: 0, eliteIdx: 0,
  midSpawned: false, finalSpawned: false,
  pendingBoss: 0, bossWarnTimer: 0,
  pendingLevels: 0,
  deathTimer: 0, winTimer: 0, timeScale: 1, ended: false,
  menuT: 0,
  best: { score: 0, time: 0, level: 1 },
  newRecords: null, runStats: null,
};

/* ============ 输入 ============ */
const Input = {
  keys: new Set(),
  touch: { active: false, dx: 0, dy: 0 },
  dashQueued: false,
  axis: { x: 0, y: 0 },
  lastDir: { x: 1, y: 0 },
  codes: new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP']),

  keydown(e) {
    if (this.codes.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space') this.dashQueued = true;
  },
  keyup(e) { this.keys.delete(e.code); },
  clear() {
    this.keys.clear();
    this.touch.active = false; this.touch.dx = 0; this.touch.dy = 0;
    this.dashQueued = false; this.axis.x = 0; this.axis.y = 0;
  },
  computeAxis() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.touch.active) { x = this.touch.dx; y = this.touch.dy; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.axis.x = x; this.axis.y = y;
    if (l > 0.15) {
      const n = Math.hypot(x, y) || 1;
      this.lastDir.x = x / n; this.lastDir.y = y / n;
    }
  },
  consumeDash() { const d = this.dashQueued; this.dashQueued = false; return d; }
};

/* 提前捕获运行期错误，供自动化验证读取 */
window.__ERRS = [];
window.addEventListener('error', (ev) => {
  window.__ERRS.push(String(ev.message || ev.error) + ' @' + (ev.filename || '') + ':' + (ev.lineno || 0));
});
