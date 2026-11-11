/* 封存室：在浏览器本地解密 vault/data.js，并按档案室的排版渲染。
 * 明文从不离开这台设备，页面也不向任何服务器发请求。
 * 渲染器与 app.js 里的 markdown()/inline() 保持同一份实现，排版才和公开笔记一致。 */
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const REMEMBER_KEY = 'vault-key';
  const REMEMBER_DAYS = 30;

  const state = { password: null, notes: [], query: '', current: null };

  /* ---------------- 基础工具 ---------------- */

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary);
  }

  /* ---------------- 解密 ---------------- */

  async function deriveKeyBytes(password, blob) {
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: base64ToBytes(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
      material, 256);
    return bits;
  }

  async function decrypt(keyBytes, blob) {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(blob.iv) }, key, base64ToBytes(blob.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function rememberedKey(blob) {
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
      if (!saved || saved.exp < Date.now() || saved.salt !== blob.salt) return null;
      return base64ToBytes(saved.k);
    } catch { return null; }
  }

  function rememberKey(keyBytes, blob) {
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({
        k: bytesToBase64(keyBytes),
        salt: blob.salt,
        exp: Date.now() + REMEMBER_DAYS * 864e5
      }));
    } catch { /* 隐私模式下写不进去，忽略即可 */ }
  }

  function forgetKey() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
  }

  /* ---------------- Markdown（与 app.js 同一实现） ---------------- */

  function inline(raw) {
    const codeSlots = [];
    const withoutCode = String(raw).replace(/`([^`\n]+)`/g, (_match, code) => {
      const index = codeSlots.push(`<code>${escapeHTML(code)}</code>`) - 1;
      return `\uE000${index}\uE001`;
    });
    let html = escapeHTML(withoutCode);
    html = html.replace(/==([^=\n]+)==/g, '<mark class="md-highlight">$1</mark>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    /* 图片要先于链接处理，否则 ![...](...) 会被链接规则啃掉一半（与 app.js 保持一致） */
    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s<>)"']+|\.{0,2}\/[\w\-./%]+)\)/g,
      '<img src="$2" alt="$1" loading="lazy" decoding="async">');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s<>)"']+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/\[([^\]]+)\]\(#([\p{L}\p{N}_-]+)\)/gu, '<a href="#$2">$1</a>');
    return html.replace(/\uE000(\d+)\uE001/g, (_match, index) => codeSlots[Number(index)] || '');
  }

  function headingSlug(raw) {
    return String(raw).replace(/`([^`]*)`/g, '$1').replace(/\*\*|\*/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-');
  }

  function highlightCode(source, language) {
    const js = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|return|function|async|await|if|else|for|of|new|class|export|import|from|try|catch|throw|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()/g;
    const css = /\/\*[\s\S]*?\*\/|#[\da-fA-F]{3,8}\b|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[.#][\w-]+(?=\s*[{,:])|\b[\w-]+(?=\s*:)|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b/g;
    const htmlLang = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*|\/?>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[\w-]+(?==)/g;
    const java = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@\w+|\b(?:public|private|protected|class|new|return|if|else|try|catch|throw|final|static|void|long|int|boolean|true|false|null|this|extends|implements|import|package)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()/g;
    const sql = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|\b(?:SELECT|UPDATE|SET|WHERE|AND|OR|INSERT|INTO|VALUES|FROM|LIMIT|NOW|INTERVAL|MINUTE|NULL|NOT|INDEX|CREATE|UNIQUE|AS|ORDER|BY)\b|\b\d+\b|\b[A-Za-z_][\w]*(?=\s*\()/gi;
    /* 注：三引号 docstring 必须排在普通引号之前，否则 """ 会被拆成两个空串 */
    const py = /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|[fFrRbBuU]{0,2}"(?:\\.|[^"\\])*"|[fFrRbBuU]{0,2}'(?:\\.|[^'\\])*'|@[\w.]+|\b(?:def|class|return|if|elif|else|while|for|in|not|and|or|is|None|True|False|try|except|finally|raise|with|as|lambda|pass|break|continue|import|from|global|nonlocal|assert|del|yield|async|await)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\s*\()/g;
    /* JSON 没有关键字可言：键靠“后面紧跟冒号”判定为 property，值一律 string/number/literal */
    const json = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
    /* Shell 也没有统一语法边界：命令名靠“是否处在命令位”判定，普通参数不着色（见下方 isSh 分支） */
    const sh = /#[^\n]*|"(?:\\.|[^"\\])*"|'[^']*'|\$\{[^}]*\}|\$[A-Za-z_]\w*|\$[0-9@*?#!$-]|&&|\|\||\||\b\d+\b|--?[A-Za-z][\w-]*|\b[A-Za-z_][\w.-]*\b/g;
    const lang = String(language).toLowerCase();
    const isPy = /^(py|python|python3)$/.test(lang);
    const isJson = /^(json|jsonc)$/.test(lang);
    const isSh = /^(bash|sh|shell|zsh)$/.test(lang);
    const pattern = /^(js|javascript|ts|typescript|jsx)$/.test(lang) ? js
      : lang === 'css' ? css
      : lang === 'html' ? htmlLang
      : lang === 'java' ? java
      : lang === 'sql' ? sql
      : isPy ? py
      : isJson ? json
      : isSh ? sh : null;
    if (!pattern) return escapeHTML(source);
    let result = '', last = 0, match;
    while ((match = pattern.exec(source)) !== null) {
      result += escapeHTML(source.slice(last, match.index));
      const token = match[0];
      let kind;
      if (isSh) {
        if (token.startsWith('#')) kind = 'comment';
        else if (/^['"]/.test(token)) kind = 'string';
        else if (token.startsWith('$')) kind = 'property';
        else if (/^-/.test(token)) kind = 'number';
        else if (/^[|&]+$/.test(token)) kind = 'keyword';
        else if (/^(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|return|break|continue|export|local|readonly|declare|typeset|unset|shift|set|trap)$/.test(token)) kind = 'keyword';
        else {
          const after = source.slice(match.index + token.length);
          if (/^[A-Za-z_]\w*$/.test(token) && /^=(?!=)/.test(after)) kind = 'property';  /* NAME=value 赋值左侧算变量 */
          else {
            /* 命令位：行首，或紧跟在 ; | && || ( { 或 sudo/env/nohup/time/xargs 这类包装命令之后 */
            const before = source.slice(Math.max(0, match.index - 48), match.index);
            kind = /(?:^|[\n;|&({]|\b(?:then|do|else|elif|sudo|env|nohup|time|xargs|exec|command|eval)\s)\s*$/.test(before) ? 'function' : '';
          }
        }
      }
      else if (token.startsWith('//') || token.startsWith('/*') || token.startsWith('<!--') || token.startsWith('--') || (isPy && token.startsWith('#'))) kind = 'comment';
      else if (/^(?:[fFrRbBuU]{1,2})?['"`]/.test(token)) kind = 'string';
      else if (/^-?\d/.test(token) || (lang === 'css' && token.startsWith('#'))) kind = 'number';
      else if (token.startsWith('<') || token === '>' || token === '/>') kind = 'tag';
      else if (/^(?:const|let|var|return|function|async|await|if|else|for|of|new|class|export|import|from|try|catch|throw|true|false|null|undefined|public|private|protected|final|static|void|long|int|boolean|this|extends|implements|package|def|elif|while|in|is|as|with|except|finally|raise|yield|lambda|pass|break|continue|global|nonlocal|assert|del|None|True|False|SELECT|UPDATE|SET|WHERE|INSERT|INTO|VALUES|FROM|LIMIT|NOW|INTERVAL|MINUTE|NOT|INDEX|CREATE|UNIQUE|AS|ORDER|BY)$/i.test(token)) kind = 'keyword';
      else if (lang === 'css' && /^[.#]/.test(token)) kind = 'selector';
      else if (lang === 'css' || lang === 'html' || token.startsWith('@')) kind = 'property';
      else kind = 'function';
      if (isJson && kind === 'string' && /^\s*:/.test(source.slice(match.index + token.length))) kind = 'property';
      result += kind ? `<span class="tok tok-${kind}">${escapeHTML(token)}</span>` : escapeHTML(token);
      last = pattern.lastIndex;
    }
    return result + escapeHTML(source.slice(last));
  }

  function codeBlock(lines, language) {
    const lang = /^[a-zA-Z0-9+#-]{1,20}$/.test(language) ? language.toLowerCase() : '';
    const labels = { js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', css: 'CSS', html: 'HTML', json: 'JSON', jsonc: 'JSON', java: 'Java', sql: 'SQL', py: 'Python', python: 'Python', bash: 'Bash', sh: 'Shell', shell: 'Shell', zsh: 'Zsh' };
    const label = Object.hasOwn(labels, lang) ? labels[lang] : (lang ? lang.toUpperCase() : 'CODE');
    return `<div class="md-code"><div class="md-code-head"><span class="code-dots" aria-hidden="true">● ● ●</span><span>${escapeHTML(label)}</span></div><pre><code>${highlightCode(lines.join('\n'), lang)}</code></pre></div>`;
  }

  function pipeCells(line) {
    const trimmed = line.trim();
    return trimmed.startsWith('|') && trimmed.endsWith('|')
      ? trimmed.slice(1, -1).split('|').map(cell => cell.trim()) : null;
  }

  function markdown(source) {
    const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
    const output = []; let paragraph = [], list = null, quote = [], code = [], fenced = false, codeLanguage = '';
    const headingIds = new Map();
    const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; } };
    const flushList = () => { if (list) { output.push(`</${list}>`); list = null; } };
    const flushQuote = () => { if (quote.length) { output.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        flushParagraph(); flushList(); flushQuote();
        if (fenced) { output.push(codeBlock(code, codeLanguage)); code = []; codeLanguage = ''; fenced = false; }
        else { codeLanguage = line.slice(3).trim().split(/\s+/)[0] || ''; fenced = true; }
        continue;
      }
      if (fenced) { code.push(line); continue; }
      const headers = pipeCells(line);
      const separator = pipeCells(lines[i + 1] || '');
      if (headers?.length && separator?.length === headers.length && separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
        flushParagraph(); flushList(); flushQuote();
        const head = headers.map(cell => `<th scope="col">${inline(cell)}</th>`).join('');
        const rows = [];
        i++;
        while (i + 1 < lines.length) {
          const cells = pipeCells(lines[i + 1]);
          if (!cells || cells.length !== headers.length) break;
          rows.push(`<tr>${cells.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`);
          i++;
        }
        output.push(`<div class="md-table-scroll" role="region" aria-label="文章表格" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
        continue;
      }
      if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
      if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) { flushParagraph(); flushList(); flushQuote(); output.push('<hr>'); continue; }
      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        flushParagraph(); flushList(); flushQuote();
        const depth = Math.max(2, heading[1].length);
        const base = headingSlug(heading[2]) || 'section';
        const count = headingIds.get(base) || 0;
        headingIds.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        output.push(`<h${depth} id="${escapeHTML(id)}">${inline(heading[2])}</h${depth}>`);
        continue;
      }
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      const numbered = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (bullet || numbered) {
        flushParagraph(); flushQuote();
        const target = bullet ? 'ul' : 'ol';
        if (list && list !== target) flushList();
        if (!list) { list = target; output.push(`<${target}>`); }
        output.push(`<li>${inline((bullet || numbered)[1])}</li>`);
        continue;
      }
      const quoted = /^>\s?(.+)$/.exec(line);
      if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
      flushList(); flushQuote(); paragraph.push(line.trim());
    }
    flushParagraph(); flushList(); flushQuote();
    if (fenced) output.push(codeBlock(code, codeLanguage));
    return output.join('');
  }

  /* ---------------- 界面 ---------------- */

  const gate = $('#vaultGate');
  const shell = $('#vaultShell');
  const listHost = $('#vaultList');
  const emptyHint = $('#vaultEmpty');
  const reader = $('#vaultReader');
  const errorBox = $('#vaultError');

  function showGate() {
    gate.hidden = false;
    shell.hidden = true;
    reader.hidden = true;
  }

  function showShell() {
    gate.hidden = true;
    shell.hidden = false;
  }

  function formatDate(value) {
    const [year, month, day] = String(value).split('-');
    return `${year}.${month}.${day}`;
  }

  function matches(note, query) {
    if (!query) return true;
    const haystack = [note.title, note.summary, note.category, (note.tags || []).join(' '), note.content]
      .join('\n').toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
  }

  function renderList() {
    const notes = state.notes.filter(note => matches(note, state.query));
    listHost.innerHTML = '';
    emptyHint.hidden = notes.length > 0;
    for (const note of notes) {
      const card = document.createElement('a');
      card.className = 'vault-item';
      card.href = '#/n/' + encodeURIComponent(note.id);
      const tags = (note.tags || []).map(tag => `<span class="vault-tag">${escapeHTML(tag)}</span>`).join('');
      card.innerHTML = `
        <div class="vault-item-head">
          <span class="vault-date">${escapeHTML(formatDate(note.date))}</span>
          <span class="vault-type">${note.type === 'diary' ? '日记' : escapeHTML(note.category || '笔记')}</span>
        </div>
        <h3>${escapeHTML(note.title)}</h3>
        ${note.summary ? `<p>${escapeHTML(note.summary)}</p>` : ''}
        ${tags ? `<div class="vault-tags">${tags}</div>` : ''}`;
      listHost.appendChild(card);
    }
    $('#vaultMeta').textContent = `${window.VAULT_LOCAL ? 'LOCAL PREVIEW · 明文直读' : 'UNSEALED'} · 共 ${state.notes.length} 篇 · ${state.query ? `筛出 ${notes.length} 篇` : '全部在位'}`;
  }

  function openNote(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) { closeNote(); return; }
    state.current = note;
    $('#readerMeta').textContent = `${formatDate(note.date)} · ${note.type === 'diary' ? 'DIARY' : (note.category || 'NOTE')}`;
    $('#readerTitle').textContent = note.title;
    $('#readerSummary').textContent = note.summary || '';
    $('#readerSummary').hidden = !note.summary;
    $('#readerBody').innerHTML = markdown(note.content);
    reader.hidden = false;
    listHost.hidden = true;
    emptyHint.hidden = true;
    document.title = note.title + ' · 封存室';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeNote() {
    state.current = null;
    reader.hidden = true;
    listHost.hidden = false;
    document.title = '封存室 · Isaac’s life';
  }

  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    if (hash.startsWith('n/')) openNote(hash.slice(2));
    else closeNote();
  }

  function applyPayload(payload) {
    state.notes = (payload.notes || []).slice();
    showShell();
    renderList();
    route();
  }

  async function unlockWithKey(keyBytes) {
    try {
      const payload = await decrypt(keyBytes, window.VAULT_DATA);
      state.password = null;
      applyPayload(payload);
      return true;
    } catch {
      forgetKey();
      return false;
    }
  }

  async function unlockWithPassword(password) {
    const blob = window.VAULT_DATA;
    const keyBytes = await deriveKeyBytes(password, blob);
    const ok = await unlockWithKey(keyBytes);
    if (ok && $('#vaultRemember').checked) rememberKey(keyBytes, blob);
    return ok;
  }

  function lock() {
    state.notes = [];
    state.query = '';
    state.current = null;
    forgetKey();
    listHost.innerHTML = '';
    listHost.hidden = false;
    $('#vaultSearch').value = '';
    $('#vaultPass').value = '';
    errorBox.textContent = '';
    showGate();
    document.title = '封存室 · Isaac’s life';
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  function boot() {
    const toggle = $('#themeToggle');
    try {
      if (localStorage.getItem('muse-theme') === 'light') document.body.classList.add('light');
      if (toggle) toggle.textContent = document.body.classList.contains('light') ? '☾' : '☼';
      toggle?.addEventListener('click', () => {
        const light = document.body.classList.toggle('light');
        toggle.textContent = light ? '☾' : '☼';
        localStorage.setItem('muse-theme', light ? 'light' : 'dark');
      });
    } catch { /* 没有 localStorage 也能看 */ }
    const year = $('#footerYear');
    if (year) year.textContent = new Date().getFullYear();

    // 两种模式共用的交互：搜索、返回清单、锁定、地址栏路由。
    const bindCommon = () => {
      $('#vaultSearch').addEventListener('input', event => {
        state.query = event.target.value.trim();
        if (state.current) closeNote();
        renderList();
      });
      $('#vaultLock').addEventListener('click', lock);
      $('#vaultBack').addEventListener('click', () => {
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        closeNote();
      });
      window.addEventListener('hashchange', route);
    };

    // 本机预览：明文由 tools/vault-local.mjs 直接内联，不走加密，也不需要口令。
    if (window.VAULT_LOCAL) {
      bindCommon();
      $('#vaultFlag').hidden = false;
      $('#vaultLock').hidden = true; // 本地没有密文，没什么可锁的
      if (window.VAULT_LOCAL_WARNING) {
        errorBox.textContent = '有笔记没读进来：' + window.VAULT_LOCAL_WARNING;
      }
      applyPayload(window.VAULT_LOCAL);
      document.title = '封存室 · 本地预览';
      return;
    }

    if (!window.VAULT_DATA || !window.VAULT_DATA.ct) {
      showGate();
      errorBox.textContent = '没有找到 vault/data.js —— 先在本地跑一次 node tools/vault-build.mjs。';
      $('#vaultForm').hidden = true;
      return;
    }

    showGate();

    const saved = rememberedKey(window.VAULT_DATA);
    if (saved) {
      unlockWithKey(saved).then(ok => {
        if (!ok) {
          showGate();
          errorBox.textContent = '这台设备记下的密钥已经失效，请输入口令。';
        }
      });
    }

    $('#vaultForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.target.querySelector('button[type="submit"]');
      const password = $('#vaultPass').value;
      if (!password) return;
      errorBox.textContent = '正在解封…';
      button.disabled = true;
      try {
        const ok = await unlockWithPassword(password);
        if (!ok) {
          errorBox.textContent = '口令不对。解封失败——这份档案不是用这个口令封的。';
          $('#vaultPass').select();
        } else {
          errorBox.textContent = '';
          $('#vaultPass').value = '';
        }
      } catch (error) {
        errorBox.textContent = '解封出错：' + (error && error.message ? error.message : String(error));
      } finally {
        button.disabled = false;
      }
    });

    bindCommon();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
