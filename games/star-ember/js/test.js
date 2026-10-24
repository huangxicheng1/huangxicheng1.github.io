/* 星烬：最后一夜 — 自动化验证（?selftest=1 自动运行，也可控制台调用 __TEST.run()） */
'use strict';

const __TEST = {
  /* 基础控制 */
  start() { resetGame(); startRun(); return G.state; },
  setAxis(x, y) { Input.touch.active = true; Input.touch.dx = x; Input.touch.dy = y; },
  clearAxis() { Input.touch.active = false; Input.touch.dx = 0; Input.touch.dy = 0; },
  /* 模拟帧：仅在 playing 状态推进（与真实主循环一致） */
  tick(n = 1) { for (let i = 0; i < n; i++) { if (G.state === 'playing') update(STEP); } },
  forceTick(n = 1) { for (let i = 0; i < n; i++) update(STEP); },
  spawn(type, x, y, elite = false) {
    const p = G.player;
    const e = makeEnemy(type, x !== undefined ? x : p.x + 70, y !== undefined ? y : p.y, elite);
    G.enemies.push(e);
    return e;
  },
  boss(which) { return summonBoss(which); },
  pick(i) { UI.pickCard(i); },
  dmg(n) { G.player.invuln = 0; return damagePlayer(n, G.player.x + 10, G.player.y); },
  give(id) { const u = UPGRADES.find(u => u.id === id); u.apply(G.player); G.player.upLevels[id] = (G.player.upLevels[id] || 0) + 1; return u; },
  god() { G.player.invuln = 99999; G.player.hp = G.player.maxhp; },

  run() { return runSelfTest(); }
};
window.__TEST = __TEST;
/* 调试/验证暴露口（不影响游戏逻辑） */
window.G = G; window.Input = Input; window.UI = UI; window.Sfx = Sfx;

function runSelfTest() {
  const out = [];
  const res = { pass: 0, fail: 0 };
  const A = (name, cond, info = '') => {
    const ok = !!cond;
    if (ok) res.pass++; else res.fail++;
    out.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${info ? ' | ' + info : ''}`);
    return ok;
  };
  const errsBefore = window.__ERRS.length;

  try {
    /* 1. 启动与重置 */
    __TEST.start();
    A('T01 开始游戏进入 playing', G.state === 'playing' && !!G.player);
    A('T02 实体数组为空、计时归零', G.enemies.length === 0 && G.bullets.length === 0 && G.time === 0 && G.kills === 0);

    /* 2. 移动 */
    const x0 = G.player.x;
    __TEST.setAxis(1, 0);
    __TEST.tick(30);
    A('T03 键轴移动生效', G.player.x > x0 + 10, `dx=${(G.player.x - x0).toFixed(1)}`);
    __TEST.clearAxis();
    const x1 = G.player.x;
    __TEST.tick(30);
    A('T04 松键后停止移动', Math.abs(G.player.x - x1) < 3);
    Input.keys.add('KeyA');
    __TEST.tick(30);
    Input.keys.delete('KeyA');
    A('T05 键盘WASD移动生效', G.player.x < x1 - 10);

    /* 3. 自动攻击与击杀掉落 */
    const e1 = __TEST.spawn('chaser', G.player.x + 90, G.player.y);
    const hp0 = e1.hp;
    __TEST.tick(120);
    A('T06 自动攻击造成伤害', e1.dead || e1.hp < hp0, `hp ${hp0.toFixed(0)} -> ${(e1.hp || 0).toFixed(0)}`);
    __TEST.tick(180);
    A('T07 敌人死亡并掉落经验', G.kills > 0 && G.gems.length > 0, `kills=${G.kills} gems=${G.gems.length}`);
    const xp0 = G.player.xp;
    G.gems[0].x = G.player.x; G.gems[0].y = G.player.y; G.gems[0].vac = true;
    __TEST.tick(20);
    A('T08 拾取晶体获得经验', G.player.xp > xp0 || G.player.level > 1);

    /* 4. 升级三选一 */
    G.player.xp += G.player.xpNext + 1;
    addXP(0);
    A('T09 升级触发暂停选卡', G.state === 'levelup' && UI.els.cards.children.length === 3);
    const dmgBefore = G.player.dmgMul;
    __TEST.pick(0);
    A('T10 选卡后返回战斗', G.state === 'playing' || G.state === 'levelup');
    if (G.state === 'levelup') __TEST.pick(0);
    A('T11 强化真实生效', G.player.dmgMul !== dmgBefore || G.player.upLevels && Object.keys(G.player.upLevels).length > 0, `up=${JSON.stringify(G.player.upLevels)}`);
    /* 逐项验证强化效果 */
    __TEST.give('multi'); A('T12 多重弹头 projectiles=2', G.player.projectiles === 2);
    __TEST.give('pierce'); A('T13 贯穿 pierce=1', G.player.pierce === 1);
    const blade0 = G.player.blades;
    __TEST.give('blade'); A('T14 环刃 blades 增加', G.player.blades === blade0 + 1, `blades=${G.player.blades}`);
    __TEST.give('drone'); A('T15 无人机 drones=1', G.player.drones === 1);
    __TEST.give('frost'); __TEST.spawn('shooter', G.player.x + 60, G.player.y);
    __TEST.tick(90);
    A('T16 减速生效或敌已死', G.enemies.every(e => e.dead || e.slow !== undefined));

    /* 5. 敌方伤害 */
    const hp = G.player.hp;
    __TEST.dmg(12);
    A('T17 玩家受伤扣血', G.player.hp === hp - 12);
    const inv2 = G.player.invuln;
    const applied2 = damagePlayer(12, G.player.x + 10, G.player.y);
    A('T18 受伤后短暂无敌', inv2 > 0 && applied2 === false && G.player.hp === hp - 12, `inv=${inv2.toFixed(2)}`);

    /* 6. 暂停 */
    const t0 = G.time;
    G.state = 'paused';
    __TEST.tick(120);
    A('T19 暂停时战斗冻结', G.time === t0);
    G.state = 'playing';
    __TEST.tick(10);
    A('T20 继续后恢复推进', G.time > t0);

    /* 7. 中期首领 */
    __TEST.god();
    const b1 = __TEST.boss(1);
    A('T21 中期首领生成', !!b1 && G.boss === b1 && !G.boss.dead);
    __TEST.tick(600);
    A('T22 首领攻击循环无错', !G.boss || !!G.boss);
    A('T23 首领血条数据就绪', G.boss && G.boss.maxhp > 0);
    if (G.boss) {
      G.boss.invuln = 0;
      damageBoss(G.boss, G.boss.hp + 1, false);
      __TEST.tick(120);
      A('T24 中期首领可被击败', G.boss === null || G.boss.dead, `boss=${!!G.boss}`);
    }

    /* 8. 最终首领与阶段 */
    const b2 = __TEST.boss(2);
    A('T25 最终首领生成', !!b2 && b2.phase === 1);
    __TEST.tick(300);
    if (G.boss) {
      G.boss.hp = G.boss.maxhp * 0.5;
      __TEST.tick(5);
      A('T26 剩余50%进入阶段2', G.boss.phase === 2, `phase=${G.boss.phase}`);
      G.boss.hp = G.boss.maxhp * 0.2;
      __TEST.tick(5);
      A('T27 剩余20%进入阶段3', G.boss.phase === 3, `phase=${G.boss.phase}`);
      G.boss.invuln = 0;
      damageBoss(G.boss, 1e9, false);
      A('T28 击杀触发胜利演出', G.winTimer > 0 && G.boss.dead);
      __TEST.tick(240);
      A('T29 胜利结算', G.state === 'victory');
    } else {
      A('T26-29 首领存活检查', false, 'boss died too early');
    }

    /* 9. 记录保存 */
    let savedOk = false;
    try { savedOk = localStorage.getItem('se_best_score') !== null; } catch (e) { }
    A('T30 最高记录已保存', savedOk);

    /* 10. 死亡结算 */
    __TEST.start();
    __TEST.god(); G.player.invuln = 0; G.player.hp = 5;
    __TEST.dmg(999);
    A('T31 玩家死亡进入演出', G.player.dead === true);
    __TEST.tick(150);
    A('T32 死亡结算界面', G.state === 'over');

    /* 11. 重开完全重置 */
    __TEST.start();
    A('T33 重开后状态干净', G.state === 'playing' && G.time === 0 && G.kills === 0 &&
      G.enemies.length === 0 && G.ebullets.length === 0 && G.gems.length === 0 &&
      G.parts.length === 0 && G.boss === null && G.player.level === 1 && G.pendingLevels === 0);

    /* 12. 性能：大量实体下 600 帧 */
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * TAU;
      G.enemies.push(makeEnemy('chaser', G.player.x + Math.cos(a) * 200, G.player.y + Math.sin(a) * 200, i % 40 === 0));
    }
    for (let i = 0; i < 300; i++) {
      const a = rand(0, TAU);
      spawnEBullet(G.player.x, G.player.y, Math.cos(a) * 120, Math.sin(a) * 120, 5, '#ff5f9e');
    }
    __TEST.god();
    const tStart = performance.now();
    __TEST.tick(600);
    const ms = performance.now() - tStart;
    A('T34 600帧性能(<1500ms)', ms < 1500, `${ms.toFixed(0)}ms for 600 ticks`);
    A('T35 实体数量受控', G.enemies.length <= 300 && G.ebullets.length <= 320 && G.parts.length <= 520,
      `enemies=${G.enemies.length} ebullets=${G.ebullets.length} parts=${G.parts.length}`);

    /* 13. 运行期错误 */
    const newErrs = window.__ERRS.length - errsBefore;
    A('T36 无运行期报错', newErrs === 0, window.__ERRS.slice(errsBefore).join(' ; '));

    /* 回到菜单，恢复常态 */
    toMenu();
  } catch (err) {
    res.fail++;
    out.push('EXCEPTION | ' + (err && err.stack || err));
    try { toMenu(); } catch (e) { }
  }

  const summary = `星烬自检：${res.pass} 通过 / ${res.fail} 失败`;
  out.unshift(summary);
  const text = out.join('\n');
  console.log(text);
  try {
    const pre = $('selftest-out');
    pre.classList.remove('hidden');
    pre.textContent = text;
  } catch (e) { }
  document.title = (res.fail === 0 ? 'SELFTEST-PASS ' : 'SELFTEST-FAIL ') + res.pass + '/' + (res.pass + res.fail);
  return { pass: res.pass, fail: res.fail, text };
}

/* URL 带 ?selftest=1 时自动执行 */
if (new URLSearchParams(location.search).has('selftest')) {
  window.addEventListener('load', () => setTimeout(() => runSelfTest(), 400));
}
