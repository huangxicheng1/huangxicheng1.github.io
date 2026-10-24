/* 星烬：最后一夜 — 界面、HUD、强化卡、触屏与启动 */
'use strict';

const UI = {
  touchMode: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
  els: {}, annTimer: 0, last: {},

  init() {
    const ids = ['hud', 'xpfill', 'lvchip', 'hpfill', 'hptext', 'timer', 'kills', 'scorebox',
      'dashbox', 'dashfill', 'bosswrap', 'bossname', 'bossfill',
      'announce', 'ann-main', 'ann-sub', 'touchui', 'joy', 'knob', 'dashbtn',
      'screen-menu', 'screen-pause', 'screen-levelup', 'screen-result', 'cards',
      'logo', 'menu-best', 'btn-start', 'btn-sound-menu', 'btn-sound-pause',
      'btn-resume', 'btn-restart-pause', 'btn-quit-pause', 'pause-stats',
      'result-title', 'result-flavor', 'st-time', 'st-level', 'st-kills', 'st-score', 'result-records',
      'btn-again', 'btn-menu-result', 'hurtflash', 'lowhp', 'selftest-out'];
    for (const id of ids) this.els[id] = $(id);

    /* —— 按钮 —— */
    const onStart = () => { Sfx.resume(); Sfx.select(); startRun(); };
    this.els['btn-start'].addEventListener('click', onStart);
    this.els['btn-again'].addEventListener('click', () => { Sfx.select(); startRun(); });
    this.els['btn-menu-result'].addEventListener('click', () => { Sfx.select(); toMenu(); });
    this.els['btn-resume'].addEventListener('click', () => { Sfx.select(); this.resumeGame(); });
    this.els['btn-restart-pause'].addEventListener('click', () => { Sfx.select(); startRun(); });
    this.els['btn-quit-pause'].addEventListener('click', () => { Sfx.select(); toMenu(); });
    this.els['btn-sound-menu'].addEventListener('click', () => this.toggleSound());
    this.els['btn-sound-pause'].addEventListener('click', () => this.toggleSound());
    window.addEventListener('pointerdown', () => Sfx.resume());

    /* —— 全局按键（状态控制） —— */
    window.addEventListener('keydown', (e) => Input.keydown(e));
    window.addEventListener('keyup', (e) => Input.keyup(e));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') { this.toggleSound(); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (G.state === 'playing') this.pauseGame();
        else if (G.state === 'paused') this.resumeGame();
        return;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (G.state === 'menu') { Sfx.resume(); Sfx.select(); startRun(); }
        else if (G.state === 'over' || G.state === 'victory') { Sfx.select(); startRun(); }
        return;
      }
      if (G.state === 'levelup') {
        const map = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
        if (e.code in map) this.pickCard(map[e.code]);
      }
    });

    /* —— 失焦清理输入并自动暂停 —— */
    window.addEventListener('blur', () => {
      Input.clear();
      if (G.state === 'playing') this.pauseGame();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        Input.clear();
        if (G.state === 'playing') this.pauseGame();
      }
    });

    this.initTouch();
    this.syncSound();
    this.refreshBest();
    /* 站点内运行（部署在 /games/ 下）时显示“返回站点”，独立运行时隐藏 */
    const inSite = /\/games\//.test(location.pathname);
    document.querySelectorAll('.back-link').forEach((a) => a.classList.toggle('hidden', !inSite));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  /* ============ 画面缩放（保持像素清晰） ============ */
  resize() {
    const wrap = $('wrap');
    const aw = window.innerWidth, ah = window.innerHeight;
    let s = Math.min(aw / VIEW_W, ah / VIEW_H);
    /* 1/4 步进缩放：16:9 屏幕正好整数倍（像素完全清晰），其余屏幕轻微非整数但不模糊 */
    if (s >= 1) s = Math.floor(s * 4) / 4;
    s = Math.max(0.4, s);
    wrap.style.width = Math.round(VIEW_W * s) + 'px';
    wrap.style.height = Math.round(VIEW_H * s) + 'px';
  },

  /* ============ 屏幕切换 ============ */
  showScreen(name) {
    const map = { menu: 'screen-menu', pause: 'screen-pause', levelup: 'screen-levelup', result: 'screen-result' };
    for (const k in map) {
      this.els[map[k]].classList.toggle('hidden', k !== name);
    }
  },

  setHudVisible(v) { this.els.hud.classList.toggle('hidden', !v); },
  setTouchVisible(v) { this.els.touchui.classList.toggle('hidden', !v); },

  pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    Input.clear();
    const p = G.player;
    this.els['pause-stats'].textContent =
      `生存 ${fmtTime(G.time)} · 等级 ${p.level} · 击杀 ${G.kills}`;
    this.showScreen('pause');
  },
  resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    this.showScreen(null);
  },

  toggleSound() {
    Sfx.resume();
    Sfx.setEnabled(!Sfx.enabled);
    this.syncSound();
    Sfx.select();
  },
  syncSound() {
    const label = '声音：' + (Sfx.enabled ? '开' : '关');
    this.els['btn-sound-menu'].textContent = label;
    this.els['btn-sound-pause'].textContent = label;
  },

  refreshBest() {
    const b = G.best;
    this.els['menu-best'].textContent = `最高得分 ${b.score} · 最长生存 ${fmtTime(b.time)} · 最高等级 ${b.level}`;
  },

  /* ============ 公告 ============ */
  announce(main, sub = '', color = '#4df0e2', dur = 2.2) {
    const el = this.els.announce;
    this.els['ann-main'].textContent = main;
    this.els['ann-main'].style.color = color;
    this.els['ann-main'].style.textShadow = `0 0 12px ${color}`;
    this.els['ann-sub'].textContent = sub;
    el.classList.remove('hidden');
    el.classList.remove('anim');
    void el.offsetWidth;
    el.classList.add('anim');
    clearTimeout(this.annTimer);
    this.annTimer = setTimeout(() => el.classList.add('hidden'), dur * 1000);
  },

  /* ============ 升级三选一 ============ */
  openLevelUp() {
    G.state = 'levelup';
    Sfx.levelup();
    this.buildCards();
    this.showScreen('levelup');
  },

  buildCards() {
    const p = G.player;
    const box = this.els.cards;
    box.innerHTML = '';
    /* 只从未满级的强化中抽取 */
    const pool = UPGRADES.filter(u => (p.upLevels[u.id] || 0) < u.max);
    const chosen = [];
    while (chosen.length < 3 && chosen.length < pool.length + FALLBACKS.length) {
      const cands = pool.filter(u => !chosen.includes(u));
      if (cands.length > 0) {
        let total = 0;
        for (const c of cands) total += RARITY[c.rar].w;
        let r = Math.random() * total, sel = cands[0];
        for (const c of cands) { r -= RARITY[c.rar].w; if (r <= 0) { sel = c; break; } }
        chosen.push(sel);
      } else {
        const fb = FALLBACKS.filter(u => !chosen.includes(u));
        if (fb.length === 0) break;
        chosen.push(pick(fb));
      }
    }
    chosen.forEach((u, i) => {
      const lv = p.upLevels[u.id] || 0;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card rar-' + u.rar;
      const ic = document.createElement('canvas');
      ic.width = 36; ic.height = 36;
      const g = ic.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(getUpgradeIcon(u.icon), 0, 0, 36, 36);
      card.appendChild(ic);
      const nm = document.createElement('div');
      nm.className = 'c-name';
      nm.textContent = u.name;
      card.appendChild(nm);
      const rar = document.createElement('div');
      rar.className = 'c-rar';
      rar.textContent = RARITY[u.rar].n;
      rar.style.color = RARITY[u.rar].c;
      card.appendChild(rar);
      const ds = document.createElement('div');
      ds.className = 'c-desc';
      ds.textContent = u.desc;
      card.appendChild(ds);
      const pips = document.createElement('div');
      pips.className = 'c-pips';
      if (!u.fallback) {
        for (let j = 0; j < u.max; j++) {
          const s = document.createElement('span');
          if (j < lv) s.className = 'on';
          pips.appendChild(s);
        }
        const lab = document.createElement('em');
        lab.textContent = `Lv ${lv}/${u.max}`;
        pips.appendChild(lab);
      } else {
        const lab = document.createElement('em');
        lab.textContent = '立即生效';
        pips.appendChild(lab);
      }
      card.appendChild(pips);
      const keyHint = document.createElement('div');
      keyHint.className = 'c-key';
      keyHint.textContent = String(i + 1);
      card.appendChild(keyHint);
      card.addEventListener('click', () => this.pickCard(i));
      box.appendChild(card);
    });
    this.currentCards = chosen;
  },

  pickCard(i) {
    if (G.state !== 'levelup' || !this.currentCards) return;
    const u = this.currentCards[i];
    if (!u) return;
    const p = G.player;
    u.apply(p);
    if (!u.fallback) p.upLevels[u.id] = (p.upLevels[u.id] || 0) + 1;
    Sfx.select();
    addParts(p.x, p.y, RARITY[u.rar].c, 12, 120, 0.5, 2, true);
    G.pendingLevels = Math.max(0, G.pendingLevels - 1);
    if (G.pendingLevels > 0) {
      Sfx.levelup();
      this.buildCards();
    } else {
      this.currentCards = null;
      G.state = 'playing';
      this.showScreen(null);
    }
  },

  /* ============ 结算 ============ */
  showResult(victory) {
    const st = G.runStats;
    this.els['st-time'].textContent = fmtTime(st.time);
    this.els['st-level'].textContent = st.level;
    this.els['st-kills'].textContent = st.kills;
    this.els['st-score'].textContent = st.score;
    const scr = $('screen-result');
    scr.classList.toggle('win', victory);
    scr.classList.toggle('lose', !victory);
    if (victory) {
      this.els['result-title'].textContent = '黎 明 将 至';
      this.els['result-flavor'].textContent = '星烬主宰陨落，废墟迎来第一缕晨光。这一夜，你赢了。';
    } else {
      this.els['result-title'].textContent = '你 倒 下 了';
      this.els['result-flavor'].textContent = '星火熄灭于长夜 —— 但废墟会记住你的抵抗。';
    }
    const nr = G.newRecords || {};
    const marks = [];
    if (nr.score) marks.push('新纪录：最高得分');
    if (nr.time) marks.push('新纪录：最长生存');
    if (nr.level) marks.push('新纪录：最高等级');
    this.els['result-records'].textContent =
      (marks.length ? marks.join(' · ') + '！' : `最佳：得分 ${G.best.score} · 生存 ${fmtTime(G.best.time)} · 等级 ${G.best.level}`);
    this.setTouchVisible(false);
    this.showScreen('result');
  },

  /* ============ HUD 刷新 ============ */
  updateHUD() {
    const H = this.last;
    if (!G.player || G.state === 'menu') return;
    const p = G.player;
    const set = (id, v) => { if (H[id] !== v) { H[id] = v; this.els[id].textContent = v; } };

    /* 经验 */
    const xpf = clamp(p.xp / p.xpNext, 0, 1) * 100;
    if (H.xpf !== xpf) { H.xpf = xpf; this.els.xpfill.style.width = xpf.toFixed(1) + '%'; }
    set('lvchip', 'Lv ' + p.level);
    /* 生命 */
    const hpf = clamp(p.hp / p.maxhp, 0, 1) * 100;
    if (H.hpf !== hpf) { H.hpf = hpf; this.els.hpfill.style.width = hpf.toFixed(1) + '%'; }
    const hpt = `${Math.max(0, Math.ceil(p.hp))}/${p.maxhp}`;
    set('hptext', hpt);
    const hpState = p.hp / p.maxhp < 0.25 ? 'low' : p.hp / p.maxhp < 0.5 ? 'mid' : 'ok';
    if (H.hpState !== hpState) { H.hpState = hpState; this.els.hpfill.className = hpState; }
    this.els.lowhp.classList.toggle('on', !p.dead && p.hp / p.maxhp < 0.3 && G.state === 'playing');
    this.els.hurtflash.style.opacity = p.hurtT > 0 ? (p.hurtT / 0.3 * 0.55).toFixed(2) : '0';
    /* 时间 / 击杀 / 得分 */
    set('timer', fmtTime(G.time));
    set('kills', '击杀 ' + G.kills);
    set('scorebox', '得分 ' + computeScore());
    /* 冲刺冷却 */
    const df = p.dashCd <= 0 ? 100 : (1 - p.dashCd / p.dashCdMax) * 100;
    if (H.df !== df) { H.df = df; this.els.dashfill.style.height = df.toFixed(0) + '%'; }
    const ready = p.dashCd <= 0;
    if (H.ready !== ready) { H.ready = ready; this.els.dashbox.classList.toggle('ready', ready); }
    /* 首领血条 */
    const b = G.boss && !G.boss.dead ? G.boss : null;
    const bShow = !!b;
    if (H.bShow !== bShow) { H.bShow = bShow; this.els.bosswrap.classList.toggle('hidden', !bShow); }
    if (b) {
      set('bossname', b.name + (b.which === 2 && b.phase > 1 ? ` · 阶段 ${b.phase}` : b.which === 1 && b.enraged ? ' · 过载' : ''));
      const bf = clamp(b.hp / b.maxhp, 0, 1) * 100;
      if (H.bf !== bf) { H.bf = bf; this.els.bossfill.style.width = bf.toFixed(1) + '%'; }
      const bp = b.which === 2 ? 'p' + b.phase : (b.enraged ? 'p2' : 'p1');
      if (H.bp !== bp) { H.bp = bp; this.els.bossfill.className = bp; }
    }
  },

  /* ============ 触屏 ============ */
  initTouch() {
    const wrap = $('wrap');
    const joy = this.els.joy, knob = this.els.knob;
    let joyId = null, baseX = 0, baseY = 0;
    const R = 42;

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    wrap.addEventListener('touchstart', (e) => {
      Sfx.resume();
      if (!this.touchMode || G.state !== 'playing' || joyId !== null) return;
      const rect = wrap.getBoundingClientRect();
      for (const t of e.changedTouches) {
        if (t.clientX < rect.left + rect.width * 0.55) {
          joyId = t.identifier;
          baseX = t.clientX; baseY = t.clientY;
          joy.style.display = 'block';
          joy.style.left = (baseX - rect.left - 52) + 'px';
          joy.style.top = (baseY - rect.top - 52) + 'px';
          setKnob(0, 0);
          e.preventDefault();
        }
      }
    }, { passive: false });
    wrap.addEventListener('touchmove', (e) => {
      if (joyId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - baseX, dy = t.clientY - baseY;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx = dx / l * R; dy = dy / l * R; }
          setKnob(dx, dy);
          Input.touch.active = true;
          Input.touch.dx = dx / R;
          Input.touch.dy = dy / R;
          e.preventDefault();
        }
      }
    }, { passive: false });
    const endTouch = (e) => {
      if (joyId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          joy.style.display = 'none';
          Input.touch.active = false;
          Input.touch.dx = 0; Input.touch.dy = 0;
        }
      }
    };
    wrap.addEventListener('touchend', endTouch);
    wrap.addEventListener('touchcancel', endTouch);

    this.els.dashbtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      Input.dashQueued = true;
      this.els.dashbtn.classList.add('press');
    }, { passive: false });
    this.els.dashbtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.els.dashbtn.classList.remove('press');
    }, { passive: false });

    if (this.touchMode) {
      wrap.addEventListener('contextmenu', (e) => e.preventDefault());
      document.body.classList.add('touch');
    }
  },
};

/* ============ 启动 ============ */
function boot() {
  buildSprites();
  loadRecords();
  UI.init();
  resetGame();
  G.state = 'menu';
  UI.showScreen('menu');
  UI.setHudVisible(false);
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
}
boot();
