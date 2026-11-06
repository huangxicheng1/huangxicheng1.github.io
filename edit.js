/* ============================================================================
 * 编辑室（edit.js）—— 在网站上直接写 / 改 notes 与 diary
 * ----------------------------------------------------------------------------
 * 内容真相仍然只有一处：content/**\/*.md。这里通过 GitHub Contents API 直接
 * 提交到仓库，Actions 会重新跑 build.py 生成 entries.js，约 1 分钟后线上可见。
 *
 * 授权：复用它站内批注那枚 fine-grained PAT（只给本仓库 Contents 读写），
 * token 存在 localStorage，不进仓库、不发往除 api.github.com 之外的任何地方。
 *
 * 调试：?mock=1 时用 localStorage 假装成仓库，可在没有 token 的情况下跑通全流程。
 * ========================================================================== */

(function () {
  'use strict';

  if (document.body.dataset.page !== 'admin') return;

  const CONFIG = {
    owner: 'huangxicheng1',
    repo: 'huangxicheng1.github.io',
    branch: 'main',
    api: 'https://api.github.com',
    notesDir: 'content/notes',
    diaryDir: 'content/diary',
    imageDir: 'assets/images'
  };

  const KEY_TOKEN = 'muse-gh-token';
  const KEY_USER = 'muse-gh-user';
  const KEY_MOCK = 'muse-mock-repo';
  const KEY_DRAFT = 'muse-editor-draft';
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
  const MOCK = /(?:^\?|&)mock=1(?:&|$)/.test(location.search);

  /* ------------------------------------------------------------ 小工具 */

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function readLS(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, value); } catch { /* 无痕模式 */ }
  }
  function readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }

  /* base64 <-> UTF-8 文本（btoa 只认 latin1，中文必须自己转） */
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function toBase64(text) {
    const bytes = encoder.encode(text);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function fromBase64(b64) {
    const bin = atob(String(b64 || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return decoder.decode(bytes);
  }

  /* ------------------------------------------------------------ 仓库读写 */

  const state = {
    token: readLS(KEY_TOKEN, '') || '',
    user: readJSON(KEY_USER, null),
    entries: [],
    filter: '',
    doc: null,
    pending: null,
    ready: false
  };

  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  function headers(extra) {
    return Object.assign({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, state.token ? { Authorization: 'Bearer ' + state.token } : {}, extra || {});
  }

  async function ghJson(path, options) {
    const res = await fetch(CONFIG.api + path, Object.assign({ headers: headers() }, options || {}));
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* 忽略 */ }
      throw new ApiError(detail || `GitHub ${res.status}`, res.status);
    }
    return res.json();
  }

  /* ---- mock：把仓库假装成 localStorage ---- */

  function mockRepo() {
    let repo = readJSON(KEY_MOCK, null);
    if (!repo) {
      const seed = {
        'content/notes/2026-11-05-线程池调优.md': '---\ntitle: 线程池调优\ndate: 2026-11-05\ntype: note\nsummary: 线程池调优\ncategory: Java\ntags: Java\n---\n\n## 一、先分清三类线程池\n\n示例正文。\n',
        'content/diary/2026-11-05-随手一记.md': '---\ntitle: 随手一记\ndate: 2026-11-05\ntype: diary\nsummary: 随手一记\n---\n\n今天只是随便写点。\n'
      };
      repo = {};
      for (const [path, text] of Object.entries(seed)) repo[path] = { text, sha: 'mock-' + path.length };
      writeLS(KEY_MOCK, JSON.stringify(repo));
    }
    return repo;
  }

  function mockSave(repo) { writeLS(KEY_MOCK, JSON.stringify(repo)); }

  async function listDir(dir) {
    if (MOCK) {
      const repo = mockRepo();
      return Object.keys(repo)
        .filter(p => p.startsWith(dir + '/') && p.endsWith('.md'))
        .map(p => ({ name: p.split('/').pop(), path: p, sha: repo[p].sha, type: 'file' }));
    }
    return ghJson(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${dir}?ref=${CONFIG.branch}`);
  }

  async function readFile(path) {
    if (MOCK) {
      const repo = mockRepo();
      const hit = repo[path];
      if (!hit) throw new ApiError('文件不存在', 404);
      return { text: hit.text, sha: hit.sha };
    }
    const data = await ghJson(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`);
    return { text: fromBase64(data.content), sha: data.sha };
  }

  async function putFile(path, text, sha, message) {
    if (MOCK) {
      const repo = mockRepo();
      if (sha && !repo[path]) throw new ApiError('409 冲突', 409);
      repo[path] = { text, sha: 'mock-' + Math.random().toString(36).slice(2, 10) };
      mockSave(repo);
      return { ok: true };
    }
    const body = { message, content: toBase64(text), branch: CONFIG.branch };
    if (sha) body.sha = sha;
    const res = await fetch(`${CONFIG.api}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
      method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body)
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* 忽略 */ }
      throw new ApiError(detail || `GitHub ${res.status}`, res.status);
    }
    return res.json();
  }

  async function putBinary(path, base64, message) {
    if (MOCK) {
      const repo = mockRepo();
      repo[path] = { text: '[binary]', sha: 'mock-' + Math.random().toString(36).slice(2, 10) };
      mockSave(repo);
      return { ok: true };
    }
    const res = await fetch(`${CONFIG.api}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message, content: base64, branch: CONFIG.branch })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* 忽略 */ }
      throw new ApiError(detail || `GitHub ${res.status}`, res.status);
    }
    return res.json();
  }

  async function verifyToken(token) {
    if (MOCK) return { login: 'mock-user', avatar: '' };
    const res = await fetch(CONFIG.api + '/user', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) throw new ApiError(res.status === 401 ? 'token 无效或已被撤销' : `验证失败（HTTP ${res.status}）`, res.status);
    const user = await res.json();
    return { login: user.login, avatar: user.avatar_url };
  }

  /* ------------------------------------------------------------ front matter */

  function oneLine(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim();
  }

  function parseDoc(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const fields = {};
    if (!clean.startsWith('---\n')) return { fields, body: clean, ok: false };
    const end = clean.indexOf('\n---\n', 4);
    if (end < 0) return { fields, body: clean, ok: false };
    for (const line of clean.slice(4, end).split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = line.indexOf(':');
      if (at < 0) continue;
      const key = line.slice(0, at).trim().toLowerCase();
      const value = line.slice(at + 1).trim().replace(/^["']|["']$/g, '');
      fields[key] = value;
    }
    return { fields, body: clean.slice(end + 5).replace(/^\n+/, ''), ok: true };
  }

  function buildDoc(doc) {
    const f = doc.fields;
    const lines = ['---', 'title: ' + oneLine(f.title), 'date: ' + oneLine(f.date), 'type: ' + doc.kind,
      'summary: ' + oneLine(f.summary)];
    if (doc.kind === 'note') lines.push('category: ' + (oneLine(f.category) || '未分类'));
    const tags = String(f.tags || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    if (tags.length) lines.push('tags: ' + tags.join(', '));
    if (f.review) lines.push('review: ' + oneLine(f.review));
    if (f.draft) lines.push('draft: true');
    lines.push('---');
    return lines.join('\n') + '\n\n' + String(doc.body || '').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  }

  function slugify(title) {
    return oneLine(title)
      .replace(/[\\/:*?"<>|#%{}^~`[\]]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 48) || 'untitled';
  }

  function pathOf(doc) {
    const dir = doc.kind === 'note' ? CONFIG.notesDir : CONFIG.diaryDir;
    return `${dir}/${oneLine(doc.fields.date)}-${slugify(doc.fields.title)}.md`;
  }

  /* ------------------------------------------------------------ 提示 */

  let toastTimer = 0;
  function toast(message, options) {
    const opts = options || {};
    const box = $('#edToast');
    if (!box) return;
    box.replaceChildren(document.createTextNode(message));
    if (opts.link) {
      box.append(document.createTextNode(' '));
      const a = el('a', '', opts.link.label);
      a.href = opts.link.href;
      box.append(a);
    }
    box.classList.toggle('is-error', Boolean(opts.error));
    box.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('is-on'), opts.time || 4200);
  }

  /* ------------------------------------------------------------ 授权 */

  function showGate() {
    $('#edGate').hidden = false;
    $('#edListView').hidden = true;
    $('#edEditor').hidden = true;
    $('#edWho').textContent = '';
    const out = $('#edLogout');
    if (out) out.hidden = true;
  }

  function hideGate() {
    $('#edGate').hidden = true;
    $('#edListView').hidden = false;
  }

  async function authorize(rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) throw new ApiError('先粘贴 token', 0);
    const user = await verifyToken(token);
    state.token = token;
    state.user = user;
    writeLS(KEY_TOKEN, token);
    writeLS(KEY_USER, JSON.stringify(user));
    return user;
  }

  /* ------------------------------------------------------------ 列表 */

  function kindOfPath(path) {
    return path.startsWith(CONFIG.notesDir) ? 'note' : 'diary';
  }

  function idOfPath(path) {
    return path.replace(/^content\//, '').replace(/\.md$/, '');
  }

  async function loadList() {
    const count = $('#edCount');
    if (count) count.textContent = '载入中…';
    const list = $('#edItems');
    if (list && !list.children.length) {
      list.replaceChildren(el('li', 'ed-empty', '正在读取仓库…'));
    }

    const [notes, diary] = await Promise.all([
      listDir(CONFIG.notesDir).catch(() => []),
      listDir(CONFIG.diaryDir).catch(() => [])
    ]);
    const files = [].concat(Array.isArray(notes) ? notes : [], Array.isArray(diary) ? diary : [])
      .filter(f => f.type === 'file' && /\.md$/.test(f.name));

    /* 一次只读 6 个，条目多了也不至于把接口打出 403 */
    const loaded = [];
    const queue = files.slice();
    async function worker() {
      while (queue.length) {
        const file = queue.shift();
        try {
          const { text, sha } = await readFile(file.path);
          const parsed = parseDoc(text);
          loaded.push({
            path: file.path,
            sha,
            kind: kindOfPath(file.path),
            fields: parsed.fields,
            body: parsed.body,
            raw: text
          });
        } catch { /* 单个文件失败不影响整页 */ }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);

    state.entries = loaded.sort((a, b) => {
      const da = a.fields.date || '';
      const db = b.fields.date || '';
      return db.localeCompare(da) || (a.fields.title || '').localeCompare(b.fields.title || '', 'zh-Hans-CN');
    });
    renderList();
  }

  function renderList() {
    const list = $('#edItems');
    list.replaceChildren();

    const query = state.filter.toLowerCase();
    const rows = state.entries.filter(entry => {
      if (!query) return true;
      const hay = [entry.fields.title, entry.fields.category, entry.fields.tags, entry.fields.summary, entry.path]
        .join(' ').toLowerCase();
      return hay.includes(query);
    });

    const count = $('#edCount');
    if (count) count.textContent = rows.length === state.entries.length
      ? `共 ${rows.length} 条`
      : `${rows.length} / ${state.entries.length} 条`;

    if (!rows.length) {
      const empty = el('li', 'ed-empty', state.entries.length ? '没有匹配的条目。' : '还没有条目 — 点上面的「＋」开始写。');
      list.append(empty);
      return;
    }

    for (const entry of rows) {
      const item = el('button', 'ed-item');
      item.type = 'button';
      item.dataset.path = entry.path;

      item.append(el('span', 'ed-date', entry.fields.date || '—'));

      const kind = el('span', 'ed-kind' + (entry.kind === 'diary' ? ' is-diary' : ''),
        entry.kind === 'note' ? '笔记' : '日记');
      item.append(kind);

      const titleBox = el('span');
      titleBox.append(el('span', 'ed-title', entry.fields.title || '(无标题)'));

      /* 分类、标签、复习日期去重后拼一行；都没有就退回摘要 */
      const bits = [];
      const seen = new Set();
      const push = value => String(value || '')
        .split(/[,，、]/)
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(part => { if (!seen.has(part)) { seen.add(part); bits.push(part); } });
      push(entry.fields.category);
      push(entry.fields.tags);
      if (entry.fields.review) push('复习 ' + entry.fields.review);
      titleBox.append(el('span', 'ed-sub', bits.join(' · ') || entry.fields.summary || ''));

      item.append(titleBox);

      const draft = String(entry.fields.draft || '').toLowerCase();
      const isDraft = draft === 'true' || draft === 'yes' || draft === '1';
      item.append(el('span', 'ed-flag' + (isDraft ? ' is-draft' : ''), isDraft ? '草稿' : '已发布'));

      list.append(item);
    }
  }

  /* ------------------------------------------------------------ 编辑器 */

  function blankDoc(kind) {
    return {
      path: '',
      sha: '',
      kind: kind === 'diary' ? 'diary' : 'note',
      fields: { title: '', date: today(), summary: '', category: '', tags: '', review: '', draft: false },
      body: '',
      isNew: true
    };
  }

  function docFromEntry(entry) {
    const f = entry.fields;
    const draft = String(f.draft || '').toLowerCase();
    return {
      path: entry.path,
      sha: entry.sha,
      kind: entry.kind,
      fields: {
        title: f.title || '',
        date: f.date || today(),
        summary: f.summary || '',
        category: f.category || '',
        tags: f.tags || '',
        review: f.review || '',
        draft: draft === 'true' || draft === 'yes' || draft === '1'
      },
      body: entry.body || '',
      isNew: false
    };
  }

  function fillForm(doc) {
    $('#fType').value = doc.kind;
    $('#fDate').value = doc.fields.date || today();
    $('#fTitle').value = doc.fields.title || '';
    $('#fSummary').value = doc.fields.summary || '';
    $('#fCategory').value = doc.fields.category || '';
    $('#fTags').value = doc.fields.tags || '';
    $('#fReview').value = doc.fields.review || '';
    const draftBox = $('#fDraft');
    if (draftBox) draftBox.checked = Boolean(doc.fields.draft);
    $('#fBody').value = doc.body || '';
    $('#wrapCategory').hidden = doc.kind !== 'note';
    $('#wrapReview').hidden = doc.kind !== 'note';
    $('#edArchive').disabled = doc.isNew;
    $('#edArchive').textContent = doc.fields.draft ? '取消归档（重新发布）' : '归档（下架）';
    $('#edSave').textContent = doc.isNew ? '保存并发布' : '保存修改';
    $('#edPath').textContent = doc.isNew ? '新建 · ' + (doc.kind === 'note' ? CONFIG.notesDir : CONFIG.diaryDir) : doc.path;
    markClean();
    renderPreview();
  }

  function readForm() {
    if (!state.doc) return null;
    state.doc.fields.title = $('#fTitle').value;
    state.doc.fields.date = $('#fDate').value;
    state.doc.fields.summary = $('#fSummary').value;
    state.doc.fields.category = $('#fCategory').value;
    state.doc.fields.tags = $('#fTags').value;
    state.doc.fields.review = $('#fReview').value;
    const draftBox = $('#fDraft');
    if (draftBox) state.doc.fields.draft = draftBox.checked;
    state.doc.body = $('#fBody').value;
    return state.doc;
  }

  let cleanSnapshot = '';

  function snapshot() {
    if (!state.doc) return '';
    return JSON.stringify({ k: state.doc.kind, f: state.doc.fields, b: state.doc.body });
  }

  function markClean() {
    cleanSnapshot = snapshot();
    updateDirty();
  }

  function isDirty() {
    return snapshot() !== cleanSnapshot;
  }

  function updateDirty() {
    const flag = $('#edState');
    if (!flag) return;
    const dirty = isDirty();
    flag.textContent = dirty ? '● 未保存' : '✓ 已同步';
    flag.classList.toggle('is-dirty', dirty);
  }

  let previewTimer = 0;

  function renderPreview() {
    const box = $('#edPreview');
    if (!box) return;
    const body = $('#fBody').value || '';
    if (!body.trim()) {
      box.replaceChildren(el('p', 'ed-preview-empty', '左边写点什么，这里实时预览。'));
      return;
    }
    const render = window.SITE_MD;
    if (typeof render !== 'function') {
      box.replaceChildren(el('p', 'ed-preview-empty', '渲染器没加载上（app.js 未就绪）。'));
      return;
    }
    box.innerHTML = render(body);
  }

  function openEditor(doc) {
    state.doc = doc;
    $('#edListView').hidden = true;
    $('#edEditor').hidden = false;
    fillForm(doc);
    $('#fTitle').focus();
  }

  function closeEditor() {
    state.doc = null;
    $('#edEditor').hidden = true;
    $('#edListView').hidden = false;
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  function validate(doc) {
    if (!oneLine(doc.fields.title)) return '标题不能为空';
    if (!validDate(oneLine(doc.fields.date))) return '日期要写成 YYYY-MM-DD';
    if (doc.fields.review && !validDate(oneLine(doc.fields.review))) return '复习日期要写成 YYYY-MM-DD';
    if (!String(doc.body || '').trim()) return '正文不能为空';
    if (!oneLine(doc.fields.summary)) {
      doc.fields.summary = oneLine(doc.fields.title);
    }
    return '';
  }

  async function saveDoc(doc, message) {
    const text = buildDoc(doc);
    const path = doc.path || pathOf(doc);

    if (doc.sha) {
      try {
        const res = await putFile(path, text, doc.sha, message);
        return { path, sha: res.content ? res.content.sha : doc.sha };
      } catch (error) {
        if (error.status !== 409) throw error;
        const fresh = await readFile(path);          // 远端被改过：拿最新 sha 再来一次
        const res = await putFile(path, text, fresh.sha, message);
        return { path, sha: res.content ? res.content.sha : fresh.sha };
      }
    }

    try {                                                     // 同名文件已存在就当更新
      const existing = await readFile(path);
      const res = await putFile(path, text, existing.sha, message);
      return { path, sha: res.content ? res.content.sha : existing.sha };
    } catch (error) {
      if (error.status && error.status !== 404 && error.status !== 0) throw error;
      const res = await putFile(path, text, '', message);
      return { path, sha: res.content ? res.content.sha : '' };
    }
  }

  async function submit(options) {
    const opts = options || {};
    const doc = readForm();
    if (!doc) return;

    const problem = validate(doc);
    if (problem) { toast(problem, { error: true }); return; }

    const button = opts.archive ? $('#edArchive') : $('#edSave');
    if (button) button.disabled = true;
    const path = doc.path || pathOf(doc);

    try {
      let message;
      if (opts.archive) {
        doc.fields.draft = !doc.fields.draft;
        message = (doc.fields.draft ? 'blog: 归档 ' : 'blog: 恢复 ') + path.replace(/^content\//, '');
      } else {
        message = 'blog: ' + (doc.isNew ? '新增 ' : '更新 ') + path.replace(/^content\//, '');
      }

      const saved = await saveDoc(doc, message);
      const id = idOfPath(saved.path);

      doc.path = saved.path;
      doc.sha = saved.sha;
      doc.isNew = false;
      markClean();
      $('#edPath').textContent = saved.path;
      $('#edSave').textContent = '保存修改';
      $('#edArchive').disabled = false;
      $('#edArchive').textContent = doc.fields.draft ? '取消归档（重新发布）' : '归档（下架）';

      if (!opts.archive) {
        toast(doc.fields.draft ? '已存为草稿 · 不会出现在线上' : '已提交到仓库 · 约 1 分钟后线上可见', {
          link: { label: '看这篇 →', href: './entry.html?id=' + encodeURIComponent(id) },
          time: 6000
        });
      } else {
        toast(doc.fields.draft ? '已归档，线上约 1 分钟后消失' : '已恢复发布', { time: 5000 });
      }

      await loadList();
    } catch (error) {
      if (error.status === 401) { showGate(); toast('授权失效了，重新贴一次 token', { error: true }); }
      else toast('提交失败：' + (error.message || error), { error: true });
    } finally {
      if (button) button.disabled = false;
      if ($('#edArchive')) $('#edArchive').disabled = !state.doc;
    }
  }

  /* ------------------------------------------------------------ 图片 */

  function insertAtCursor(text) {
    const area = $('#fBody');
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const before = area.value.slice(0, start);
    const after = area.value.slice(end);
    const pad = before && !/\n$/.test(before) ? '\n\n' : '';
    area.value = before + pad + text + '\n' + after;
    const caret = (before + pad + text).length + 1;
    area.setSelectionRange(caret, caret);
    area.focus();
    readForm();
    updateDirty();
    renderPreview();
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(new Error('读不出这张图'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 4 * 1024 * 1024) {
      toast('图片超过 4MB 了，先压一下再贴', { error: true });
      return;
    }
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const name = `${oneLine($('#fDate').value) || today()}-${Date.now().toString(36)}.${ext}`;
    const path = `${CONFIG.imageDir}/${name}`;

    toast('图片上传中…', { time: 2000 });
    try {
      const base64 = await readFileAsBase64(file);
      await putBinary(path, base64, 'blog: 上传图片 ' + name);
      insertAtCursor(`![图](./${path})`);
      toast('图片已进仓库 · 提交笔记后一起生效', { time: 4200 });
    } catch (error) {
      toast('图片上传失败：' + (error.message || error), { error: true });
    }
  }

  /* ------------------------------------------------------------ 绑定 */

  function bind() {
    /* 授权 */
    $('#edAuthGo').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const user = await authorize($('#edAuthInput').value);
        $('#edAuthInput').value = '';
        toast('已授权：' + user.login, { time: 3000 });
        hideGate();
        await start();
      } catch (error) {
        toast(error.message || '授权失败', { error: true });
      } finally {
        button.disabled = false;
      }
    });

    $('#edAuthInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') $('#edAuthGo').click();
    });

    $('#edLogout') && $('#edLogout').addEventListener('click', () => {
      state.token = '';
      state.user = null;
      writeLS(KEY_TOKEN, '');
      writeLS(KEY_USER, '');
      showGate();
      toast('已退出授权', { time: 2400 });
    });

    /* 新建 / 列表 */
    document.querySelectorAll('[data-new]').forEach(button => {
      button.addEventListener('click', () => openEditor(blankDoc(button.dataset.new)));
    });

    $('#edItems').addEventListener('click', event => {
      const item = event.target.closest('.ed-item');
      if (!item) return;
      const entry = state.entries.find(e => e.path === item.dataset.path);
      if (entry) openEditor(docFromEntry(entry));
    });

    $('#edSearch').addEventListener('input', event => {
      state.filter = event.target.value.trim();
      renderList();
    });

    /* 编辑器 */
    $('#edBack').addEventListener('click', () => {
      if (isDirty() && !confirm('还有没保存的改动，确定离开？')) return;
      closeEditor();
    });

    $('#fType').addEventListener('change', event => {
      if (!state.doc) return;
      state.doc.kind = event.target.value === 'diary' ? 'diary' : 'note';
      $('#wrapCategory').hidden = state.doc.kind !== 'note';
      $('#wrapReview').hidden = state.doc.kind !== 'note';
      updateDirty();
    });

    const onField = () => {
      readForm();
      updateDirty();
      if (state.doc.isNew) $('#edPath').textContent = '新建 · ' + pathOf(state.doc);
      const draft = buildDoc(Object.assign({}, state.doc, { fields: Object.assign({}, state.doc.fields) }));
      writeLS(KEY_DRAFT, JSON.stringify({ at: Date.now(), path: state.doc.path, text: draft }));
    };

    ['#fTitle', '#fDate', '#fSummary', '#fCategory', '#fTags', '#fReview', '#fDraft'].forEach(sel => {
      const node = $(sel);
      if (node) node.addEventListener('input', onField);
    });

    $('#fBody').addEventListener('input', () => {
      readForm();
      updateDirty();
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 180);
    });

    $('#fBody').addEventListener('paste', event => {
      const items = (event.clipboardData && event.clipboardData.items) || [];
      for (const item of items) {
        if (item.type && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) { event.preventDefault(); uploadImage(file); }
          return;
        }
      }
    });

    $('#edPickImage').addEventListener('click', () => $('#edImageFile').click());
    $('#edImageFile').addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) uploadImage(file);
      event.target.value = '';
    });

    /* 工具栏 */
    document.querySelectorAll('[data-tool]').forEach(button => {
      button.addEventListener('click', () => {
        const area = $('#fBody');
        const kind = button.dataset.tool;
        const start = area.selectionStart;
        const end = area.selectionEnd;
        const picked = area.value.slice(start, end);
        const wrap = (left, right, placeholder) => {
          const text = picked || placeholder || '';
          area.setSelectionRange(start, end);
          insertAtCursor(left + text + right);
        };
        if (kind === 'bold') wrap('**', '**', '粗体');
        else if (kind === 'code') wrap('`', '`', 'code');
        else if (kind === 'h2') insertAtCursor('\n## 小标题\n');
        else if (kind === 'h3') insertAtCursor('\n### 小标题\n');
        else if (kind === 'quote') insertAtCursor('\n> 引用\n');
        else if (kind === 'list') insertAtCursor('\n- 一条\n- 又一条\n');
        else if (kind === 'table') insertAtCursor('\n| 列 A | 列 B |\n| --- | --- |\n| 值 | 值 |\n');
        else if (kind === 'link') wrap('[', '](https://)', '链接文字');
        else if (kind === 'hr') insertAtCursor('\n---\n');
        else if (kind === 'image') $('#edPickImage').click();
      });
    });

    $('#edSave').addEventListener('click', () => submit());
    $('#edArchive').addEventListener('click', () => submit({ archive: true, stay: true }));

    window.addEventListener('beforeunload', event => {
      if (state.doc && isDirty()) { event.preventDefault(); event.returnValue = ''; }
    });

    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (state.doc) submit();
      }
    });
  }

  /* ------------------------------------------------------------ 启动 */

  function renderWho() {
    const who = $('#edWho');
    if (!who) return;
    who.replaceChildren();
    if (MOCK) { who.append(document.createTextNode('MOCK 模式 · 不会真的写仓库')); return; }
    if (!state.user) return;
    who.append(document.createTextNode('已授权 '));
    const b = el('b', '', '@' + state.user.login);
    who.append(b);
  }

  async function applyRoute() {
    const params = new URLSearchParams(location.search);
    if (params.get('new')) { openEditor(blankDoc(params.get('new'))); return; }
    const edit = params.get('edit');
    if (!edit) return;
    const path = 'content/' + edit.replace(/^\/+/, '') + '.md';
    const entry = state.entries.find(e => e.path === path);
    if (entry) { openEditor(docFromEntry(entry)); return; }
    try {
      const { text, sha } = await readFile(path);
      const parsed = parseDoc(text);
      openEditor(docFromEntry({ path, sha, kind: kindOfPath(path), fields: parsed.fields, body: parsed.body }));
    } catch {
      toast('找不到这篇：' + edit, { error: true });
    }
  }

  async function start() {
    hideGate();
    renderWho();
    const out = $('#edLogout');
    if (out) out.hidden = !state.token;
    if (!state.ready) { bind(); state.ready = true; }
    try {
      await loadList();
      await applyRoute();
    } catch (error) {
      if (error.status === 401) { showGate(); toast('授权失效了，重新贴一次 token', { error: true }); }
      else toast('读取仓库失败：' + (error.message || error), { error: true });
    }
  }

  function boot() {
    $('#edTokenLink').href = TOKEN_URL;
    if (MOCK) { state.token = 'mock'; }
    if (!state.token) { showGate(); bind(); return; }
    start();
  }

  boot();
})();
