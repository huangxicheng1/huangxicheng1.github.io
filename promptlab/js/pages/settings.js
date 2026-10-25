// 设置页面（hash: #/settings）
// 契约依据：SPEC.md 第 5 节（GET/PUT /api/settings、GET /api/export、POST /api/import）、
// 8.4（state.js 的 store：app.js 订阅 store.set({theme}) 同步主题）、8.5（主题：html[data-theme] +
// localStorage 'plm-theme'，默认 dark）、8.6（settings：LLM 表单 / apiKey 掩码 / 主题切换 / 导入导出）。
// 依赖（[前端·框架与设计系统]模块按契约提供）：../api.js、../ui.js、../state.js
import { api } from '../api.js?v=4';
import { h, toast, confirmDialog, ICONS } from '../ui.js?v=4';
import { store } from '../state.js?v=4';

// 页面私有样式（注入 root）
const PAGE_CSS = `
  .plm-muted { color: var(--muted); }
  .plm-settings { display: flex; flex-direction: column; gap: 16px; max-width: 780px; }
  .plm-section { padding: 20px 24px; }
  .plm-section-title { font-size: 15px; font-weight: 600; }
  .plm-section-sub { font-size: 12px; margin: 4px 0 14px; }
  .plm-mode-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
  .plm-mode-option { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
  .plm-mode-option:hover { border-color: var(--accent); }
  .plm-mode-option.active { border-color: var(--accent); background: var(--panel-2); }
  .plm-mode-option input[type='radio'] { margin-top: 3px; accent-color: var(--accent); flex: 0 0 auto; }
  .plm-mode-name { font-weight: 600; font-size: 14px; }
  .plm-mode-desc { font-size: 12px; line-height: 1.5; margin-top: 2px; }
  .plm-mode-hint { font-size: 12px; margin-bottom: 14px; }
  .plm-live-fields { display: flex; flex-direction: column; gap: 14px; }
  .plm-field { gap: 6px; margin-bottom: 0; }
  .plm-field .label { font-size: 13px; }
  .plm-field-hint { font-size: 12px; }
  .plm-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .plm-form-foot { display: flex; justify-content: flex-end; margin-top: 8px; }
  .plm-theme-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .plm-theme-current { font-weight: 600; color: var(--accent); }
  .plm-data-row { display: grid; grid-template-columns: 2fr 3fr; gap: 16px; }
  .plm-data-block { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-2); }
  .plm-data-name { font-weight: 600; }
  .plm-data-block .plm-muted { font-size: 12px; line-height: 1.6; }
  .plm-file { font-size: 13px; max-width: 100%; }
  .plm-import-modes { display: flex; flex-direction: column; gap: 6px; }
  .plm-radio-line { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
  .plm-radio-line input[type='radio'] { accent-color: var(--accent); flex: 0 0 auto; }
  .plm-import-status { font-size: 12px; line-height: 1.6; }
  @media (max-width: 860px) {
    .plm-mode-group { grid-template-columns: 1fr; }
    .plm-field-row { grid-template-columns: 1fr; }
    .plm-data-row { grid-template-columns: 1fr; }
  }
`;

// 统一空态结构（复用 base.css 的 .empty 系列）
function emptyBlock(icon, title, hint) {
  const kids = [h('div', { class: 'empty-icon' }, icon), h('div', { class: 'empty-title' }, title)];
  if (hint) kids.push(h('div', { class: 'empty-hint' }, hint));
  return h('div', { class: 'empty' }, ...kids);
}

// 页面入口（契约 8.1；页面标题「设置」由 app.js 顶栏维护）
export async function render(root, params) {
  document.title = '设置 · PromptLab';
  root.appendChild(h('style', {}, PAGE_CSS));

  const loading = h('div', { class: 'loading' }, '正在加载设置…');
  root.appendChild(loading);

  let settings;
  try {
    settings = await api.get('/api/settings');
  } catch (err) {
    loading.remove();
    root.appendChild(emptyBlock('⚠️', '设置加载失败', err.message));
    toast(`设置加载失败：${err.message}`, 'error');
    return;
  }
  loading.remove();
  const llm = (settings && settings.llm) || {};
  root.appendChild(h('div', { class: 'plm-settings' },
    buildLlmCard(llm),
    buildThemeCard(),
    buildDataCard()
  ));
}

function field(labelText, control, hint) {
  const kids = [h('label', { class: 'label' }, labelText), control];
  if (hint) kids.push(h('div', { class: 'plm-muted plm-field-hint' }, hint));
  return h('div', { class: 'form-row plm-field' }, ...kids);
}

// ---------- LLM 设置表单（SPEC 8.6 / 第 5 节 settings） ----------
function buildLlmCard(llm) {
  let mode = llm.mode === 'live' ? 'live' : 'mock';

  const mockRadio = h('input', { type: 'radio', name: 'plm-llm-mode', value: 'mock' });
  const liveRadio = h('input', { type: 'radio', name: 'plm-llm-mode', value: 'live' });
  mockRadio.checked = mode === 'mock';
  liveRadio.checked = mode === 'live';

  const modeHint = h('div', { class: 'plm-muted plm-mode-hint' }, modeHintText(mode));

  const mockOption = h('label', { class: 'plm-mode-option' },
    mockRadio,
    h('div', {},
      h('div', { class: 'plm-mode-name' }, 'Mock 本地模拟'),
      h('div', { class: 'plm-muted plm-mode-desc' }, '无需网络，确定性中文结构化输出，适合调试与演示')
    )
  );
  const liveOption = h('label', { class: 'plm-mode-option' },
    liveRadio,
    h('div', {},
      h('div', { class: 'plm-mode-name' }, 'Live 真实 API'),
      h('div', { class: 'plm-muted plm-mode-desc' }, '调用 OpenAI 兼容接口的 chat/completions')
    )
  );

  // live 模式才显示的字段
  const baseUrlInput = h('input', { class: 'input', type: 'text', placeholder: 'https://api.openai.com/v1' });
  baseUrlInput.value = llm.baseUrl || '';
  // apiKey：GET 返回的是掩码（"····" + 末4位）；提交时若仍是掩码值，服务端会保留原值不覆盖（SPEC 第 5 节）
  const apiKeyInput = h('input', { class: 'input', type: 'text', placeholder: '未设置，例如 sk-…' });
  apiKeyInput.value = llm.apiKey || '';
  const modelInput = h('input', { class: 'input', type: 'text', placeholder: 'gpt-4o-mini' });
  modelInput.value = llm.model || '';
  const tempRaw = Number(llm.temperature);
  const tempInit = Number.isFinite(tempRaw) ? tempRaw : 0.7;
  const tokensRaw = Number(llm.maxTokens);
  const tokensInit = Number.isFinite(tokensRaw) && tokensRaw > 0 ? Math.floor(tokensRaw) : 1024;
  const tempInput = h('input', { class: 'input', type: 'number', min: '0', max: '2', step: '0.1' });
  tempInput.value = String(tempInit);
  const tokensInput = h('input', { class: 'input', type: 'number', min: '1', step: '1' });
  tokensInput.value = String(tokensInit);

  const liveFields = h('div', { class: 'plm-live-fields' },
    field('API 地址（baseUrl）', baseUrlInput, 'OpenAI 兼容接口地址，例如 https://api.openai.com/v1'),
    field('API Key', apiKeyInput, '仅保存在本地数据文件中；输入框初始显示掩码，保持不变则不会覆盖已保存的 Key（清空提交可移除）'),
    field('模型（model）', modelInput, '任意 OpenAI 兼容的模型名称'),
    h('div', { class: 'plm-field-row' },
      field('温度（temperature）', tempInput, '0–2，越高越随机'),
      field('最大 tokens（maxTokens）', tokensInput, '单次响应的长度上限')
    )
  );

  function setMode(m) {
    mode = m;
    mockOption.classList.toggle('active', m === 'mock');
    liveOption.classList.toggle('active', m === 'live');
    liveFields.style.display = m === 'live' ? '' : 'none';
    modeHint.textContent = modeHintText(m);
  }
  mockRadio.addEventListener('change', () => setMode('mock'));
  liveRadio.addEventListener('change', () => setMode('live'));
  setMode(mode);

  const saveBtn = h('button', { class: 'btn btn-primary', onclick: submit }, '保存设置');

  async function submit() {
    const baseUrl = baseUrlInput.value.trim();
    const model = modelInput.value.trim();
    const temperature = parseFloat(tempInput.value);
    const maxTokens = parseInt(tokensInput.value, 10);
    if (mode === 'live') {
      if (!baseUrl) { toast('Live 模式需要填写 API 地址', 'error'); baseUrlInput.focus(); return; }
      if (!/^https?:\/\//.test(baseUrl)) { toast('API 地址需要以 http:// 或 https:// 开头', 'error'); baseUrlInput.focus(); return; }
      if (!model) { toast('Live 模式需要填写模型名称', 'error'); modelInput.focus(); return; }
    }
    if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
      toast('温度需要是 0–2 之间的数字', 'error'); tempInput.focus(); return;
    }
    if (Number.isNaN(maxTokens) || maxTokens < 1) {
      toast('最大 tokens 需要是正整数', 'error'); tokensInput.focus(); return;
    }
    const payload = {
      llm: {
        mode,
        baseUrl,
        apiKey: apiKeyInput.value, // 未改动时即掩码值，服务端保留原值；改动则为新 Key
        model,
        temperature,
        maxTokens
      }
    };
    saveBtn.disabled = true;
    try {
      await api.put('/api/settings', payload);
      toast('设置已保存', 'success');
      // 重新读取以刷新 apiKey 掩码显示
      try {
        const fresh = await api.get('/api/settings');
        apiKeyInput.value = (fresh && fresh.llm && fresh.llm.apiKey) || '';
      } catch (_) { /* 掩码刷新失败不影响保存结果 */ }
    } catch (err) {
      toast(`保存失败：${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  return h('div', { class: 'card plm-section' },
    h('div', { class: 'plm-section-title' }, 'LLM 引擎'),
    h('div', { class: 'plm-muted plm-section-sub' }, '运行提示词时使用的引擎：Mock 为本地模拟，Live 调用 OpenAI 兼容接口。'),
    h('div', { class: 'plm-mode-group' }, mockOption, liveOption),
    modeHint,
    liveFields,
    h('div', { class: 'plm-form-foot' }, saveBtn)
  );
}

function modeHintText(mode) {
  return mode === 'live'
    ? 'Live 模式：运行提示词时将请求真实 API，响应内容与耗时取决于服务端。'
    : 'Mock 模式：运行提示词时由本地引擎生成确定性的模拟响应，可在运行台直接体验。';
}

// ---------- 主题切换（SPEC 8.5：html[data-theme] + localStorage 'plm-theme'，默认 dark） ----------
// 主通道为 store.set({ theme })：app.js 订阅后同步 html[data-theme] 并持久化（state.js 约定）；
// 同时直接写入 DOM/localStorage 作为兜底，两条路径写入的值一致，互不冲突。
function buildThemeCard() {
  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    const st = store.get().theme;
    if (st === 'light' || st === 'dark') return st;
    let saved = null;
    try { saved = localStorage.getItem('muse-theme'); } catch (_) { /* 隐私模式下 localStorage 可能不可用 */ }
    if (saved === 'light') return 'dark'; // 全站统一键：主站 'light'=夜间
    if (saved === 'dark') return 'light';
    return 'light';
  }
  function themeName(t) { return t === 'light' ? '档案室（纸色）' : '夜间值班'; }

  const themeLabel = h('span', { class: 'plm-theme-current' }, '');
  const toggleBtn = h('button', { class: 'btn', onclick: toggle }, '');

  function update() {
    const t = currentTheme();
    themeLabel.textContent = themeName(t);
    toggleBtn.textContent = `${ICONS.theme} 切换为${themeName(t === 'light' ? 'dark' : 'light')}`;
  }
  function toggle() {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    store.set({ theme: next }); // 主通道：app.js 订阅会同步 html[data-theme] 与 localStorage
    document.documentElement.setAttribute('data-theme', next); // 兜底直写，幂等
    try { localStorage.setItem('muse-theme', next === 'dark' ? 'light' : 'dark'); } catch (_) { /* 忽略持久化失败 */ }
    update();
    toast(`已切换到${themeName(next)}主题`, 'info');
  }
  update();

  return h('div', { class: 'card plm-section' },
    h('div', { class: 'plm-section-title' }, '外观'),
    h('div', { class: 'plm-theme-row' },
      h('div', {},
        h('div', {}, '当前主题：', themeLabel),
        h('div', { class: 'plm-muted', style: { marginTop: '4px', fontSize: '12px' } }, '主题偏好保存在浏览器本地（localStorage），默认纸色档案室。')
      ),
      toggleBtn
    )
  );
}

// ---------- 数据管理：导出 / 导入（SPEC 8.6 / 第 5 节 io） ----------
function buildDataCard() {
  let importData = null;
  let importMode = 'merge';

  const fileInput = h('input', { class: 'plm-file', type: 'file', accept: '.json,application/json' });
  const mergeRadio = h('input', { type: 'radio', name: 'plm-import-mode', value: 'merge' });
  const replaceRadio = h('input', { type: 'radio', name: 'plm-import-mode', value: 'replace' });
  mergeRadio.checked = true;
  const importBtn = h('button', { class: 'btn btn-primary', onclick: doImport }, `${ICONS.import} 开始导入`);
  importBtn.disabled = true;
  const importStatus = h('div', { class: 'plm-muted plm-import-status' }, '选择导出的 JSON 文件后即可导入。');

  function arrLen(x) { return Array.isArray(x) ? String(x.length) : '0'; }
  function numText(x) {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? String(n) : '0';
  }

  // 文件选择 → FileReader 读取并解析（SPEC 8.6）
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    importData = null;
    importBtn.disabled = true;
    if (!file) {
      importStatus.textContent = '选择导出的 JSON 文件后即可导入。';
      return;
    }
    importStatus.textContent = `正在读取「${file.name}」…`;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        importStatus.textContent = `文件解析失败：${err.message}`;
        toast('导入文件不是有效的 JSON', 'error');
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        importStatus.textContent = '文件解析失败：内容不是 PromptLab 整库 JSON 对象。';
        toast('导入文件不是有效的 PromptLab 数据', 'error');
        return;
      }
      importData = parsed;
      importBtn.disabled = false;
      importStatus.textContent =
        `已读取「${file.name}」：提示词 ${arrLen(parsed.prompts)} · 集合 ${arrLen(parsed.collections)} · 运行 ${arrLen(parsed.runs)}。选择导入模式后点击「开始导入」。`;
    };
    reader.onerror = () => {
      importStatus.textContent = '文件读取失败，请重试。';
    };
    reader.readAsText(file);
  });

  mergeRadio.addEventListener('change', () => { if (mergeRadio.checked) importMode = 'merge'; });
  replaceRadio.addEventListener('change', () => { if (replaceRadio.checked) importMode = 'replace'; });

  async function doImport() {
    if (!importData) {
      toast('请先选择要导入的 JSON 文件', 'error');
      return;
    }
    // replace 模式需二次确认并说明会覆盖现有数据（SPEC 8.6）
    if (importMode === 'replace') {
      const ok = await confirmDialog(
        '替换导入将覆盖现有的全部提示词、集合与运行记录（设置会保留），该操作无法撤销。确定继续吗？'
      );
      if (!ok) return;
    }
    importBtn.disabled = true;
    try {
      const res = await api.post('/api/import', { data: importData, mode: importMode });
      const added = res || {};
      const modeText = importMode === 'replace' ? '替换导入' : '合并导入';
      importStatus.textContent =
        `${modeText}完成：新增提示词 ${numText(added.addedPrompts)} · 集合 ${numText(added.addedCollections)} · 运行记录 ${numText(added.addedRuns)}。`;
      toast(`${modeText}完成`, 'success');
      fileInput.value = '';
      importData = null;
      importBtn.disabled = true;
    } catch (err) {
      importStatus.textContent = `导入失败：${err.message}`;
      toast(`导入失败：${err.message}`, 'error');
      importBtn.disabled = false;
    }
  }

  // 导出：静态版从本地数据层取整库 JSON，浏览器端生成下载（桌面版为 window.open('/api/export')）
  async function exportData() {
    const data = await api.get('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptlab-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('已导出整库备份 JSON', 'success');
  }

  return h('div', { class: 'card plm-section' },
    h('div', { class: 'plm-section-title' }, '数据管理'),
    h('div', { class: 'plm-muted plm-section-sub' }, '数据以 JSON 文件形式保存在本地，可随时导出备份或从备份恢复。'),
    h('div', { class: 'plm-data-row' },
      h('div', { class: 'plm-data-block' },
        h('div', { class: 'plm-data-name' }, '导出'),
        h('div', { class: 'plm-muted' }, '下载包含全部提示词、版本、集合与运行记录的整库 JSON 备份文件。'),
        h('button', { class: 'btn btn-primary', onclick: exportData }, `${ICONS.export} 导出全部数据`)
      ),
      h('div', { class: 'plm-data-block' },
        h('div', { class: 'plm-data-name' }, '导入'),
        h('div', { class: 'plm-muted' }, '从导出的 JSON 备份文件恢复数据。'),
        fileInput,
        h('div', { class: 'plm-import-modes' },
          h('label', { class: 'plm-radio-line' }, mergeRadio, '合并导入：保留现有数据，跳过重复项，追加新记录'),
          h('label', { class: 'plm-radio-line' }, replaceRadio, '替换导入：覆盖现有全部数据（设置保留）')
        ),
        importBtn,
        importStatus
      )
    )
  );
}
