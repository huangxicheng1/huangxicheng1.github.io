// app.js — 事务科 · 今日待办（静态版，localStorage 数据 + 可选 GitHub 云同步）
// 视图：#/today 今日待办 · #/calendar 月历；右侧常驻当日面板与收件箱。
import * as store from './store.js?v=4';
import * as sync from './github-sync.js?v=4';
import { iso } from './seed-data.js?v=4';

/* ---------------- 基础工具 ---------------- */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'type' && k !== 'value' && k !== 'checked') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

function todayIso() { return iso(0); }

function weekdayOf(dateIso) {
  const d = new Date(dateIso + 'T00:00:00');
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

function fmtCn(dateIso) {
  const [, m, d] = dateIso.split('-');
  return `${Number(m)} 月 ${Number(d)} 日`;
}

/** 某年某月的日历矩阵：周一开头，返回 42 格 {dateIso, inMonth} */
function monthMatrix(y, m) {
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一=0
  const start = new Date(y, m - 1, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const p = (n) => String(n).padStart(2, '0');
    cells.push({
      dateIso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      inMonth: d.getMonth() + 1 === m,
    });
  }
  return cells;
}

function groupTagHtml(task) {
  const g = task.groupId ? store.groupById(task.groupId) : null;
  return g ? h('span', { class: 'td-task-grouptag', style: { borderColor: g.color, color: g.color } }, g.name)
           : h('span', { class: 'td-task-grouptag' }, '未分组');
}

/* ---------------- Toast ---------------- */

let toastContainer = null;
function toast(message) {
  if (!toastContainer) {
    toastContainer = h('div', { class: 'toast-container' });
    document.body.appendChild(toastContainer);
  }
  const el = h('div', { class: 'toast' }, message);
  toastContainer.appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250); }, 2200);
}

/* ---------------- 状态 ---------------- */

const state = {
  view: 'today',            // 'today' | 'calendar'
  filterGroup: null,        // null=全部
  selectedDate: todayIso(), // 当日面板选中的日期
  calY: new Date().getFullYear(),
  calM: new Date().getMonth() + 1,
};

/* ---------------- 渲染：任务行 ---------------- */

function taskRow(task, { showDate } = {}) {
  const row = h('div', { class: 'td-task' + (task.done ? ' done' : '') },
    h('button', {
      class: 'td-check',
      'aria-label': task.done ? '标记为未完成' : '标记为已完成',
      title: task.done ? '标记为未完成' : '标记为已完成',
      onclick: () => { store.toggleTask(task.id); render(); },
    }, '✓'),
    h('div', { class: 'td-task-title' },
      task.title,
      showDate && task.date ? h('span', { style: { marginLeft: '8px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' } }, task.date) : null),
    groupTagHtml(task),
    h('button', {
      class: 'td-task-del',
      'aria-label': '删除任务',
      title: '删除',
      onclick: () => { store.deleteTask(task.id); toast('已删除一条任务'); render(); },
    }, '✕'));
  return row;
}

function taskList(tasks, { showDate } = {}) {
  if (tasks.length === 0) {
    return h('div', { class: 'td-empty' }, '这里暂时没有任务。在上方输入框写下第一件想做的事。');
  }
  return h('div', null, tasks.map((x) => taskRow(x, { showDate })));
}

/* ---------------- 渲染：快速添加 ---------------- */

function quickAdd(defaultDate) {
  const title = h('input', { class: 'input td-input-title', type: 'text', placeholder: '写下一件要做的事…', 'aria-label': '任务标题' });
  const group = h('select', { class: 'select', 'aria-label': '分组' },
    h('option', { value: '' }, '不分组'),
    store.getGroups().map((g) => h('option', { value: g.id }, g.name)));
  const date = h('input', { class: 'input', type: 'date', value: defaultDate || todayIso(), 'aria-label': '日期' });
  const submit = () => {
    if (!title.value.trim()) { title.focus(); return; }
    store.addTask({ title: title.value, groupId: group.value || null, date: date.value || null });
    title.value = '';
    toast('已记入档案');
    render();
  };
  const btn = h('button', { class: 'btn', type: 'button', onclick: submit }, '＋ 记入档案');
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return h('div', { class: 'td-quickadd' }, title, group, date, btn);
}

/* ---------------- 渲染：云同步面板 ---------------- */

function syncStatusContent() {
  const s = sync.getStatus();
  const map = {
    local: { icon: '○', color: 'var(--muted)', text: '本地模式 · 数据只存本机' },
    ok: { icon: '●', color: 'var(--ok)', text: sync.lastSyncText() },
    syncing: { icon: '⟳', color: 'var(--accent)', text: '正在同步到 GitHub…' },
    error: { icon: '⚠', color: 'var(--danger)', text: s.message || '同步失败' },
  };
  const m = map[s.kind] || map.local;
  return [
    h('span', { style: { color: m.color, marginRight: '6px' } }, m.icon),
    h('span', { style: { fontSize: '11px', color: s.kind === 'error' ? 'var(--danger)' : 'var(--muted)', lineHeight: '1.5', wordBreak: 'break-all' } }, m.text),
  ];
}

function patchSyncBadge() {
  const el = document.getElementById('td-sync-status');
  if (el) el.replaceChildren(...syncStatusContent());
}

function renderSyncPanel() {
  const tokenInput = h('input', {
    class: 'input', type: 'password', placeholder: 'github_pat_…（粘贴细粒度令牌）',
    'aria-label': 'GitHub 访问令牌', style: { fontSize: '12px' },
  });
  return h('div', { class: 'td-side-block' },
    h('div', { class: 'side-label', style: { marginBottom: '8px' } }, '云同步 · CLOUD SYNC'),
    h('div', { id: 'td-sync-status', style: { display: 'flex', alignItems: 'flex-start' } }, syncStatusContent()),
    h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px' } },
      h('button', {
        class: 'btn', style: { fontSize: '11px', padding: '3px 10px' },
        onclick: () => { if (sync.hasToken()) sync.push(); else { toast('请先在下方设置令牌'); } },
      }, '⟳ 立即同步'),
      h('button', {
        class: 'btn ghost', style: { fontSize: '11px', padding: '3px 10px' },
        onclick: () => { const d = document.getElementById('td-token-panel'); if (d) d.open = !d.open; },
      }, '令牌设置')),
    h('details', { id: 'td-token-panel', style: { marginTop: '10px' } },
      h('summary', {
        style: {
          fontFamily: 'var(--mono)', fontSize: '9.5px', letterSpacing: '.16em',
          color: 'var(--muted)', cursor: 'pointer', marginBottom: '8px',
        },
      }, 'TOKEN SETUP · 生成步骤'),
      h('div', { style: { fontSize: '11.5px', lineHeight: '1.9', color: 'var(--muted)' } },
        '① 打开 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token；',
        h('br'),
        '② Repository access 选 “Only select repositories” → ',
        h('b', { style: { color: 'var(--text)' } }, 'huangxicheng1.github.io'),
        '；',
        h('br'),
        '③ Permissions → Repository permissions → Contents 设为 ',
        h('b', { style: { color: 'var(--text)' } }, 'Read and write'),
        '；',
        h('br'),
        '④ 生成后复制令牌粘贴到下面。令牌只保存在你本机浏览器，不会进代码或仓库。'),
      tokenInput,
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
        h('button', {
          class: 'btn', style: { fontSize: '11px', padding: '3px 10px' },
          onclick: () => {
            if (!tokenInput.value.trim()) { tokenInput.focus(); return; }
            sync.setToken(tokenInput.value);
            tokenInput.value = '';
            toast('令牌已保存，开始连接 GitHub');
            render();
          },
        }, '保存并连接'),
        h('button', {
          class: 'btn ghost', style: { fontSize: '11px', padding: '3px 10px' },
          onclick: () => {
            sync.setToken('');
            toast('已清除令牌，回到本地模式');
            render();
          },
        }, sync.hasToken() ? '清除令牌' : '暂不使用'))));
}

/* ---------------- 渲染：侧栏 ---------------- */

function renderSidebar() {
  const counts = store.groupCounts();
  const t = todayIso();
  const prog = store.todayProgress(t);
  const open = store.openCount();

  const groupRow = (dotColor, name, count, key) => h('div', {
    class: 'td-group-row' + (state.filterGroup === key ? ' active' : ''),
    onclick: () => { state.filterGroup = state.filterGroup === key ? null : key; render(); },
  },
    h('span', { class: 'td-group-dot', style: { background: dotColor } }),
    h('span', null, name),
    h('span', { class: 'td-group-count' }, String(count)));

  return h('aside', { class: 'td-side' },
    h('div', { class: 'td-side-block' },
      h('div', { class: 'side-label', style: { marginBottom: '10px' } }, '今日进度 · TODAY'),
      h('div', { class: 'td-progress', 'aria-hidden': 'true' },
        h('div', { class: 'td-progress-fill', style: { width: prog.percent + '%' } }),
        h('div', { class: 'td-progress-ticks' })),
      h('div', { class: 'td-progress-num', style: { marginTop: '6px' } },
        `已完成 ${prog.done} / ${prog.total} · ${prog.percent}%`),
      h('div', { class: 'tiny-rule' }),
      h('div', { class: 'stat-line' }, h('span', null, '未完成总数'), h('b', null, String(open)))),
    h('div', { class: 'td-side-block' },
      h('div', { class: 'side-label', style: { marginBottom: '8px' } }, '任务分组 · SETS'),
      groupRow('transparent', '全部', open, null),
      store.getGroups().map((g) => groupRow(g.color, g.name, counts.groups.get(g.id) || 0, g.id)),
      h('div', { class: 'tiny-rule' }),
      groupRow('var(--muted)', '收件箱 · 未排期', counts.inbox, '__inbox')),
    renderSyncPanel());
}

/* ---------------- 渲染：今日视图 ---------------- */

function renderToday() {
  const t = todayIso();
  const fg = state.filterGroup;
  const inboxMode = fg === '__inbox';

  const overdue = store.overdueTasks(t, fg === '__inbox' ? null : fg);
  let main;
  if (inboxMode) {
    main = h('div', { class: 'card' },
      h('div', { class: 'side-label', style: { marginBottom: '4px' } }, '收件箱 · 未排期任务'),
      taskList(store.inboxTasks(fg === '__inbox' ? null : fg), { showDate: false }));
  } else {
    const todays = store.tasksOnDate(t, fg);
    const undone = todays.filter((x) => !x.done);
    const done = todays.filter((x) => x.done);
    main = h('div', { class: 'card' },
      h('div', { class: 'side-label', style: { marginBottom: '4px' }, hidden: false }, '当天任务 · SCHEDULED'),
      taskList(undone, {}),
      done.length > 0
        ? h('details', { style: { marginTop: '10px' } },
            h('summary', { style: { fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '.16em', color: 'var(--muted)', cursor: 'pointer' } },
              `已完成 · ${done.length}`),
            taskList(done, {}))
        : null);
  }

  return h('div', null,
    h('div', { class: 'td-datehead', style: { margin: '6px 0 14px' } },
      h('span', { class: 'td-date-big' }, fmtCn(t)),
      h('span', { class: 'td-date-sub' }, `${weekdayOf(t).toUpperCase()} · ${inboxMode ? 'INBOX' : 'TODAY'}`)),
    h('div', { class: 'card', style: { padding: '12px 14px', marginBottom: '16px' } }, quickAdd(inboxMode ? '' : t)),
    overdue.length > 0 && !inboxMode
      ? h('div', { class: 'card', style: { marginBottom: '16px', borderLeft: '2px solid var(--danger)' } },
          h('div', { class: 'side-label', style: { color: 'var(--danger)', marginBottom: '4px' } }, `逾期未完成 · ${overdue.length}`),
          taskList(overdue, { showDate: true }))
      : null,
    main);
}

/* ---------------- 渲染：月历视图 ---------------- */

function renderCalendar() {
  const fg = state.filterGroup === '__inbox' ? null : state.filterGroup;
  const t = todayIso();
  const cells = monthMatrix(state.calY, state.calM);
  const byDate = new Map();
  for (const task of store.getDb().tasks) {
    if (!task.date) continue;
    if (fg && task.groupId !== fg) continue;
    if (!byDate.has(task.date)) byDate.set(task.date, []);
    byDate.get(task.date).push(task);
  }

  const monthTitle = `${state.calY}年${state.calM}月`;
  const nav = (delta) => {
    let m = state.calM + delta, y = state.calY;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    state.calM = m; state.calY = y;
    render();
  };

  return h('div', null,
    h('div', { class: 'section-head td-section-head', style: { marginTop: 0 } },
      h('h2', null, monthTitle),
      h('span', { class: 'en' }, 'MONTHLY OPERATIONS — 点击日期在右侧登记'),
      h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
        h('button', { class: 'icon-button', 'aria-label': '上个月', onclick: () => nav(-1) }, '‹'),
        h('strong', { style: { fontFamily: 'var(--mono)', fontSize: '12px', letterSpacing: '.1em' } }, String(state.calM).padStart(2, '0') + ' / ' + String(state.calY)),
        h('button', { class: 'icon-button', 'aria-label': '下个月', onclick: () => nav(1) }, '›'))),
    h('div', { class: 'td-cal-weekdays', 'aria-hidden': 'true' },
      ['一', '二', '三', '四', '五', '六', '日'].map((w) => h('span', null, w))),
    h('div', { class: 'td-cal-grid', role: 'grid' },
      cells.map((c) => {
        const items = (byDate.get(c.dateIso) || []).slice().sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
        const shown = items.slice(0, 3);
        const more = items.length - shown.length;
        return h('div', {
          class: 'td-cal-cell' + (c.inMonth ? '' : ' dim') + (c.dateIso === t ? ' today' : '') + (c.dateIso === state.selectedDate ? ' selected' : ''),
          role: 'gridcell',
          'aria-label': c.dateIso,
          onclick: () => { state.selectedDate = c.dateIso; render(); },
        },
          h('div', { class: 'td-cal-daynum' }, h('span', null, String(Number(c.dateIso.slice(8)))), c.dateIso === t ? h('span') : null),
          shown.map((task) => {
            const g = task.groupId ? store.groupById(task.groupId) : null;
            return h('div', { class: 'td-cal-item' + (task.done ? ' done' : ''), style: { borderLeftColor: g ? g.color : 'var(--muted)' } }, task.title);
          }),
          more > 0 ? h('div', { class: 'td-cal-more' }, `+${more} 项`) : null);
      })));
}

/* ---------------- 渲染：当日面板 ---------------- */

function renderDayPanel() {
  const dateIso = state.selectedDate;
  const fg = state.filterGroup === '__inbox' ? null : state.filterGroup;
  const tasks = store.tasksOnDate(dateIso, fg);
  const inbox = store.inboxTasks(null).slice(0, 5);
  return h('aside', { class: 'td-daypanel' },
    h('div', { class: 'card', style: { marginBottom: '14px' } },
      h('div', { class: 'side-label' }, '当日安排 · DAY PLAN'),
      h('div', { class: 'td-datehead', style: { margin: '8px 0 10px' } },
        h('span', { style: { fontFamily: 'var(--din)', fontSize: '20px', fontWeight: 700 } }, fmtCn(dateIso)),
        h('span', { style: { fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '.2em', color: 'var(--muted)' } }, weekdayOf(dateIso))),
      h('div', { class: 'td-daypanel-tasks' }, taskList(tasks, {}))),
    h('div', { class: 'card' },
      h('div', { class: 'side-label', style: { marginBottom: '4px' } }, '收件箱 · 未排期'),
      inbox.length ? taskList(inbox, {}) : h('div', { class: 'td-empty' }, '收件箱是空的。')));
}

/* ---------------- 主渲染 ---------------- */

function render() {
  const root = document.getElementById('app-root');
  root.replaceChildren();
  root.appendChild(h('div', { class: 'td-layout' },
    renderSidebar(),
    h('section', { style: { minWidth: 0 } }, state.view === 'calendar' ? renderCalendar() : renderToday()),
    renderDayPanel()));

  // 导航高亮
  for (const el of document.querySelectorAll('.dept-nav .dept')) {
    const key = el.dataset.key;
    el.classList.toggle('active', key === state.view);
  }
  document.title = (state.view === 'calendar' ? '月历' : '今日待办') + ' · TODO DIVISION — Isaac’s life';
}

/* ---------------- 路由与主题 ---------------- */

function applyHash() {
  const hash = location.hash || '#/today';
  state.view = hash.startsWith('#/calendar') ? 'calendar' : 'today';
  render();
}

function initTheme() {
  // 全站统一主题记忆（主站档案室的 'muse-theme'）：主站约定 'light'=夜间值班，'dark'/未设=纸色。
  // 事务科内部用 html[data-theme]（'dark'=夜间），在边界做一次翻译，保证三个部门明暗始终一致。
  const readSite = () => {
    try { return localStorage.getItem('muse-theme'); } catch (e) { return null; }
  };
  document.documentElement.dataset.theme = readSite() === 'light' ? 'dark' : 'light';
  const btn = document.getElementById('themeToggle');
  const sync = () => { btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☾' : '☼'; };
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('muse-theme', next === 'dark' ? 'light' : 'dark'); } catch (e) { /* 忽略 */ }
    sync();
  });
  sync();
}

function startClock() {
  const el = document.getElementById('td-clock');
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
  const y = document.getElementById('footerYear');
  if (y) y.textContent = new Date().getFullYear();
  window.addEventListener('hashchange', applyHash);
  // 云同步：数据变更会触发 onChange 重渲染（含采纳远端数据的场景）；状态变化只更新徽章
  store.onChange(() => render());
  sync.onStatus(() => patchSyncBadge());
  sync.init();
  applyHash();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
