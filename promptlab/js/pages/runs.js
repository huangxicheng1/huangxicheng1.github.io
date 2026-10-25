// 全局运行历史页面（hash: #/runs）
// 契约依据：SPEC.md 第 5 节（GET /api/runs?promptId=&limit= → {items,total}，createdAt 降序）、
//   第 8.6 节（runs：全局运行历史表（时间、prompt 标题（点击 → playground）、v、mode badge、ok 状态、
//   耗时、tokens 估算合计）；行可展开显示变量与 response 前 200 字；顶部统计 chips（总运行、成功率、平均耗时））。
// 依赖（由 [前端·框架与设计系统] 按契约提供）：../api.js、../ui.js、../router.js。
// 注意：本模块顶层不访问 window/document（SPEC 第 0 节），DOM 操作全部在函数内完成。
import { api } from '../api.js?v=4';
import { h, toast, timeAgo } from '../ui.js?v=4';
import { navigate } from '../router.js?v=4';

const RUNS_LIMIT = 200; // 一次拉取的运行条数（契约示例 limit=50，这里取更大值以支撑统计 chips）
const RESPONSE_PREVIEW = 200; // 展开行中 response 预览字数（SPEC 8.6：前 200 字）

/** 耗时展示：非法值显示 “—”。 */
function fmtMs(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${v} ms` : '—';
}

/** 小徽章（pill）：variant ∈ ''|mock|live|ok|fail。 */
function mkPill(text, variant) {
  return h('span', { class: variant ? `rns-pill rns-pill-${variant}` : 'rns-pill' }, text);
}

// 页面私有样式（以 <style> 注入 root；仅使用 8.5 节定义的 CSS 变量与公共类，不修改 base.css）
const PAGE_CSS = `
  .rns-page { display: flex; flex-direction: column; gap: 16px; }
  .rns-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: space-between; }
  .rns-chips { display: flex; gap: 12px; flex-wrap: wrap; }
  .rns-chip { display: flex; flex-direction: column; gap: 2px; min-width: 148px; padding: 14px 18px; }
  .rns-chip-num { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .rns-chip-label { font-size: 12px; color: var(--muted); }
  .rns-note { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .rns-center { display: flex; justify-content: center; margin-top: 8px; }
  .rns-table-card { overflow-x: auto; }
  .rns-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .rns-table th { text-align: left; padding: 10px 12px; color: var(--muted); font-weight: 600; font-size: 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .rns-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .rns-row { cursor: pointer; transition: background 0.15s; }
  .rns-row:hover, .rns-row.is-open { background: var(--panel-2); }
  .rns-row.is-fail .rns-when, .rns-row.is-fail .rns-prompt { opacity: 0.9; }
  .rns-chevron { display: inline-block; color: var(--muted); transition: transform 0.15s; }
  .rns-row.is-open .rns-chevron { transform: rotate(90deg); }
  .rns-when { color: var(--muted); white-space: nowrap; }
  .rns-prompt { max-width: 320px; }
  .rns-link { background: none; border: none; padding: 0; font: inherit; color: var(--accent-2); cursor: pointer; text-align: left; word-break: break-word; }
  .rns-link:hover { text-decoration: underline; }
  .rns-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rns-detail-row > td { background: var(--panel-2); padding: 0 12px 12px 34px; }
  .rns-detail { display: flex; flex-direction: column; gap: 8px; }
  .rns-sec { font-size: 12px; font-weight: 600; color: var(--muted); margin-top: 2px; }
  .rns-kvs { display: flex; flex-direction: column; gap: 4px; }
  .rns-kv { display: flex; gap: 8px; font-size: 12px; }
  .rns-kv-k { color: var(--muted); flex: none; min-width: 90px; }
  .rns-kv-v { word-break: break-all; }
  .rns-error { color: var(--danger); font-size: 13px; line-height: 1.7; word-break: break-word; }
  .rns-response { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.7; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px; max-height: 180px; overflow: auto; }
  .rns-pill { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 11px; line-height: 1.5; border: 1px solid var(--border); color: var(--muted); background: var(--panel-2); white-space: nowrap; }
  .rns-pill-mock { color: var(--accent-2); border-color: var(--accent-2); }
  .rns-pill-live { color: var(--accent); border-color: var(--accent); }
  .rns-pill-ok { color: var(--ok); border-color: var(--ok); }
  .rns-pill-fail { color: var(--danger); border-color: var(--danger); }
`;

// 页面入口（契约 8.1：root 为已清空的主内容容器；本页无路径参数）
export async function render(root, params) {
  document.title = '运行历史 · PromptLab';
  root.appendChild(h('style', {}, PAGE_CSS));

  const chips = h('div', { class: 'rns-chips' });
  const note = h('div', { class: 'rns-note', style: { display: 'none' } });
  const body = h('tbody');
  const table = h('table', { class: 'table rns-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, ''),
      h('th', {}, '时间'),
      h('th', {}, 'Prompt'),
      h('th', {}, '版本'),
      h('th', {}, '模式'),
      h('th', {}, '状态'),
      h('th', {}, '耗时'),
      h('th', {}, 'tokens 估算'))),
    body);
  const tableCard = h('div', { class: 'card rns-table-card' });

  root.appendChild(h('div', { class: 'rns-page' },
    h('div', { class: 'toolbar rns-toolbar' },
      h('span', { class: 'rns-note' }, '所有 Prompt 的运行记录，按时间倒序排列；点击行可展开详情。'),
      h('button', { class: 'btn btn-ghost', onclick: () => load() }, '刷新')),
    chips,
    note,
    tableCard));

  showLoading();
  await load();

  function showLoading() {
    tableCard.replaceChildren(h('div', { class: 'empty' }, '正在加载运行记录…'));
  }

  async function load() {
    showLoading();
    try {
      const res = await api.get('/api/runs?limit=' + RUNS_LIMIT);
      const items = res && Array.isArray(res.items) ? res.items : [];
      const total = res && typeof res.total === 'number' ? res.total : items.length;
      renderChips(items, total);
      renderTable(items);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      chips.replaceChildren();
      note.style.display = 'none';
      tableCard.replaceChildren(
        h('div', { class: 'empty' }, `运行记录加载失败：${msg}`),
        h('div', { class: 'rns-center' },
          h('button', { class: 'btn btn-primary', onclick: () => load() }, '重试')));
      toast(`运行记录加载失败：${msg}`, 'error');
    }
  }

  // 顶部统计 chips：总运行（total）、成功率、平均耗时（后两者按已加载记录计算）
  function renderChips(items, total) {
    const okCount = items.reduce((n, r) => n + (r && r.ok ? 1 : 0), 0);
    const rate = items.length ? Math.round((okCount / items.length) * 1000) / 10 : null;
    const lats = items
      .map((r) => (r && typeof r.latencyMs === 'number' ? r.latencyMs : 0))
      .filter((v) => v > 0);
    const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
    chips.replaceChildren(
      mkChip(`${total}`, '总运行'),
      mkChip(rate == null ? '—' : `${rate}%`, '成功率'),
      mkChip(avg == null ? '—' : `${avg} ms`, '平均耗时'));
    if (total > items.length) {
      note.textContent = `共 ${total} 条记录，当前已加载最近 ${items.length} 条；成功率与平均耗时按已加载记录计算。`;
      note.style.display = '';
    } else {
      note.style.display = 'none';
    }
  }

  function mkChip(value, label) {
    return h('div', { class: 'card rns-chip' },
      h('div', { class: 'rns-chip-num' }, value),
      h('div', { class: 'rns-chip-label' }, label));
  }

  function renderTable(items) {
    if (!items.length) {
      tableCard.replaceChildren(
        h('div', { class: 'empty' },
          h('div', {}, '还没有运行记录。'),
          h('div', { class: 'rns-note', style: { margin: '8px 0' } },
            '到提示词库选择一个 Prompt，点击 🚀 进入运行台完成第一次运行。'),
          h('div', { class: 'rns-center' },
            h('button', { class: 'btn btn-primary', onclick: () => navigate('#/library') }, '前往提示词库'))));
      return;
    }
    body.replaceChildren(...items.flatMap((run) => runRow(run)));
    tableCard.replaceChildren(table);
  }

  // 一条运行 = 主行 + 可展开详情行（返回数组，flatMap 展平后插入 tbody）
  function runRow(run) {
    const tokensTotal = (run.tokensIn || 0) + (run.tokensOut || 0);
    const detailCell = h('td', {}, '');
    detailCell.setAttribute('colspan', '8');
    const detailRow = h('tr', { class: 'rns-detail-row', style: { display: 'none' } }, detailCell);
    const chevron = h('span', { class: 'rns-chevron' }, '▸');
    let open = false;

    const titleText = run.promptTitle || run.promptId || '（未知 Prompt）';
    const titleCell = run.promptId
      ? h('button', {
          class: 'rns-link',
          title: '在运行台中打开此 Prompt',
          onclick: (e) => {
            e.stopPropagation(); // 不触发行展开
            navigate('#/playground/' + encodeURIComponent(run.promptId));
          },
        }, titleText)
      : h('span', {}, titleText);

    const mainRow = h('tr', { class: 'rns-row' + (run.ok ? '' : ' is-fail') },
      h('td', {}, chevron),
      h('td', { class: 'rns-when', title: run.createdAt || '' }, run.createdAt ? timeAgo(run.createdAt) : '—'),
      h('td', { class: 'rns-prompt' }, titleCell),
      h('td', {}, `v${run.promptVersion != null ? run.promptVersion : '?'}`),
      h('td', {}, mkPill(run.mode === 'live' ? 'Live' : 'Mock', run.mode === 'live' ? 'live' : 'mock')),
      h('td', {}, run.ok ? mkPill('成功', 'ok') : mkPill('失败', 'fail')),
      h('td', { class: 'rns-num' }, fmtMs(run.latencyMs)),
      h('td', {
        class: 'rns-num',
        title: `输入 ≈${run.tokensIn || 0} · 输出 ≈${run.tokensOut || 0}`,
      }, tokensTotal > 0 ? `≈ ${tokensTotal}` : '—'));

    mainRow.addEventListener('click', () => {
      open = !open;
      if (open) {
        detailCell.replaceChildren(h('div', { class: 'rns-detail' }, ...detailChildren(run)));
        detailRow.style.display = '';
      } else {
        detailRow.style.display = 'none';
      }
      mainRow.classList.toggle('is-open', open);
    });

    return [mainRow, detailRow];
  }

  // 展开详情：变量、错误（若有）、response 前 200 字
  function detailChildren(run) {
    const kids = [];
    const vars = run.variables && typeof run.variables === 'object' ? run.variables : {};
    const keys = Object.keys(vars);
    kids.push(h('div', { class: 'rns-sec' }, '变量'));
    if (keys.length) {
      kids.push(h('div', { class: 'rns-kvs' },
        ...keys.map((k) => h('div', { class: 'rns-kv' },
          h('span', { class: 'rns-kv-k' }, k),
          h('span', { class: 'rns-kv-v' }, String(vars[k] == null ? '' : vars[k]))))));
    } else {
      kids.push(h('div', { class: 'rns-note' }, '本次运行未提供变量。'));
    }
    if (!run.ok && run.error) {
      kids.push(h('div', { class: 'rns-sec' }, '错误'));
      kids.push(h('div', { class: 'rns-error' }, run.error));
    }
    kids.push(h('div', { class: 'rns-sec' }, `响应预览（前 ${RESPONSE_PREVIEW} 字）`));
    const text = run.response || '';
    kids.push(h('div', { class: 'rns-response' },
      text ? text.slice(0, RESPONSE_PREVIEW) + (text.length > RESPONSE_PREVIEW ? '…' : '') : '（无响应内容）'));
    kids.push(h('div', { class: 'rns-note' },
      `Prompt：${run.promptTitle || '—'}（${run.promptId || '—'}） · 创建于 ${run.createdAt || '—'}`));
    return kids;
  }
}
