/* 星烬：最后一夜 — 实体逻辑（玩家 / 敌人 / 首领 / 子弹 / 拾取 / 粒子） */
'use strict';

/* ================= 玩家 ================= */
function newPlayer() {
  return {
    x: WORLD_W / 2, y: WORLD_H / 2, r: 5.5,
    hp: PLAYER_BASE.hp, maxhp: PLAYER_BASE.hp,
    level: 1, xp: 0, xpNext: xpNext(1),
    dmgMul: 1, rateMul: 1, projectiles: 1, pierce: 0,
    critCh: PLAYER_BASE.crit, critMul: PLAYER_BASE.critMul,
    speedMul: 1, pickupR: PLAYER_BASE.pickupR, dashCdMul: 1,
    frostLv: 0, blades: 0, drones: 0, regen: 0,
    fireT: 0.25, muzzle: 0,
    dashT: 0, dashCd: 0, dashCdMax: PLAYER_BASE.dashCd, dashX: 1, dashY: 0,
    invuln: 1.2, dead: false, hurtT: 0,
    anim: 0, moving: false, face: 1,
    upLevels: {}, bladeA: 0, droneA: 0, droneList: [],
    kx: 0, ky: 0, ghostT: 0, regenAcc: 0,
  };
}

function updatePlayer(dt) {
  const p = G.player;
  if (!p || p.dead) return;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.muzzle > 0) p.muzzle -= dt;

  if (Input.consumeDash()) tryDash();

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.ghostT -= dt;
    if (p.ghostT <= 0) { addGhost(p); p.ghostT = 0.024; }
  }

  const ax = Input.axis.x, ay = Input.axis.y;
  p.moving = !!(ax || ay);
  let vx, vy;
  if (p.dashT > 0) { vx = p.dashX * PLAYER_BASE.dashSpd; vy = p.dashY * PLAYER_BASE.dashSpd; }
  else { vx = ax * PLAYER_BASE.speed * p.speedMul; vy = ay * PLAYER_BASE.speed * p.speedMul; }
  vx += p.kx; vy += p.ky;
  const kd = Math.pow(0.0008, dt);
  p.kx *= kd; p.ky *= kd;
  p.x = clamp(p.x + vx * dt, 8, WORLD_W - 8);
  p.y = clamp(p.y + vy * dt, 8, WORLD_H - 8);
  if (Math.abs(ax) > 0.1) p.face = ax < 0 ? -1 : 1;
  if (p.moving || p.dashT > 0) p.anim += dt * 9;

  /* 生命再生 */
  if (p.regen > 0 && p.hp < p.maxhp) {
    p.regenAcc += p.regen * dt;
    if (p.regenAcc >= 1) {
      const h = Math.min(p.maxhp - p.hp, Math.floor(p.regenAcc));
      if (h > 0) { p.hp += h; addDnum(p.x, p.y - 14, '+' + h, '#6dff7d'); }
      p.regenAcc -= h;
    }
  }

  fireMain(dt);
  updateBlades(dt);
  updateDrones(dt);
}

function tryDash() {
  const p = G.player;
  if (p.dashCd > 0 || p.dashT > 0 || p.dead) return;
  let dx = Input.axis.x, dy = Input.axis.y;
  if (!dx && !dy) { dx = Input.lastDir.x; dy = Input.lastDir.y; }
  const l = Math.hypot(dx, dy) || 1;
  p.dashX = dx / l; p.dashY = dy / l;
  p.dashT = PLAYER_BASE.dashTime;
  p.dashCdMax = PLAYER_BASE.dashCd * p.dashCdMul;
  p.dashCd = p.dashCdMax;
  p.invuln = Math.max(p.invuln, 0.26);
  Sfx.dash();
  addShake(1.2);
  addParts(p.x, p.y, '#4df0e2', 6, 70, 0.3, 2, true);
}

/* 找到射程内最近的敌人（含首领） */
function findTarget(range) {
  const p = G.player;
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (G.boss && !G.boss.dead) {
    const d = dist2(p.x, p.y, G.boss.x, G.boss.y);
    if (d < bd) { bd = d; best = G.boss; }
  }
  return best;
}

function fireMain(dt) {
  const p = G.player;
  p.fireT -= dt;
  if (p.fireT > 0) return;
  const tg = findTarget(340);
  if (!tg) { p.fireT = 0.08; return; }
  p.fireT = Math.max(0.07, PLAYER_BASE.fireCd / p.rateMul);
  p.muzzle = 0.06;
  const base = angTo(p.x, p.y, tg.x, tg.y);
  const n = p.projectiles;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.13;
    spawnBullet(
      p.x, p.y - 3,
      Math.cos(a) * PLAYER_BASE.bulletSpd, Math.sin(a) * PLAYER_BASE.bulletSpd,
      PLAYER_BASE.dmg * p.dmgMul,
      { pierce: p.pierce, frost: p.frostLv }
    );
  }
  Sfx.shoot();
}

/* —— 环绕旋刃 —— */
function updateBlades(dt) {
  const p = G.player;
  if (p.blades <= 0) return;
  p.bladeA += dt * 3.4;
  for (let i = 0; i < p.blades; i++) {
    const a = p.bladeA + (i / p.blades) * TAU;
    const bx = p.x + Math.cos(a) * 34, by = p.y + Math.sin(a) * 34;
    gridQuery(bx, by, 12, (e) => {
      if (e.bladeCd > 0 || e.dead) return;
      if (dist2(bx, by, e.x, e.y) < (e.r + 6) * (e.r + 6)) {
        e.bladeCd = 0.35;
        const crit = chance(p.critCh);
        damageEnemy(e, PLAYER_BASE.dmg * p.dmgMul * 0.8 * (crit ? p.critMul : 1) * rand(0.92, 1.08), { crit });
      }
    });
  }
}

/* —— 浮游无人机 —— */
function updateDrones(dt) {
  const p = G.player;
  while (p.droneList.length < p.drones) p.droneList.push({ off: p.droneList.length * TAU / Math.max(1, p.drones), fireT: rand(0.2, 0.9), bob: rand(0, TAU) });
  p.droneA += dt * 1.6;
  for (const d of p.droneList) {
    d.bob += dt * 5;
    d.fireT -= dt;
    if (d.fireT <= 0) {
      const dx = p.x + Math.cos(p.droneA + d.off) * 22, dy = p.y + Math.sin(p.droneA + d.off) * 22;
      const tg = findTarget(210);
      if (tg) {
        d.fireT = 1.15;
        const a = angTo(dx, dy, tg.x, tg.y);
        spawnBullet(dx, dy, Math.cos(a) * 380, Math.sin(a) * 380,
          PLAYER_BASE.dmg * p.dmgMul * 0.6, { pierce: 0, frost: p.frostLv, drone: true });
        Sfx.shoot();
      } else d.fireT = 0.15;
    }
  }
}

/* ================= 玩家子弹 ================= */
function spawnBullet(x, y, vx, vy, dmg, opts = {}) {
  if (G.bullets.length >= 160) G.bullets.shift();
  G.bullets.push({
    x, y, vx, vy, dmg, r: 3, life: 1.5,
    pierce: opts.pierce || 0, hit: [],
    frost: opts.frost || 0, drone: !!opts.drone,
  });
}

function updateBullets(dt) {
  const arr = G.bullets; let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life <= 0 || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) continue;
    let dead = false;
    gridQuery(b.x, b.y, 14, (e) => {
      if (dead || e.dead || b.hit.includes(e)) return;
      if (dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) * (e.r + b.r)) {
        b.hit.push(e);
        const p = G.player;
        const crit = chance(p.critCh);
        damageEnemy(e, b.dmg * (crit ? p.critMul : 1) * rand(0.92, 1.08), { crit, frost: b.frost, kx: b.vx * 0.05, ky: b.vy * 0.05 });
        if (b.hit.length > b.pierce) dead = true;
      }
    });
    if (!dead) arr[w++] = b;
  }
  arr.length = w;
}

/* ================= 敌方子弹 ================= */
function spawnEBullet(x, y, vx, vy, dmg, col) {
  if (G.ebullets.length >= 320) return;
  G.ebullets.push({ x, y, vx, vy, dmg, r: 4, life: 7, col: col || '#ff5f9e' });
}

function updateEBullets(dt) {
  const p = G.player;
  const arr = G.ebullets; let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life <= 0 || b.x < -20 || b.x > WORLD_W + 20 || b.y < -20 || b.y > WORLD_H + 20) continue;
    if (!p.dead && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) * (b.r + p.r)) {
      if (damagePlayer(b.dmg, b.x, b.y)) {
        addParts(b.x, b.y, b.col, 5, 80, 0.35, 2, true);
        continue; // 子弹消失
      }
    }
    arr[w++] = b;
  }
  arr.length = w;
}

/* ================= 敌人 ================= */
function makeEnemy(type, x, y, elite = false) {
  const d = EDEF[type];
  const hs = hpScale(G.time), ds = dmgScale(G.time), ss = spdScale(G.time);
  return {
    type, def: d, elite,
    x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: d.r * (elite ? 1.35 : 1),
    hp: d.hp * hs * (elite ? 4.5 : 1),
    maxhp: d.hp * hs * (elite ? 4.5 : 1),
    spd: d.spd * ss * (elite ? 1.08 : 1),
    dmg: d.dmg * ds * (elite ? 1.5 : 1),
    xp: d.xp * (elite ? 6 : 1),
    state: 'move', st: 0, cd: rand(0.5, 1.5),
    t: rand(0, 5), wob: rand(0, TAU), flash: 0, slow: 0, hb: 0,
    fireT: d.fireCd ? rand(1.2, 2.6) : 0, tele: false,
    bladeCd: 0, fx: 1, dead: false,
  };
}

function enemyShoot(e, nx, ny) {
  const spd = 150;
  spawnEBullet(e.x, e.y + 1, nx * spd, ny * spd, e.dmg * 0.85, '#ff5f9e');
  e.tele = false;
}

function updateEnemies(dt) {
  const p = G.player;
  const arr = G.enemies; let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead) continue;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slow > 0) e.slow -= dt;
    if (e.bladeCd > 0) e.bladeCd -= dt;
    const sf = e.slow > 0 ? Math.max(0.4, 1 - 0.26 * G.player.frostLv) : 1;

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    let mvx = 0, mvy = 0;

    switch (e.type) {
      case 'chaser': {
        const wob = Math.sin(e.t * 3 + e.wob) * 0.35;
        mvx = (nx + (-ny) * wob) * e.spd * sf;
        mvy = (ny + nx * wob) * e.spd * sf;
        break;
      }
      case 'shooter': {
        let approach = 0;
        if (d > 185) approach = 1; else if (d < 125) approach = -1;
        const tang = Math.sin(e.t * 1.3 + e.wob) > 0 ? 1 : -1;
        mvx = (nx * approach + (-ny) * tang * 0.55) * e.spd * sf;
        mvy = (ny * approach + nx * tang * 0.55) * e.spd * sf;
        e.fireT -= dt;
        e.tele = e.fireT < 0.32;
        if (e.fireT <= 0) {
          if (d < 560 && !p.dead) enemyShoot(e, nx, ny);
          e.fireT = e.def.fireCd + rand(0, 0.9);
        }
        break;
      }
      case 'charger': {
        e.cd -= dt;
        if (e.state === 'move') {
          mvx = nx * e.spd * sf; mvy = ny * e.spd * sf;
          if (d < 230 && e.cd <= 0 && !p.dead) { e.state = 'wind'; e.st = 0.65; e.cx = nx; e.cy = ny; }
        } else if (e.state === 'wind') {
          e.st -= dt;
          if (e.st > 0.2) { e.cx = nx; e.cy = ny; }
          if (e.st <= 0) { e.state = 'charge'; e.st = 0.5; }
        } else if (e.state === 'charge') {
          e.st -= dt;
          mvx = e.cx * 360; mvy = e.cy * 360;
          if (e.st <= 0) { e.state = 'tired'; e.st = 0.8; e.cd = 2.4; }
        } else { /* tired */
          e.st -= dt;
          if (e.st <= 0) e.state = 'move';
        }
        break;
      }
      case 'heavy': {
        mvx = nx * e.spd * sf; mvy = ny * e.spd * sf;
        break;
      }
    }

    e.vx = mvx + e.kx; e.vy = mvy + e.ky;
    const kd = Math.pow(0.001, dt);
    e.kx *= kd; e.ky *= kd;
    e.x = clamp(e.x + e.vx * dt, e.r, WORLD_W - e.r);
    e.y = clamp(e.y + e.vy * dt, e.r, WORLD_H - e.r);
    if (Math.abs(e.vx) > 2) e.fx = e.vx < 0 ? -1 : 1;

    /* 离玩家过远则传送回玩家附近（保持压迫感，避免实体无效堆积） */
    if (d > 950 && e.state !== 'charge') {
      const pos = edgeSpawnPos();
      e.x = pos.x; e.y = pos.y;
    }

    /* 接触伤害 */
    if (!p.dead && d < e.r + p.r + 2) {
      const mult = (e.type === 'charger' && e.state === 'charge') ? 1.25 : 1;
      damagePlayer(e.dmg * mult, e.x, e.y);
    }
    arr[w++] = e;
  }
  arr.length = w;

  /* 相互挤开，避免叠成一团 */
  for (const e of arr) {
    if (e.state === 'charge') continue;
    gridQuery(e.x, e.y, e.r + 14, (o) => {
      if (o === e || o.dead) return;
      const dx = o.x - e.x, dy = o.y - e.y;
      const rr = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / d * 0.5;
        const em = o.boss ? 0 : 1, om = e.boss ? 0 : 1;
        e.x -= dx * push * em; e.y -= dy * push * em;
        o.x += dx * push * om; o.y += dy * push * om;
      }
    });
  }
}

function damageEnemy(e, dmg, opts = {}) {
  if (e.dead) return;
  if (e.boss) { damageBoss(e, dmg, opts.crit); return; }
  e.hp -= dmg;
  e.flash = 0.08;
  if (opts.frost && !e.boss) e.slow = 1.2;
  if (opts.kx !== undefined && e.type !== 'heavy') {
    e.kx += opts.kx * (e.elite ? 0.4 : 1);
    e.ky += opts.ky * (e.elite ? 0.4 : 1);
  }
  addDnum(e.x, e.y - e.r - 4, String(Math.max(1, Math.round(dmg))), opts.crit ? '#ffd23f' : '#eafffb', opts.crit ? 2 : 1);
  addParts(e.x, e.y, opts.crit ? '#ffd23f' : '#bffcf4', opts.crit ? 6 : 3, 90, 0.3, 1.6);
  if (opts.crit) Sfx.crit(); else Sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  Sfx.die();
  addParts(e.x, e.y, e.elite ? '#ffd23f' : '#c95c9e', e.elite ? 18 : 10, 110, 0.55, 2.2);
  addParts(e.x, e.y, '#4df0e2', 4, 60, 0.4, 2, true);
  addShake(e.elite ? 3 : 0.6);
  spawnGem(e.x, e.y, e.xp);
  const heartCh = e.elite ? 1 : (e.type === 'heavy' ? 0.2 : 0.02);
  if (chance(heartCh)) spawnHeart(e.x + rand(-6, 6), e.y + rand(-6, 6));
}

/* ================= 首领 ================= */
function makeBoss(which) {
  const def = BOSSDEFS[which];
  const scale = bossHpScale(G.time);
  const p = G.player;
  /* 出生点：玩家朝世界中心方向偏移 */
  const cx = WORLD_W / 2, cy = WORLD_H / 2;
  let a = angTo(p.x, p.y, cx, cy) + rand(-0.6, 0.6);
  let bx = clamp(p.x + Math.cos(a) * 240, 60, WORLD_W - 60);
  let by = clamp(p.y + Math.sin(a) * 240, 60, WORLD_H - 60);
  if (which === 1 && G.boss && !G.boss.dead && G.boss.which === 1) return null;
  return {
    boss: true, which, name: def.name,
    x: bx, y: by, r: def.r, scale: def.scale, col: def.col,
    hp: def.hp * scale, maxhp: def.hp * scale,
    contact: def.contact, spd: def.spd,
    phase: 1, state: 'enter', t: 1.1, invuln: 1.4,
    flash: 0, atk: null, tele: null, cd: 1.2, cdMul: 1,
    lastAtk: '', wob: rand(0, TAU), aliveTime: 0, enraged: false,
    bladeCd: 0, slow: 0, dead: false, deathT: 0, fx: 1,
  };
}

function summonBoss(which) {
  /* 若上一个首领还活着，由新首领将其吞噬（罕见边界情况） */
  if (which === 2 && G.boss && !G.boss.dead && G.boss.which === 1) {
    killBoss(G.boss, true);
  }
  const b = makeBoss(which);
  if (!b) return null;
  G.boss = b;
  addParts(b.x, b.y, b.col, 26, 150, 0.8, 3, true);
  addShake(8);
  UI.announce(b.name, which === 1 ? '首领战 开始' : '最终决战', '#ffb054');
  return b;
}

function bossPhaseUp(b, phase) {
  b.phase = phase;
  b.invuln = 1.2;
  b.cdMul = [1, 1, 0.8, 0.62][phase];
  /* 清空弹幕变为火花，给玩家喘息 */
  for (const eb of G.ebullets) addParts(eb.x, eb.y, '#ffd23f', 3, 60, 0.4, 1.6, true);
  G.ebullets.length = 0;
  addParts(b.x, b.y, '#e8452f', 30, 200, 0.9, 3, true);
  addShake(11);
  Sfx.bossWarn();
  UI.announce('星烬主宰', `第 ${phase} 阶段 —— 灼热升腾`, '#ff5f4d');
}

function chooseBossAttack(b) {
  let list;
  if (b.which === 1) {
    list = b.enraged ? ['ring', 'ring', 'fan', 'fan', 'summon'] : ['ring', 'fan', 'summon'];
  } else {
    if (b.phase === 1) list = ['ring', 'fan', 'charge'];
    else if (b.phase === 2) list = ['ring', 'fan', 'charge', 'spiral', 'summon'];
    else list = ['nova', 'spiral', 'charge', 'ring', 'fan', 'summon'];
  }
  let type = pick(list);
  if (type === b.lastAtk && list.length > 1) type = pick(list);
  b.lastAtk = type;

  const teleDur = { ring: 0.9, fan: 0.85, summon: 0.9, charge: 0.85, spiral: 0.9, nova: 1.0 }[type];
  const kind = (type === 'fan' || type === 'charge') ? 'line' : (type === 'summon' ? 'circle' : (type === 'nova' ? 'nova' : 'ring'));
  b.tele = { kind, t: 0, dur: teleDur, ang: angTo(b.x, b.y, G.player.x, G.player.y) };
  b.state = 'tele';
  b.atk = { type };
  Sfx.tone(180, 0.25, { type: 'square', vol: 0.07, slide: 90 });
}

function startAttack(b) {
  const t = b.atk.type;
  if (t === 'ring') Object.assign(b.atk, { waves: b.which === 2 && b.phase === 3 ? 3 : 2, w: 0, t: -0.1 });
  else if (t === 'fan') Object.assign(b.atk, { volleys: 3, v: 0, t: -0.05 });
  else if (t === 'summon') {
    const list = b.which === 1 ? ['chaser', 'chaser', 'chaser']
      : b.phase === 3 ? ['charger', 'charger', 'shooter', 'shooter'] : ['charger', 'charger', 'charger'];
    for (const ty of list) {
      const e = makeEnemy(ty, clamp(b.x + rand(-50, 50), 20, WORLD_W - 20), clamp(b.y + rand(-50, 50), 20, WORLD_H - 20), false);
      G.enemies.push(e);
      addParts(e.x, e.y, '#8a4fd0', 8, 90, 0.5, 2, true);
    }
    Sfx.tone(140, 0.3, { type: 'square', vol: 0.08, slide: 280 });
    endAttack(b); return;
  }
  else if (t === 'charge') {
    const a = angTo(b.x, b.y, G.player.x, G.player.y);
    Object.assign(b.atk, { t: 0.55, dx: Math.cos(a), dy: Math.sin(a), trail: 0 });
  }
  else if (t === 'spiral') Object.assign(b.atk, { t: 2.6, a: rand(0, TAU), emit: 0 });
  else if (t === 'nova') Object.assign(b.atk, { rings: 3, ri: 0, t: -0.05, gap: Math.floor(rand(0, 20)) });
}

function endAttack(b) {
  b.state = 'idle';
  const base = b.which === 1 ? 1.7 : 1.5;
  let cd = base * b.cdMul;
  if (b.which === 1 && b.enraged) cd *= 0.7;
  if (b.aliveTime > 75) cd *= 0.75;
  b.cd = cd;
}

function runAttack(b, dt) {
  const p = G.player;
  const spdMul = (b.which === 2 && b.phase === 3) ? 1.1 : 1;
  const t = b.atk.type;
  if (t === 'ring') {
    b.atk.t += dt;
    if (b.atk.t >= 0) {
      const count = 14 + (b.which === 2 ? b.phase * 2 : (b.enraged ? 4 : 0));
      const off = b.atk.w * 0.22;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + off;
        const spd = (115 + b.phase * 8) * spdMul;
        spawnEBullet(b.x, b.y, Math.cos(a) * spd, Math.sin(a) * spd, b.which === 1 ? 12 : 13, b.which === 1 ? '#57f2dd' : '#ffb054');
      }
      Sfx.tone(320, 0.12, { type: 'square', vol: 0.07, slide: 160 });
      addShake(2);
      b.atk.w++; b.atk.t = -0.55;
      if (b.atk.w >= b.atk.waves) endAttack(b);
    }
  } else if (t === 'fan') {
    b.atk.t += dt;
    if (b.atk.t >= 0) {
      const a0 = angTo(b.x, b.y, p.x, p.y);
      const n = b.which === 2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.16;
        const spd = 175 * spdMul;
        spawnEBullet(b.x, b.y, Math.cos(a) * spd, Math.sin(a) * spd, b.which === 1 ? 12 : 14, b.which === 1 ? '#57f2dd' : '#ffb054');
      }
      Sfx.tone(280, 0.1, { type: 'sawtooth', vol: 0.07, slide: 140 });
      b.atk.v++; b.atk.t = -0.28;
      if (b.atk.v >= b.atk.volleys) endAttack(b);
    }
  } else if (t === 'charge') {
    b.atk.t -= dt;
    b.x += b.atk.dx * 430 * dt;
    b.y += b.atk.dy * 430 * dt;
    b.atk.trail -= dt;
    if (b.atk.trail <= 0) {
      b.atk.trail = 0.05;
      addParts(b.x, b.y, '#e8452f', 3, 40, 0.4, 2, true);
    }
    if (b.atk.t <= 0) {
      if (b.which === 2) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          spawnEBullet(b.x, b.y, Math.cos(a) * 130, Math.sin(a) * 130, 14, '#ffb054');
        }
      }
      addShake(4);
      endAttack(b);
    }
  } else if (t === 'spiral') {
    b.atk.t -= dt;
    b.atk.emit -= dt;
    if (b.atk.emit <= 0) {
      b.atk.emit = 0.11;
      const arms = b.phase === 3 ? 4 : 2;
      for (let i = 0; i < arms; i++) {
        const a = b.atk.a + (i / arms) * TAU;
        spawnEBullet(b.x, b.y, Math.cos(a) * 128, Math.sin(a) * 128, 14, '#ff7ad9');
      }
      b.atk.a += 0.55;
    }
    if (b.atk.t <= 0) endAttack(b);
  } else if (t === 'nova') {
    b.atk.t += dt;
    if (b.atk.t >= 0) {
      const count = 20;
      const gap = (b.atk.gap + b.atk.ri * 5) % count;
      for (let i = 0; i < count; i++) {
        if (i === gap || i === (gap + 1) % count) continue; // 留出可躲避缺口
        const a = (i / count) * TAU;
        spawnEBullet(b.x, b.y, Math.cos(a) * 95, Math.sin(a) * 95, 15, '#e8452f');
      }
      Sfx.tone(150, 0.2, { type: 'sawtooth', vol: 0.09, slide: 60 });
      addShake(3);
      b.atk.ri++; b.atk.t = -0.55;
      if (b.atk.ri >= b.atk.rings) endAttack(b);
    }
  }
}

function updateBoss(dt) {
  const b = G.boss;
  if (!b) return;
  if (b.dead) { b.deathT -= dt; if (b.deathT <= 0) G.boss = null; return; }
  const p = G.player;
  b.aliveTime += dt; b.wob += dt;
  if (b.flash > 0) b.flash -= dt;
  if (b.invuln > 0) b.invuln -= dt;
  if (b.bladeCd > 0) b.bladeCd -= dt;

  /* 阶段切换（最终首领） */
  if (b.which === 2) {
    const frac = b.hp / b.maxhp;
    const want = frac <= 1 / 3 ? 3 : frac <= 2 / 3 ? 2 : 1;
    if (want > b.phase) bossPhaseUp(b, want);
  }
  /* 中期首领狂暴 */
  if (b.which === 1 && !b.enraged && b.hp < b.maxhp * 0.35) {
    b.enraged = true;
    addShake(6);
    Sfx.bossWarn();
    UI.announce('残响巨像', '核心过载 —— 攻击加速', '#57f2dd');
  }

  const dx = p.x - b.x, dy = p.y - b.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;

  switch (b.state) {
    case 'enter':
      b.t -= dt;
      b.x += nx * b.spd * dt; b.y += ny * b.spd * dt;
      if (b.t <= 0) { b.state = 'idle'; b.cd = 1.0; }
      break;
    case 'idle': {
      const mv = d > 160 ? 1 : d < 110 ? -0.4 : 0;
      const tang = Math.sin(b.wob * 0.7) > 0 ? 1 : -1;
      b.x += (nx * mv + (-ny) * tang * 0.5) * b.spd * dt;
      b.y += (ny * mv + nx * tang * 0.5) * b.spd * dt;
      b.cd -= dt;
      if (b.cd <= 0 && !p.dead) chooseBossAttack(b);
      break;
    }
    case 'tele':
      b.tele.t += dt;
      if (b.tele.kind === 'line' && b.tele.t < b.tele.dur * 0.6) {
        b.tele.ang = angTo(b.x, b.y, p.x, p.y);
      }
      if (b.tele.t >= b.tele.dur) { b.tele = null; b.state = 'act'; startAttack(b); }
      break;
    case 'act':
      runAttack(b, dt);
      break;
  }

  b.x = clamp(b.x, b.r, WORLD_W - b.r);
  b.y = clamp(b.y, b.r, WORLD_H - b.r);
  if (Math.abs(dx) > 4) b.fx = dx > 0 ? 1 : -1;

  /* 接触伤害 */
  if (!p.dead && d < b.r + p.r) damagePlayer(b.contact, b.x, b.y);
}

function damageBoss(b, dmg, crit) {
  if (b.dead) return;
  if (b.invuln > 0) {
    addDnum(b.x + rand(-8, 8), b.y - b.r, '!', '#8fd6ff', 1);
    addParts(b.x + rand(-10, 10), b.y + rand(-10, 10), '#8fd6ff', 2, 50, 0.25, 1.5);
    return;
  }
  b.hp -= dmg;
  b.flash = 0.1;
  addDnum(b.x + rand(-10, 10), b.y - b.r - 6, String(Math.max(1, Math.round(dmg))), crit ? '#ffd23f' : '#eafffb', crit ? 2 : 1);
  if (crit) Sfx.crit(); else Sfx.hit();
  addShake(crit ? 1.6 : 0.5);
  if (b.hp <= 0) killBoss(b, false);
}

function killBoss(b, eaten) {
  if (b.dead) return;
  b.dead = true;
  b.deathT = eaten ? 0.4 : 1.0;
  G.kills++;
  G.bossKills++;
  addShake(14);
  Sfx.bossDie();
  for (let i = 0; i < 4; i++) addParts(b.x + rand(-20, 20), b.y + rand(-20, 20), i % 2 ? b.col : '#fff', 14, 170, 0.9, 3, true);
  if (eaten) return;
  /* 掉落：一圈经验晶体 + 生命 */
  const n = b.which === 2 ? 12 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    spawnGem(b.x + Math.cos(a) * 26, b.y + Math.sin(a) * 26, 6);
  }
  spawnHeart(b.x - 14, b.y); spawnHeart(b.x + 14, b.y);
  if (b.which === 2) {
    /* 最终首领被击败：清场并进入胜利演出 */
    for (const e of G.enemies) if (!e.dead) { e.dead = true; addParts(e.x, e.y, '#ff7ad9', 8, 100, 0.6, 2); }
    G.enemies.length = 0;
    for (const eb of G.ebullets) addParts(eb.x, eb.y, '#ffd23f', 2, 50, 0.35, 1.5, true);
    G.ebullets.length = 0;
    G.winTimer = 2.6;
    G.timeScale = 0.35;
    UI.announce('星烬主宰 陨落', '黎明将至……', '#ffd23f');
  } else {
    UI.announce('残响巨像 已消灭', '掉落了大量星尘', '#57f2dd');
  }
}

/* ================= 伤害与死亡 ================= */
function damagePlayer(amount, sx, sy) {
  const p = G.player;
  if (!p || p.dead || p.invuln > 0 || p.dashT > 0) return false;
  p.hp -= amount;
  p.invuln = PLAYER_BASE.invuln;
  p.hurtT = 0.3;
  Sfx.hurt();
  addShake(5);
  addDnum(p.x, p.y - 14, '-' + Math.max(1, Math.round(amount)), '#ff5f4d', 2);
  addParts(p.x, p.y, '#ff5f4d', 8, 110, 0.4, 2);
  /* 击退 */
  if (sx !== undefined) {
    const a = angTo(sx, sy, p.x, p.y);
    p.kx += Math.cos(a) * 150; p.ky += Math.sin(a) * 150;
  }
  if (p.hp <= 0) playerDie();
  return true;
}

function playerDie() {
  const p = G.player;
  p.dead = true;
  p.hp = 0;
  G.deathTimer = 1.6;
  addShake(12);
  Sfx.gameover();
  addParts(p.x, p.y, '#4df0e2', 26, 170, 1.0, 3, true);
  addParts(p.x, p.y, '#eafffb', 12, 120, 0.8, 2);
}

/* ================= 拾取物 ================= */
function spawnGem(x, y, v) {
  v = Math.max(1, Math.round(v));
  if (G.gems.length >= 240) { G.gems[0].v += v; return; } // 合并最旧的晶体
  G.gems.push({ x, y, v, t: rand(0, TAU), vac: false, vt: 0 });
}
function spawnHeart(x, y) {
  if (G.hearts.length >= 20) return;
  G.hearts.push({ x, y, t: rand(0, TAU) });
}

function addXP(v) {
  const p = G.player;
  p.xp += v;
  Sfx.gem();
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpNext(p.level);
    G.pendingLevels++;
    addParts(p.x, p.y, '#4df0e2', 14, 120, 0.6, 2, true);
  }
  if (G.pendingLevels > 0 && G.state === 'playing') UI.openLevelUp();
}

function updateGems(dt) {
  const p = G.player;
  const arr = G.gems; let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const g = arr[i];
    g.t += dt;
    const dx = p.x - g.x, dy = p.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!p.dead && d < 14) {
      addXP(g.v);
      addParts(g.x, g.y, '#4df0e2', 2, 50, 0.25, 1.5, true);
      continue;
    }
    if (!p.dead && d < p.pickupR) g.vac = true;
    if (g.vac) {
      g.vt += dt;
      const spd = Math.min(620, 200 + g.vt * 1100);
      g.x += (dx / d) * spd * dt;
      g.y += (dy / d) * spd * dt;
    }
    arr[w++] = g;
  }
  arr.length = w;
}

function updateHearts(dt) {
  const p = G.player;
  const arr = G.hearts; let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const h = arr[i];
    h.t += dt;
    if (!p.dead && dist2(p.x, p.y, h.x, h.y) < 16 * 16) {
      if (p.hp < p.maxhp) {
        p.hp = Math.min(p.maxhp, p.hp + 25);
        addDnum(p.x, p.y - 14, '+25', '#6dff7d', 2);
        Sfx.heart();
        addParts(h.x, h.y, '#ff4d6b', 6, 80, 0.4, 2, true);
        continue;
      }
    }
    arr[w++] = h;
  }
  arr.length = w;
}

/* ================= 粒子与伤害数字 ================= */
function addParts(x, y, color, n, spd = 90, life = 0.5, size = 2, glow = false) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length >= 520) return;
    const a = rand(0, TAU), s = rand(0.3, 1) * spd;
    G.parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.6, 1) * life, max: life,
      color, size: rand(0.6, 1.2) * size, glow,
    });
  }
}
function addGhost(p) {
  if (G.parts.length >= 520) return;
  const fi = Math.floor(p.anim) % 2;
  G.parts.push({
    ghost: true,
    spr: p.face < 0 ? SPR.player.ghostFl[fi] : SPR.player.ghost[fi],
    x: p.x, y: p.y, life: 0.26, max: 0.26,
  });
}
function addDnum(x, y, txt, color, scale = 1) {
  if (G.dnums.length >= 70) G.dnums.shift();
  G.dnums.push({ x: x + rand(-4, 4), y, vy: -36, life: 0.75, max: 0.75, txt, color, scale });
}

function updateParts(dt) {
  const arr = G.parts; let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (!p.ghost) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const dr = Math.pow(0.02, dt);
      p.vx *= dr; p.vy *= dr;
    }
    arr[w++] = p;
  }
  arr.length = w;

  const dn = G.dnums; let dw = 0;
  for (let i = 0; i < dn.length; i++) {
    const d = dn[i];
    d.life -= dt;
    if (d.life <= 0) continue;
    d.y += d.vy * dt;
    d.vy *= Math.pow(0.05, dt);
    dn[dw++] = d;
  }
  dn.length = dw;
}
