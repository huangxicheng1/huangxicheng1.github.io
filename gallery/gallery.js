/* ============================================================================
 * 模型档案 · gallery.js
 * 读取 works.json → 渲染作品墙 / 筛选 / 详情抽屉。零依赖，全部原生。
 * 新增作品只需要往 works.json 里加一条，并把封面放进 covers/。
 * ========================================================================== */
(() => {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const wall = $('#geWall');
  const emptyBox = $('#geEmpty');
  const filtersBox = $('#geFilters');
  const searchInput = $('#geSearch');
  const lb = $('#geLightbox');
  const compareBox = $('#geCompare');

  const state = { works: [], theme: 'all', engine: 'all', q: '', list: [], view: 'wall' };
  let lastFocus = null;

  /* ---------- 工具 ---------- */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const fmtDate = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[2]}.${m[3]}` : (iso || '—');
  };
  const shortDate = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '—';
  };
  const pad2 = n => String(n).padStart(2, '0');

  /* ---------- 模型：名字、配色、同题分组 ---------- */
  const MODEL_PALETTE = ['#ff7500', '#2f8f7f', '#7b5cc4', '#2f6fb5', '#a8761c', '#c2452f'];
  const modelName = w => (w.engine || '').trim() || '未标注';
  const sceneOf = w => w.scene || w.id;
  function modelColor(name) {
    if (!name || name === '未标注') return null;
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return MODEL_PALETTE[h % MODEL_PALETTE.length];
  }
  function modelTag(w, cls) {
    const name = modelName(w);
    const tag = el('span', cls || 'ge-model');
    const color = modelColor(name);
    if (color) {
      const dot = el('i', 'ge-dot');
      dot.style.background = color;
      tag.append(dot);
    } else {
      tag.classList.add('is-unknown');
    }
    tag.append(document.createTextNode(name));
    return tag;
  }
  const variantCount = w => state.works.filter(x => sceneOf(x) === sceneOf(w)).length;
  // 按 scene 分组，组内按入库时间倒序；组之间按最新一条排序
  function groupScenes(list) {
    const map = new Map();
    list.forEach(w => {
      const key = sceneOf(w);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(w);
    });
    return [...map.entries()].map(([key, items]) => {
      items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return {
        key,
        name: items[0].sceneName || items[0].title,
        prompt: (items.find(w => (w.prompt || '').trim()) || {}).prompt || '',
        items
      };
    }).sort((a, b) => (b.items[0].date || '').localeCompare(a.items[0].date || ''));
  }

  /* ---------- 主题 / 页脚 ---------- */
  function initShared() {
    const toggle = $('#themeToggle');
    if (toggle) {
      toggle.textContent = document.body.classList.contains('light') ? '☾' : '☼';
      toggle.addEventListener('click', () => {
        const light = document.body.classList.toggle('light');
        toggle.textContent = light ? '☾' : '☼';
        try { localStorage.setItem('muse-theme', light ? 'light' : 'dark'); } catch (e) { /* 忽略 */ }
      });
    }
    const year = $('#footerYear');
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ---------- 渲染 ---------- */
  function renderStats() {
    const works = state.works;
    const engines = new Set(works.map(w => (w.engine || '').trim()).filter(Boolean));
    const interactive = works.filter(w => w.interactive).length;
    const latest = works.reduce((acc, w) => (w.date > acc ? w.date : acc), '');
    $('#geStatWorks').textContent = pad2(works.length);
    $('#geStatEngines').textContent = pad2(engines.size);
    $('#geStatInteractive').textContent = pad2(interactive);
    $('#geStatUpdated').textContent = latest ? shortDate(latest) : '—';
    $('#geTotal').textContent = pad2(works.length);

    const terminal = $('#geTerminal');
    if (!terminal) return;
    const lines = works.slice(0, 3).map(w =>
      `<span class="t-accent">№${String(w.index || '').padStart(3, '0')}</span> ${escapeHtml(w.title)} <span class="t-dim">${fmtDate(w.date)}</span>`
    );
    terminal.innerHTML = '<span class="t-dim">INTAKE QUEUE · 入库队列</span><br>' +
      lines.join('<br>') + '<br><span class="t-ok">✓ SYNCED</span> <span class="t-dim">' +
      pad2(works.length) + ' FILES</span> <span class="ge-cursor"></span>';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function buildFilters() {
    const themes = [...new Set(state.works.map(w => w.theme).filter(Boolean))];
    const engines = [...new Set(state.works.map(w => (w.engine || '').trim()).filter(Boolean))];
    filtersBox.replaceChildren();

    // 总开关：一次清空题材与引擎
    const all = el('button', 'ge-chip', '全部');
    all.type = 'button';
    all.dataset.key = 'all';
    all.dataset.value = 'all';
    all.setAttribute('aria-pressed', String(state.theme === 'all' && state.engine === 'all'));
    all.append(el('b', '', String(state.works.length)));
    filtersBox.append(all);

    const group = (label, key, items) => {
      if (!items.length) return;
      filtersBox.append(el('span', 'ge-f-label', label));
      items.forEach(value => {
        const count = state.works.filter(w => (key === 'theme' ? w.theme : (w.engine || '').trim()) === value).length;
        const chip = el('button', 'ge-chip', value);
        chip.type = 'button';
        chip.dataset.key = key;
        chip.dataset.value = value;
        chip.setAttribute('aria-pressed', String(state[key] === value));
        chip.append(el('b', '', String(count)));
        filtersBox.append(chip);
      });
    };

    group('题材', 'theme', themes);
    group('引擎', 'engine', engines);
  }

  function syncChipStates() {
    filtersBox.querySelectorAll('.ge-chip').forEach(c => {
      const key = c.dataset.key;
      const value = c.dataset.value;
      const on = key === 'all'
        ? (state.theme === 'all' && state.engine === 'all')
        : state[key] === value;
      c.setAttribute('aria-pressed', String(on));
    });
  }

  function applyFilters() {
    const q = state.q.trim().toLowerCase();
    state.list = state.works.filter(w => {
      if (state.theme !== 'all' && w.theme !== state.theme) return false;
      if (state.engine !== 'all' && (w.engine || '').trim() !== state.engine) return false;
      if (!q) return true;
      const hay = [w.title, w.subtitle, w.theme, w.engine, w.desc, w.prompt, (w.tags || []).join(' ')]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
    render();
  }

  function updateCounter() {
    const list = state.list;
    $('#geShown').textContent = pad2(list.length);
    $('#geTotal').textContent = pad2(state.works.length);
    emptyBox.hidden = list.length !== 0;
  }

  function render() {
    wall.hidden = state.view === 'compare';
    compareBox.hidden = state.view !== 'compare';
    updateCounter();
    if (state.view === 'compare') renderCompare();
    else renderWall();
  }

  function renderWall() {
    wall.replaceChildren();
    const list = state.list;
    list.forEach((w, i) => {
      const card = el('article', 'ge-card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${w.title} — 查看详情`);
      card.dataset.id = w.id;

      const media = el('div', 'ge-media');
      const img = el('img');
      img.src = w.cover;
      img.alt = `${w.title} — ${w.subtitle || ''}`;
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.decoding = 'async';
      media.append(img);

      media.append(el('span', 'ge-idx', `№${String(w.index || i + 1).padStart(3, '0')}`));
      media.append(modelTag(w, 'ge-flag'));
      if (w.pick && variantCount(w) > 1) media.append(el('span', 'ge-adopt', 'ADOPTED · 采用'));

      const hover = el('div', 'ge-hover');
      hover.innerHTML = `<b>${escapeHtml(w.theme || '')}</b><span class="ge-hover-open">查看档案 ↗</span>`;
      media.append(hover);
      card.append(media);

      const body = el('div', 'ge-body');
      const title = el('div', 'ge-title');
      title.append(el('span', '', w.title));
      body.append(title);
      body.append(el('div', 'ge-sub', w.subtitle || ''));

      const meta = el('div', 'ge-meta');
      const dateSpan = el('span');
      dateSpan.append(el('b', '', fmtDate(w.date)));
      meta.append(dateSpan);
      const mediumSpan = el('span');
      mediumSpan.append(el('b', '', w.medium || ''));
      meta.append(mediumSpan);
      const siblings = variantCount(w);
      if (siblings > 1) meta.append(el('span', 'ge-vars', `同题 ${siblings} 版`));
      body.append(meta);
      card.append(body);

      const openDetail = () => openLightbox(list, i);
      card.addEventListener('click', openDetail);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); }
      });
      wall.append(card);
    });
  }

  /* ---------- 同题对比 ---------- */
  function renderCompare() {
    compareBox.replaceChildren();
    const scenes = groupScenes(state.list);
    if (!scenes.length) return;

    scenes.forEach(scene => {
      const row = el('section', 'ge-cmp-row');
      if (scene.items.length === 1) row.classList.add('is-single');

      const head = el('header', 'ge-cmp-head');
      const text = el('div', '');
      text.append(el('h3', '', scene.name));
      if (scene.prompt) text.append(el('p', 'ge-cmp-prompt', `「${scene.prompt}」`));
      head.append(text);
      const models = [...new Set(scene.items.map(modelName))];
      head.append(el('span', 'ge-cmp-count', `${pad2(models.length)} MODEL${models.length > 1 ? 'S' : ''}`));
      row.append(head);

      const track = el('div', 'ge-cmp-track');
      scene.items.forEach(w => {
        const cell = el('article', 'ge-cmp-cell');
        const media = el('button', 'ge-cmp-media');
        media.type = 'button';
        media.setAttribute('aria-label', `查看 ${w.title} 档案`);
        const img = el('img');
        img.src = w.cover;
        img.alt = `${w.title} — ${modelName(w)}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        media.append(img);
        if (w.pick && scene.items.length > 1) media.append(el('span', 'ge-adopt ge-adopt--inline', 'ADOPTED · 采用'));
        media.addEventListener('click', () => {
          const idx = state.list.indexOf(w);
          if (idx >= 0) openLightbox(state.list, idx);
        });
        cell.append(media);

        const meta = el('div', 'ge-cmp-meta');
        meta.append(modelTag(w));
        meta.append(el('span', 'ge-cmp-date', fmtDate(w.date)));
        cell.append(meta);
        track.append(cell);
      });

      row.append(track);
      compareBox.append(row);
    });
  }

  /* ---------- 详情抽屉 ---------- */
  let lbIndex = 0;

  function openLightbox(list, index) {
    if (!list.length) return;
    lbIndex = index;
    lastFocus = document.activeElement;
    paintLightbox(list[lbIndex]);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#geLbClose').focus({ preventScroll: true });
  }

  function paintLightbox(w) {
    if (!w) return;
    const list = state.list;
    $('#geLbImg').src = w.cover;
    $('#geLbImg').alt = `${w.title} — ${w.subtitle || ''}`;
    $('#geLbKicker').textContent = `ARCHIVE NO.${String(w.index || '').padStart(3, '0')} · ${modelName(w)} · ${w.theme || ''}`;
    $('#geLbTitle').textContent = w.title;
    $('#geLbSub').textContent = w.subtitle || '';
    $('#geLbDesc').textContent = w.desc || '';

    const specs = $('#geLbSpecs');
    specs.replaceChildren();
    const rows = [
      ['媒介 MEDIUM', w.medium || '—'],
      ['生成引擎 ENGINE', (w.engine || '').trim() || '未标注'],
      ['入库日期 DATE', shortDate(w.date)],
      ['交互 INTERACTIVE', w.interactive ? 'YES · 可旋转浏览' : 'NO · 静态画面']
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.append(el('span', '', k));
      row.append(el('b', '', v));
      specs.append(row);
    });

    const promptBox = $('#geLbPromptBox');
    if ((w.prompt || '').trim()) {
      promptBox.hidden = false;
      $('#geLbPrompt').textContent = w.prompt.trim();
    } else {
      promptBox.hidden = true;
    }

    const tags = $('#geLbTags');
    tags.replaceChildren();
    (w.tags || []).forEach(t => tags.append(el('i', '', t)));

    // 同题其他模型：在详情里就能横向换着看
    const varBox = $('#geLbVariants');
    const sibs = state.list.filter(x => sceneOf(x) === sceneOf(w) && x.id !== w.id);
    varBox.replaceChildren();
    if (sibs.length) {
      varBox.hidden = false;
      varBox.append(el('div', 'ge-lb-label', '同题其他模型 · SAME BRIEF'));
      const strip = el('div', 'ge-lb-vars');
      sibs.forEach(s => {
        const btn = el('button', 'ge-lb-var');
        btn.type = 'button';
        const thumb = el('img');
        thumb.src = s.cover;
        thumb.alt = modelName(s);
        thumb.loading = 'lazy';
        btn.append(thumb);
        btn.append(modelTag(s, 'ge-lb-var-tag'));
        btn.addEventListener('click', () => {
          const idx = state.list.indexOf(s);
          if (idx >= 0) { lbIndex = idx; paintLightbox(state.list[idx]); }
        });
        strip.append(btn);
      });
      varBox.append(strip);
    } else {
      varBox.hidden = true;
    }

    const open = $('#geLbOpen');
    open.href = w.href || '#';
    open.textContent = w.interactive ? '进入场景 ↗' : '查看大图 ↗';
    open.style.display = w.href ? '' : 'none';

    // 首尾循环
    $('#geLbPrev').disabled = list.length < 2;
    $('#geLbNext').disabled = list.length < 2;
  }

  function closeLightbox() {
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function step(delta) {
    const list = state.list;
    if (list.length < 2) return;
    lbIndex = (lbIndex + delta + list.length) % list.length;
    paintLightbox(list[lbIndex]);
  }

  /* ---------- 事件 ---------- */
  function bindEvents() {
    filtersBox.addEventListener('click', e => {
      const chip = e.target.closest('.ge-chip');
      if (!chip) return;
      const key = chip.dataset.key;
      if (key === 'all') {
        state.theme = 'all';
        state.engine = 'all';
      } else {
        // 再点一次已选中的标签 = 取消该组筛选
        state[key] = (state[key] === chip.dataset.value) ? 'all' : chip.dataset.value;
      }
      syncChipStates();
      applyFilters();
    });

    let timer = 0;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = searchInput.value; applyFilters(); }, 120);
    });

    // 视图切换：档案墙 / 同题对比
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
        render();
      });
    });

    $('#geRandom').addEventListener('click', () => {
      if (!state.list.length) return;
      openLightbox(state.list, Math.floor(Math.random() * state.list.length));
    });

    $('#geLbClose').addEventListener('click', closeLightbox);
    $('#geLbPrev').addEventListener('click', () => step(-1));
    $('#geLbNext').addEventListener('click', () => step(1));
    lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });

    $('#geLbCopy').addEventListener('click', async () => {
      const w = state.list[lbIndex];
      if (!w) return;
      const url = new URL(w.href || './', location.href).href;
      const btn = $('#geLbCopy');
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = '已复制 ✓';
      } catch (e) {
        btn.textContent = '复制失败';
      }
      setTimeout(() => { btn.textContent = '复制链接'; }, 1600);
    });

    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });

    // 从钱包/外链带 hash 进来时，直接展开对应作品
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (id) {
      const i = state.list.findIndex(w => w.id === id);
      if (i >= 0) openLightbox(state.list, i);
    }
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    initShared();
    try {
      const data = window.GEN_WORKS;
      if (!data || !Array.isArray(data.works) || !data.works.length) throw new Error('no data');
      state.works = data.works.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.index || '').localeCompare(b.index || ''));
      buildFilters();
      renderStats();
      state.list = state.works.slice();
      render();
      bindEvents();
    } catch (err) {
      wall.innerHTML = '';
      emptyBox.hidden = false;
      emptyBox.textContent = '作品数据没能载入 —— 请确认 gallery/works.js 存在且格式正确。';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
