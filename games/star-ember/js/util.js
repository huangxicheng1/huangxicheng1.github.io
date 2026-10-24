/* 星烬：最后一夜 — 通用工具 */
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];
const chance = (p) => Math.random() < p;
const $ = (id) => document.getElementById(id);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/* 按权重从 {key: weight} 中挑选 key */
function wpick(w) {
  let total = 0;
  for (const k in w) total += w[k];
  let r = Math.random() * total;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}

/* ============ 3x5 像素数字字体（伤害数字用） ============ */
const PIXFONT = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '!': ['010', '010', '010', '000', '010'],
  '.': ['000', '000', '000', '000', '010'],
};

/* 绘制像素文字；align: 0 左 1 中 2 右 */
function drawPixText(g, str, x, y, scale, color, align = 0) {
  const chars = String(str).split('');
  const totalW = chars.length * 4 * scale - scale;
  let cx = align === 1 ? Math.round(x - totalW / 2) : align === 2 ? Math.round(x - totalW) : Math.round(x);
  g.fillStyle = color;
  for (const ch of chars) {
    const gl = PIXFONT[ch];
    if (gl) {
      for (let r = 0; r < 5; r++) {
        const row = gl[r];
        for (let c = 0; c < 3; c++) {
          if (row[c] === '1') g.fillRect(cx + c * scale, Math.round(y) + r * scale, scale, scale);
        }
      }
    }
    cx += 4 * scale;
  }
}
