/* 星烬：最后一夜 — 主循环、导演、空间网格与渲染 */
'use strict';

const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

/* ============ 空间网格（敌人碰撞加速） ============ */
const CELL = 48;
const GRID = new Map();
function buildGrid() {
  GRID.clear();
  const put = (e) => {
    const k = ((e.x / CELL) | 0) * 4096 + ((e.y / CELL) | 0);
    let a = GRID.get(k);
    if (!a) { a = []; GRID.set(k, a); }
    a.push(e);
  };
  for (const e of G.enemies) if (!e.dead) put(e);
  if (G.boss && !G.boss.dead) put(G.boss);
}
function gridQuery(x, y, r, cb) {
  const x0 = ((x - r) / CELL) | 0, x1 = ((x + r) / CELL) | 0;
  const y0 = ((y - r) / CELL) | 0, y1 = ((y + r) / CELL) | 0;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const a = GRID.get(cx * 4096 + cy);
      if (!a) continue;
      for (let i = 0; i < a.length; i++) cb(a[i]);
    }
  }
}

function addShake(n) { G.shake = Math.min(14, G.shake + n); }

/* ============ 地图装饰 ============ */
function makePropField() {
  const rng = mulberry32(G.seed);
  G.props = [];
  const R = (a, b) => a + rng() * (b - a);
  const I = (a, b) => Math.floor(R(a, b + 1));
  for (let i = 0; i < 26; i++) { // 裂纹：随机游走
    const cells = [];
    let x = I(40, WORLD_W - 40), y = I(40, WORLD_H - 40);
    const n = I(10, 24);
    for (let j = 0; j < n; j++) {
      cells.push([x, y]);
      x = clamp(x + I(-2, 2) * 3, 12, WORLD_W - 12);
      y = clamp(y + I(-2, 2) * 3, 12, WORLD_H - 12);
    }
    G.props.push({ t: 'crack', cells });
  }
  for (let i = 0; i < 60; i++) { // 残骸碎块
    const cells = [];
    const n = I(4, 9);
    let x = I(30, WORLD_W - 30), y = I(30, WORLD_H - 30);
    for (let j = 0; j < n; j++) {
      cells.push([x + I(-4, 4), y + I(-4, 4), I(0, 2)]);
    }
    G.props.push({ t: 'rubble', cells });
  }
  for (let i = 0; i < 30; i++) { // 发光碎片
    G.props.push({
      t: 'shard', x: I(30, WORLD_W - 30), y: I(30, WORLD_H - 30),
      c: pick(['#2ee6cf', '#8a4fd0', '#ff8c3a']), ph: R(0, TAU),
    });
  }
  for (let i = 0; i < 14; i++) { // 断裂钢梁
    G.props.push({ t: 'girder', x: I(60, WORLD_W - 60), y: I(60, WORLD_H - 60), len: I(10, 24), dir: I(0, 1), gap: I(3, 14) });
  }
  for (let i = 0; i < 10; i++) { // 霓虹水洼
    G.props.push({
      t: 'pool', x: I(60, WORLD_W - 60), y: I(60, WORLD_H - 60),
      w: I(10, 22), h: I(6, 12), c: pick(['46,230,207', '138,79,208', '255,140,58']),
    });
  }
  G.embers = [];
  for (let i = 0; i < 42; i++) {
    G.embers.push({ x: R(0, WORLD_W), y: R(0, WORLD_H), s: R(0.5, 1.4), ph: R(0, TAU) });
  }
}

/* ============ 重置与开始 ============ */
function resetGame() {
  G.time = 0; G.kills = 0; G.bossKills = 0;
  G.enemies = []; G.bullets = []; G.ebullets = [];
  G.gems = []; G.hearts = []; G.parts = []; G.dnums = [];
  G.boss = null;
  G.shake = 0;
  G.spawnAcc = 0; G.waveIdx = 0; G.eliteIdx = 0;
  G.midSpawned = false; G.finalSpawned = false;
  G.pendingBoss = 0; G.bossWarnTimer = 0;
  G.pendingLevels = 0;
  G.deathTimer = 0; G.winTimer = 0; G.timeScale = 1; G.ended = false;
  G.newRecords = null; G.runStats = null;
  G.seed = (Math.random() * 0xffffffff) >>> 0;
  G.rng = mulberry32(G.seed);
  G.player = newPlayer();
  makePropField();
  Input.clear();
  Sfx.musicStep = 0; Sfx.musicNext = 0;
  G.cam.x = clamp(G.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  G.cam.y = clamp(G.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
}

function startRun() {
  resetGame();
  G.state = 'playing';
  UI.showScreen(null);
  UI.setHudVisible(true);
  UI.setTouchVisible(UI.touchMode);
  UI.announce('第 1 夜 · 开始于废墟东区', '活下来，收集星尘', '#4df0e2');
}

function toMenu() {
  resetGame();
  G.state = 'menu';
  UI.showScreen('menu');
  UI.setHudVisible(false);
  UI.setTouchVisible(false);
  UI.refreshBest();
}

/* ============ 导演：波次 / 精英 / 首领 ============ */
function edgeSpawnPos() {
  const p = G.player;
  for (let tries = 0; tries < 8; tries++) {
    const side = randi(0, 3);
    let x, y;
    const m = rand(30, 70);
    if (side === 0) { x = G.cam.x - m; y = G.cam.y + rand(0, VIEW_H); }
    else if (side === 1) { x = G.cam.x + VIEW_W + m; y = G.cam.y + rand(0, VIEW_H); }
    else if (side === 2) { x = G.cam.x + rand(0, VIEW_W); y = G.cam.y - m; }
    else { x = G.cam.x + rand(0, VIEW_W); y = G.cam.y + VIEW_H + m; }
    x = clamp(x, 16, WORLD_W - 16); y = clamp(y, 16, WORLD_H - 16);
    if (dist2(x, y, p.x, p.y) > 230 * 230) return { x, y };
  }
  return { x: clamp(p.x + rand(-1, 1) * 400, 16, WORLD_W - 16), y: clamp(p.y + rand(-1, 1) * 400, 16, WORLD_H - 16) };
}

function spawnEnemyAtEdge(type, elite) {
  if (G.enemies.length >= enemyCap(G.time)) return null;
  const pos = edgeSpawnPos();
  const e = makeEnemy(type, pos.x, pos.y, elite);
  G.enemies.push(e);
  if (elite) addParts(e.x, e.y, '#ffd23f', 12, 110, 0.6, 2, true);
  else addParts(e.x, e.y, '#8a4fd0', 4, 60, 0.4, 1.6);
  return e;
}

function triggerBossWarn(which) {
  G.pendingBoss = which;
  G.bossWarnTimer = 2.2;
  Sfx.bossWarn();
  addShake(6);
  const def = BOSSDEFS[which];
  UI.announce('警 告', `${def.name} 正在接近`, '#ff5f4d', 2.4);
}

function spawnDirector(dt) {
  const t = G.time;
  /* 首领警报倒计时 → 真正召唤 */
  if (G.bossWarnTimer > 0) {
    G.bossWarnTimer -= dt;
    if (G.bossWarnTimer <= 0) summonBoss(G.pendingBoss);
  }
  if (!G.midSpawned && t >= BOSS1_TIME) { G.midSpawned = true; triggerBossWarn(1); }
  if (!G.finalSpawned && t >= BOSS2_TIME) { G.finalSpawned = true; triggerBossWarn(2); }

  /* 精英 */
  if (G.eliteIdx < ELITE_TIMES.length && t >= ELITE_TIMES[G.eliteIdx]) {
    G.eliteIdx++;
    const unlocked = t >= 165 ? ['chaser', 'shooter', 'charger', 'heavy'] : t >= 75 ? ['chaser', 'shooter', 'charger'] : ['chaser', 'shooter'];
    spawnEnemyAtEdge(pick(unlocked), true);
  }

  /* 常规波次 */
  while (G.waveIdx < WAVES.length - 1 && t >= WAVES[G.waveIdx + 1].t) G.waveIdx++;
  const w = WAVES[G.waveIdx];
  if (!w) return;
  let iv = w.iv, burst = w.burst;
  if (G.boss && !G.boss.dead) { iv *= 2.6; burst = Math.max(1, burst - 1); }
  G.spawnAcc += dt;
  while (G.spawnAcc >= iv) {
    G.spawnAcc -= iv;
    for (let i = 0; i < burst; i++) spawnEnemyAtEdge(wpick(w.w), false);
  }
}

/* ============ 结算 ============ */
function computeScore() {
  return G.kills * 15 + Math.floor(G.time) * 8 + (G.player.level - 1) * 60 + G.bossKills * 800 + (G.winTimer === 0 && G.state === 'victory' ? 1500 : 0);
}

function loadRecords() {
  try {
    G.best.score = parseInt(localStorage.getItem('se_best_score')) || 0;
    G.best.time = parseInt(localStorage.getItem('se_best_time')) || 0;
    G.best.level = parseInt(localStorage.getItem('se_best_level')) || 1;
  } catch (e) { /* 无存储环境时保持默认 */ }
}

function endRun(victory) {
  if (G.ended) return;
  G.ended = true;
  G.timeScale = 1;
  const finalTime = G.time;
  const score = computeScore() + (victory ? 1500 : 0);
  const lvl = G.player.level;
  G.runStats = { time: finalTime, level: lvl, kills: G.kills, score, victory };
  G.newRecords = {
    score: score > G.best.score,
    time: finalTime > G.best.time,
    level: lvl > G.best.level,
  };
  G.best.score = Math.max(G.best.score, score);
  G.best.time = Math.max(G.best.time, Math.floor(finalTime));
  G.best.level = Math.max(G.best.level, lvl);
  try {
    localStorage.setItem('se_best_score', String(G.best.score));
    localStorage.setItem('se_best_time', String(G.best.time));
    localStorage.setItem('se_best_level', String(G.best.level));
  } catch (e) { /* 忽略 */ }
  G.state = victory ? 'victory' : 'over';
  if (victory) Sfx.victory();
  UI.showResult(victory);
}

/* ============ 主更新 ============ */
function update(dtReal) {
  if (G.state !== 'playing') return;
  Input.computeAxis();
  const dt = dtReal * G.timeScale;
  G.time += dt;

  buildGrid();
  updatePlayer(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt);
  updateEBullets(dt);
  updateGems(dt);
  updateHearts(dt);
  updateParts(dt);
  spawnDirector(dtReal);

  /* 环境余烬 */
  for (const em of G.embers) {
    em.y -= em.s * 9 * dt;
    em.x += Math.sin(G.time * 0.7 + em.ph) * 5 * dt;
    if (em.y < -4) { em.y = WORLD_H + 4; em.x = rand(0, WORLD_W); }
  }

  /* 相机跟随 */
  const p = G.player;
  const tx = clamp(p.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const ty = clamp(p.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  const k = Math.min(1, 9 * dt);
  G.cam.x += (tx - G.cam.x) * k;
  G.cam.y += (ty - G.cam.y) * k;
  G.shake = Math.max(0, G.shake - G.shake * 6 * dt - 2 * dt);

  /* 死亡 / 胜利演出计时（真实时间） */
  if (G.deathTimer > 0) {
    G.deathTimer -= dtReal;
    if (G.deathTimer <= 0) endRun(false);
  }
  if (G.winTimer > 0) {
    G.winTimer -= dtReal;
    if (G.winTimer <= 0) { G.timeScale = 1; endRun(true); }
  }
}

/* ============ 渲染 ============ */
const RENDER_LIST = [];

function render() {
  const g = ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#06080e';
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  /* 菜单状态：缓慢平移的空场景 */
  let camX = G.cam.x, camY = G.cam.y;
  if (G.state === 'menu') {
    G.menuT += 1 / 60;
    camX = (WORLD_W - VIEW_W) / 2 + Math.sin(G.menuT * 0.1) * 150;
    camY = (WORLD_H - VIEW_H) / 2 + Math.cos(G.menuT * 0.13) * 90;
  }

  let sx = 0, sy = 0;
  if (G.shake > 0.1) { sx = rand(-1, 1) * G.shake; sy = rand(-1, 1) * G.shake; }

  g.save();
  g.translate(-Math.round(camX) + Math.round(sx), -Math.round(camY) + Math.round(sy));
  drawFloor(g, camX, camY);
  drawProps(g, camX, camY);

  if (G.state !== 'menu' && G.player) {
    drawGems(g);
    drawHearts(g);

    /* 按纵深处排序绘制 */
    RENDER_LIST.length = 0;
    for (const e of G.enemies) RENDER_LIST.push(e);
    if (G.boss && !G.boss.dead) RENDER_LIST.push(G.boss);
    RENDER_LIST.push(G.player);
    RENDER_LIST.sort((a, b) => a.y - b.y);
    for (const o of RENDER_LIST) {
      if (o === G.player) drawPlayer(g);
      else if (o.boss) drawBoss(g, o);
      else drawEnemy(g, o);
    }

    drawDronesBlades(g);
    drawBullets(g);
    drawEBullets(g);
  }

  drawParticles(g);
  drawDnums(g);
  g.restore();
}

function drawFloor(g, camX, camY) {
  g.fillStyle = '#0a0e16';
  g.fillRect(Math.round(camX) - 2, Math.round(camY) - 2, VIEW_W + 4, VIEW_H + 4);
  /* 网格 */
  const x0 = Math.floor(camX / 32) * 32, x1 = camX + VIEW_W;
  const y0 = Math.floor(camY / 32) * 32, y1 = camY + VIEW_H;
  g.strokeStyle = 'rgba(72,110,150,0.10)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = x0; x <= x1; x += 32) { g.moveTo(x + 0.5, y0); g.lineTo(x + 0.5, y1); }
  for (let y = y0; y <= y1; y += 32) { g.moveTo(x0, y + 0.5); g.lineTo(x1, y + 0.5); }
  g.stroke();
  /* 主网格微光 */
  const mx0 = Math.floor(camX / 160) * 160, my0 = Math.floor(camY / 160) * 160;
  g.strokeStyle = 'rgba(46,230,207,0.07)';
  g.beginPath();
  for (let x = mx0; x <= x1; x += 160) { g.moveTo(x + 0.5, y0); g.lineTo(x + 0.5, y1); }
  for (let y = my0; y <= y1; y += 160) { g.moveTo(x0, y + 0.5); g.lineTo(x1, y + 0.5); }
  g.stroke();
}

function drawProps(g, camX, camY) {
  const L = camX - 8, Rr = camX + VIEW_W + 8, T = camY - 8, B = camY + VIEW_H + 8;
  const pulse = 0.5 + 0.5 * Math.sin(G.time * 2.2);
  for (const pr of G.props) {
    if (pr.t === 'crack') {
      if (pr.cells[0][0] < L || pr.cells[0][0] > Rr) continue;
      g.fillStyle = '#05070c';
      for (const c of pr.cells) g.fillRect(c[0], c[1], 3, 3);
    } else if (pr.t === 'rubble') {
      if (pr.cells[0][0] < L || pr.cells[0][0] > Rr) continue;
      const cols = ['#20262f', '#2b3342', '#171c26'];
      for (const c of pr.cells) { g.fillStyle = cols[c[2]]; g.fillRect(c[0], c[1], 2, 2); }
    } else if (pr.t === 'shard') {
      if (pr.x < L || pr.x > Rr || pr.y < T || pr.y > B) continue;
      g.fillStyle = pr.c;
      g.fillRect(pr.x, pr.y, 2, 2);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.18 + 0.14 * Math.sin(G.time * 2 + pr.ph);
      g.fillStyle = pr.c;
      g.fillRect(pr.x - 3, pr.y - 3, 8, 8);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    } else if (pr.t === 'girder') {
      if (pr.x < L - 30 || pr.x > Rr + 30 || pr.y < T - 30 || pr.y > B + 30) continue;
      g.fillStyle = '#33261e';
      for (let i = 0; i < pr.len; i++) {
        if (i === pr.gap) continue;
        if (pr.dir === 0) g.fillRect(pr.x + i * 2, pr.y, 2, 4);
        else g.fillRect(pr.x, pr.y + i * 2, 4, 2);
      }
      g.fillStyle = '#4d382a';
      if (pr.dir === 0) { g.fillRect(pr.x, pr.y, 2, 4); g.fillRect(pr.x + pr.len * 2 - 2, pr.y, 2, 4); }
      else { g.fillRect(pr.x, pr.y, 4, 2); g.fillRect(pr.x, pr.y + pr.len * 2 - 2, 4, 2); }
    } else if (pr.t === 'pool') {
      if (pr.x < L || pr.x > Rr || pr.y < T || pr.y > B) continue;
      g.fillStyle = `rgba(${pr.c},${0.05 + 0.03 * pulse})`;
      g.fillRect(pr.x, pr.y, pr.w, pr.h);
      g.fillStyle = `rgba(${pr.c},0.22)`;
      g.fillRect(pr.x, pr.y, pr.w, 1);
    }
  }

  /* 世界边界：警戒霓虹栅栏 */
  g.save();
  g.strokeStyle = 'rgba(255,80,60,0.4)';
  g.lineWidth = 2;
  g.setLineDash([8, 6]);
  g.strokeRect(0, 0, WORLD_W, WORLD_H);
  g.restore();
  g.fillStyle = `rgba(77,240,226,${0.4 + 0.3 * pulse})`;
  for (const cx of [0, WORLD_W - 6]) for (const cy of [0, WORLD_H - 6]) g.fillRect(cx, cy, 6, 6);

  /* 环境余烬 */
  g.globalCompositeOperation = 'lighter';
  for (const em of G.embers) {
    if (em.x < L || em.x > Rr || em.y < T || em.y > B) continue;
    g.globalAlpha = 0.35 + 0.3 * Math.sin(G.time * 3 + em.ph);
    g.fillStyle = '#ffb054';
    g.fillRect(em.x, em.y, em.s < 0.8 ? 1 : 2, em.s < 0.8 ? 1 : 2);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawGems(g) {
  for (const gm of G.gems) {
    const ti = gemTier(gm.v);
    const spr = SPR.gem[ti];
    const bobY = Math.sin(gm.t * 3) * 1.5;
    g.drawImage(spr, Math.round(gm.x - 2.5), Math.round(gm.y - 2.5 + bobY));
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.22;
    g.drawImage(spr, Math.round(gm.x - 3.5), Math.round(gm.y - 3.5 + bobY), 7, 7);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
function drawHearts(g) {
  for (const h of G.hearts) {
    const bobY = Math.sin(h.t * 2.5) * 1.5;
    g.drawImage(SPR.heart, Math.round(h.x - 3.5), Math.round(h.y - 3 + bobY));
  }
}

function drawPlayer(g) {
  const p = G.player;
  if (p.dead) return;
  /* 无敌闪烁（冲刺残影除外） */
  if (p.invuln > 0 && p.dashT <= 0 && Math.floor(performance.now() / 1000 * 24) % 2 === 0) {
    /* 闪烁帧：仍绘制一个淡影，保证位置可读 */
    g.globalAlpha = 0.35;
  }
  const fi = p.moving || p.dashT > 0 ? Math.floor(p.anim) % 2 : 0;
  const spr = p.face < 0 ? SPR.player.fl[fi] : SPR.player.f[fi];
  const bob = p.moving ? 0 : Math.sin(G.time * 2.4) * 0.8;
  g.drawImage(spr, Math.round(p.x - 6), Math.round(p.y - 11 + bob));
  g.globalAlpha = 1;
  /* 枪口闪光 */
  if (p.muzzle > 0) {
    const tg = findTarget(340);
    if (tg) {
      const a = angTo(p.x, p.y, tg.x, tg.y);
      const mx = p.x + Math.cos(a) * 9, my = p.y - 3 + Math.sin(a) * 9;
      g.fillStyle = '#eafffb';
      g.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
      g.fillStyle = '#4df0e2';
      g.fillRect(Math.round(mx) - 2, Math.round(my), 1, 1);
      g.fillRect(Math.round(mx) + 2, Math.round(my), 1, 1);
    }
  }
}

function drawEnemy(g, e) {
  const S = SPR[e.type];
  const dist2Cam = dist2(e.x, e.y, G.cam.x + VIEW_W / 2, G.cam.y + VIEW_H / 2);
  if (dist2Cam > 460 * 460) return;
  const blink = (e.type === 'charger' && e.state === 'wind') || e.tele;
  const useWhite = e.flash > 0 || (blink && Math.floor(performance.now() / 90) % 2 === 0);
  let spr = e.elite ? S.gold : S.c;
  if (useWhite) spr = S.white;
  else if (e.fx < 0) spr = e.elite ? S.gold : S.fl;
  const scale = e.elite ? 2 : 1;
  const w = S.w * scale, h = S.h * scale;
  const bob = Math.sin(e.t * 5 + e.wob) * 1.2;
  g.drawImage(spr, Math.round(e.x - w / 2), Math.round(e.y - h / 2 + bob), w, h);
  /* 减速蓝染 */
  if (e.slow > 0 && !useWhite) {
    g.globalAlpha = 0.4;
    g.drawImage(S.white === spr ? S.c : tintTmp(g, S, e.type), Math.round(e.x - w / 2), Math.round(e.y - h / 2 + bob), w, h);
    g.globalAlpha = 1;
  }
  /* 精英王冠 */
  if (e.elite) g.drawImage(SPR.crown, Math.round(e.x - 5), Math.round(e.y - h / 2 + bob - 6));
  /* 冲锋预警方向 */
  if (e.type === 'charger' && e.state === 'wind') {
    g.save();
    g.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() / 60);
    g.strokeStyle = '#ff8c3a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(e.x + e.cx * 12, e.y + e.cy * 12);
    g.lineTo(e.x + e.cx * 54, e.y + e.cy * 54);
    g.stroke();
    g.restore();
  }
  /* 血条 */
  if (e.hp < e.maxhp) {
    const bw = Math.max(10, Math.round(e.r * 2));
    const frac = clamp(e.hp / e.maxhp, 0, 1);
    g.fillStyle = 'rgba(10,14,22,0.8)';
    g.fillRect(Math.round(e.x - bw / 2), Math.round(e.y - h / 2 + bob - 4), bw, 2);
    g.fillStyle = e.elite ? '#ffd23f' : '#ff5f9e';
    g.fillRect(Math.round(e.x - bw / 2), Math.round(e.y - h / 2 + bob - 4), Math.round(bw * frac), 2);
  }
}

/* 减速蓝罩的临时缓存 */
const TINT_CACHE = {};
function tintTmp(g, S, type) {
  if (!TINT_CACHE[type]) TINT_CACHE[type] = tintCopy(S.c, '#4d9dff');
  return TINT_CACHE[type];
}

function drawBoss(g, b) {
  const bob = Math.sin(b.wob * 2) * 3;
  const spr = b.which === 1 ? SPR.boss1 : (b.phase === 3 ? SPR.boss2Angry : SPR.boss2);
  const white = b.which === 1 ? SPR.boss1White : SPR.boss2White;
  const s = b.scale;
  const w = spr.width * s, h = spr.height * s;
  const bx = Math.round(b.x - w / 2), by = Math.round(b.y - h / 2 + bob);

  /* 阶段光环 */
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.16 + 0.08 * Math.sin(b.wob * 3);
  g.fillStyle = b.which === 1 ? '#57f2dd' : (b.phase === 3 ? '#e8452f' : '#ff8c3a');
  g.beginPath();
  g.arc(b.x, b.y + bob, b.r + 14, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  g.drawImage(spr, bx, by, w, h);
  if (b.flash > 0 || (b.dead && Math.floor(performance.now() / 70) % 2 === 0)) {
    g.globalAlpha = 0.85;
    g.drawImage(white, bx, by, w, h);
    g.globalAlpha = 1;
  }
  if (b.dead) {
    g.save();
    g.globalAlpha = clamp(b.deathT, 0, 1);
    g.restore();
  }
  /* 出生/免伤护盾 */
  if (b.invuln > 0 && !b.dead) {
    g.strokeStyle = 'rgba(77,240,226,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(b.x, b.y + bob, b.r + 6 + Math.sin(b.wob * 6), 0, TAU);
    g.stroke();
  }

  /* 攻击预警 */
  if (b.tele && !b.dead) {
    const tel = b.tele;
    const pr = tel.t / tel.dur;
    const flash = 0.4 + 0.5 * Math.sin(performance.now() / 55);
    g.save();
    if (tel.kind === 'ring' || tel.kind === 'nova') {
      g.strokeStyle = b.col;
      g.globalAlpha = flash;
      g.lineWidth = 2;
      g.beginPath();
      if (tel.kind === 'ring') g.arc(b.x, b.y, 26 + pr * 70, 0, TAU);
      else g.arc(b.x, b.y, 40 + pr * 190, 0, TAU);
      g.stroke();
      g.globalAlpha = flash * 0.25;
      g.fillStyle = b.col;
      g.beginPath();
      g.arc(b.x, b.y, b.r + 8, 0, TAU);
      g.fill();
    } else if (tel.kind === 'line') {
      g.globalAlpha = flash;
      g.strokeStyle = '#ff5f4d';
      g.lineWidth = 3;
      g.setLineDash([7, 5]);
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x + Math.cos(tel.ang) * 320, b.y + Math.sin(tel.ang) * 320);
      g.stroke();
    } else if (tel.kind === 'circle') {
      g.globalAlpha = flash * 0.4;
      g.fillStyle = '#8a4fd0';
      g.beginPath();
      g.arc(b.x, b.y, 44, 0, TAU);
      g.fill();
      g.globalAlpha = flash;
      g.strokeStyle = '#b07ff0';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(b.x, b.y, 44, 0, TAU);
      g.stroke();
    }
    g.restore();
  }
}

function drawDronesBlades(g) {
  const p = G.player;
  if (p.dead) return;
  /* 无人机 */
  for (const d of p.droneList) {
    const dx = p.x + Math.cos(p.droneA + d.off) * 22;
    const dy = p.y + Math.sin(p.droneA + d.off) * 22 + Math.sin(d.bob) * 2;
    g.fillStyle = '#3c4356';
    g.fillRect(Math.round(dx) - 3, Math.round(dy) - 2, 6, 4);
    g.fillStyle = '#ffb054';
    g.fillRect(Math.round(dx) - 1, Math.round(dy) - 1, 2, 2);
    g.fillStyle = 'rgba(77,240,226,0.5)';
    g.fillRect(Math.round(dx) - 4, Math.round(dy) - 3, 8, 1);
  }
  /* 环刃 */
  for (let i = 0; i < p.blades; i++) {
    const a = p.bladeA + (i / p.blades) * TAU;
    const bx = p.x + Math.cos(a) * 34, by = p.y + Math.sin(a) * 34;
    g.save();
    g.translate(Math.round(bx), Math.round(by));
    g.rotate(a + G.time * 10);
    g.fillStyle = '#eafffb';
    g.fillRect(-4, -1, 8, 2);
    g.fillStyle = '#4df0e2';
    g.fillRect(-2, -2, 4, 4);
    g.restore();
  }
}

function drawBullets(g) {
  for (const b of G.bullets) {
    const col = b.drone ? '#ffb054' : '#4df0e2';
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35;
    g.fillStyle = col;
    g.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 3, 6, 6);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = b.drone ? '#fff2df' : '#eafffb';
    g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
  }
}
function drawEBullets(g) {
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.3;
  for (const b of G.ebullets) {
    g.fillStyle = b.col;
    g.fillRect(Math.round(b.x) - 4, Math.round(b.y) - 4, 8, 8);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  for (const b of G.ebullets) {
    g.fillStyle = b.col;
    g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 5, 5);
    g.fillStyle = '#fff';
    g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
  }
}

function drawParticles(g) {
  for (const p of G.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.ghost) {
      g.globalAlpha = a * 0.6;
      g.drawImage(p.spr, Math.round(p.x - 6), Math.round(p.y - 11));
      g.globalAlpha = 1;
      continue;
    }
    if (p.glow) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a * 0.7;
      g.fillStyle = p.color;
      const s = Math.max(1, p.size * a);
      g.fillRect(Math.round(p.x - s), Math.round(p.y - s), Math.round(s * 2), Math.round(s * 2));
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    } else {
      g.globalAlpha = a;
      g.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size * (0.4 + a)));
      g.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      g.globalAlpha = 1;
    }
  }
}

function drawDnums(g) {
  for (const d of G.dnums) {
    const a = clamp(d.life / d.max, 0, 1);
    g.globalAlpha = a > 0.5 ? 1 : a * 2;
    drawPixText(g, d.txt, Math.round(d.x), Math.round(d.y), d.scale, d.color, 1);
    g.globalAlpha = 1;
  }
}

/* ============ 帧循环 ============ */
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  if (G.state === 'playing') {
    acc += dt;
    if (acc > 0.25) acc = 0.25;
    let n = 0;
    while (acc >= STEP && G.state === 'playing' && n < 5) {
      update(STEP);
      acc -= STEP;
      n++;
    }
    if (n >= 5) acc = 0;
  } else {
    acc = 0;
  }

  const musicOn = (G.state === 'playing' || G.state === 'levelup') && !G.player?.dead && G.winTimer <= 0;
  Sfx.updateMusic(musicOn ? (G.boss && !G.boss.dead ? 2 : 1) : 0);

  render();
  UI.updateHUD();
}
