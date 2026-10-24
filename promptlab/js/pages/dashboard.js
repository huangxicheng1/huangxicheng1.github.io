// 统计仪表盘页面（hash: #/stats）
// 契约依据：SPEC.md 第 5 节（GET /api/stats）、8.1（页面模块契约：export async function render(root, params)，
// 私有样式以 <style> 注入 root）、8.5（复用 base.css 公共类）、8.6（dashboard：指标卡 / 标签分布条形 /
// 14 天迷你柱状图 / 最近活动）。
// 依赖（[前端·框架与设计系统]模块按契约提供）：../api.js、../ui.js、../router.js
import { api } from '../api.js';
import { h, toast, timeAgo, ICONS } from '../ui.js';
import { navigate } from '../router.js';

// 页面私有样式（注入 root；颜色一律使用 base.css 的 CSS 变量）
const PAGE_CSS = `
  .plm-dash { display: flex; flex-direction: column; gap: 16px; }
  .plm-muted { color: var(--muted); }
  .plm-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .plm-metric { display: flex; align-items: center; gap: 16px; padding: 20px 24px; }
  .plm-metric.plm-clickable { cursor: pointer; transition: border-color 0.15s; }
  .plm-metric.plm-clickable:hover { border-color: var(--accent); }
  .plm-metric-icon { font-size: 26px; line-height: 1; }
  .plm-metric-num { font-size: 30px; font-weight: 700; line-height: 1.2; }
  .plm-metric-label { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .plm-dash-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: stretch; }
  .plm-section { padding: 20px; }
  .plm-section-title { font-size: 15px; font-weight: 600; }
  .plm-section-sub { font-size: 12px; margin: 4px 0 14px; }
  .plm-section .empty { padding: 24px 16px; }
  .plm-tagbar-row { display: grid; grid-template-columns: 84px 1fr 36px; align-items: center; gap: 8px; margin-bottom: 8px; }
  .plm-tagbar-row:last-child { margin-bottom: 0; }
  .plm-tagbar-name { font-size: 13px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plm-tagbar-track { height: 14px; border-radius: 7px; background: var(--panel-2); overflow: hidden; }
  .plm-tagbar-fill { height: 100%; border-radius: 7px; background: linear-gradient(90deg, var(--accent), var(--accent-2)); min-width: 2px; transition: width 0.3s; }
  .plm-tagbar-count { font-size: 12px; color: var(--muted); text-align: right; }
  .plm-chart { display: flex; align-items: stretch; gap: 6px; height: 150px; }
  .plm-chart-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .plm-chart-bararea { flex: 1; min-height: 0; display: flex; align-items: flex-end; justify-content: center; }
  .plm-chart-bar { width: 100%; max-width: 36px; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, var(--accent-2), var(--accent)); transition: height 0.3s; }
  .plm-chart-bar.zero { background: var(--border); }
  .plm-chart-label { font-size: 9px; color: var(--muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
  .plm-activity-row { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
  .plm-activity-row:hover { background: var(--panel-2); }
  .plm-activity-icon { font-size: 15px; flex: 0 0 auto; }
  .plm-activity-text { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plm-activity-title { font-weight: 600; }
  .plm-activity-time { font-size: 12px; color: var(--muted); white-space: nowrap; flex: 0 0 auto; }
  @media (max-width: 960px) {
    .plm-metrics { grid-template-columns: 1fr; }
    .plm-dash-row { grid-template-columns: 1fr; }
  }
`;

// 安全取数：非法或负值一律按 0 处理
function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// 统一空态结构（复用 base.css 的 .empty / .empty-icon / .empty-title / .empty-hint）
function emptyBlock(icon, title, hint) {
  const kids = [h('div', { class: 'empty-icon' }, icon), h('div', { class: 'empty-title' }, title)];
  if (hint) kids.push(h('div', { class: 'empty-hint' }, hint));
  return h('div', { class: 'empty' }, ...kids);
}

// 页面入口（契约 8.1：root 为已清空的主内容容器；页面标题由 app.js 顶栏维护）
export async function render(root, params) {
  document.title = '统计 · PromptLab';
  root.appendChild(h('style', {}, PAGE_CSS));

  const loading = h('div', { class: 'loading' }, '正在加载统计数据…');
  root.appendChild(loading);

  let stats;
  try {
    stats = await api.get('/api/stats');
  } catch (err) {
    loading.remove();
    root.appendChild(emptyBlock('⚠️', '统计数据加载失败', err.message));
    toast(`统计数据加载失败：${err.message}`, 'error');
    return;
  }
  loading.remove();
  root.appendChild(buildDashboard(stats && typeof stats === 'object' ? stats : {}));
}

function buildDashboard(stats) {
  const tagCounts = Array.isArray(stats.tagCounts) ? stats.tagCounts : [];
  const runsByDay = Array.isArray(stats.runsByDay) ? stats.runsByDay : [];
  const recentRuns = Array.isArray(stats.recentRuns) ? stats.recentRuns : [];
  const recentPrompts = Array.isArray(stats.recentPrompts) ? stats.recentPrompts : [];

  return h('div', { class: 'plm-dash' },
    buildMetrics(toCount(stats.promptCount), toCount(stats.versionCount), toCount(stats.runCount)),
    h('div', { class: 'plm-dash-row' },
      buildTagChart(tagCounts),
      buildTrendChart(runsByDay)
    ),
    buildActivity(recentRuns, recentPrompts)
  );
}

// 指标卡：prompt 数 / 版本总数 / 运行总数（SPEC 8.6）
function buildMetrics(promptCount, versionCount, runCount) {
  return h('div', { class: 'plm-metrics' },
    metricCard(ICONS.library, promptCount, '提示词', '点击进入提示词库', () => navigate('#/library')),
    metricCard(ICONS.version, versionCount, '版本总数', '所有提示词累计保存的版本数量', null),
    metricCard(ICONS.run, runCount, '运行总数', '点击查看运行历史', () => navigate('#/runs'))
  );
}

function metricCard(icon, value, label, hint, onclick) {
  const card = h('div', { class: 'card plm-metric', title: hint || '' },
    h('div', { class: 'plm-metric-icon' }, icon),
    h('div', { class: 'plm-metric-body' },
      h('div', { class: 'plm-metric-num' }, String(value)),
      h('div', { class: 'plm-metric-label' }, label)
    )
  );
  if (typeof onclick === 'function') {
    card.classList.add('plm-clickable');
    card.addEventListener('click', onclick);
  }
  return card;
}

// 标签分布横向条形：tagCounts 前 10，CSS 宽度百分比（SPEC 8.6）
function buildTagChart(tagCounts) {
  const top = tagCounts
    .filter((t) => t && typeof t.tag === 'string')
    .slice(0, 10)
    .map((t) => ({ tag: t.tag, count: toCount(t.count) }));
  const max = top.length ? Math.max(...top.map((t) => t.count), 1) : 1;

  let body;
  if (!top.length) {
    body = [emptyBlock(ICONS.stats, '暂无标签数据', '给提示词添加标签后，这里会显示标签分布。')];
  } else {
    body = top.map((t) => {
      const pct = Math.round((t.count / max) * 1000) / 10;
      return h('div', { class: 'plm-tagbar-row', title: `${t.tag}：${t.count} 个提示词` },
        h('span', { class: 'plm-tagbar-name' }, t.tag),
        h('div', { class: 'plm-tagbar-track' },
          h('div', { class: 'plm-tagbar-fill', style: { width: pct + '%' } })
        ),
        h('span', { class: 'plm-tagbar-count' }, String(t.count))
      );
    });
  }
  return h('div', { class: 'card plm-section' },
    h('div', { class: 'plm-section-title' }, '标签分布'),
    h('div', { class: 'plm-muted plm-section-sub' }, '按标签被提示词使用的数量排序，展示前 10 个'),
    ...body
  );
}

// 最近 14 天运行趋势：div 高度迷你柱状图 + hover title（SPEC 8.6）
function buildTrendChart(runsByDay) {
  const days = runsByDay.filter((d) => d && typeof d.date === 'string');
  const max = days.length ? Math.max(...days.map((d) => toCount(d.count)), 1) : 1;
  const total = days.reduce((sum, d) => sum + toCount(d.count), 0);

  let cols;
  if (!days.length) {
    cols = [emptyBlock(ICONS.run, '暂无运行数据', '去运行台跑一次提示词试试。')];
  } else {
    cols = days.map((d) => {
      const count = toCount(d.count);
      const pct = Math.round((count / max) * 100);
      const height = count === 0 ? '2px' : Math.max(pct, 4) + '%';
      return h('div', { class: 'plm-chart-col', title: `${d.date} · ${count} 次运行` },
        h('div', { class: 'plm-chart-bararea' },
          h('div', { class: 'plm-chart-bar' + (count === 0 ? ' zero' : ''), style: { height } })
        ),
        h('span', { class: 'plm-chart-label' }, d.date)
      );
    });
  }
  return h('div', { class: 'card plm-section' },
    h('div', { class: 'plm-section-title' }, '最近 14 天运行趋势'),
    h('div', { class: 'plm-muted plm-section-sub' }, `14 天内共 ${total} 次运行，悬停柱子可查看每日数量`),
    h('div', { class: 'plm-chart' }, ...cols)
  );
}

// 最近活动：recentRuns + recentPrompts 合并按时间降序（SPEC 8.6）
function buildActivity(recentRuns, recentPrompts) {
  const items = [];
  for (const r of recentRuns) {
    if (!r) continue;
    items.push({ kind: 'run', at: Date.parse(r.createdAt) || 0, run: r });
  }
  for (const p of recentPrompts) {
    if (!p) continue;
    items.push({ kind: 'prompt', at: Date.parse(p.updatedAt || p.createdAt) || 0, prompt: p });
  }
  items.sort((a, b) => b.at - a.at);

  let rows;
  if (!items.length) {
    rows = [emptyBlock(ICONS.version, '暂无最近活动', '运行提示词或编辑内容后，活动会显示在这里。')];
  } else {
    rows = items.slice(0, 10).map((item) => (item.kind === 'run' ? runRow(item.run) : promptRow(item.prompt)));
  }
  return h('div', { class: 'card plm-section' },
    h('div', { class: 'plm-section-title' }, '最近活动'),
    h('div', { class: 'plm-muted plm-section-sub' }, '最近的运行记录与提示词更新'),
    ...rows
  );
}

function runRow(r) {
  const badges = [
    h('span', { class: 'badge' + (r.mode === 'live' ? ' badge-accent' : '') }, r.mode === 'live' ? 'Live' : 'Mock'),
    r.ok
      ? h('span', { class: 'badge badge-ok' }, '成功')
      : h('span', { class: 'badge badge-danger' }, '失败')
  ];
  if (r.latencyMs != null) {
    badges.push(h('span', { class: 'plm-muted', style: { fontSize: '12px', whiteSpace: 'nowrap' } }, `${r.latencyMs} ms`));
  }
  const titleText = r.ok
    ? `查看「${r.promptTitle || ''}」的运行台`
    : `运行失败：${r.error || '未知错误'}（点击查看运行台）`;
  const versionSuffix = r.promptVersion != null ? `（v${r.promptVersion}）` : '';
  return h('div', {
    class: 'plm-activity-row',
    title: titleText,
    onclick: () => { if (r.promptId) navigate('#/playground/' + encodeURIComponent(r.promptId)); }
  },
    h('span', { class: 'plm-activity-icon' }, ICONS.run),
    h('span', { class: 'plm-activity-text' },
      '运行了',
      h('b', { class: 'plm-activity-title' }, r.promptTitle || '（已删除的提示词）'),
      versionSuffix
    ),
    ...badges,
    h('span', { class: 'plm-activity-time' }, r.createdAt ? timeAgo(r.createdAt) : '')
  );
}

function promptRow(p) {
  const version = p.currentVersion != null
    ? `v${p.currentVersion}`
    : (p.versionsCount != null ? `${p.versionsCount} 个版本` : '');
  const children = [
    h('span', { class: 'plm-activity-icon' }, ICONS.library),
    h('span', { class: 'plm-activity-text' },
      '更新了',
      h('b', { class: 'plm-activity-title' }, p.title || '未命名提示词')
    )
  ];
  if (version) children.push(h('span', { class: 'badge' }, version));
  children.push(h('span', { class: 'plm-activity-time' },
    p.updatedAt ? timeAgo(p.updatedAt) : (p.createdAt ? timeAgo(p.createdAt) : '')));
  return h('div', {
    class: 'plm-activity-row',
    title: `打开「${p.title || ''}」编辑器`,
    onclick: () => { if (p.id) navigate('#/prompt/' + encodeURIComponent(p.id)); }
  }, ...children);
}
