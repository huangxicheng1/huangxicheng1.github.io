/* ============================================================================
 * 暮色手帖 · 开屏动画（splash.js）
 * ----------------------------------------------------------------------------
 * 六幕开机序列（对齐 dsh-startup-screen 暗色版式）：黑色序幕（厂牌标识）→
 * 过曝洗白 → 暗色「技术档案」底板 → 六步访问授权（第一、二步需要点按 /
 * Enter / 空格确认，其余自动推进；左上角有整段流程指示与时钟）→
 * 色散故障揭幕。揭幕后移除开屏层，博客页面按编排进场。
 *
 * 零依赖、零素材：字体取系统自带，音效为 WebAudio 现场合成（无语音）。
 * 右上角「跳过」或 Esc 随时可略过；偏好减少动效时直接进页。
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 配置：想改行为，改这里就好
   *   mode            'always'  每次刷新都播（适合本地演示）
   *                   'session' 一个浏览器会话只播一次
   *                   'once'    只播一次（此后除非清缓存）
   *   speed           整段动画快慢倍率，0.35 – 3
   *   readerName      身份表「身份名称」
   *   no / level      身份编号 / 权限等级
   *   requireConfirm  第 1、2 步是否等待点按确认
   *   skippable       是否允许跳过（按钮 + Esc）
   *   sound           界面音效（合成音，首次交互后才会出声）
   * ------------------------------------------------------------------ */
  var CFG = {
    mode: 'session',
    speed: 1,
    readerName: '亲爱的读者',
    no: '0087',
    level: '3',
    password: 'root',
    requireConfirm: true,
    skippable: true,
    sound: true
  };

  var KEY = 'muse-boot-played';
  var html = document.documentElement;

  /* 防重复执行 + 与页首内联脚本的失败保底握手 */
  if (window.__MUSE_BOOT_DONE__) return;
  window.__MUSE_BOOT_STARTED__ = true;

  function storageOk(key, store) {
    try { return !!store.getItem(key); } catch (e) { return false; }
  }
  function markPlayed() {
    try { sessionStorage.setItem(KEY, '1'); localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function shouldSkip() {
    if (CFG.mode === 'session' && storageOk(KEY, sessionStorage)) return true;
    if (CFG.mode === 'once' && (storageOk(KEY, localStorage) || storageOk(KEY, sessionStorage))) return true;
    return false;
  }

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var done = false;
  var root = null;
  var els = {};
  var rafId = 0;
  var hexTimer = 0;
  var clockTimer = 0;
  var hexOn = false;

  /* ---------------- 等待 / 工具 ---------------- */
  function sleep(ms) {
    var s = (typeof CFG.speed === 'number' && CFG.speed > 0) ? CFG.speed : 1;
    return new Promise(function (res) { setTimeout(res, Math.max(0, ms / s)); });
  }
  function pad3(n) { return String(n).length < 3 ? ('00' + n).slice(-3) : String(n); }

  /* ---------------- 音效：WebAudio 现场合成 ---------------- */
  var actx = null;
  function ensureAudio() {
    if (!CFG.sound || actx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    } catch (e) { actx = null; }
  }
  document.addEventListener('pointerdown', ensureAudio, { once: true, capture: true });
  document.addEventListener('keydown', ensureAudio, { once: true, capture: true });
  function blip(freq, dur, gain, delay) {
    if (!actx) return;
    try {
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime + (delay || 0);
      var o = actx.createOscillator();
      var v = actx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      v.gain.setValueAtTime(0.0001, t);
      v.gain.exponentialRampToValueAtTime(gain || 0.045, t + 0.012);
      v.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.06));
      o.connect(v); v.connect(actx.destination);
      o.start(t); o.stop(t + (dur || 0.06) + 0.06);
    } catch (e) { /* 静音失败不打扰 */ }
  }
  function sndStep() { blip(1245, 0.05, 0.03); }
  function sndConfirm() { blip(660, 0.07, 0.05); blip(990, 0.08, 0.045, 0.07); }
  function sndWelcome() { blip(523, 0.1, 0.04); blip(784, 0.1, 0.04, 0.1); blip(1047, 0.16, 0.035, 0.2); }

  /* ---------------- 逐字渐显 ---------------- */
  function typeIn(el, text, per) {
    el.classList.remove('bt-in');
    el.textContent = '';
    var step = Math.max(6, (per || 26) / CFG.speed);
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(text, function (ch, i) {
      var s = document.createElement('span');
      s.className = 'bt-ch';
      /* 空格在 inline-block 里宽度会塌缩，用不换行空格占位 */
      s.textContent = ch === ' ' ? '\u00A0' : ch;
      s.style.transitionDelay = Math.round(i * step) + 'ms';
      frag.appendChild(s);
    });
    el.appendChild(frag);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('bt-in'); });
    });
  }

  /* ---------------- 十六进制瀑布 ---------------- */
  function hexLine() {
    var out = [];
    for (var i = 0; i < 7; i++) out.push(pad3(Math.floor(Math.random() * 4096)).slice(-3));
    return out.join(' ');
  }
  function startHex() {
    if (hexTimer) return;
    var pre = els.hexPre;
    var rows = [];
    for (var i = 0; i < 8; i++) rows.push(hexLine());
    pre.textContent = rows.join('\n');
    hexTimer = setInterval(function () {
      if (!hexOn) return;
      rows.shift(); rows.push(hexLine());
      pre.textContent = rows.join('\n');
    }, 110);
  }
  function stopHex() { if (hexTimer) { clearInterval(hexTimer); hexTimer = 0; } }

  /* ---------------- 右上角时钟 ---------------- */
  function startClock() {
    var el = els.clock;
    if (!el || clockTimer) return;
    var tick = function () {
      var d = new Date();
      var p = function (n) { return ('0' + n).slice(-2); };
      el.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = 0; } }

  /* ---------------- 左上角六段流程指示 ---------------- */
  function setDashes(i, total) {
    if (!els.dashes) return;
    var list = els.dashes.children;
    for (var j = 0; j < list.length; j++) {
      list[j].className = j < i ? 'done' : (j === i ? 'cur' : '');
    }
  }

  /* ---------------- 进度条 ---------------- */
  function setBar(frac, accent) {
    els.bar.style.width = (Math.round(frac * 1000) / 10) + '%';
    els.bar.classList.toggle('full', !!accent);
  }
  function runBar(fromFrac, toFrac, dur) {
    cancelAnimationFrame(rafId);
    var t0 = performance.now();
    var s = (typeof CFG.speed === 'number' && CFG.speed > 0) ? CFG.speed : 1;
    var total = Math.max(1, dur / s);
    var tick = function (t) {
      if (done) return;
      var p = Math.min(1, (t - t0) / total);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      var frac = fromFrac + (toFrac - fromFrac) * e;
      setBar(frac);
      if (p < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  /* ---------------- DOM ---------------- */
  function build() {
    root = document.createElement('div');
    root.id = 'boot-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '开屏动画');
    root.innerHTML =
      '<section class="boot-black" aria-hidden="true">' +
        '<div class="boot-black-inner">' +
          '<div class="boot-mark"><i></i></div>' +
          '<div class="boot-brand">暮色手帖</div>' +
          '<div class="boot-brand-en">LETTERS TO THE DAYS</div>' +
        '</div>' +
        '<div class="boot-log" id="btLog"></div>' +
        '<div class="boot-black-foot">TWILIGHT ARCHIVE · BOOT SEQUENCE</div>' +
      '</section>' +
      '<div class="boot-wash" aria-hidden="true"></div>' +
      '<section class="boot-plate" aria-hidden="true">' +
        '<i class="bt-col bt-col-a"></i><i class="bt-col bt-col-b"></i><i class="bt-col bt-col-c"></i>' +
        '<i class="bt-corner c-tl"></i><i class="bt-corner c-tr"></i>' +
        '<i class="bt-corner c-bl"></i><i class="bt-corner c-br"></i>' +
        '<header class="boot-brand-block">' +
          '<strong>暮色手帖</strong>' +
          '<small>LETTERS TO THE DAYS</small>' +
          '<div class="boot-rev"><span>REV 1.0 · HOME PAGE</span><b class="bt-rev-clock" id="btClock">--:--:--</b></div>' +
          '<div class="boot-dashes" id="btDashes"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '</header>' +
        '<button class="boot-skip" id="btSkip" type="button">跳过 SKIP</button>' +
        '<div class="boot-hex" id="btHex" aria-hidden="true">' +
          '<div class="bt-hex-head">MEM DUMP — LIVE</div>' +
          '<pre id="btHexPre"></pre>' +
        '</div>' +
        '<div class="boot-status" id="btStatus">' +
          '<div class="boot-status-zh"><span id="btZh"></span><span class="boot-caret" aria-hidden="true"></span></div>' +
          '<div class="boot-status-en" id="btEn"></div>' +
          '<div class="boot-rule" aria-hidden="true"></div>' +
          '<div class="boot-status-name" id="btName">欢迎回来，这里所有日子都在。</div>' +
          '<div class="boot-stamp" id="btStamp">核验通过<small>VERIFIED</small></div>' +
        '</div>' +
        '<div class="boot-mid">' +
          '<div class="boot-idtable" id="btTable">' +
            '<div class="bt-row"><span>身份名称</span><b>' + CFG.readerName + '</b></div>' +
            '<div class="bt-row"><span>身份编号</span><b>NO.' + CFG.no + '</b></div>' +
            '<div class="bt-row"><span>权限等级</span><b>LEVEL ' + CFG.level + '</b></div>' +
          '</div>' +
          '<figure class="boot-dog" id="btDog" aria-hidden="true">' +
            '<img src="./dog.gif" alt="" loading="eager">' +
            '<span class="bt-dog-dashes">········</span>' +
          '</figure>' +
        '<div class="boot-action" id="btAction">' +
          '<div class="boot-pass" id="btPass" hidden>' +
            '<label class="boot-pass-label" for="btPassInput">ACCESS KEY · 访问密码</label>' +
            '<input id="btPassInput" type="password" autocomplete="off" spellcheck="false" placeholder="········" aria-label="访问密码">' +
            '<p class="boot-pass-error" id="btPassError" role="alert"></p>' +
          '</div>' +
          '<button class="boot-btn" id="btBtn" type="button">' +
            '<span id="btBtnZh">请求访问</span>' +
            '<span id="btBtnEn">REQUEST ACCESS</span>' +
          '</button>' +
          '<span class="boot-hint" id="btHint"><span id="btHintText">点按按钮继续</span>，或按 <kbd>Enter</kbd> / <kbd>Space</kbd></span>' +
        '</div>' +
        '</div>' +
        '<footer class="boot-foot">' +
          '<div class="boot-foot-l">' +
            '<span class="boot-voice" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' +
            '<span class="boot-stepword" id="btStep">[ 01 / 06 ] AUTHORIZATION</span>' +
          '</div>' +
          '<div class="boot-foot-c">' +
            '<p class="bt-foot-zh" id="btFootZh">等待用户授权...</p>' +
            '<p class="bt-foot-en" id="btFootEn">AWAITING OPERATOR CONSENT</p>' +
          '</div>' +
          '<div class="boot-foot-r">' +
            '<span class="boot-idline" id="btIdLine">· ID CONFIRMED : ' + CFG.no + '</span>' +
            '<span class="boot-powered">POWERED BY 暮色手帖<i aria-hidden="true"></i></span>' +
          '</div>' +
        '</footer>' +
        '<div class="boot-progress"><i id="btBar"></i></div>' +
        '<div class="boot-scanline" aria-hidden="true"></div>' +
        '<div class="boot-grain" aria-hidden="true"></div>' +
        '<div class="boot-vignette" aria-hidden="true"></div>' +
      '</section>' +
      '<div class="boot-glitch" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="boot-flash" aria-hidden="true"></div>';

    document.body.appendChild(root);
    var idMap = {
      black: '.boot-black', wash: '.boot-wash', plate: '.boot-plate',
      status: '#btStatus', zh: '#btZh', en: '#btEn', name: '#btName',
      stamp: '#btStamp', table: '#btTable', dog: '#btDog',
      hex: '#btHex', hexPre: '#btHexPre',
      action: '#btAction', btn: '#btBtn', btnZh: '#btBtnZh', btnEn: '#btBtnEn',
      passField: '#btPass', passInput: '#btPassInput', passError: '#btPassError',
      hint: '#btHintText',
      skip: '#btSkip', dashes: '#btDashes', clock: '#btClock',
      step: '#btStep', footZh: '#btFootZh', footEn: '#btFootEn',
      idLine: '#btIdLine', bar: '#btBar',
      glitch: '.boot-glitch', flash: '.boot-flash', log: '#btLog'
    };
    Object.keys(idMap).forEach(function (k) { els[k] = root.querySelector(idMap[k]); });
  }

  /* ---------------- 等待确认（第一步带密码门） ---------------- */
  var waiting = false;
  var waitResolve = null;
  var passGate = false;
  var attempts = 0;
  function waitConfirm(st) {
    return new Promise(function (res) {
      waiting = true;
      waitResolve = res;
      els.btnZh.textContent = st.confirm.zh;
      els.btnEn.textContent = st.confirm.en;
      els.action.classList.add('on');
      passGate = !!(st.pass && CFG.password);
      els.passField.hidden = !passGate;
      els.passError.textContent = '';
      els.passInput.value = '';
      els.hint.textContent = passGate ? '输入访问密码' : '点按按钮继续';
      if (passGate) {
        setTimeout(function () { try { els.passInput.focus({ preventScroll: true }); } catch (e) {} }, 80);
      } else {
        els.btn.focus({ preventScroll: true });
      }
    });
  }
  function attemptPass() {
    if (!waiting || !passGate) return;
    var val = (els.passInput.value || '').replace(/^\s+|\s+$/g, '');
    if (val === CFG.password) {
      attempts = 0;
      els.passError.textContent = '';
      resolveConfirm();
      return;
    }
    attempts++;
    els.passError.textContent = 'ACCESS DENIED · 密码不符，请重试（第 ' + attempts + ' 次）';
    els.passField.classList.remove('deny');
    void els.passField.offsetWidth;
    els.passField.classList.add('deny');
    els.passInput.value = '';
    try { els.passInput.focus({ preventScroll: true }); } catch (e) {}
    blip(196, 0.1, 0.05);
  }
  function resolveConfirm() {
    if (!waiting) return;
    waiting = false;
    passGate = false;
    els.passField.hidden = true;
    els.passError.textContent = '';
    els.action.classList.remove('on');
    sndConfirm();
    var r = waitResolve;
    waitResolve = null;
    if (r) r();
  }

  function onKey(e) {
    if (done) return;
    if (e.key === 'Escape' && CFG.skippable) { e.preventDefault(); release('skip'); return; }
    if (!waiting) return;
    var typing = passGate && e.target === els.passInput;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (passGate) attemptPass(); else resolveConfirm();
      return;
    }
    if ((e.key === ' ' || e.code === 'Space') && !typing) {
      e.preventDefault();
      resolveConfirm();
    }
  }

  /* ---------------- 收尾：揭幕离场，页面进场 ---------------- */
  function release(reason) {
    if (done) return;
    done = true;
    cancelAnimationFrame(rafId);
    stopHex();
    stopClock();
    document.removeEventListener('keydown', onKey, true);
    markPlayed();

    html.classList.remove('boot-pending');
    document.body.classList.add('booted');

    if (!root) return;
    if (reason === 'skip') {
      root.style.transition = 'opacity 340ms ease';
      root.style.opacity = '0';
      setTimeout(function () { if (root && root.parentNode) root.parentNode.removeChild(root); }, 420);
    } else {
      root.classList.add('exit');
      setTimeout(function () { if (root && root.parentNode) root.parentNode.removeChild(root); }, 800);
    }
  }

  /* ---------------- 六步授权 ---------------- */
  var STEPS = [
    { zh: '需要访问许可', en: 'ACCESS PERMISSION REQUIRED',
      word: 'AUTHORIZATION',
      footZh: '等待用户授权...', footEn: 'AWAITING OPERATOR CONSENT',
      confirm: { zh: '请求访问', en: 'REQUEST ACCESS' }, pass: true },
    { zh: '身份资料确认', en: 'IDENTITY VERIFICATION',
      word: 'IDENTITY',
      footZh: '核对身份资料...', footEn: 'MATCHING OPERATOR RECORD',
      table: true, confirm: { zh: '确认身份', en: 'CONFIRM IDENTITY' } },
    { zh: '接收访问需求', en: 'ACCESS REQUEST RECEIVED',
      word: 'REQUEST',
      footZh: '已接收访问需求，建立安全信道...', footEn: 'SECURING CHANNEL',
      hold: 1500, hex: true },
    { zh: '开始读取权限', en: 'PERMISSION READ STARTED',
      word: 'READ',
      footZh: '开始读取权限，索引日子与笔记...', footEn: 'INDEXING DAYS AND NOTES',
      hold: 2300, hex: true, progress: true, dog: true },
    { zh: '读取完毕 · 核验通过', en: 'READ COMPLETE · VERIFIED',
      word: 'VERIFIED',
      footZh: '读取完毕，权限核验通过。', footEn: 'PERMISSION VERIFIED',
      hold: 1500, hex: true, stamp: true },
    { zh: '欢迎回来', en: 'WELCOME BACK',
      word: 'WELCOME',
      footZh: '欢迎回来，今晚也慢慢写。', footEn: 'ENJOY THE QUIET PAGE',
      hold: 2100, welcome: true }
  ];

  async function doStep(i, st) {
    var num = ('0' + (i + 1)).slice(-2);
    els.step.textContent = '[ ' + num + ' / 06 ] ' + st.word;
    setDashes(i, STEPS.length);
    els.status.classList.toggle('welcome', !!st.welcome);
    els.hex.classList.toggle('on', !!st.hex);
    hexOn = !!st.hex;
    if (st.hex) startHex();
    els.table.classList.toggle('on', !!st.table);
    els.dog.classList.toggle('on', !!st.dog);
    els.idLine.classList.toggle('show', i >= 1);
    els.footZh.textContent = st.footZh;
    els.footEn.textContent = st.footEn;
    if (st.welcome) sndWelcome(); else sndStep();

    typeIn(els.zh, st.zh, 26);
    typeIn(els.en, st.en, 17);

    if (st.stamp) setTimeout(function () {
      if (!done) { els.stamp.classList.add('on'); blip(1568, 0.06, 0.05); }
    }, 560 / CFG.speed);

    if (st.progress) runBar(3 / STEPS.length, 5 / STEPS.length, st.hold + 260);

    if (st.confirm) {
      if (CFG.requireConfirm) {
        await sleep(760);
        if (done) return;
        await waitConfirm(st);
      } else {
        await sleep(1100);
      }
    } else {
      await sleep(st.hold);
    }
    if (done) return;

    if (i === STEPS.length - 1) {
      setBar(1, true);
    } else if (!st.progress) {
      setBar((i + 1) / STEPS.length);
    }
    if (!st.hex) { els.hex.classList.remove('on'); hexOn = false; }
    els.table.classList.remove('on');
    els.dog.classList.remove('on');
    els.stamp.classList.remove('on');
  }

  /* ---------------- 黑色序幕的启动日志 ---------------- */
  var LOG_LINES = [
    'BOOT MUSE-DIARY v2.6 ......... OK',
    'LOADING NIGHT SKY ............ OK',
    'WARMING LAMPS ................ OK',
    'FEEDING THE DOG .............. OK'
  ];
  async function playLogs() {
    for (var i = 0; i < LOG_LINES.length; i++) {
      if (done) return;
      els.log.textContent += '> ' + LOG_LINES[i] + '\n';
      await sleep(240);
    }
  }

  /* ---------------- 主时序 ---------------- */
  async function run() {
    await sleep(320);
    if (done) return;
    els.black.classList.add('seen');
    startClock();
    await playLogs();
    await sleep(380);
    if (done) return;

    /* 过曝洗白：白圆自中心撑开，黑幕同步淡出 */
    els.wash.classList.add('on');
    els.black.classList.add('out');
    await sleep(320);
    if (done) return;
    els.plate.classList.add('on');
    await sleep(760);
    if (done) return;

    var i;
    for (i = 0; i < STEPS.length; i++) {
      await doStep(i, STEPS[i]);
      if (done) return;
    }

    /* 色散故障揭幕 */
    await sleep(120);
    els.plate.classList.add('glitch');
    els.glitch.classList.add('on');
    sndStep();
    await sleep(240);
    if (done) return;
    els.flash.classList.add('on');
    await sleep(520);
    release('done');
  }

  /* ---------------- 入口 ---------------- */
  function start() {
    if (reduceMotion || shouldSkip()) {
      /* 不播：直接放行页面（进场编排交给 .booted，减少动效时 CSS 会禁用） */
      release('skip');
      return;
    }
    build();
    document.addEventListener('keydown', onKey, true);
    els.skip.addEventListener('click', function () { release('skip'); });
    els.btn.addEventListener('click', function () { if (passGate) attemptPass(); else resolveConfirm(); });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted && !done) release('skip');
    });
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* 给控制台留个小把手 */
  window.MuseBoot = {
    skip: function () { release('skip'); },
    replay: function () {
      try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    },
    config: CFG
  };
})();
