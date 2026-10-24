/* 门户/游戏库 —— 交互脚本（背景余烬 / 中英切换 / 卡面缩略图 / 导航高亮） */
'use strict';
(function () {

  /* ============ 背景漂浮余烬 ============ */
  (function embers() {
    const cv = document.getElementById('embers');
    if (!cv) return;
    const g = cv.getContext('2d');
    let W, H, list = [];
    function resize() {
      W = cv.width = Math.ceil(window.innerWidth / 3);
      H = cv.height = Math.ceil(window.innerHeight / 3);
    }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 46; i++) {
      list.push({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random(), ph: Math.random() * 6.28 });
    }
    let last = 0;
    function draw(t) {
      requestAnimationFrame(draw);
      if (t - last < 50) return; // 20fps 足够
      const dt = Math.min(0.15, (t - last) / 1000); last = t;
      g.clearRect(0, 0, W, H);
      for (const p of list) {
        p.y -= p.s * 4 * dt * 6;
        p.x += Math.sin(t / 900 + p.ph) * 0.08;
        if (p.y < -2) { p.y = H + 2; p.x = Math.random() * W; }
        const a = 0.35 + 0.35 * Math.sin(t / 400 + p.ph);
        g.fillStyle = p.s > 0.9 ? `rgba(255,176,84,${a})` : `rgba(77,240,226,${a * 0.8})`;
        g.fillRect(p.x | 0, p.y | 0, p.s > 0.9 ? 2 : 1, p.s > 0.9 ? 2 : 1);
      }
    }
    requestAnimationFrame(draw);
  })();

  /* ============ 游戏卡缩略图：程序化像素小场景 ============ */
  (function thumbs() {
    document.querySelectorAll('canvas[data-thumb="star-ember"]').forEach((cv) => {
      const g = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      g.fillStyle = '#0a0e16'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(72,110,150,0.16)'; g.beginPath();
      for (let x = 0; x <= W; x += 8) { g.moveTo(x + .5, 0); g.lineTo(x + .5, H); }
      for (let y = 0; y <= H; y += 8) { g.moveTo(0, y + .5); g.lineTo(W, y + .5); }
      g.stroke();
      const shards = [[14, 12, '#2ee6cf'], [96, 20, '#8a4fd0'], [60, 56, '#ff8c3a'], [112, 48, '#2ee6cf'], [30, 60, '#b07ff0']];
      for (const [sx, sy, c] of shards) {
        g.fillStyle = c; g.fillRect(sx, sy, 2, 2);
        g.globalAlpha = 0.22; g.fillRect(sx - 2, sy - 2, 6, 6); g.globalAlpha = 1;
      }
      g.fillStyle = '#17303f'; g.fillRect(58, 30, 10, 11);
      g.fillStyle = '#2b5d70'; g.fillRect(59, 30, 4, 2);
      g.fillStyle = '#4df0e2'; g.fillRect(60, 33, 6, 2);
      g.fillStyle = '#2b2f3d'; g.fillRect(59, 37, 8, 3);
      g.fillStyle = '#20242e'; g.fillRect(60, 40, 3, 2); g.fillRect(64, 40, 3, 2);
      g.strokeStyle = '#4df0e2';
      g.beginPath(); g.arc(63, 36, 13, 0, 6.28); g.stroke();
      g.fillStyle = '#eafffb'; g.fillRect(75, 34, 4, 2); g.fillRect(47, 36, 4, 2);
      g.fillStyle = '#8a2f6d'; g.fillRect(20, 42, 7, 7); g.fillStyle = '#fff'; g.fillRect(22, 44, 1, 1); g.fillRect(25, 44, 1, 1);
      g.fillStyle = '#37e0c8'; g.fillRect(100, 44, 7, 7); g.fillStyle = '#fff'; g.fillRect(102, 46, 3, 2);
      g.fillStyle = '#e0762a'; g.fillRect(36, 16, 8, 8); g.fillStyle = '#ffd23f'; g.fillRect(39, 19, 2, 2);
      g.fillStyle = '#2c545a'; g.fillRect(86, 12, 12, 10); g.fillStyle = '#e0643f'; g.fillRect(90, 15, 4, 3);
      g.fillStyle = '#eafffb'; g.fillRect(46, 24, 2, 2); g.fillRect(80, 26, 2, 2); g.fillRect(70, 18, 2, 2);
      g.fillStyle = '#ff5f9e'; g.fillRect(30, 32, 3, 3); g.fillRect(95, 34, 3, 3);
      g.fillStyle = '#ffd23f'; g.fillRect(24, 36, 1, 3); g.fillRect(26, 36, 1, 5);
    });
  })();

  /* ============ 中英切换（存在 data-i18n 元素时生效） ============ */
  const I18N = {
    en: {
      nav_home: 'HOME', nav_about: 'ABOUT', nav_skills: 'SKILLS', nav_projects: 'PROJECTS',
      nav_contact: 'CONTACT', nav_games: 'GAME LIBRARY', nav_archive: 'ARCHIVE',
    },
  };
  const ZH = {};
  const btn = document.getElementById('langToggle');
  if (btn) {
    let lang = 'zh';
    const nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach((n) => { ZH[n.dataset.i18n] = n.textContent; });
    btn.addEventListener('click', () => {
      lang = lang === 'zh' ? 'en' : 'zh';
      btn.textContent = lang === 'zh' ? 'EN' : '中';
      const dict = lang === 'en' ? I18N.en : ZH;
      nodes.forEach((n) => {
        const v = dict[n.dataset.i18n];
        if (v) n.textContent = v;
      });
    });
  }

  /* ============ 导航锚点高亮（仅处理 # 锚点链接） ============ */
  const secs = ['home', 'about', 'skills', 'projects', 'contact'];
  const navLinks = document.querySelectorAll('.links a');
  window.addEventListener('scroll', () => {
    let cur = 'home';
    for (const id of secs) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < 160) cur = id;
    }
    navLinks.forEach((a) => {
      const h = a.getAttribute('href');
      if (h && h.startsWith('#')) a.classList.toggle('on', h === '#' + cur);
    });
  }, { passive: true });

})();
