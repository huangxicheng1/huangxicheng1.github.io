/* ============================================================================
 * 游戏库 · 游玩档案（games.js）
 * ----------------------------------------------------------------------------
 * 读 ./playtime.json（由 tools/build-playtime.py 从本机 Steam 记录生成），
 * 渲染统计条与时长列表，并提供排序 / 筛选 / 搜索。
 * 数据是静态快照，页面不依赖任何第三方接口。
 * ========================================================================== */

(function () {
  'use strict';

  const list = document.getElementById('playList');
  if (!list) return;

  const $ = sel => document.querySelector(sel);

  /* ------------------------------------------------------------ 主题与年份 */

  const toggle = $('#themeToggle');
  if (toggle) {
    const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* 无痕模式也能用 */ } };
    if (read('muse-theme') === 'light') document.body.classList.add('light');
    toggle.textContent = document.body.classList.contains('light') ? '☾' : '☼';
    toggle.addEventListener('click', () => {
      const light = document.body.classList.toggle('light');
      toggle.textContent = light ? '☾' : '☼';
      write('muse-theme', light ? 'light' : 'dark');
    });
  }
  const year = $('#footerYear');
  if (year) year.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------ 状态 */

  const state = { sort: 'hours', filter: 'all', query: '' };
  let games = [];
  let maxMinutes = 1;
  let topIds = new Set();

  const SORTS = {
    hours: (a, b) => b.minutes - a.minutes,
    last: (a, b) => (b.last || '').localeCompare(a.last || '') || b.minutes - a.minutes,
    name: (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')
  };

  const SORT_LABELS = {
    hours: 'SORTED BY HOURS PLAYED',
    last: 'SORTED BY LAST PLAYED',
    name: 'SORTED BY NAME'
  };

  const FILTERS = {
    all: () => true,
    heavy: g => g.hours >= 50,
    mid: g => g.hours >= 10 && g.hours < 50,
    cold: g => g.hours < 1
  };

  /* ------------------------------------------------------------ 渲染 */

  function fmtHours(hours) {
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }

  function buildRow(game, index) {
    const li = document.createElement('li');
    li.className = 'play-row' + (topIds.has(game.id) ? ' is-top' : '');

    const rank = document.createElement('span');
    rank.className = 'pr-rank';
    rank.textContent = String(index + 1).padStart(3, '0');

    const cover = document.createElement('div');
    cover.className = 'pr-cover';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = `./covers/${game.id}.jpg`;
    const fallback = document.createElement('b');
    fallback.textContent = 'NO COVER';
    img.addEventListener('error', () => {
      img.remove();
      fallback.hidden = false;
    });
    fallback.hidden = true;
    cover.append(img, fallback);

    const body = document.createElement('div');
    body.className = 'pr-body';

    const name = document.createElement('h3');
    name.className = 'pr-name';
    name.textContent = game.name;

    const meta = document.createElement('p');
    meta.className = 'pr-meta';
    const appid = document.createElement('span');
    appid.textContent = 'APPID ' + game.id;
    const last = document.createElement('span');
    last.textContent = game.last ? '最近启动 ' + game.last : '最近启动 —';
    meta.append(appid, last);

    const bar = document.createElement('div');
    bar.className = 'pr-bar';
    const fill = document.createElement('i');
    // 平方根压缩：让 300 小时的头部和 2 小时的尾巴都还看得见
    fill.dataset.width = (Math.sqrt(game.minutes / maxMinutes) * 100).toFixed(1);
    bar.append(fill);

    body.append(name, meta, bar);

    const hours = document.createElement('div');
    hours.className = 'pr-hours';
    const num = document.createElement('b');
    num.textContent = fmtHours(game.hours);
    const unit = document.createElement('span');
    unit.textContent = 'H';
    hours.append(num, unit);

    li.append(rank, cover, body, hours);
    return li;
  }

  function render() {
    const filtered = games
      .filter(FILTERS[state.filter])
      .filter(game => {
        if (!state.query) return true;
        const q = state.query.toLowerCase();
        return game.name.toLowerCase().includes(q) || game.id.includes(q);
      })
      .sort(SORTS[state.sort]);

    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('li');
      empty.className = 'play-empty';
      empty.textContent = '没有符合条件的档案 — 换个词或换一档筛选。';
      list.append(empty);
    } else {
      filtered.forEach((game, index) => list.append(buildRow(game, index)));
    }

    // 条形宽度等元素进 DOM 后再写，transition 才有动画
    requestAnimationFrame(() => {
      list.querySelectorAll('.pr-bar i').forEach(bar => {
        bar.style.width = bar.dataset.width + '%';
      });
    });

    const counter = $('#playCount');
    if (counter) {
      counter.textContent = filtered.length === games.length
        ? `共 ${games.length} 部`
        : `${filtered.length} / ${games.length} 部`;
    }

    const label = $('#playSortLabel');
    if (label) label.textContent = SORT_LABELS[state.sort] || '';
  }

  /* ------------------------------------------------------------ 统计 */

  function renderStats(data) {
    const latest = games.reduce((best, g) => (g.last && g.last > (best || '')) ? g.last : best, '');
    const top = games[0];

    const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
    set('#statCount', data.count || games.length);
    set('#statHours', fmtHours(data.totalHours || 0));
    set('#statLatest', latest || '—');
    set('#playUpdated', data.updated || '—');
    if (top) {
      set('#statTop', fmtHours(top.hours));
      set('#statTopName', top.name);
    }
  }

  /* ------------------------------------------------------------ 交互 */

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach(other => {
        other.setAttribute('aria-pressed', String(other === btn));
      });
      render();
    });
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(other => {
        other.setAttribute('aria-pressed', String(other === btn));
      });
      render();
    });
  });

  const search = $('#playSearch');
  if (search) {
    search.addEventListener('input', () => {
      state.query = search.value.trim();
      render();
    });
  }

  /* ------------------------------------------------------------ 启动 */

  fetch('./playtime.json', { cache: 'no-cache' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      games = (data.games || []).filter(g => g.minutes > 0);
      if (!games.length) throw new Error('空数据');
      gamepad(data);
    })
    .catch(err => {
      list.replaceChildren();
      const empty = document.createElement('li');
      empty.className = 'play-empty';
      empty.textContent = '档案读取失败（' + err.message + '）— 需要从本地服务器打开本页。';
      list.append(empty);
    });

  function gamepad(data) {
    maxMinutes = Math.max(...games.map(g => g.minutes));
    topIds = new Set(games.slice(0, 3).map(g => g.id));
    renderStats(data);
    render();
  }
})();
