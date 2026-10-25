// ============================================================================
// pages/library.js —— 提示词库页面
// 归属：前端·库与编辑器（SPEC 8.6 · library.js）
// 功能：搜索（防抖 300ms）/集合/标签/排序筛选、卡片网格、新建、删除、空态、深链同步。
// 依赖契约模块：../api.js、../ui.js、../router.js、../state.js（由框架模块提供）。
// 说明：本模块被 import 时不执行任何访问 window/document 的顶层代码（SPEC 第 0 节）。
// ============================================================================

import { api } from '../api.js?v=4';
import { h, toast, openModal, confirmDialog, timeAgo, ICONS } from '../ui.js?v=4';
import { navigate } from '../router.js?v=4';
import { store } from '../state.js?v=5';

/** 搜索防抖时长（SPEC 8.6：输入即筛，防抖 300ms） */
const SEARCH_DEBOUNCE_MS = 300;

/** 排序选项：value 与 GET /api/prompts 的 sort 参数取值逐字一致（updated|created|title） */
const SORT_OPTIONS = [
  { value: 'updated', label: '最近更新' },
  { value: 'created', label: '创建时间' },
  { value: 'title', label: '按标题' },
];

/** 页面私有样式（以 <style> 注入 root，不修改 base.css；复用其中公共类） */
const PAGE_CSS = `
  .pl-lib-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
  .pl-lib-search { position: relative; flex: 1 1 240px; min-width: 200px; }
  .pl-lib-search .input { width: 100%; box-sizing: border-box; padding-left: 34px; }
  .pl-lib-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: 0.55; pointer-events: none; font-size: 13px; }
  .pl-lib-select { width: auto; min-width: 120px; }
  .pl-lib-count { font-size: 12px; color: var(--muted); white-space: nowrap; margin-left: auto; padding-right: 8px; }
  .pl-lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .pl-lib-loading { grid-column: 1 / -1; color: var(--muted); padding: 40px 0; text-align: center; }
  .pl-lib-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 16px; cursor: pointer; transition: border-color .15s, transform .15s, box-shadow .15s; }
  .pl-lib-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .pl-lib-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
  .pl-lib-card:hover .pl-lib-actions, .pl-lib-actions:focus-within { opacity: 1; }
  @media (hover: none) { .pl-lib-actions { opacity: 1; } }
  .pl-lib-act { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); cursor: pointer; font-size: 13px; line-height: 1; padding: 0; transition: background .15s, border-color .15s, color .15s; }
  .pl-lib-act:hover { border-color: var(--accent); background: var(--accent); color: #fff; }
  .pl-lib-act-danger:hover { border-color: var(--danger); background: var(--danger); }
  .pl-lib-title { font-weight: 600; font-size: 15px; padding-right: 56px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pl-lib-desc { color: var(--muted); font-size: 13px; line-height: 1.5; min-height: 39px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pl-lib-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .pl-lib-meta { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .pl-lib-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .pl-lib-col { display: inline-flex; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pl-lib-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; flex: none; }
  .pl-lib-ver { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pl-lib-never { opacity: 0.7; white-space: nowrap; }
  .pl-lib-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; text-align: center; }
  .pl-lib-empty-icon { font-size: 36px; opacity: 0.6; }
  .pl-lib-empty-title { font-size: 16px; font-weight: 600; }
  .pl-lib-empty-sub { color: var(--muted); font-size: 13px; max-width: 380px; line-height: 1.6; }
  .pl-lib-error { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 16px; color: var(--muted); text-align: center; }
  .pl-lib-form { display: flex; flex-direction: column; gap: 12px; }
  .pl-lib-modal-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .pl-lib-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
`;

// —— 模块级状态（跨本页多次 render 保留；均为普通变量，不访问 window/document）——
let searchTimer = null;      // 搜索防抖定时器
let searchHadFocus = false;  // 渲染前搜索框是否持有焦点（hash 变化触发重渲染后恢复焦点用）
let renderGen = 0;           // 渲染代号：用于识别路由器是否已因 hash 变化重新渲染本页

/** 解析「逗号分隔标签」输入 → 去重标签数组（兼容全角逗号） */
function parseTags(text) {
  const out = [];
  const seen = new Set();
  for (const part of String(text || '').split(/[,，]/)) {
    const t = part.trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

/** 表单字段行：label 文本 + 控件（复用 base.css 的 .form-row/.label） */
function fieldRow(labelText, control) {
  return h('div', { class: 'form-row' }, [h('div', { class: 'label' }, labelText), control]);
}

/** 填充「筛选用」集合下拉：全部集合 / 各集合 / 未分组（值 "null" 与后端筛选约定一致） */
function fillFilterCollectionOptions(select, collections, selected) {
  const opts = [h('option', { value: '' }, '全部集合')];
  for (const c of collections || []) opts.push(h('option', { value: c.id }, c.name));
  opts.push(h('option', { value: 'null' }, '未分组'));
  select.replaceChildren(...opts);
  select.value = selected || '';
}

/** 填充「筛选用」标签下拉（数据源：/api/stats 的 tagCounts） */
function fillFilterTagOptions(select, tagCounts, selected) {
  const counts = tagCounts || [];
  const opts = [h('option', { value: '' }, '全部标签')];
  // 当前筛选的标签不在 top 列表时补充临时选项，避免下拉显示与实际筛选不一致
  if (selected && !counts.some((t) => t.tag === selected)) {
    opts.push(h('option', { value: selected }, selected + '（当前筛选）'));
  }
  for (const t of counts) opts.push(h('option', { value: t.tag }, t.tag + '（' + t.count + '）'));
  select.replaceChildren(...opts);
  select.value = selected || '';
}

/** 填充「归属用」集合下拉（新建/编辑表单）：未分组 + 各集合 */
function fillPromptCollectionOptions(select, collections, selected) {
  const opts = [h('option', { value: '' }, '未分组')];
  for (const c of collections || []) opts.push(h('option', { value: c.id }, c.name));
  select.replaceChildren(...opts);
  const want = selected || '';
  select.value = want;
  if (select.value !== want) {
    // 集合可能已被删除但 prompt 仍指向它：保留原值，避免静默改为未分组
    select.appendChild(h('option', { value: want }, '未知集合（' + want + '）'));
    select.value = want;
  }
}

/**
 * 页面渲染入口（页面模块契约：export async function render(root, params)）
 * @param {HTMLElement} root 已清空的主内容容器
 * @param {{query?: {q?:string, tag?:string, collectionId?:string, sort?:string}}} params
 */
export async function render(root, params) {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  const myGen = ++renderGen;
  root.replaceChildren();
  root.appendChild(h('style', {}, PAGE_CSS));

  // —— 从深链 query 读取筛选状态（collectionId 为字符串 "null" 时表示筛选未分组）——
  const query = (params && params.query) || {};
  const filters = {
    q: String(query.q || ''),
    tag: String(query.tag || ''),
    collectionId: String(query.collectionId || ''),
    sort: String(query.sort || 'updated'),
  };
  if (!SORT_OPTIONS.some((o) => o.value === filters.sort)) filters.sort = 'updated';

  let latestCollections = []; // 最近一次加载的集合列表（新建弹窗用）

  // —— 工具栏 ——
  const searchInput = h('input', { class: 'input', type: 'text', value: filters.q, placeholder: '搜索标题、描述或正文…' });
  const collectionSelect = h('select', { class: 'select pl-lib-select', title: '按集合筛选' });
  const tagSelect = h('select', { class: 'select pl-lib-select', title: '按标签筛选' });
  const sortSelect = h('select', { class: 'select pl-lib-select', title: '排序方式' });
  fillFilterCollectionOptions(collectionSelect, [], '');
  fillFilterTagOptions(tagSelect, [], '');
  sortSelect.replaceChildren(...SORT_OPTIONS.map((o) => h('option', { value: o.value }, o.label)));
  sortSelect.value = filters.sort;

  const countEl = h('span', { class: 'pl-lib-count' }, '');
  const newBtn = h('button', { class: 'btn btn-primary', onclick: () => openCreateModal() }, ICONS.plus + ' 新建提示词');

  const toolbar = h('div', { class: 'toolbar pl-lib-toolbar' }, [
    h('div', { class: 'pl-lib-search' }, [
      h('span', { class: 'pl-lib-search-icon' }, ICONS.search),
      searchInput,
    ]),
    collectionSelect,
    tagSelect,
    sortSelect,
    countEl,
    newBtn,
  ]);
  root.appendChild(toolbar);

  const gridWrap = h('div', { class: 'grid pl-lib-grid' });
  root.appendChild(gridWrap);

  // hash 变化触发整页重渲染会丢失焦点：若渲染前焦点在搜索框，则恢复并光标置尾
  if (searchHadFocus) {
    try {
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    } catch (_) { /* 焦点恢复失败可忽略 */ }
  }

  // —— 交互：筛选变化 → 同步 #/library?... 深链 ——
  function syncFilters() {
    filters.q = searchInput.value.trim();
    filters.collectionId = collectionSelect.value;
    filters.tag = tagSelect.value;
    filters.sort = sortSelect.value || 'updated';
  }

  function controlsToHash() {
    const qs = new URLSearchParams();
    const q = searchInput.value.trim();
    if (q) qs.set('q', q);
    if (collectionSelect.value) qs.set('collectionId', collectionSelect.value);
    if (tagSelect.value) qs.set('tag', tagSelect.value);
    if (sortSelect.value && sortSelect.value !== 'updated') qs.set('sort', sortSelect.value);
    const s = qs.toString();
    return s ? '#/library?' + s : '#/library';
  }

  function applyControls() {
    const next = controlsToHash();
    if (next === location.hash) { syncFilters(); return; }
    navigate(next);
    // 兜底：若路由器对「同路径、仅 query 变化」的 hash 不触发重渲染，则本页自行刷新列表
    setTimeout(() => {
      if (renderGen === myGen && location.hash === next) {
        syncFilters();
        loadList();
      }
    }, 120);
  }

  searchInput.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchTimer = null; applyControls(); }, SEARCH_DEBOUNCE_MS);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
      applyControls();
    }
  });
  searchInput.addEventListener('focus', () => { searchHadFocus = true; });
  searchInput.addEventListener('blur', () => { searchHadFocus = false; });
  collectionSelect.addEventListener('change', applyControls);
  tagSelect.addEventListener('change', applyControls);
  sortSelect.addEventListener('change', applyControls);

  // —— 列表加载 ——
  async function loadList() {
    gridWrap.replaceChildren(h('div', { class: 'pl-lib-loading' }, '加载中…'));
    store.set({ filters: { q: filters.q, tag: filters.tag || null, collectionId: filters.collectionId || null } });
    const listPromise = api.get('/api/prompts?' + buildListQuery(filters));
    const [colsRes, statsRes] = await Promise.allSettled([
      api.get('/api/collections'),
      api.get('/api/stats'),
    ]);
    if (renderGen !== myGen) return; // 页面已被重新渲染，丢弃本次结果
    const collections = colsRes.status === 'fulfilled' ? colsRes.value : [];
    const tagCounts = statsRes.status === 'fulfilled' ? (statsRes.value.tagCounts || []) : [];
    if (colsRes.status === 'rejected' || statsRes.status === 'rejected') {
      toast('筛选选项加载失败，下拉列表可能不完整', 'error');
    }
    latestCollections = collections;
    fillFilterCollectionOptions(collectionSelect, collections, filters.collectionId);
    fillFilterTagOptions(tagSelect, tagCounts, filters.tag);
    try {
      const data = await listPromise;
      if (renderGen !== myGen) return;
      renderGrid((data && data.items) || [], collections, (data && data.total) || 0);
      store.set({ prompts: (data && data.items) || [] });
    } catch (err) {
      gridWrap.replaceChildren(h('div', { class: 'pl-lib-error' }, [
        h('div', {}, '列表加载失败：' + (err && err.message ? err.message : '未知错误')),
        h('button', { class: 'btn btn-ghost', onclick: () => loadList() }, '重试'),
      ]));
    }
  }

  function renderGrid(items, collections, total) {
    countEl.textContent = items.length ? '共 ' + total + ' 条' : '';
    if (!items.length) {
      gridWrap.replaceChildren(emptyState());
      return;
    }
    const colMap = new Map((collections || []).map((c) => [c.id, c]));
    gridWrap.replaceChildren(...items.map((p) => promptCard(p, colMap.get(p.collectionId) || null)));
  }

  function emptyState() {
    const hasFilter = !!(filters.q || filters.tag || filters.collectionId);
    if (hasFilter) {
      return h('div', { class: 'empty pl-lib-empty' }, [
        h('div', { class: 'pl-lib-empty-icon' }, ICONS.search),
        h('div', { class: 'pl-lib-empty-title' }, '没有匹配的提示词'),
        h('div', { class: 'pl-lib-empty-sub' }, '换个关键词试试，或者清除当前的筛选条件。'),
        h('button', { class: 'btn btn-ghost', onclick: () => navigate('#/library') }, '清除筛选'),
      ]);
    }
    return h('div', { class: 'empty pl-lib-empty' }, [
      h('div', { class: 'pl-lib-empty-icon' }, ICONS.library),
      h('div', { class: 'pl-lib-empty-title' }, '提示词库还是空的'),
      h('div', { class: 'pl-lib-empty-sub' }, '创建第一条提示词，开始积累与打磨你的提示词资产；也可以在「设置」页导入已有数据。'),
      h('button', { class: 'btn btn-primary', onclick: () => openCreateModal() }, ICONS.plus + ' 新建提示词'),
    ]);
  }

  function promptCard(p, col) {
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const kids = [
      h('div', { class: 'pl-lib-actions' }, [
        h('button', { class: 'pl-lib-act', title: '在运行台中测试', onclick: stop(() => navigate('#/playground/' + encodeURIComponent(p.id))) }, ICONS.run),
        h('button', { class: 'pl-lib-act pl-lib-act-danger', title: '删除提示词', onclick: stop(() => removePrompt(p)) }, ICONS.trash),
      ]),
      h('div', { class: 'pl-lib-title', title: p.title }, p.title),
      h('div', { class: 'pl-lib-desc' }, p.description || '（暂无描述）'),
    ];
    if (p.tags && p.tags.length) {
      kids.push(h('div', { class: 'pl-lib-tags' }, p.tags.map((t) => h('span', { class: 'tag' }, t))));
    }
    kids.push(h('div', { class: 'pl-lib-meta' }, [
      h('div', { class: 'pl-lib-meta-row' }, [
        h('span', { class: 'pl-lib-col' }, [
          h('span', { class: 'pl-lib-dot', style: { background: (col && col.color) || 'var(--muted)' } }),
          col ? col.name : '未分组',
        ]),
        h('span', { class: 'pl-lib-ver' }, ICONS.version + ' v' + (p.currentVersion != null ? p.currentVersion : (p.versionsCount != null ? p.versionsCount : 1))),
      ]),
      h('div', { class: 'pl-lib-meta-row' }, [
        h('span', {}, '更新 ' + timeAgo(p.updatedAt)),
        p.lastRunAt
          ? h('span', {}, '上次运行 ' + timeAgo(p.lastRunAt))
          : h('span', { class: 'pl-lib-never' }, '尚未运行'),
      ]),
    ]));
    return h('div', { class: 'card pl-lib-card', onclick: () => navigate('#/prompt/' + encodeURIComponent(p.id)) }, kids);
  }

  async function removePrompt(p) {
    const ok = await confirmDialog('确定删除「' + p.title + '」？其全部版本与运行历史将一并删除，此操作不可恢复。');
    if (!ok) return;
    try {
      await api.del('/api/prompts/' + encodeURIComponent(p.id));
      toast('已删除', 'success');
      await loadList();
    } catch (err) {
      toast('删除失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  // —— 新建提示词弹窗 ——
  function openCreateModal() {
    const titleInput = h('input', { class: 'input', placeholder: '例如：周报一键生成器' });
    const descInput = h('input', { class: 'input', placeholder: '一句话说明用途（可选）' });
    const tagsInput = h('input', { class: 'input', placeholder: '多个标签用逗号分隔，如：润色, 周报' });
    const colSelect = h('select', { class: 'select' });
    fillPromptCollectionOptions(colSelect, latestCollections, '');
    const bodyInput = h('textarea', { class: 'textarea', rows: '8', placeholder: '提示词正文，支持 {{变量名}} 占位符…' });
    const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, '取消');
    const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, '创建');

    const form = h('form', { class: 'pl-lib-form' }, [
      fieldRow('标题', titleInput),
      fieldRow('描述', descInput),
      fieldRow('标签', tagsInput),
      fieldRow('集合', colSelect),
      fieldRow('正文', bodyInput),
      h('div', { class: 'pl-lib-hint' }, '正文中的 {{变量名}} 会在运行时替换为实际值；保存后可在编辑器中继续完善。'),
      h('div', { class: 'pl-lib-modal-btns' }, [cancelBtn, submitBtn]),
    ]);

    const modal = openModal({ title: '新建提示词', content: form, actions: [] });
    cancelBtn.addEventListener('click', () => modal.close());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = titleInput.value.trim();
      const body = bodyInput.value;
      if (!title) { toast('请填写标题', 'error'); titleInput.focus(); return; }
      if (!body.trim()) { toast('请填写正文', 'error'); bodyInput.focus(); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = '创建中…';
      try {
        const created = await api.post('/api/prompts', {
          title,
          description: descInput.value.trim(),
          body,
          tags: parseTags(tagsInput.value),
          collectionId: colSelect.value || null,
        });
        modal.close();
        toast('已创建「' + created.title + '」，正在进入编辑器', 'success');
        navigate('#/prompt/' + encodeURIComponent(created.id));
      } catch (err) {
        toast('创建失败：' + (err && err.message ? err.message : '未知错误'), 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '创建';
      }
    });

    setTimeout(() => { try { titleInput.focus(); } catch (_) { /* 忽略 */ } }, 0);
  }

  await loadList();
}

/** 由筛选状态构造 GET /api/prompts 的查询串 */
function buildListQuery(f) {
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  if (f.tag) qs.set('tag', f.tag);
  if (f.collectionId) qs.set('collectionId', f.collectionId); // "null" 表示未分组
  qs.set('sort', f.sort || 'updated');
  return qs.toString();
}
