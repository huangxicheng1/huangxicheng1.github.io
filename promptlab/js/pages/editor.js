// ============================================================================
// pages/editor.js —— 提示词编辑器（表单 + 变量检测 + 渲染预览 + 版本历史 + diff + 回滚）
// 归属：前端·库与编辑器（SPEC 8.6 · editor.js）
// 依赖契约模块：../api.js、../ui.js、../router.js（由框架模块提供）。
// 说明：本模块被 import 时不执行任何访问 window/document 的顶层代码（SPEC 第 0 节）。
// ============================================================================

import { api } from '../api.js';
import { h, toast, confirmDialog, timeAgo, diffHtml, ICONS } from '../ui.js';
import { navigate } from '../router.js';

/** 变量语法（与 SPEC 第 5 节 prompts.js 的正则逐字一致） */
const VAR_PATTERN = /\{\{\s*([a-zA-Z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*\}\}/g;

/** 页面私有样式（以 <style> 注入 root，不修改 base.css；复用其中公共类） */
const PAGE_CSS = `
  .pl-ed-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .pl-ed-htitle-wrap { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  .pl-ed-htitle { font-size: 18px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pl-ed-hmeta { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .pl-ed-dirty { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--accent-2); white-space: nowrap; }
  .pl-ed-dirty-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-2); animation: pl-ed-pulse 1.2s ease-in-out infinite; }
  @keyframes pl-ed-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
  .pl-ed-loading { color: var(--muted); padding: 24px 0; text-align: center; }
  .pl-ed-cols { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
  @media (max-width: 980px) { .pl-ed-cols { grid-template-columns: 1fr; } }
  .pl-ed-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; margin-bottom: 16px; }
  .pl-ed-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 640px) { .pl-ed-row2 { grid-template-columns: 1fr; } }
  .pl-ed-textarea { width: 100%; box-sizing: border-box; resize: vertical; line-height: 1.6; }
  .pl-ed-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
  .pl-ed-chips-label { color: var(--muted); }
  .pl-ed-chip { font-family: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace; font-size: 12px; color: var(--accent-2); background: var(--panel-2); border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; cursor: pointer; transition: border-color .15s; }
  .pl-ed-chip:hover { border-color: var(--accent-2); }
  .pl-ed-preview { border: 1px solid var(--border); border-radius: 10px; background: var(--panel-2); }
  .pl-ed-preview summary { cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 13px; user-select: none; }
  .pl-ed-preview[open] summary { border-bottom: 1px solid var(--border); }
  .pl-ed-preview-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .pl-ed-preview-none { color: var(--muted); font-size: 12px; }
  .pl-ed-vars { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  .pl-ed-var { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .pl-ed-var-name { font-family: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace; font-size: 12px; color: var(--accent-2); white-space: nowrap; flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
  .pl-ed-var .input { min-width: 0; flex: 1; }
  .pl-ed-out { margin: 0; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-family: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace; font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; }
  .pl-ed-save-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pl-ed-note { flex: 1; min-width: 200px; }
  .pl-ed-hint { font-size: 12px; color: var(--muted); }
  .pl-ed-vlist { display: flex; flex-direction: column; gap: 8px; }
  .pl-ed-vrow { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); }
  .pl-ed-vrow-current { border-color: var(--accent); }
  .pl-ed-vrow input[type="checkbox"] { accent-color: var(--accent); flex: none; }
  .pl-ed-vmain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .pl-ed-vnote { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pl-ed-vtime { font-size: 11px; color: var(--muted); }
  .pl-ed-rollback { flex: none; padding: 4px 10px; font-size: 12px; }
  .pl-ed-diff { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border); display: flex; flex-direction: column; gap: 8px; }
  .pl-ed-diff-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .pl-ed-diff-title { font-weight: 600; color: var(--text); }
  .pl-ed-diff-body { border: 1px solid var(--border); border-radius: 8px; overflow: auto; max-height: 420px; background: var(--bg); font-family: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace; font-size: 12.5px; line-height: 1.55; }
  .pl-ed-diff-hint { font-size: 12px; color: var(--muted); }
  .pl-ed-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 16px; color: var(--muted); text-align: center; }
  .pl-ed-empty-title { font-size: 15px; font-weight: 600; color: var(--text); }
`;

/** 提取正文变量名（按首次出现顺序去重），正则与后端 extractVariables 保持一致 */
function extractVariables(body) {
  const names = [];
  const seen = new Set();
  const re = new RegExp(VAR_PATTERN.source, 'g');
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); names.push(m[1]); }
  }
  return names;
}

/** 渲染模板：变量替换为提供的值，未提供的替换为空字符串（与运行引擎语义一致） */
function renderTemplate(body, values) {
  const re = new RegExp(VAR_PATTERN.source, 'g');
  return String(body || '').replace(re, (all, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : '');
}

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

/** 填充集合下拉（编辑表单用）：未分组 + 各集合 */
function fillCollectionOptions(select, collections, selected) {
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
 * @param {{id?: string}} params 路径参数：提示词 id
 */
export async function render(root, params) {
  root.replaceChildren();
  root.appendChild(h('style', {}, PAGE_CSS));
  const id = String((params && params.id) || '');
  const apiUrl = '/api/prompts/' + encodeURIComponent(id);

  // —— 页面状态（本次渲染内的闭包状态）——
  const state = {
    prompt: null,        // 服务器端最新快照（完整 prompt，含 versions）
    collections: [],
    vars: [],            // 当前正文中检测到的变量名
    previewValues: {},   // 渲染预览中各变量的取值
    selectedVs: [],      // 版本对比勾选的 v 列表（最多 2 个）
    dirty: false,
  };
  let diffSeq = 0; // diff 请求序号，防止乱序响应覆盖

  // —— 头部 ——
  const headerTitle = h('span', { class: 'pl-ed-htitle' }, '加载中…');
  const headerBadge = h('span', { class: 'badge' }, '');
  const dirtyEl = h('span', { class: 'pl-ed-dirty', style: { display: 'none' } }, [
    h('span', { class: 'pl-ed-dirty-dot' }), '未保存',
  ]);
  const headerMeta = h('span', { class: 'pl-ed-hmeta' }, '');
  const header = h('div', { class: 'pl-ed-header' }, [
    h('button', { class: 'btn btn-ghost', onclick: () => navigate('#/library') }, ICONS.back + ' 返回库'),
    h('div', { class: 'pl-ed-htitle-wrap' }, [headerTitle, headerBadge, dirtyEl]),
    headerMeta,
    h('button', { class: 'btn btn-ghost', title: '在运行台中测试本提示词', onclick: () => navigate('#/playground/' + encodeURIComponent(id)) }, ICONS.run + ' 运行'),
  ]);

  // —— 左列：基本信息 + 正文编辑 ——
  const titleInput = h('input', { class: 'input', placeholder: '提示词标题（必填）' });
  const descInput = h('input', { class: 'input', placeholder: '一句话描述用途（可选）' });
  const tagsInput = h('input', { class: 'input', placeholder: '逗号分隔，如：润色, 翻译' });
  const collectionSelect = h('select', { class: 'select' });
  const basicCard = h('div', { class: 'card pl-ed-card' }, [
    h('div', { class: 'form-row' }, [h('div', { class: 'label' }, '标题'), titleInput]),
    h('div', { class: 'form-row' }, [h('div', { class: 'label' }, '描述'), descInput]),
    h('div', { class: 'pl-ed-row2' }, [
      h('div', { class: 'form-row' }, [h('div', { class: 'label' }, '标签'), tagsInput]),
      h('div', { class: 'form-row' }, [h('div', { class: 'label' }, '集合'), collectionSelect]),
    ]),
  ]);

  const bodyInput = h('textarea', {
    class: 'textarea pl-ed-textarea',
    rows: '16',
    placeholder: '提示词正文… 可用 {{变量名}} 作为占位符，运行时会替换为实际值',
  });
  const chipsWrap = h('div', { class: 'pl-ed-chips' });
  const previewVarsWrap = h('div', { class: 'pl-ed-vars' });
  const previewOut = h('pre', { class: 'pl-ed-out' }, '');
  const previewDetails = h('details', { class: 'pl-ed-preview' }, [
    h('summary', {}, '渲染预览（填入变量值，实时查看最终提示词）'),
    h('div', { class: 'pl-ed-preview-body' }, [previewVarsWrap, previewOut]),
  ]);
  const noteInput = h('input', { class: 'input pl-ed-note', placeholder: '版本备注（可选，如：调整语气）' });
  const saveBtn = h('button', { class: 'btn btn-primary', onclick: () => save() }, '保存');
  const bodyCard = h('div', { class: 'card pl-ed-card' }, [
    h('div', { class: 'label' }, '正文（保存时若正文有变化将产生新版本）'),
    bodyInput,
    chipsWrap,
    previewDetails,
    h('div', { class: 'pl-ed-save-row' }, [noteInput, saveBtn]),
  ]);

  // —— 右列：版本历史 + diff ——
  const histList = h('div', { class: 'pl-ed-vlist' });
  const diffTitle = h('span', { class: 'pl-ed-diff-title' }, '');
  const diffStat = h('span', {}, '');
  const diffHead = h('div', { class: 'pl-ed-diff-head' }, [diffTitle, diffStat]);
  const diffBody = h('div', { class: 'pl-ed-diff-body' });
  const diffHint = h('div', { class: 'pl-ed-diff-hint' }, '勾选任意两个版本，即可对比正文差异；单个版本可回滚。');
  const rightCard = h('div', { class: 'card pl-ed-card' }, [
    h('div', { class: 'label' }, ICONS.version + ' 版本历史'),
    histList,
    h('div', { class: 'pl-ed-diff' }, [diffHead, diffBody, diffHint]),
  ]);

  const loadingEl = h('div', { class: 'pl-ed-loading' }, '提示词加载中…');
  const cols = h('div', { class: 'pl-ed-cols' }, [
    h('div', {}, [basicCard, bodyCard]),
    rightCard,
  ]);
  root.appendChild(header);
  root.appendChild(loadingEl);
  root.appendChild(cols);

  // ================================ 行为 ================================

  function setDirty(b) {
    state.dirty = b;
    dirtyEl.style.display = b ? '' : 'none';
  }

  function isDirty() {
    const p = state.prompt;
    if (!p) return false;
    return titleInput.value !== (p.title || '')
      || descInput.value !== (p.description || '')
      || tagsInput.value !== (p.tags || []).join(', ')
      || (collectionSelect.value || null) !== (p.collectionId || null)
      || bodyInput.value !== (p.body || '');
  }

  function updateHeader() {
    const p = state.prompt;
    headerTitle.textContent = p.title || '（无标题）';
    headerBadge.textContent = 'v' + p.currentVersion;
    headerMeta.textContent = '更新于 ' + timeAgo(p.updatedAt) + ' · 共 ' + (p.versions || []).length + ' 个版本';
  }

  function fillForm() {
    const p = state.prompt;
    titleInput.value = p.title || '';
    descInput.value = p.description || '';
    tagsInput.value = (p.tags || []).join(', ');
    fillCollectionOptions(collectionSelect, state.collections, p.collectionId);
    bodyInput.value = p.body || '';
    updateChips();
    setDirty(false);
  }

  function applyPrompt(p) {
    state.prompt = p;
    fillForm();
    renderHistory();
    updateHeader();
  }

  // —— 变量检测 chips + 渲染预览 ——
  function updateChips() {
    const vars = extractVariables(bodyInput.value);
    const changed = vars.join('\u0001') !== state.vars.join('\u0001');
    state.vars = vars;
    if (changed) {
      const kids = [];
      if (!vars.length) {
        kids.push(h('span', { class: 'pl-ed-chips-label' }, '未检测到变量（正文中的 {{变量名}} 会自动识别为变量）'));
      } else {
        kids.push(h('span', { class: 'pl-ed-chips-label' }, '检测到 ' + vars.length + ' 个变量：'));
        for (const name of vars) {
          kids.push(h('button', {
            type: 'button',
            class: 'pl-ed-chip',
            title: '点击定位到「' + name + '」的预览输入框',
            onclick: () => focusVarInput(name),
          }, '{{' + name + '}}'));
        }
      }
      chipsWrap.replaceChildren(...kids);
      rebuildPreviewVars();
    }
    updatePreviewOut();
  }

  function rebuildPreviewVars() {
    const kids = [];
    if (!state.vars.length) {
      kids.push(h('div', { class: 'pl-ed-preview-none' }, '正文没有变量，运行时将原样发送。'));
    } else {
      for (const name of state.vars) {
        const inp = h('input', {
          class: 'input',
          dataset: { var: name },
          placeholder: '填写「' + name + '」的值（留空则替换为空字符串）',
        });
        if (Object.prototype.hasOwnProperty.call(state.previewValues, name)) {
          inp.value = state.previewValues[name];
        }
        inp.addEventListener('input', () => {
          state.previewValues[name] = inp.value;
          updatePreviewOut();
        });
        kids.push(h('div', { class: 'pl-ed-var' }, [h('span', { class: 'pl-ed-var-name' }, name), inp]));
      }
    }
    previewVarsWrap.replaceChildren(...kids);
  }

  function focusVarInput(name) {
    previewDetails.open = true;
    const inp = previewVarsWrap.querySelector('[data-var="' + name + '"]');
    if (inp) inp.focus();
  }

  function updatePreviewOut() {
    const values = {};
    for (const name of state.vars) {
      if (Object.prototype.hasOwnProperty.call(state.previewValues, name)) {
        values[name] = state.previewValues[name];
      }
    }
    previewOut.textContent = renderTemplate(bodyInput.value, values);
  }

  // —— 保存（PUT；正文变化时后端追加新版本）——
  async function save() {
    if (!state.prompt) return;
    const title = titleInput.value.trim();
    const body = bodyInput.value;
    if (!title) { toast('标题不能为空', 'error'); titleInput.focus(); return; }
    if (!body.trim()) { toast('正文不能为空', 'error'); bodyInput.focus(); return; }
    const prevV = state.prompt.currentVersion;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    try {
      const updated = await api.put(apiUrl, {
        title,
        description: descInput.value.trim(),
        tags: parseTags(tagsInput.value),
        collectionId: collectionSelect.value || null,
        body,
        note: noteInput.value.trim(),
      });
      applyPrompt(updated);
      noteInput.value = '';
      if (updated.currentVersion > prevV) {
        toast('已保存，产生新版本 v' + updated.currentVersion, 'success');
      } else {
        toast('已保存（正文未变化，未产生新版本）', 'success');
      }
    } catch (err) {
      toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  }

  // —— 版本历史 / diff / 回滚 ——
  function renderHistory() {
    const versions = (state.prompt.versions || []).slice().sort((a, b) => b.v - a.v);
    if (!versions.length) {
      histList.replaceChildren(h('div', { class: 'pl-ed-hint' }, '暂无版本记录'));
    } else {
      histList.replaceChildren(...versions.map(versionRow));
    }
    refreshDiff();
  }

  function versionRow(v) {
    const isCurrent = v.v === state.prompt.currentVersion;
    const cb = h('input', { type: 'checkbox', title: '勾选两个版本进行对比' });
    cb.checked = state.selectedVs.includes(v.v);
    cb.addEventListener('change', () => toggleSelect(v.v));
    const row = h('div', { class: 'pl-ed-vrow' + (isCurrent ? ' pl-ed-vrow-current' : '') }, [
      cb,
      h('div', { class: 'pl-ed-vmain' }, [
        h('div', { class: 'pl-ed-vnote', title: v.note || '' }, v.note || '（无备注）'),
        h('div', { class: 'pl-ed-vtime' }, 'v' + v.v + ' · ' + timeAgo(v.savedAt) + (isCurrent ? ' · 当前版本' : '')),
      ]),
    ]);
    if (!isCurrent) {
      row.appendChild(h('button', {
        class: 'btn btn-ghost pl-ed-rollback',
        title: '以此版本内容创建新版本',
        onclick: () => rollback(v.v),
      }, '回滚'));
    }
    return row;
  }

  function toggleSelect(v) {
    const i = state.selectedVs.indexOf(v);
    if (i >= 0) {
      state.selectedVs.splice(i, 1);
    } else {
      state.selectedVs.push(v);
      if (state.selectedVs.length > 2) state.selectedVs.shift(); // 最多保留两个（先进先出）
    }
    renderHistory();
  }

  async function refreshDiff() {
    const seq = ++diffSeq;
    if (state.selectedVs.length !== 2) {
      diffHead.style.display = 'none';
      diffBody.style.display = 'none';
      diffHint.style.display = '';
      return;
    }
    diffHead.style.display = '';
    diffBody.style.display = '';
    diffHint.style.display = 'none';
    const from = Math.min(state.selectedVs[0], state.selectedVs[1]);
    const to = Math.max(state.selectedVs[0], state.selectedVs[1]);
    diffTitle.textContent = '差异对比：v' + from + ' → v' + to;
    diffStat.textContent = '加载中…';
    diffBody.innerHTML = '';
    try {
      const d = await api.get(apiUrl + '/diff?from=' + from + '&to=' + to);
      if (seq !== diffSeq) return; // 已有更新的选择，丢弃过期响应
      const adds = (d.diff || []).filter((x) => x.t === 'add').length;
      const dels = (d.diff || []).filter((x) => x.t === 'del').length;
      diffStat.textContent = '+' + adds + ' 行新增 / -' + dels + ' 行删除';
      const html = diffHtml(d.diff || []);
      diffBody.innerHTML = html && html.trim()
        ? html
        : '<div class="pl-ed-diff-hint" style="padding:10px;">两个版本的正文完全相同</div>';
    } catch (err) {
      if (seq !== diffSeq) return;
      diffStat.textContent = '';
      diffBody.innerHTML = '';
      diffBody.appendChild(h('div', { class: 'pl-ed-diff-hint', style: { padding: '10px' } },
        '对比加载失败：' + (err && err.message ? err.message : '未知错误')));
    }
  }

  async function rollback(v) {
    if (!state.prompt) return;
    let msg = '回滚到 v' + v + '？将以此版本内容创建新版本 v' + (state.prompt.currentVersion + 1) + '，历史版本不会被修改。';
    if (state.dirty) msg += '\n注意：当前有未保存的修改，回滚后将被覆盖。';
    const ok = await confirmDialog(msg);
    if (!ok) return;
    try {
      const updated = await api.post(apiUrl + '/rollback', { version: v });
      applyPrompt(updated);
      toast('已回滚到 v' + v + '，产生新版本 v' + updated.currentVersion, 'success');
    } catch (err) {
      toast('回滚失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  // —— 脏状态监听 ——
  function onFormInput() {
    if (!state.prompt) return;
    setDirty(isDirty());
  }
  for (const el of [titleInput, descInput, tagsInput, bodyInput]) el.addEventListener('input', onFormInput);
  collectionSelect.addEventListener('change', onFormInput);
  bodyInput.addEventListener('input', () => updateChips());

  // —— 数据加载 ——
  async function loadAll() {
    const [pRes, cRes] = await Promise.allSettled([
      api.get(apiUrl),
      api.get('/api/collections'),
    ]);
    if (pRes.status === 'rejected') {
      showLoadError(pRes.reason && pRes.reason.message);
      return;
    }
    state.collections = cRes.status === 'fulfilled' ? cRes.value : [];
    if (cRes.status === 'rejected') toast('集合列表加载失败，集合下拉暂不可用', 'error');
    applyPrompt(pRes.value);
    loadingEl.remove();
  }

  function showLoadError(msg) {
    loadingEl.remove();
    headerTitle.textContent = '无法加载提示词';
    headerBadge.textContent = '';
    headerMeta.textContent = '';
    cols.replaceWith(h('div', { class: 'empty pl-ed-empty' }, [
      h('div', { class: 'pl-ed-empty-title' }, '提示词加载失败：' + (msg || '未知错误')),
      h('div', { class: 'pl-ed-hint' }, '它可能已被删除，或链接有误。'),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('#/library') }, ICONS.back + ' 返回提示词库'),
    ]));
  }

  await loadAll();
}
