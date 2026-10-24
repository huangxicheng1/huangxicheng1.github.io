/* 星烬：最后一夜 — 程序化像素美术（全部运行时生成，无外部素材） */
'use strict';

/* 将字符串数组按调色板绘制为 1px/格 的离屏画布 */
function sheet(rows, pal) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const col = pal[r[x]];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}
function flipX(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}
function tintCopy(src, color) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
/* 金色描边版本（精英怪用） */
function outlined(src, color) {
  const c = document.createElement('canvas'); c.width = src.width + 2; c.height = src.height + 2;
  const g = c.getContext('2d');
  const t = tintCopy(src, color);
  g.drawImage(t, 0, 1); g.drawImage(t, 2, 1); g.drawImage(t, 1, 0); g.drawImage(t, 1, 2);
  g.drawImage(src, 1, 1);
  return c;
}

const SPR = {};

function buildSprites() {
  /* —— 玩家：戴兜帽面罩的幸存者 —— */
  const pPal = { o: '#17303f', O: '#2b5d70', v: '#4df0e2', V: '#dffcf8', m: '#0e1620', j: '#2b2f3d', J: '#e8913c', g: '#cdd6e4', p: '#20242e', B: '#3c4356' };
  const pA = sheet([
    '....oooo....',
    '...oOoooo...',
    '...ovvvvo...',
    '...oVvvvo...',
    '...ommmmo...',
    '....mmmm....',
    '..jjjJJjjj..',
    '.gjjJJJJjjg.',
    '.gjjjjjjjjg.',
    '..jjjjjjjj..',
    '..pp...pp...',
    '..pp...pp...',
    '..BB...BB...',
    '..BB...BB...',
  ], pPal);
  const pB = sheet([
    '....oooo....',
    '...oOoooo...',
    '...ovvvvo...',
    '...oVvvvo...',
    '...ommmmo...',
    '....mmmm....',
    '..jjjJJjjj..',
    '.gjjJJJJjjg.',
    '.gjjjjjjjjg.',
    '..jjjjjjjj..',
    '...pp..pp...',
    '...pp..pp...',
    '..BB....BB..',
    '..BB....BB..',
  ], pPal);
  SPR.player = {
    f: [pA, pB],
    fl: [flipX(pA), flipX(pB)],
    white: [tintCopy(pA, '#eafffb'), tintCopy(pB, '#eafffb')],
    ghost: [tintCopy(pA, '#4df0e2'), tintCopy(pB, '#4df0e2')],
    ghostFl: [flipX(tintCopy(pA, '#4df0e2')), flipX(tintCopy(pB, '#4df0e2'))],
  };

  /* —— 追逐者：变异游荡体 —— */
  const cPal = { d: '#3f1440', m: '#8a2f6d', M: '#c95c9e', e: '#fff', t: '#ff7ad9' };
  const ch = sheet([
    '..dMMMd..',
    '.dMMMMMd.',
    '.mMeMeMm.',
    '.mMMMMMm.',
    '.mMtttMm.',
    '..mMMMm..',
    '..m.m.m..',
    '..d...d..',
    '.d.....d.',
  ], cPal);
  /* —— 射手：悬浮哨卫 —— */
  const sPal = { c: '#1c4f5a', C: '#37e0c8', e: '#fff', p: '#0d2a30', r: '#ff5f4d' };
  const sh = sheet([
    '....cc....',
    '..cCCCCc..',
    '.cCCeeCCc.',
    '.cCCerCCc.',
    '.cCCCCCCc.',
    '..cCCCCc..',
    '...cccc...',
    '..p....p..',
    '...p..p...',
    '....pp....',
  ], sPal);
  /* —— 冲锋者：掠袭兽 —— */
  const rPal = { d: '#2b160b', b: '#5a2a16', B: '#e0762a', h: '#ffd23f' };
  const cg = sheet([
    '....ddd....',
    '....dBd....',
    '...dBBBd...',
    '..dBBhBBd..',
    '.dBBBhBBBd.',
    'dBBBBBBBBBd',
    '.ddBBBBBdd.',
    '...dBBBd...',
    '...d...d...',
    '....d.d....',
  ], rPal);
  /* —— 重装怪：龟甲重壳 —— */
  const hPal = { d: '#101d21', A: '#2c545a', s: '#8fe6d0', r: '#e0643f' };
  const hv = sheet([
    '....AAAAAAAA....',
    '..AAAAAAAAAAAA..',
    '.AAAsAArrAAAsAA.',
    '.AAsAArrrrAAsAA.',
    '.AAAsAArrAAAsAA.',
    '.AAAAAAAAAAAAAA.',
    '..dAAAAAAAAAAd..',
    '..ddAAAAAAAAdd..',
    '...dAAAAAAAAd...',
    '...dd..dd..dd...',
    '...dd..dd..dd...',
  ], hPal);

  const mk = (c) => ({
    c, fl: flipX(c), white: tintCopy(c, '#fff'),
    gold: outlined(c, '#ffd23f'), w: c.width, h: c.height,
  });
  SPR.chaser = mk(ch);
  SPR.shooter = mk(sh);
  SPR.charger = mk(cg);
  SPR.heavy = mk(hv);

  /* —— 经验晶体（4 档） —— */
  const gemPal = (a, b) => ({ c: a, C: b, W: '#fff' });
  SPR.gem = [
    sheet(['..c..', '.cCc.', 'cCWCc', '.cCc.', '..c..'], gemPal('#0e5a52', '#2ee6cf')),
    sheet(['..c..', '.cCc.', 'cCWCc', '.cCc.', '..c..'], gemPal('#1d6b2e', '#6dff7d')),
    sheet(['..c..', '.cCc.', 'cCWCc', '.cCc.', '..c..'], gemPal('#7a3c16', '#ffb054')),
    sheet(['..c..', '.cCc.', 'cCWCc', '.cCc.', '..c..'], gemPal('#5f1560', '#ff7ad9')),
  ];
  /* 生命恢复 */
  SPR.heart = sheet([
    '.rr.rr.',
    'rRRrRRr',
    'rRWRRRr',
    '.rRRRr.',
    '..rRr..',
    '...r...',
  ], { r: '#5c1020', R: '#ff4d6b', W: '#ffd6de' });
  /* 精英王冠 */
  SPR.crown = sheet([
    'g.g.g',
    'ggggg',
    'gGgGg',
  ], { g: '#b98a1e', G: '#ffd23f' });

  SPR.boss1 = paintBoss1();
  SPR.boss1White = tintCopy(SPR.boss1, '#eaffff');
  SPR.boss2 = paintBoss2();
  SPR.boss2White = tintCopy(SPR.boss2, '#fff2df');
  SPR.boss2Angry = tintCopy(SPR.boss2, '#ff3b2f');
}

/* —— 中期首领：残响巨像（26x26 像素画，代码绘制保证对称） —— */
function paintBoss1() {
  const W = 26, H = 26;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // 外壳
  R(6, 4, 14, 2, '#0b2b33');
  R(5, 6, 16, 14, '#0b2b33');
  R(7, 6, 12, 13, '#154551');
  R(9, 7, 8, 11, '#1d5f6e');
  // 顶部晶冠
  R(9, 2, 8, 2, '#2fa3a8');
  R(8, 3, 1, 1, '#2fa3a8'); R(17, 3, 1, 1, '#2fa3a8');
  R(12, 1, 2, 1, '#57f2dd');
  // 肩部悬浮晶体
  R(2, 8, 3, 4, '#0b2b33'); R(3, 9, 1, 2, '#8a4fd0');
  R(21, 8, 3, 4, '#0b2b33'); R(22, 9, 1, 2, '#8a4fd0');
  R(1, 14, 2, 2, '#8a4fd0'); R(23, 14, 2, 2, '#8a4fd0');
  // 巨眼
  R(10, 9, 6, 1, '#2fa3a8');
  R(10, 10, 6, 3, '#eaffff');
  R(12, 11, 2, 2, '#0b2b33');
  // 裂纹辉光
  R(8, 8, 2, 1, '#57f2dd'); R(16, 13, 1, 2, '#57f2dd');
  R(8, 16, 1, 2, '#57f2dd'); R(17, 15, 1, 1, '#57f2dd');
  // 底部悬浮锥
  R(8, 20, 10, 2, '#0b2b33');
  R(10, 22, 6, 2, '#154451');
  R(12, 24, 2, 1, '#57f2dd');
  return c;
}

/* —— 最终首领：星烬主宰（30x30） —— */
function paintBoss2() {
  const W = 30, H = 30;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // 火焰王冠
  R(9, 0, 2, 2, '#ffd23f'); R(14, 0, 2, 2, '#ffd23f');
  R(11, 1, 3, 2, '#ff8c3a'); R(7, 2, 2, 2, '#ff8c3a'); R(18, 2, 2, 2, '#ff8c3a');
  R(8, 3, 3, 1, '#e8452f'); R(16, 3, 3, 1, '#e8452f');
  // 头部暗面罩
  R(10, 4, 10, 6, '#1a0f1e');
  R(11, 5, 8, 4, '#241430');
  // 燃烧双眼
  R(12, 6, 2, 2, '#ffd23f'); R(16, 6, 2, 2, '#ffd23f');
  R(12, 7, 1, 1, '#fff'); R(16, 7, 1, 1, '#fff');
  // 肩甲
  R(3, 10, 8, 5, '#1a0f1e'); R(19, 10, 8, 5, '#1a0f1e');
  R(4, 11, 6, 3, '#6e1d2e'); R(20, 11, 6, 3, '#6e1d2e');
  R(5, 12, 1, 1, '#ff8c3a'); R(23, 12, 1, 1, '#ff8c3a');
  // 躯干
  R(9, 9, 12, 12, '#1a0f1e');
  R(10, 10, 10, 10, '#2c1030');
  // 熔核心脏
  R(13, 14, 4, 4, '#e8452f');
  R(14, 15, 2, 2, '#ffd23f');
  // 裂纹
  R(11, 11, 1, 2, '#ff8c3a'); R(18, 12, 1, 2, '#ff8c3a'); R(12, 18, 2, 1, '#ff8c3a');
  // 爪臂
  R(1, 15, 3, 2, '#1a0f1e'); R(26, 15, 3, 2, '#1a0f1e');
  R(0, 17, 2, 1, '#e8452f'); R(28, 17, 2, 1, '#e8452f');
  // 下摆余烬长袍
  R(10, 21, 10, 4, '#1a0f1e');
  R(11, 25, 8, 2, '#2c1030');
  R(13, 27, 4, 1, '#e8452f');
  R(12, 28, 1, 1, '#ff8c3a'); R(17, 28, 1, 1, '#ffd23f');
  return c;
}

/* ============ 强化卡图标（12x12） ============ */
const ICON_ART = {
  dmg: { pal: { s: '#bffcf4', S: '#4df0e2', g: '#8a6b3a', h: '#cdd6e4' }, rows: [
    '..........Ss', '.........Ss.', '........Ss..', '.......Ss...', '......Ss....',
    '.....Ss.....', '..h.Ss......', '..hhS.......', '.hhh........', 'hh..h.......',
    '............', '............'] },
  rate: { pal: { y: '#ffd23f', Y: '#fff2b0' }, rows: [
    '.....yy.....', '....yy......', '...yy.......', '..yyyyy.....', '..Yyyyyy....',
    '.....yyy....', '....yyy.....', '...yy.......', '..yy........', '..y.........',
    '............', '............'] },
  multi: { pal: { c: '#4df0e2', C: '#eafffb' }, rows: [
    '............', 'C..........C', '.c....C....c', '.c...ccc...c', '.c..cc.cc..c',
    '....cc.cc...', '............', '....cc.cc...', '............', '............',
    '............', '............'] },
  pierce: { pal: { w: '#eafffb', g: '#8fe6d0', r: '#ff5f4d' }, rows: [
    '..........ww', '.........www', '........ww..', 'gggggggww...', '...ggggg....',
    'gggggggww...', '........ww..', '.........www', '..........ww', '............',
    '............', '............'] },
  crit: { pal: { c: '#ffd23f', C: '#fff' }, rows: [
    '....cccc....', '..c......c..', '.c...CC...c.', '.c..CCCC..c.', 'c...CC...c..' ,
    'c..........c', '.c........c.', '.c........c.', '..c......c..', '....cccc....',
    '............', '............'] },
  speed: { pal: { c: '#4df0e2', C: '#eafffb' }, rows: [
    '............', '............', 'c...........', '.c....c.....', '..c...cc....',
    '...c..ccc...', '.cc...ccc...', '.ccc..ccc...', '..ccc.ccc...', '...cccc.....',
    '............', '............'] },
  hp: { pal: { r: '#ff4d6b', R: '#ffd6de' }, rows: [
    '............', '.rr....rr...', 'rRRr..rRRr..', 'rRRRrrRRRr..', 'rRRRRRRRRr..',
    '.rRRRRRRr...', '..rRRRRr....', '...rRRr.....', '....rr......', '............',
    '............', '............'] },
  magnet: { pal: { r: '#ff5f4d', b: '#4df0e2', B: '#eafffb' }, rows: [
    '............', '.rr......bb.', '.rr......bb.', '.rr......bb.', '.rrr....bbb.',
    '..rrr..bbb..', '...rrrrbb...', '....rrbb....', '.....rb.....', '............',
    '............', '............'] },
  dash: { pal: { c: '#4df0e2', C: '#eafffb' }, rows: [
    '............', 'c...........', '.cc.....c...', '.ccc...cc...', '..ccc..ccc..' ,
    '..cccc.ccc..', '...ccccccc..', '....ccccc...', '.....ccc....', '......c.....',
    '............', '............'] },
  frost: { pal: { i: '#9fdcff', I: '#eafffb' }, rows: [
    '.....i......', '.....i......', '..i..i..i...', '...i.i.i....', 'iiiiIIIIii..',
    '...i.i.i....', '..i..i..i...', '.....i......', '.....i......', '............',
    '............', '............'] },
  blade: { pal: { s: '#cdd6e4', S: '#fff', b: '#4df0e2' }, rows: [
    '....ssss....', '..ss....ss..', '.s........s.', '.s...SS...s.', 's....SS....s',
    's...SSSS...s', 's....SS....s', '.s..SSSS..s.', '.s...SS...s.', '..ss....ss..',
    '....ssss....', '............'] },
  drone: { pal: { b: '#3c4356', c: '#4df0e2', C: '#ffb054' }, rows: [
    '............', '.c........c.', '..bbbbbbbb..', '..bCCbbCCb..', '..bbbbbbbb..',
    '....bCCb....', '....bbbb....', '.....bb.....', '............', '............',
    '............', '............'] },
  regen: { pal: { g: '#6dff7d', G: '#eaffea' }, rows: [
    '....gggg....', '..gg....gg..', '.g...GG...g.', '.g..GGGG..g.', '.g..GGGG..g.',
    '.g...GG...g.', '..gg....gg..', '....gggg....', '............', '............',
    '............', '............'] },
  core: { pal: { y: '#ffd23f', r: '#e8452f', w: '#fff' }, rows: [
    '.....y......', '....yry.....', '....yry.....', '.y..rrr..y..', '..yyryryyy..',
    '...rrwrr....', '..yyryryyy..', '.y..rrr..y..', '....yry.....', '....yry.....',
    '.....y......', '............'] },
  heal: { pal: { g: '#6dff7d', G: '#eaffea' }, rows: [
    '............', '....GG......', '....GG......', '..GGGGGG....', '..GGGGGG....',
    '....GG......', '....GG......', '............', '............', '............',
    '............', '............'] },
  vac: { pal: { c: '#4df0e2', C: '#eafffb' }, rows: [
    '.....C......', '....CCC.....', '...ccCcc....', '..c..C..c...', '..ccCCCcc...',
    '...ccCcc....', '....CCC.....', '.....C......', '............', '............',
    '............', '............'] },
};

const ICON_CACHE = {};
function getUpgradeIcon(id) {
  if (ICON_CACHE[id]) return ICON_CACHE[id];
  const art = ICON_ART[id];
  const c = art ? sheet(art.rows, art.pal) : sheet(['....', '.cc.', '.cc.', '....'], { c: '#4df0e2' });
  ICON_CACHE[id] = c;
  return c;
}
