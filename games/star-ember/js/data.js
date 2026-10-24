/* 星烬：最后一夜 — 数值与内容配置 */
'use strict';

const PLAYER_BASE = {
  hp: 100, speed: 150, dmg: 12, fireCd: 0.5, bulletSpd: 430,
  crit: 0.05, critMul: 2, pickupR: 55,
  dashCd: 2.2, dashTime: 0.16, dashSpd: 520, invuln: 0.8,
};

/* 敌人强度随时间成长 */
const hpScale = (t) => 1 + (t / 60) * 0.32 + Math.pow(t / 60, 2) * 0.035;
const dmgScale = (t) => 1 + (t / 60) * 0.10;
const spdScale = (t) => 1 + Math.min(0.4, (t / 60) * 0.035);
const enemyCap = (t) => 130 + Math.min(90, Math.floor(t / 60) * 10);

const EDEF = {
  chaser:  { hp: 20,  spd: 46, dmg: 8,  r: 6,  xp: 1, fireCd: 0 },
  shooter: { hp: 26,  spd: 34, dmg: 6,  r: 6,  xp: 2, fireCd: 2.6 },
  charger: { hp: 34,  spd: 42, dmg: 13, r: 7,  xp: 3, fireCd: 0 },
  heavy:   { hp: 130, spd: 17, dmg: 18, r: 11, xp: 6, fireCd: 0 },
};

/* 出怪波次（t 秒；w 为权重；iv 生成间隔；burst 每次数目） */
const WAVES = [
  { t: 0,   w: { chaser: 1 },                              iv: 1.7,  burst: 1 },
  { t: 35,  w: { chaser: 1 },                              iv: 1.35, burst: 2 },
  { t: 75,  w: { chaser: 5, shooter: 1 },                  iv: 1.3,  burst: 2 },
  { t: 120, w: { chaser: 4, shooter: 2 },                  iv: 1.25, burst: 3 },
  { t: 165, w: { chaser: 4, shooter: 2, charger: 1 },      iv: 1.3,  burst: 3 },
  { t: 225, w: { chaser: 3, shooter: 2, charger: 2, heavy: 1 }, iv: 1.35, burst: 3 },
  { t: 285, w: { chaser: 3, shooter: 2, charger: 2, heavy: 1 }, iv: 1.5,  burst: 3 },
  { t: 360, w: { chaser: 2, shooter: 3, charger: 2, heavy: 2 }, iv: 1.3,  burst: 4 },
  { t: 450, w: { chaser: 2, shooter: 3, charger: 3, heavy: 2 }, iv: 1.2,  burst: 4 },
  { t: 555, w: { chaser: 2, shooter: 2, charger: 3, heavy: 2 }, iv: 1.4,  burst: 3 },
];
/* 精英出现时间点 */
const ELITE_TIMES = [130, 225, 330, 430, 515, 585];
const BOSS1_TIME = 270, BOSS2_TIME = 540;

const BOSSDEFS = {
  1: { name: '残响巨像', hp: 1500, r: 26, spd: 30, contact: 20, scale: 3, col: '#57f2dd' },
  2: { name: '星烬主宰', hp: 3600, r: 33, spd: 38, contact: 26, scale: 3, col: '#ff8c3a' },
};
const bossHpScale = (t) => 1 + (t / 60) * 0.12;

/* 经验曲线 */
const xpNext = (lv) => Math.round(6 + lv * 4 + Math.pow(lv, 1.6) * 0.9);
const gemTier = (v) => v >= 10 ? 3 : v >= 5 ? 2 : v >= 2 ? 1 : 0;

/* ============ 强化卡 ============ */
const RARITY = [
  { n: '常规', c: '#7fd6e8', w: 56 },
  { n: '稀有', c: '#b07ff0', w: 30 },
  { n: '史诗', c: '#ffb054', w: 14 },
  { n: '补给', c: '#7dff9a', w: 0 },
];

const UPGRADES = [
  { id: 'dmg',    icon: 'dmg',    rar: 0, max: 5, name: '过载弹头',   desc: '子弹伤害 +25%',              apply: p => { p.dmgMul += 0.25; } },
  { id: 'rate',   icon: 'rate',   rar: 0, max: 5, name: '激发装置',   desc: '攻击速度 +16%',              apply: p => { p.rateMul += 0.16; } },
  { id: 'multi',  icon: 'multi',  rar: 1, max: 3, name: '分裂弹头',   desc: '额外发射 1 枚子弹',          apply: p => { p.projectiles += 1; } },
  { id: 'pierce', icon: 'pierce', rar: 1, max: 3, name: '贯穿弹芯',   desc: '子弹可多穿透 1 个敌人',      apply: p => { p.pierce += 1; } },
  { id: 'crit',   icon: 'crit',   rar: 0, max: 4, name: '猎手直觉',   desc: '暴击率 +10%（暴击造成2倍伤害）', apply: p => { p.critCh += 0.10; } },
  { id: 'speed',  icon: 'speed',  rar: 0, max: 3, name: '疾风靴',     desc: '移动速度 +10%',              apply: p => { p.speedMul += 0.10; } },
  { id: 'hp',     icon: 'hp',     rar: 0, max: 4, name: '生命扩容',   desc: '生命上限 +25，并恢复 25',    apply: p => { p.maxhp += 25; p.hp = Math.min(p.maxhp, p.hp + 25); } },
  { id: 'magnet', icon: 'magnet', rar: 0, max: 3, name: '磁场线圈',   desc: '经验拾取范围 +45%',          apply: p => { p.pickupR *= 1.45; } },
  { id: 'dashcd', icon: 'dash',   rar: 1, max: 3, name: '相位引擎',   desc: '冲刺冷却 -22%',              apply: p => { p.dashCdMul *= 0.78; } },
  { id: 'frost',  icon: 'frost',  rar: 1, max: 2, name: '冰蚀弹',     desc: '命中使敌人减速 1.2 秒',      apply: p => { p.frostLv += 1; } },
  { id: 'blade',  icon: 'blade',  rar: 1, max: 3, name: '环刃',       desc: '获得 1 枚环绕自身的旋刃',    apply: p => { p.blades += 1; } },
  { id: 'drone',  icon: 'drone',  rar: 2, max: 3, name: '浮游无人机', desc: '获得 1 台自动索敌的无人机',  apply: p => { p.drones += 1; } },
  { id: 'regen',  icon: 'regen',  rar: 1, max: 3, name: '再生矩阵',   desc: '每秒恢复 1 点生命',          apply: p => { p.regen += 1; } },
  { id: 'core',   icon: 'core',   rar: 2, max: 1, name: '星火核心',   desc: '伤害 +40%，攻击速度 +12%',   apply: p => { p.dmgMul += 0.40; p.rateMul += 0.12; } },
];

/* 所有可升级项都满级后的保底选择 */
const FALLBACKS = [
  { id: 'heal', icon: 'heal', rar: 3, max: Infinity, name: '战地补给', desc: '立即恢复 35% 生命',        fallback: true, apply: p => { p.hp = Math.min(p.maxhp, p.hp + Math.round(p.maxhp * 0.35)); } },
  { id: 'vac',  icon: 'vac',  rar: 3, max: Infinity, name: '引力脉冲', desc: '立即吸取全部经验晶体',     fallback: true, apply: p => { for (const g of G.gems) g.vac = true; } },
];
