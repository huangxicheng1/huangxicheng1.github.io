// app.js — 静态版入口（GitHub Pages）：hash 路由 + 部门导航高亮 + 主题（plm-theme）+ 值班时钟。
// 页面模块契约与桌面版一致：export async function render(root, params)。
import { parseHash, navigate } from './router.js?v=4';
import { h, toast } from './ui.js?v=4';
import { store, getSavedTheme, applyTheme } from './state.js?v=4';

const routes = [
  { pattern: '/library', title: '提示词库', en: 'PROMPT LIBRARY', nav: 'library', load: () => import('./pages/library.js?v=6') },
  { pattern: '/prompt/:id', title: '提示词编辑器', en: 'FILE EDITOR', nav: 'library', load: () => import('./pages/editor.js?v=6') },
  { pattern: '/playground/:id', title: '运行测试台', en: 'RUN TERMINAL', nav: 'library', load: () => import('./pages/playground.js?v=6') },
  { pattern: '/runs', title: '运行历史', en: 'RUN HISTORY', nav: 'runs', load: () => import('./pages/runs.js?v=6') },
  { pattern: '/collections', title: '集合管理', en: 'COLLECTION SETS', nav: 'collections', load: () => import('./pages/collections.js?v=6') },
  { pattern: '/stats', title: '统计', en: 'LAB STATS', nav: 'stats', load: () => import('./pages/dashboard.js?v=6') },
  { pattern: '/settings', title: '设置', en: 'CONFIG', nav: 'settings', load: () => import('./pages/settings.js?v=6') },
];

/** 将路由模式（如 '/prompt/:id'）与 path 段数组匹配。 */
function matchRoute(pattern, parts) {
  const segs = pattern.split('/').slice(1);
  if (segs.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.startsWith(':')) {
      if (!parts[i]) return null;
      params[seg.slice(1)] = parts[i];
    } else if (seg !== parts[i]) {
      return null;
    }
  }
  return params;
}

/** 更新部门导航高亮（编辑器/运行台归属提示词库）。 */
function updateNav(activeKey) {
  for (const el of document.querySelectorAll('.dept-nav .dept')) {
    const key = el.dataset.key;
    el.classList.toggle('active', key === activeKey);
    if (key === activeKey) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

/** 渲染 404 兜底视图。 */
function renderNotFound(root, path) {
  root.replaceChildren(
    h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, '🧭'),
      h('div', { class: 'empty-title' }, `页面不存在：${path}`),
      h('div', { class: 'empty-hint' }, '请从上方导航重新进入'),
      h('button', { class: 'btn', onclick: () => navigate('#/library') }, '返回提示词库')),
  );
}

let renderSeq = 0;

/** hashchange 主流程：解析 hash → 匹配路由 → 动态 import 页面模块 → render(root, params)。 */
async function renderRoute() {
  const { path, parts, query } = parseHash();
  const seq = ++renderSeq;

  let matched = null;
  let params = null;
  for (const route of routes) {
    const m = matchRoute(route.pattern, parts);
    if (m) {
      matched = route;
      params = m;
      break;
    }
  }

  updateNav(matched ? matched.nav : null);

  // 区块标题（站点 section-head 语言）
  const head = document.getElementById('pl-head');
  if (head) {
    head.replaceChildren();
    if (matched) {
      const sh = h('div', { class: 'section-head pl-section-head' },
        h('h2', null, matched.title),
        h('span', { class: 'en' }, `${matched.en} — PROMPT ARTS DIVISION`));
      head.replaceChildren(sh);
    }
  }

  const root = document.getElementById('page-root');
  root.replaceChildren(h('div', { class: 'loading', role: 'status' }, '检索中…'));

  if (!matched) {
    renderNotFound(root, path);
    return;
  }

  try {
    const mod = await matched.load();
    if (seq !== renderSeq) return;
    root.replaceChildren();
    await mod.render(root, { ...params, query });
  } catch (err) {
    if (seq !== renderSeq) return;
    console.error('页面加载失败:', err);
    const msg = err && err.message ? err.message : String(err);
    root.replaceChildren(
      h('div', { class: 'empty' },
        h('div', { class: 'empty-icon' }, '⚠️'),
        h('div', { class: 'empty-title' }, '页面加载失败'),
        h('div', { class: 'empty-hint' }, msg)),
    );
    toast(`页面加载失败：${msg}`, 'error');
  }
}

/** 主题：默认纸色档案室（light），夜间值班（dark）；键 'plm-theme'，与桌面版一致。 */
function initTheme() {
  const saved = getSavedTheme();
  document.documentElement.dataset.theme = saved;
  store.set({ theme: saved });
  store.subscribe((s) => {
    if ((s.theme === 'light' || s.theme === 'dark') && document.documentElement.dataset.theme !== s.theme) {
      applyTheme(s.theme);
      syncToggleGlyph();
    }
  });
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      store.set({ theme: next });
    });
  }
  syncToggleGlyph();
}

function syncToggleGlyph() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const night = document.documentElement.dataset.theme === 'dark';
  btn.textContent = night ? '☾' : '☼';
}

/** 值班时钟（页脚上方的等宽时间码，每秒刷新）。 */
function startClock() {
  const el = document.getElementById('pl-clock');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

function boot() {
  initTheme();
  startClock();
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
