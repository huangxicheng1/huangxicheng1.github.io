// 运行测试台页面（hash: #/playground/:id）
// 契约依据：SPEC.md 第 5 节（POST /api/prompts/:id/run：非流式返回完整 run 记录（HTTP 200，ok:false 也 200）；
//   ?stream=1 时 SSE 逐块 data:{"type":"chunk","text":"…"}、结束 data:{"type":"done","run":{…}}；
//   live 模式不支持流式；GET /api/runs?promptId=&limit= → {items,total}）、
//   第 8.6 节（playground：prompt 信息卡（标题、当前 v）、变量表单（按 extractVariables 生成）、
//   「运行」按钮（文案随 settings 显示 Mock/Live）、打字机流式渲染、耗时与 token 估算、
//   本 prompt 运行历史（可展开看 finalPrompt 与 response）、运行中按钮禁用显示 loading）。
// 依赖（由 [前端·框架与设计系统] 按契约提供）：../api.js、../ui.js、../router.js。
// 注意：本模块顶层不访问 window/document（SPEC 第 0 节），DOM 操作全部在函数内完成。
import { api } from '../api.js?v=4';
import { h, toast, timeAgo, ICONS } from '../ui.js?v=4';
import { navigate } from '../router.js?v=4';

// 变量语法与后端 prompts.js 导出的 extractVariables 完全一致（SPEC 第 5 节）
const VARIABLE_RE = /\{\{\s*([a-zA-Z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*\}\}/g;

/** 从正文中提取去重变量名（按首次出现顺序）；与后端 extractVariables(body) 行为一致。 */
function extractVariables(body) {
  const names = [];
  const seen = new Set();
  const text = body == null ? '' : String(body);
  for (const m of text.matchAll(VARIABLE_RE)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      names.push(m[1]);
    }
  }
  return names;
}

/** 耗时展示：非法值显示 “—”。 */
function fmtMs(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${v} ms` : '—';
}

/** 小徽章（pill）：variant ∈ ''|mock|live|ok|fail|running。 */
function mkPill(text, variant) {
  return h('span', { class: variant ? `plg-pill plg-pill-${variant}` : 'plg-pill' }, text);
}

/** 结果统计 chip：label + 加粗值。 */
function mkStat(label, value) {
  return h('span', { class: 'plg-stat' }, `${label} `, h('b', {}, value));
}

// 页面私有样式（以 <style> 注入 root；仅使用 8.5 节定义的 CSS 变量与公共类，不修改 base.css）
const PAGE_CSS = `
  .plg-page { display: flex; flex-direction: column; gap: 16px; }
  .plg-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: space-between; }
  .plg-hint { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .plg-grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 16px; align-items: start; }
  .plg-right { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .plg-prompt-card { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
  .plg-prompt-title { margin: 0; font-size: 17px; line-height: 1.5; word-break: break-word; }
  .plg-badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .plg-desc { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; word-break: break-word; white-space: pre-wrap; }
  .plg-sec { font-size: 12px; font-weight: 600; color: var(--muted); }
  .plg-vars { display: flex; flex-direction: column; gap: 10px; }
  .plg-var-row { display: flex; flex-direction: column; gap: 4px; }
  .plg-var-code { font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace; color: var(--accent-2); }
  .plg-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .plg-run-btn { width: 100%; }
  .plg-run-btn[disabled] { opacity: 0.65; cursor: not-allowed; }
  .plg-result-card { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
  .plg-result-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .plg-flex-grow { flex: 1 1 auto; }
  .plg-elapsed { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .plg-stream { font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace; font-size: 13px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; min-height: 120px; max-height: 360px; overflow: auto; }
  .plg-placeholder { color: var(--muted); }
  .plg-cursor { display: inline-block; width: 8px; height: 1.05em; margin-left: 2px; border-radius: 2px; background: var(--accent-2); vertical-align: text-bottom; animation: plg-blink 0.9s steps(1, end) infinite; }
  @keyframes plg-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  .plg-stats { display: flex; gap: 8px; flex-wrap: wrap; }
  .plg-stat { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; font-size: 12px; color: var(--muted); }
  .plg-stat b { color: var(--text); font-weight: 600; margin-left: 4px; font-variant-numeric: tabular-nums; }
  .plg-error { border: 1px solid var(--danger); background: var(--danger-soft); color: var(--danger); border-radius: 8px; padding: 8px 12px; font-size: 13px; line-height: 1.7; word-break: break-word; }
  .plg-hist-card { display: flex; flex-direction: column; gap: 10px; padding: 20px; }
  .plg-hist-head { display: flex; align-items: center; gap: 10px; }
  .plg-hist-list { display: flex; flex-direction: column; gap: 8px; }
  .plg-hist-item { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--panel-2); transition: border-color 0.15s; }
  .plg-hist-item:hover { border-color: var(--accent); }
  .plg-hist-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; cursor: pointer; font-size: 13px; }
  .plg-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); flex: none; }
  .plg-dot.is-fail { background: var(--danger); }
  .plg-hist-when { color: var(--muted); white-space: nowrap; }
  .plg-hist-meta { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .plg-chevron { color: var(--muted); }
  .plg-hist-detail { display: flex; flex-direction: column; gap: 8px; border-top: 1px dashed var(--border); padding: 10px 12px; background: var(--panel); }
  .plg-kvs { display: flex; flex-direction: column; gap: 4px; }
  .plg-kv { display: flex; gap: 8px; font-size: 12px; }
  .plg-kv-k { color: var(--muted); flex: none; min-width: 90px; }
  .plg-kv-v { word-break: break-all; }
  .plg-pre { margin: 0; font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace; font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px; max-height: 220px; overflow: auto; }
  .plg-hist-err { color: var(--danger); font-size: 12px; line-height: 1.6; word-break: break-word; }
  .plg-pill { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 11px; line-height: 1.5; border: 1px solid var(--border); color: var(--muted); background: var(--panel-2); white-space: nowrap; }
  .plg-pill-mock { color: var(--accent-2); border-color: var(--accent-2); }
  .plg-pill-live { color: var(--accent); border-color: var(--accent); }
  .plg-pill-ok { color: var(--ok); border-color: var(--ok); }
  .plg-pill-fail { color: var(--danger); border-color: var(--danger); }
  .plg-pill-running { color: var(--accent-2); border-color: var(--accent-2); animation: plg-pulse 1s ease-in-out infinite; }
  @keyframes plg-pulse { 50% { opacity: 0.45; } }
  .plg-center { display: flex; justify-content: center; }
  @media (max-width: 960px) {
    .plg-grid { grid-template-columns: 1fr; }
  }
`;

// 页面入口（契约 8.1：root 为已清空的主内容容器；params 含路径参数 id）
export async function render(root, params) {
  document.title = '运行测试台 · PromptLab';
  const promptId = params && params.id != null ? String(params.id) : '';
  const styleEl = h('style', {}, PAGE_CSS);
  root.appendChild(styleEl);

  if (!promptId) {
    root.appendChild(h('div', { class: 'empty' }, '缺少 Prompt ID，请从提示词库选择 Prompt 后进入运行台。'));
    return;
  }

  const runPath = '/api/prompts/' + encodeURIComponent(promptId) + '/run';

  // —— 可变状态 ——
  let mode = 'mock'; // 来自 GET /api/settings，决定按钮文案与是否走流式
  let running = false;
  let streamedChars = 0; // 已流式渲染的字符数（用于 done 后兜底补齐）
  let timerId = null;
  let runStartAt = 0;
  let varInputs = []; // [{ name, input }]

  // —— DOM 引用 ——
  const badgesBox = h('div', { class: 'plg-badges' });
  const titleEl = h('h2', { class: 'plg-prompt-title' }, '…');
  const descEl = h('p', { class: 'plg-desc' }, '');
  const tagsBox = h('div', { class: 'plg-badges' });
  const varBox = h('div', { class: 'plg-vars' });
  const runBtn = h('button', { class: 'btn btn-primary plg-run-btn', onclick: () => doRun() }, `${ICONS.run} 运行`);
  const modeHint = h('div', { class: 'plg-hint' }, '');
  const statusBadge = mkPill('待运行', '');
  const elapsedEl = h('span', { class: 'plg-elapsed' }, '');
  const statsBox = h('div', { class: 'plg-stats' });
  const errorBox = h('div', { class: 'plg-error', style: { display: 'none' } });
  const cursor = h('span', { class: 'plg-cursor' });
  const streamBox = h('div', { class: 'plg-stream' },
    h('div', { class: 'plg-placeholder' }, '点击「运行」开始测试，模型响应将在此流式显示。'));
  const histCountEl = h('span', { class: 'plg-hint' }, '');
  const histList = h('div', { class: 'plg-hist-list' },
    h('div', { class: 'empty' }, '正在加载运行历史…'));

  root.appendChild(h('div', { class: 'plg-page' },
    h('div', { class: 'toolbar plg-toolbar' },
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => navigate('#/prompt/' + encodeURIComponent(promptId)),
      }, `${ICONS.back} 返回编辑器`),
      h('span', { class: 'plg-hint' }, `ID：${promptId}`)),
    h('div', { class: 'plg-grid' },
      h('section', { class: 'card plg-prompt-card' },
        badgesBox,
        titleEl,
        descEl,
        tagsBox,
        h('div', { class: 'plg-sec' }, '变量'),
        varBox,
        h('div', { class: 'plg-actions' }, runBtn, modeHint)),
      h('section', { class: 'plg-right' },
        h('div', { class: 'card plg-result-card' },
          h('div', { class: 'plg-result-head' },
            h('span', { class: 'plg-sec' }, '运行结果'),
            statusBadge,
            h('span', { class: 'plg-flex-grow' }),
            elapsedEl),
          streamBox,
          errorBox,
          statsBox),
        h('div', { class: 'card plg-hist-card' },
          h('div', { class: 'plg-hist-head' },
            h('span', { class: 'plg-sec' }, '本 Prompt 运行历史'),
            histCountEl),
          histList)))));

  // —— 数据加载 ——
  let prompt;
  let settings;
  try {
    [prompt, settings] = await Promise.all([
      api.get('/api/prompts/' + encodeURIComponent(promptId)),
      api.get('/api/settings').catch(() => null), // 设置加载失败不阻塞运行台，按默认 Mock 处理
    ]);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    root.replaceChildren(
      styleEl,
      h('div', { class: 'empty' }, `Prompt 加载失败：${msg}`),
      h('div', { class: 'plg-center', style: { margin: '8px 0 16px' } },
        h('button', { class: 'btn btn-primary', onclick: () => navigate('#/library') }, '返回提示词库')));
    toast(`Prompt 加载失败：${msg}`, 'error');
    return;
  }
  initFromPrompt(prompt, settings);
  refreshHistory(); // 异步刷新，不阻塞首屏

  // —— 初始化：填充信息卡 / 变量表单 / 运行按钮 ——
  function initFromPrompt(pt, st) {
    const body = pt && pt.body != null ? pt.body : '';
    mode = st && st.llm && st.llm.mode === 'live' ? 'live' : 'mock';
    const ver = typeof pt.currentVersion === 'number'
      ? pt.currentVersion
      : (Array.isArray(pt.versions) ? pt.versions.length : '?');
    badgesBox.replaceChildren(
      mkPill(`v${ver}`, ''),
      mkPill(mode === 'live' ? 'Live' : 'Mock', mode));
    titleEl.textContent = (pt && pt.title) || promptId;
    if (pt && pt.description) {
      descEl.textContent = pt.description;
    } else {
      descEl.style.display = 'none';
    }
    const tags = Array.isArray(pt && pt.tags) ? pt.tags : [];
    tagsBox.replaceChildren(...tags.map((t) => h('span', { class: 'tag' }, String(t))));
    if (!tags.length) tagsBox.style.display = 'none';

    varInputs = [];
    const names = extractVariables(body);
    if (!names.length) {
      varBox.replaceChildren(h('div', { class: 'plg-hint' }, '未在正文检测到 {{变量}} 占位符，可直接运行。'));
    } else {
      const rows = names.map((name) => {
        const input = h('input', {
          class: 'input',
          type: 'text',
          placeholder: `填写「${name}」的值`,
        });
        input.addEventListener('keydown', onVarKeydown);
        varInputs.push({ name, input });
        return h('div', { class: 'plg-var-row' },
          h('label', { class: 'label plg-var-code' }, `{{${name}}}`),
          input);
      });
      varBox.replaceChildren(...rows);
    }
    runBtn.textContent = `${ICONS.run} 运行（${mode === 'live' ? 'Live' : 'Mock'} 模式）`;
    modeHint.textContent = mode === 'live'
      ? 'Live 模式：调用真实 OpenAI 兼容接口（可在设置页配置）。Live 不支持流式，响应将整段返回。'
      : 'Mock 模式：本地模拟模型（确定性输出），响应以流式打字机方式展示。';
  }

  function onVarKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      doRun();
    }
  }

  // —— 流式渲染（打字机） ——
  function resetStream() {
    streamedChars = 0;
    streamBox.replaceChildren(cursor);
    streamBox.scrollTop = 0;
  }

  function appendChunk(text) {
    if (!text) return;
    streamedChars += text.length;
    const node = document.createTextNode(text);
    if (cursor.parentNode === streamBox) streamBox.insertBefore(node, cursor);
    else streamBox.appendChild(node);
    streamBox.scrollTop = streamBox.scrollHeight; // 跟随最新内容滚动
  }

  // —— 计时器（运行中实时耗时；结束后以 run.latencyMs 为准） ——
  function startTimer() {
    stopTimer();
    runStartAt = Date.now();
    elapsedEl.textContent = '0 ms';
    timerId = setInterval(() => {
      elapsedEl.textContent = `${Date.now() - runStartAt} ms`;
    }, 100);
  }

  function stopTimer() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function setStatus(text, variant) {
    statusBadge.textContent = text;
    statusBadge.className = variant ? `plg-pill plg-pill-${variant}` : 'plg-pill';
  }

  // —— 运行 ——
  async function doRun() {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    runBtn.textContent = '运行中…';
    setStatus('运行中', 'running');
    errorBox.style.display = 'none';
    statsBox.replaceChildren();
    resetStream();
    startTimer();

    const variables = {};
    for (const item of varInputs) variables[item.name] = item.input.value;
    const body = { variables, mode };

    try {
      let run;
      if (mode === 'live') {
        // live 模式不支持流式（SPEC 第 5 节）：直接非流式请求，响应整段返回
        run = await api.post(runPath, body);
        appendChunk(run && run.response ? run.response : '');
      } else {
        // mock 模式：SSE 流式打字机（api.streamPost 会自动补 stream=1）
        run = await api.streamPost(runPath, body, (text) => appendChunk(text));
      }
      if (!run || typeof run !== 'object') throw new Error('运行响应异常');
      finishRun(run);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setStatus('失败', 'fail');
      errorBox.textContent = `运行失败：${msg}`;
      errorBox.style.display = '';
      toast(`运行失败：${msg}`, 'error');
    } finally {
      stopTimer();
      running = false;
      runBtn.disabled = false;
      runBtn.textContent = `${ICONS.run} 运行（${mode === 'live' ? 'Live' : 'Mock'} 模式）`;
      refreshHistory(); // 运行（含失败）都会落库，刷新本 prompt 历史
    }
  }

  function finishRun(run) {
    if (streamedChars === 0 && run.response) appendChunk(run.response); // 兜底：流未送达任何块时补齐全文
    cursor.remove();
    elapsedEl.textContent = fmtMs(run.latencyMs);
    if (run.ok) {
      setStatus('成功', 'ok');
    } else {
      setStatus('失败', 'fail');
      errorBox.textContent = `模型返回错误：${run.error || '未知错误'}`;
      errorBox.style.display = '';
    }
    statsBox.replaceChildren(
      mkStat('耗时', fmtMs(run.latencyMs)),
      mkStat('输入 tokens（估算）', `≈ ${run.tokensIn != null ? run.tokensIn : 0}`),
      mkStat('输出 tokens（估算）', `≈ ${run.tokensOut != null ? run.tokensOut : 0}`),
      mkStat('模式', run.mode === 'live' ? 'Live' : 'Mock'));
  }

  // —— 本 prompt 运行历史（GET /api/runs?promptId=&limit=50） ——
  async function refreshHistory() {
    try {
      const res = await api.get('/api/runs?promptId=' + encodeURIComponent(promptId) + '&limit=50');
      const items = res && Array.isArray(res.items) ? res.items : [];
      const total = res && typeof res.total === 'number' ? res.total : items.length;
      renderHistory(items, total);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      histCountEl.textContent = '';
      histList.replaceChildren(h('div', { class: 'empty' }, `运行历史加载失败：${msg}`));
    }
  }

  function renderHistory(items, total) {
    histCountEl.textContent = `共 ${total} 条` + (total > items.length ? `，显示最近 ${items.length} 条` : '');
    if (!items.length) {
      histList.replaceChildren(h('div', { class: 'empty' }, '暂无运行记录，点击左上「运行」开始第一次测试。'));
      return;
    }
    histList.replaceChildren(...items.map((run) => histItem(run)));
  }

  function histItem(run) {
    const chevron = h('span', { class: 'plg-chevron' }, '▸');
    const detail = h('div', { class: 'plg-hist-detail', style: { display: 'none' } },
      ...detailChildren(run));
    let open = false;
    const row = h('div', { class: 'plg-hist-row' },
      h('span', { class: run.ok ? 'plg-dot' : 'plg-dot is-fail', title: run.ok ? '成功' : '失败' }),
      mkPill(run.mode === 'live' ? 'Live' : 'Mock', run.mode === 'live' ? 'live' : 'mock'),
      h('span', { class: 'plg-hist-when', title: run.createdAt || '' }, run.createdAt ? timeAgo(run.createdAt) : '—'),
      h('span', { class: 'plg-hist-meta' },
        `${fmtMs(run.latencyMs)}${run.ok ? ` · ≈${(run.tokensIn || 0) + (run.tokensOut || 0)} tokens` : ''}`),
      h('span', { class: 'plg-flex-grow' }),
      chevron);
    row.addEventListener('click', () => {
      open = !open;
      detail.style.display = open ? 'flex' : 'none';
      chevron.textContent = open ? '▾' : '▸';
    });
    return h('div', { class: 'plg-hist-item' }, row, detail);
  }

  function detailChildren(run) {
    const kids = [];
    const vars = run.variables && typeof run.variables === 'object' ? run.variables : {};
    const keys = Object.keys(vars);
    kids.push(h('div', { class: 'plg-sec' }, '变量'));
    if (keys.length) {
      kids.push(h('div', { class: 'plg-kvs' },
        ...keys.map((k) => h('div', { class: 'plg-kv' },
          h('span', { class: 'plg-kv-k' }, k),
          h('span', { class: 'plg-kv-v' }, String(vars[k] == null ? '' : vars[k]))))));
    } else {
      kids.push(h('div', { class: 'plg-hint' }, '本次运行未提供变量。'));
    }
    if (!run.ok && run.error) {
      kids.push(h('div', { class: 'plg-sec' }, '错误'));
      kids.push(h('div', { class: 'plg-hist-err' }, run.error));
    }
    kids.push(h('div', { class: 'plg-sec' }, '最终提示词（finalPrompt）'));
    kids.push(h('pre', { class: 'plg-pre' }, run.finalPrompt || '（空）'));
    kids.push(h('div', { class: 'plg-sec' }, '模型响应（response）'));
    kids.push(h('pre', { class: 'plg-pre' }, run.response || '（空）'));
    kids.push(h('div', { class: 'plg-hint' },
      `创建时间：${run.createdAt || '—'} · tokens 估算：输入 ${run.tokensIn != null ? run.tokensIn : 0} / 输出 ${run.tokensOut != null ? run.tokensOut : 0}`));
    return kids;
  }
}
