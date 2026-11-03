/* ============================================================================
 * 划词批注 · 阅读室注释层（annotate.js）
 * ----------------------------------------------------------------------------
 * 只在 entry.html（阅读页）加载。做四件事：
 *   1. 从仓库读取 annotations/<文章 id>.json，把批注重新贴回正文
 *   2. 划词 → 右侧空白处长出一张卡片 → 写 → 提交到 GitHub 仓库
 *   3. 卡片 / 高亮 / 连接线的定位（Notion 那种侧注）
 *   4. 一次性的 GitHub 授权（token 存在本机，不写进仓库）
 *
 * 数据文件长这样（每篇文章一个）：
 *   { "version": 1, "entry": "notes/xxx",
 *     "annotations": [{ id, quote, prefix, suffix, start, body, author, created, updated }] }
 *
 * 定位策略：先看原文位置还对不对（start + quote 严格相等），
 * 不对就全文找同一句（取离 start 最近的那处），再不行用前后文兜底，
 * 全都失败就降级成「未定位」，画在抽屉里也不丢。
 * ========================================================================== */
(() => {
  'use strict';

  const CONFIG = {
    owner: 'huangxicheng1',
    repo: 'huangxicheng1.github.io',
    branch: 'main',
    dir: 'annotations',
    api: 'https://api.github.com'
  };
  const CARD_W = 262;
  const RAIL_MIN = 1280;
  const CONTEXT = 28;
  const KEY_TOKEN = 'muse-gh-token';
  const KEY_USER = 'muse-gh-user';
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

  const root = document.getElementById('articleBody');
  if (!root) return;
  const entryId = new URLSearchParams(location.search).get('id') || '';
  if (!entryId) return;

  const state = {
    entry: entryId,
    annotations: [],
    sha: null,
    token: readLocal(KEY_TOKEN),
    user: readJSON(KEY_USER),
    resolved: new Map(),
    marks: new Map(),
    cards: new Map(),
    editing: null,
    draft: null,
    hint: null,
    active: null,
    loading: false
  };

  /* ------------------------------------------------------------------ 小工具 */

  function readLocal(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }
  function writeLocal(key, value) {
    try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* 隐身模式下就算了 */ }
  }
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function b64encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function b64decode(text) {
    const binary = atob(String(text || '').replace(/\s+/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)));
  }
  function encodePath(path) {
    return String(path).split('/').map(part => encodeURIComponent(part)).join('/');
  }
  function stamp(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  function shortId() {
    return 'an_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }
  function filePath() {
    return `${CONFIG.dir}/${state.entry}.json`;
  }
  function staticUrl() {
    return `./${encodePath(filePath())}`;
  }

  let toastTimer = 0;
  function toast(message, hold) {
    let node = document.querySelector('.an-toast');
    if (!node) {
      node = el('div', 'an-toast');
      document.body.append(node);
    }
    node.textContent = message;
    node.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-on'), hold || 2600);
  }

  /* -------------------------------------------------------------- 正文定位 */

  function textIndex() {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = '';
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue;
      if (!value) continue;
      nodes.push({ node, start: text.length });
      text += value;
    }
    return { nodes, text };
  }

  function resolveAnchor(ann, text) {
    const quote = ann.quote;
    if (!quote) return null;
    if (typeof ann.start === 'number' && text.startsWith(quote, ann.start)) {
      return { start: ann.start, end: ann.start + quote.length };
    }
    let best = -1;
    if (typeof ann.start === 'number') {
      let bestGap = Infinity;
      let index = text.indexOf(quote);
      while (index !== -1) {
        const gap = Math.abs(index - ann.start);
        if (gap < bestGap) { bestGap = gap; best = index; }
        index = text.indexOf(quote, index + 1);
      }
    } else {
      best = text.indexOf(quote);
    }
    if (best !== -1) return { start: best, end: best + quote.length };
    const prefix = ann.prefix || '';
    const suffix = ann.suffix || '';
    if (prefix || suffix) {
      const at = text.indexOf(prefix + quote + suffix);
      if (at !== -1) {
        const start = at + prefix.length;
        return { start, end: start + quote.length };
      }
    }
    return null;
  }

  function clearMarks() {
    const marks = root.querySelectorAll('mark.an-mark');
    if (!marks.length) return;
    for (const mark of marks) {
      const text = document.createTextNode(mark.textContent);
      mark.replaceWith(text);
    }
    root.normalize();
  }

  function applyMarks() {
    clearMarks();
    state.resolved.clear();
    state.marks.clear();
    const { nodes, text } = textIndex();
    const plans = new Map();
    const used = new Map();
    for (const ann of state.annotations) {
      const range = resolveAnchor(ann, text);
      if (!range) continue;
      state.resolved.set(ann.id, range);
      const key = `${range.start}:${range.end}`;
      if (used.has(key)) continue;
      used.set(key, ann.id);
      for (const item of nodes) {
        const size = item.node.nodeValue.length;
        const from = Math.max(range.start, item.start) - item.start;
        const to = Math.min(range.end, item.start + size) - item.start;
        if (to <= from) continue;
        const plan = plans.get(item.node) || [];
        plan.push({ from, to, id: ann.id });
        plans.set(item.node, plan);
      }
    }
    for (const [textNode, plan] of plans) {
      plan.sort((a, b) => b.from - a.from);
      for (const seg of plan) {
        let target = textNode;
        if (seg.to < target.nodeValue.length) target.splitText(seg.to);
        if (seg.from > 0) target = target.splitText(seg.from);
        const mark = el('mark', 'an-mark');
        mark.dataset.an = seg.id;
        mark.textContent = target.nodeValue;
        target.replaceWith(mark);
        const list = state.marks.get(seg.id) || [];
        list.push(mark);
        state.marks.set(seg.id, list);
      }
    }
  }

  /* -------------------------------------------------------------- 侧栏卡片 */

  const rail = el('div', 'an-rail');
  rail.setAttribute('aria-label', '划词批注');
  document.body.append(rail);

  const hint = el('button', 'an-hint');
  hint.type = 'button';
  hint.title = '给这段写批注';
  hint.setAttribute('aria-label', '给选中的文字写批注');
  hint.textContent = '＋';
  document.body.append(hint);

  const pop = el('div', 'an-pop');
  document.body.append(pop);

  function ordered() {
    return [...state.annotations].sort((a, b) => {
      const ra = state.resolved.get(a.id);
      const rb = state.resolved.get(b.id);
      if (ra && rb) return ra.start - rb.start;
      if (ra) return -1;
      if (rb) return 1;
      return String(a.created || '').localeCompare(String(b.created || ''));
    });
  }

  function annotationIndex(id) {
    const list = ordered();
    const at = list.findIndex(item => item.id === id);
    return at < 0 ? 0 : at + 1;
  }

  function buildCard(ann) {
    const card = el('div', 'an-card');
    card.dataset.an = ann.id;
    card.style.transform = 'translate3d(-9999px, 0, 0)';
    const head = el('div', 'an-card-top');
    const label = el('b', '', '批注 ' + String(annotationIndex(ann.id)).padStart(2, '0'));
    const time = el('span', '', stamp(ann.created));
    head.append(label, time);
    const quote = el('p', 'an-card-quote', '“' + String(ann.quote || '').trim() + '”');
    const body = el('div', 'an-card-body', ann.body || '');
    const actions = el('div', 'an-card-actions');
    const edit = el('button', '', '编辑');
    edit.type = 'button';
    const remove = el('button', 'is-danger', '删除');
    remove.type = 'button';
    actions.append(edit, remove);
    card.append(head, quote, body, actions);

    edit.addEventListener('click', event => {
      event.stopPropagation();
      beginEdit(ann, card);
    });
    remove.addEventListener('click', event => {
      event.stopPropagation();
      askDelete(ann, remove);
    });
    card.addEventListener('mouseenter', () => setActive(ann.id, true));
    card.addEventListener('mouseleave', () => setActive(ann.id, false));
    return card;
  }

  function setActive(id, on) {
    const marks = state.marks.get(id) || [];
    for (const mark of marks) mark.classList.toggle('is-active', on);
    const card = state.cards.get(id);
    if (card) card.el.classList.toggle('is-active', on);
    if (on) state.active = id;
  }

  function renderCards() {
    for (const entry of state.cards.values()) {
      entry.el.remove();
      entry.link.remove();
      entry.dot.remove();
    }
    state.cards.clear();
    for (const ann of ordered()) {
      if (!state.marks.has(ann.id)) continue;
      if (state.draft && state.draft.id === ann.id) continue;
      const card = buildCard(ann);
      const link = el('i', 'an-link');
      const dot = el('i', 'an-dot');
      rail.append(card, link, dot);
      state.cards.set(ann.id, { el: card, link, dot });
    }
  }

  function layout() {
    const hasMarks = state.annotations.some(ann => state.marks.has(ann.id));
    const wide = window.innerWidth >= RAIL_MIN && hasMarks;
    document.body.classList.toggle('an-wide', wide);
    rail.classList.toggle('is-on', wide);
    if (!wide) {
      closePopover();
      return;
    }
    const panel = document.querySelector('.reader-panel');
    const panelRight = panel ? panel.getBoundingClientRect().right : window.innerWidth / 2;
    const limit = window.innerWidth - 24 - CARD_W;
    const left = Math.max(12, Math.min(panelRight + 44, limit));
    const items = [];
    for (const [id, entry] of state.cards) {
      const marks = state.marks.get(id);
      if (!marks || !marks.length) {
        entry.el.classList.add('is-hidden');
        continue;
      }
      const first = marks[0].getBoundingClientRect();
      const last = marks[marks.length - 1].getBoundingClientRect();
      const top = first.top;
      const away = last.bottom < -160 || first.top > window.innerHeight + 160;
      entry.el.classList.toggle('is-hidden', away);
      items.push({ entry, top, first, last, away });
    }
    items.sort((a, b) => a.top - b.top);
    let floor = 8;
    for (const item of items) {
      if (item.away) continue;
      const height = item.entry.el.offsetHeight || 90;
      let y = Math.max(item.top - 6, floor);
      y = Math.min(y, window.innerHeight - height - 12);
      y = Math.max(y, 8);
      floor = y + height + 12;
      item.entry.el.style.transform = `translate3d(${left}px, ${y}px, 0)`;
      const anchorX = panelRight + 6;
      const gap = left - anchorX;
      if (gap > 8 && !item.away) {
        item.entry.link.style.display = '';
        item.entry.link.style.left = `${anchorX}px`;
        item.entry.link.style.top = `${y + 16}px`;
        item.entry.link.style.width = `${gap - 10}px`;
        item.entry.dot.style.display = '';
        item.entry.dot.style.left = `${anchorX + 2}px`;
        item.entry.dot.style.top = `${y + 16}px`;
      } else {
        item.entry.link.style.display = 'none';
        item.entry.dot.style.display = 'none';
      }
    }
  }

  let layoutJob = 0;
  function scheduleLayout() {
    if (layoutJob) return;
    layoutJob = requestAnimationFrame(() => {
      layoutJob = 0;
      layout();
    });
  }

  /* -------------------------------------------------------------- 抽屉 / 状态 */

  const dock = el('button', 'an-dock');
  dock.type = 'button';
  const dockLabel = el('span', '', '批注');
  const dockCount = el('span', 'an-count', '0');
  const dockLive = el('i', 'an-dot-live');
  dock.append(dockLive, dockLabel, dockCount);
  document.body.append(dock);

  const drawer = el('aside', 'an-drawer');
  drawer.hidden = true;
  document.body.append(drawer);

  function renderDrawer() {
    drawer.replaceChildren();
    const head = el('div', 'an-drawer-head');
    const title = el('span');
    title.append(el('b', '', `批注 · ${state.annotations.length}`), document.createTextNode(`  ·  ${stamp()}`));
    const close = el('button', 'an-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭批注列表');
    close.addEventListener('click', () => setDrawer(false));
    head.append(title, close);
    const body = el('div', 'an-drawer-body');
    if (!state.annotations.length) {
      body.append(el('p', 'an-empty', state.loading ? '正在取这篇的批注…' : '这篇还没批注。选中一段文字，就会出现一个「＋」，点它就开写。'));
    } else {
      for (const ann of ordered()) {
        const item = el('button', 'an-item');
        item.type = 'button';
        const orphan = !state.resolved.has(ann.id);
        if (orphan) item.classList.add('is-orphan');
        const top = el('div', 'an-item-top');
        top.append(document.createTextNode('批注 ' + String(annotationIndex(ann.id)).padStart(2, '0') + ' · ' + stamp(ann.created)));
        if (orphan) top.append(document.createTextNode('  · 未定位'));
        const quote = el('div', 'an-item-quote', '“' + String(ann.quote || '').trim() + '”');
        const text = el('div', 'an-item-body', ann.body || '');
        item.append(top, quote, text);
        item.addEventListener('click', () => {
          setDrawer(false);
          focusAnnotation(ann.id);
        });
        body.append(item);
      }
    }
    drawer.append(head, body, accountBar());
  }

  function accountBar() {
    const bar = el('div', 'an-acct');
    if (state.user && state.token) {
      if (state.user.avatar) {
        const img = el('img');
        img.src = state.user.avatar;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        bar.append(img);
      }
      bar.append(el('b', '', state.user.login || '已登录'));
      const out = el('button', '', '退出');
      out.type = 'button';
      out.addEventListener('click', () => {
        state.token = '';
        state.user = null;
        writeLocal(KEY_TOKEN, '');
        writeLocal(KEY_USER, '');
        dock.classList.remove('is-live');
        renderDrawer();
        toast('已退出，批注仍然只读可见');
      });
      bar.append(out);
    } else {
      bar.append(el('span', '', '只读浏览中'));
      const go = el('button', '', '登录以写批注');
      go.type = 'button';
      go.addEventListener('click', () => openLogin());
      bar.append(go);
    }
    return bar;
  }

  function setDrawer(open) {
    drawer.hidden = !open;
    document.body.classList.toggle('an-drawer-open', open);
    if (open) renderDrawer();
  }

  dock.addEventListener('click', () => setDrawer(drawer.hidden));

  function renderStatus() {
    dockCount.textContent = String(state.annotations.length);
    dockCount.hidden = state.annotations.length === 0;
    dock.classList.toggle('is-live', Boolean(state.token));
    if (!drawer.hidden) renderDrawer();
  }

  function focusAnnotation(id) {
    const marks = state.marks.get(id);
    if (!marks || !marks.length) {
      toast('这段原文已经改过了，批注还留着，可以在列表里编辑或删除');
      return;
    }
    setActive(id, true);
    marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    marks.forEach(mark => {
      mark.classList.remove('is-flash');
      void mark.offsetWidth;
      mark.classList.add('is-flash');
      setTimeout(() => mark.classList.remove('is-flash'), 1200);
    });
    const card = state.cards.get(id);
    if (card) card.el.classList.add('is-active');
    if (window.innerWidth < RAIL_MIN) openPopover(id, marks[0]);
  }

  /* -------------------------------------------------------------- 划词浮标 */

  function boundaryOffset(container, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(container, offset);
    return range.toString().length;
  }

  function currentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const raw = range.toString();
    if (!raw || !raw.trim() || raw.trim().length < 2) return null;
    const start = boundaryOffset(range.startContainer, range.startOffset);
    const end = boundaryOffset(range.endContainer, range.endOffset);
    if (end <= start) return null;
    return { range, start, end, text: raw };
  }

  function hideHint() {
    hint.classList.remove('is-on');
    state.hint = null;
  }

  function showHint(selection) {
    const rect = selection.range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hideHint(); return; }
    const x = Math.min(Math.max(rect.right + 14, 24), window.innerWidth - 24);
    const y = Math.min(Math.max(rect.top + Math.min(rect.height / 2, 20), 24), window.innerHeight - 24);
    hint.style.left = `${x}px`;
    hint.style.top = `${y}px`;
    hint.classList.add('is-on');
    state.hint = selection;
  }

  function checkSelection() {
    if (state.draft) return;
    const selection = currentSelection();
    if (!selection) { hideHint(); return; }
    const inside = selection.range.startContainer.parentElement?.closest?.('.an-mark');
    hint.textContent = inside ? '✎' : '＋';
    hint.title = inside ? '编辑这条批注' : '给这段写批注';
    showHint(selection);
  }

  hint.addEventListener('mousedown', event => event.preventDefault());
  hint.addEventListener('click', () => {
    const selection = state.hint;
    if (!selection) return;
    const mark = selection.range.startContainer.parentElement?.closest?.('.an-mark');
    hideHint();
    if (mark) {
      const id = mark.dataset.an;
      const ann = state.annotations.find(item => item.id === id);
      if (ann) {
        const card = state.cards.get(id);
        if (card) beginEdit(ann, card.el);
        else if (window.innerWidth < RAIL_MIN) openPopover(id, mark, true);
        return;
      }
    }
    beginCompose(selection);
  });

  document.addEventListener('pointerup', event => {
    if (rail.contains(event.target) || pop.contains(event.target)) return;
    if (drawer.contains(event.target) || dock.contains(event.target)) return;
    setTimeout(checkSelection, 0);
  });
  document.addEventListener('keyup', event => {
    if (event.key === 'Shift' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      setTimeout(checkSelection, 0);
    }
    if (event.key === 'Escape') {
      hideHint();
      closePopover();
    }
  });
  window.addEventListener('scroll', () => {
    hideHint();
    scheduleLayout();
  }, { passive: true });
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) hideHint();
  });

  /* -------------------------------------------------------------- 新建 / 编辑 */

  function insideRail(card) {
    if (document.body.classList.contains('an-wide')) {
      rail.append(card);
      return 'rail';
    }
    pop.replaceChildren(card);
    pop.classList.add('is-on');
    return 'pop';
  }

  function placeDraft(card, selection) {
    if (document.body.classList.contains('an-wide')) {
      const panel = document.querySelector('.reader-panel');
      const panelRight = panel ? panel.getBoundingClientRect().right : window.innerWidth / 2;
      const limit = window.innerWidth - 24 - CARD_W;
      const left = Math.max(12, Math.min(panelRight + 44, limit));
      const rect = selection.range.getBoundingClientRect();
      const top = Math.min(Math.max(rect.top - 6, 8), window.innerHeight - 200);
      card.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    } else {
      const rect = selection.range.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 32);
      const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
      const top = Math.min(Math.max(rect.bottom + 12, 70), window.innerHeight - 260);
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    }
  }

  function beginCompose(selection) {
    if (!canWrite()) { openLogin(); return; }
    closePopover();
    const card = el('div', 'an-card is-draft is-editing');
    card.dataset.an = 'draft';
    const head = el('div', 'an-card-top');
    head.append(el('b', '', '新批注'), el('span', '', stamp()));
    const quote = el('p', 'an-card-quote', '“' + selection.text.trim().slice(0, 160) + '”');
    const area = el('textarea');
    area.placeholder = '这段让你想到什么？（Ctrl / ⌘ + Enter 保存）';
    area.rows = 3;
    const foot = el('div', 'an-card-foot');
    const save = el('button', 'an-btn is-primary', '保存');
    save.type = 'button';
    const cancel = el('button', 'an-btn', '取消');
    cancel.type = 'button';
    const tip = el('span', 'an-hintkey', 'Ctrl + Enter');
    foot.append(save, cancel, tip);
    card.append(head, quote, area, foot);

    const mode = insideRail(card);
    placeDraft(card, selection);
    setTimeout(() => area.focus(), 30);

    state.draft = { selection, card, mode };

    const finish = () => {
      state.draft = null;
      card.remove();
      closePopover();
    };
    cancel.addEventListener('click', finish);
    area.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        save.click();
      }
    });
    save.addEventListener('click', () => {
      const body = area.value.trim();
      if (!body) { area.focus(); toast('写点什么再保存'); return; }
      const overlap = overlapping(selection.start, selection.end);
      if (overlap) {
        toast('这段和「批注 ' + String(annotationIndex(overlap.id)).padStart(2, '0') + '」重叠了');
        return;
      }
      const text = textIndex().text;
      const annotation = {
        id: shortId(),
        quote: selection.text.trim(),
        prefix: text.slice(Math.max(0, selection.start - CONTEXT), selection.start).trimStart(),
        suffix: text.slice(selection.end, selection.end + CONTEXT).trimEnd(),
        start: selection.start,
        body,
        author: state.user ? state.user.login : '',
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
      save.disabled = true;
      commit({ type: 'upsert', annotation }, `批注：${state.entry}`)
        .then(() => { finish(); toast('已提交到仓库 · 约 1 分钟后线上可见', 3600); })
        .catch(error => {
          save.disabled = false;
          reportError(error);
        });
    });
  }

  function overlapping(start, end) {
    for (const ann of state.annotations) {
      const range = state.resolved.get(ann.id);
      if (!range) continue;
      if (start < range.end && end > range.start) return ann;
    }
    return null;
  }

  function beginEdit(ann, card) {
    if (!canWrite()) { openLogin(); return; }
    if (state.editing) return;
    state.editing = ann.id;
    card.classList.add('is-editing');
    const body = card.querySelector('.an-card-body');
    const quote = card.querySelector('.an-card-quote');
    if (quote) quote.hidden = true;
    const area = el('textarea');
    area.value = ann.body || '';
    area.rows = 3;
    body.replaceWith(area);
    const foot = el('div', 'an-card-foot');
    const save = el('button', 'an-btn is-primary', '保存');
    save.type = 'button';
    const cancel = el('button', 'an-btn', '取消');
    cancel.type = 'button';
    foot.append(save, cancel, el('span', 'an-hintkey', 'Ctrl + Enter'));
    card.append(foot);
    area.focus();

    const close = () => {
      state.editing = null;
      card.classList.remove('is-editing');
      foot.remove();
      if (pop.contains(card)) closePopover();
      render();
    };
    cancel.addEventListener('click', close);
    area.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        save.click();
      }
    });
    save.addEventListener('click', () => {
      const body2 = area.value.trim();
      if (!body2) { area.focus(); return; }
      save.disabled = true;
      const next = { ...ann, body: body2, updated: new Date().toISOString() };
      commit({ type: 'upsert', annotation: next }, `批注修改：${state.entry}`)
        .then(() => {
          state.editing = null;
          if (pop.contains(card)) closePopover();
          render();
          toast('已更新');
        })
        .catch(error => {
          save.disabled = false;
          reportError(error);
        });
    });
  }

  function askDelete(ann, button) {
    if (!canWrite()) { openLogin(); return; }
    if (button.dataset.armed === '1') {
      commit({ type: 'remove', id: ann.id }, `批注删除：${state.entry}`)
        .then(() => { closePopover(); render(); toast('已删除'); })
        .catch(reportError);
      return;
    }
    button.dataset.armed = '1';
    button.textContent = '确认删除？';
    setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = '删除';
    }, 2600);
  }

  /* -------------------------------------------------------------- 浮层（窄屏） */

  let popId = null;
  function openPopover(id, mark, editing) {
    const ann = state.annotations.find(item => item.id === id);
    if (!ann) return;
    popId = id;
    const card = buildCard(ann);
    pop.replaceChildren(card);
    pop.classList.add('is-on');
    const rect = mark.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 32);
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
    const top = Math.min(Math.max(rect.bottom + 10, 70), window.innerHeight - 280);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    if (editing) beginEdit(ann, card);
  }
  function closePopover() {
    pop.classList.remove('is-on');
    pop.replaceChildren();
    popId = null;
  }

 /* ------------------------------------------------------------------ 登录 */

  function canWrite() {
    return Boolean(state.token);
  }

  function openLogin() {
    closePopover();
    const modal = el('div', 'an-modal');
    const card = el('div', 'an-modal-card');
    const kicker = el('p', 'an-kicker', 'GITHUB AUTHORIZATION · 一次就好');
    const title = el('h2', '', '写批注需要一次 GitHub 授权');
    const steps = el('ol');
    const step1 = el('li');
    step1.append(document.createTextNode('打开 '));
    const link = el('a', '', 'github.com/settings/personal-access-tokens/new');
    link.href = TOKEN_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    step1.append(link, document.createTextNode('，Token name 随便填，Expiration 建议 90 天。'));
    const step2 = el('li');
    step2.append(document.createTextNode('Repository access 选 '));
    step2.append(el('code', '', 'Only select repositories'));
    step2.append(document.createTextNode(' → '), el('code', '', CONFIG.repo));
    const step3 = el('li');
    step3.append(document.createTextNode('Permissions → Repository permissions → '));
    step3.append(el('code', '', 'Contents'));
    step3.append(document.createTextNode(' 设为 '), el('code', '', 'Read and write'));
    step3.append(document.createTextNode('，别的都不用给。'));
    const step4 = el('li', '', 'Generate token，把那串 ghp_ / github_pat_ 开头的粘到下面。');
    steps.append(step1, step2, step3, step4);

    const input = el('input');
    input.type = 'password';
    input.placeholder = 'github_pat_…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const err = el('p', 'an-err');
    err.hidden = true;
    const foot = el('div', 'an-modal-foot');
    const ok = el('button', 'an-btn is-primary', '保存并验证');
    ok.type = 'button';
    const cancel = el('button', 'an-btn', '先不登');
    cancel.type = 'button';
    foot.append(ok, cancel, el('span', 'an-note', '只存在这台浏览器'));
    const note = el('p', 'an-hintline', '这个 token 只给这一个仓库的 Contents 写权限。它不会被提交进仓库，也不会出现在页面的任何请求里——只会从你的浏览器直接发给 api.github.com。');
    card.append(kicker, title, steps, input, err, foot, note);
    modal.append(card);
    document.body.append(modal);
    setTimeout(() => input.focus(), 40);

    const close = () => modal.remove();
    cancel.addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

    const submit = async () => {
      const token = input.value.trim();
      if (!token) { input.focus(); return; }
      ok.disabled = true;
      ok.textContent = '验证中…';
      err.hidden = true;
      try {
        const res = await fetch(`${CONFIG.api}/user`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'token 不对或者已被撤销' : `验证失败（HTTP ${res.status}）`);
        const user = await res.json();
        state.token = token;
        state.user = { login: user.login, avatar: user.avatar_url };
        writeLocal(KEY_TOKEN, token);
        writeLocal(KEY_USER, JSON.stringify(state.user));
        renderStatus();
        close();
        toast('已登录 ' + user.login);
        setTimeout(checkSelection, 80);
      } catch (error) {
        err.hidden = false;
        err.textContent = error.message || '验证失败，检查网络和 token';
        ok.disabled = false;
        ok.textContent = '保存并验证';
      }
    };
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
    });
  }

  /* ------------------------------------------------------------------ 读写 */

  function apiHeaders() {
    return {
      Authorization: `Bearer ${state.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function contentsUrl() {
    return `${CONFIG.api}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodePath(filePath())}`;
  }

  function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(item => item && typeof item === 'object' && item.id && typeof item.quote === 'string' && String(item.quote).length)
      .map(item => ({
        id: String(item.id),
        quote: String(item.quote),
        prefix: String(item.prefix || ''),
        suffix: String(item.suffix || ''),
        start: Number.isFinite(item.start) ? item.start : undefined,
        body: String(item.body || ''),
        author: String(item.author || ''),
        created: item.created || new Date().toISOString(),
        updated: item.updated || item.created || new Date().toISOString()
      }));
  }

  async function fetchRemote() {
    const res = await fetch(`${contentsUrl()}?ref=${encodeURIComponent(CONFIG.branch)}&t=${Date.now()}`, {
      headers: apiHeaders(),
      cache: 'no-store'
    });
    if (res.status === 404) return { annotations: [], sha: null };
    if (!res.ok) {
      const error = new Error(`读取批注失败（HTTP ${res.status}）`);
      error.status = res.status;
      throw error;
    }
    const data = await res.json();
    const parsed = JSON.parse(b64decode(data.content));
    return { annotations: normalizeList(parsed.annotations), sha: data.sha };
  }

  async function fetchStatic() {
    try {
      const res = await fetch(`${staticUrl()}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return { annotations: [], sha: null };
      const parsed = await res.json();
      return { annotations: normalizeList(parsed.annotations), sha: null };
    } catch {
      return { annotations: [], sha: null };
    }
  }

  async function loadAnnotations() {
    state.loading = true;
    renderStatus();
    let data = null;
    if (state.token) {
      try {
        data = await fetchRemote();
      } catch (error) {
        if (error.status === 401) {
          state.token = '';
          state.user = null;
          writeLocal(KEY_TOKEN, '');
          writeLocal(KEY_USER, '');
          toast('授权失效了，重新登录一下');
        }
        data = null;
      }
    }
    if (!data) data = await fetchStatic();
    state.annotations = data.annotations;
    state.sha = data.sha;
    state.loading = false;
    render();
  }

  async function persist(message) {
    const payload = JSON.stringify({
      version: 1,
      entry: state.entry,
      updated: new Date().toISOString(),
      annotations: ordered()
    }, null, 2);
    const body = {
      message,
      content: b64encode(payload),
      branch: CONFIG.branch
    };
    if (state.sha) body.sha = state.sha;
    const res = await fetch(contentsUrl(), {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      const error = new Error('授权过期了，重新登录一下');
      error.status = 401;
      throw error;
    }
    if (res.status === 409) {
      const error = new Error('远端刚被改过');
      error.status = 409;
      throw error;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const error = new Error(res.status === 403 ? '这个 token 没有写 Contents 的权限' : `提交失败（HTTP ${res.status}）${detail ? ' · ' + detail.slice(0, 120) : ''}`);
      error.status = res.status;
      throw error;
    }
    const data = await res.json();
    state.sha = data.content?.sha || state.sha;
  }

  function applyChange(change) {
    if (change.type === 'remove') {
      state.annotations = state.annotations.filter(item => item.id !== change.id);
      return;
    }
    const list = state.annotations.filter(item => item.id !== change.annotation.id);
    list.push(change.annotation);
    state.annotations = list;
  }

  async function commit(change, message) {
    applyChange(change);
    render();
    try {
      await persist(message);
    } catch (error) {
      if (error.status === 409 && state.token) {
        const remote = await fetchRemote();
        state.annotations = remote.annotations;
        state.sha = remote.sha;
        applyChange(change);
        render();
        await persist(message);
        return;
      }
      await loadAnnotations();
      throw error;
    }
  }

  function reportError(error) {
    if (error && error.status === 401) {
      openLogin();
      return;
    }
    toast(error.message || '出错了', 4200);
  }

  /* ------------------------------------------------------------------ 渲染 */

  function render() {
    applyMarks();
    renderCards();
    renderStatus();
    scheduleLayout();
  }

  root.addEventListener('click', event => {
    const mark = event.target.closest?.('.an-mark');
    if (!mark) return;
    const id = mark.dataset.an;
    if (window.innerWidth < RAIL_MIN) openPopover(id, mark);
    else {
      setActive(id, true);
      const card = state.cards.get(id);
      if (card) card.el.classList.add('is-active');
    }
  });

  window.addEventListener('resize', scheduleLayout);

  try {
    render();
    loadAnnotations();
  } catch (error) {
    console.warn('[annotate] 初始化失败', error);
  }
})();
