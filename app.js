(() => {
  'use strict';

  const entries = Array.isArray(window.SITE_ENTRIES)
    ? window.SITE_ENTRIES.filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
        .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    : [];
  const byDay = new Map();
  for (const entry of entries) {
    if (!byDay.has(entry.date)) byDay.set(entry.date, []);
    byDay.get(entry.date).push(entry);
  }
  const today = new Date();
  const todayKey = keyOf(today);
  const page = document.body.dataset.page;
  const $ = selector => document.querySelector(selector);
  const kindName = entry => entry.type === 'diary' ? '生活记录' : '学习笔记';
  const notes = entries.filter(entry => entry.type === 'note');
  const due = notes.filter(entry => entry.review && entry.review <= todayKey)
    .sort((a, b) => a.review.localeCompare(b.review));
  const state = {year: today.getFullYear(), month: today.getMonth(), selected: todayKey, heatYear: today.getFullYear(), noteView: 'all', category: '', query: ''};

  function keyOf(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function dateOf(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  function validDate(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(key || '') && keyOf(dateOf(key)) === key;
  }
  function fmt(key) {
    return new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'long', day:'numeric'}).format(dateOf(key));
  }
  function itemsOn(key) { return byDay.get(key) || []; }
  function entryUrl(entry) { return `./entry.html?id=${encodeURIComponent(entry.id)}`; }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function getSetting(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function saveSetting(key, value) { try { localStorage.setItem(key, value); } catch { /* Site still works without local storage. */ } }

  function initShared() {
    const toggle = $('#themeToggle');
    if (getSetting('muse-theme') === 'light') document.body.classList.add('light');
    toggle.textContent = document.body.classList.contains('light') ? '☾' : '☼';
    toggle.addEventListener('click', () => {
      const light = document.body.classList.toggle('light');
      toggle.textContent = light ? '☾' : '☼';
      saveSetting('muse-theme', light ? 'light' : 'dark');
    });
    $('#footerYear').textContent = today.getFullYear();
  }

  function renderMonth() {
    const grid = $('#calendarGrid');
    if (!grid) return;
    const {year, month} = state;
    $('#monthTitle').textContent = `${year} 年 ${String(month + 1).padStart(2, '0')} 月`;
    grid.replaceChildren();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Math.ceil((offset + days) / 7) * 7;
    for (let index = 0; index < cells; index++) {
      const day = index - offset + 1;
      if (day < 1 || day > days) {
        const blank = el('div', 'calendar-blank');
        blank.setAttribute('aria-hidden', 'true');
        grid.append(blank);
        continue;
      }
      const key = keyOf(new Date(year, month, day, 12));
      const items = itemsOn(key);
      const cell = el('div', 'calendar-day');
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${fmt(key)}，${items.length ? `${items.length} 篇记录` : '无记录'}`);
      cell.setAttribute('aria-selected', String(key === state.selected));
      if (key === todayKey) cell.classList.add('today');
      if (key === state.selected) cell.classList.add('selected');
      if (items.length) cell.classList.add('has-entry');
      cell.append(el('span', 'day-number', String(day)));
      if (items.length) {
        const links = el('div', 'day-entry-list');
        for (const item of items) {
          const link = el('a', `day-entry ${item.type === 'note' ? 'note' : 'diary'}`, item.title);
          link.href = entryUrl(item);
          link.title = item.title;
          link.setAttribute('aria-label', `${kindName(item)}：${item.title}`);
          links.append(link);
        }
        cell.append(links);
      }
      grid.append(cell);
    }
  }
  function changeMonth(offset) {
    const d = new Date(state.year, state.month + offset, 1, 12);
    state.year = d.getFullYear(); state.month = d.getMonth();
    const prefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}-`;
    state.selected = entries.find(item => item.date.startsWith(prefix))?.date || keyOf(d);
    renderMonth();
  }
  function initMonth() {
    if (!$('#calendarGrid')) return;
    $('#prevMonth').addEventListener('click', () => changeMonth(-1));
    $('#nextMonth').addEventListener('click', () => changeMonth(1));
    $('#goToday')?.addEventListener('click', () => {
      state.year = today.getFullYear(); state.month = today.getMonth(); state.selected = todayKey;
      state.heatYear = state.year; renderMonth(); renderYear();
    });
    renderMonth();
  }

  function renderYear() {
    const grid = $('#heatmapGrid');
    if (!grid) return;
    const year = state.heatYear;
    $('#heatmapYear').textContent = `${year} 年`;
    grid.replaceChildren();
    const months = $('#yearMonths'); months.replaceChildren();
    const start = new Date(year, 0, 1, 12);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(year, 11, 31, 12);
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
    const cursor = new Date(start);
    let count = 0;
    for (let index = 0; cursor <= end; index++, cursor.setDate(cursor.getDate() + 1)) {
      const key = keyOf(cursor);
      const inYear = cursor.getFullYear() === year;
      const items = itemsOn(key);
      const cell = el(inYear ? 'button' : 'span', inYear ? 'heat-cell' : 'heat-blank');
      if (inYear) {
        cell.type = 'button';
        const level = Math.min(items.length, 4);
        cell.classList.add(`level-${level}`);
        if (key > todayKey) cell.classList.add('future');
        cell.setAttribute('aria-label', `${fmt(key)}，${items.length ? `${items.length} 篇记录` : '无记录'}`);
        cell.title = `${fmt(key)} · ${items.length ? `${items.length} 篇记录` : '无记录'}`;
        cell.addEventListener('click', () => {
          if (page === 'home') {
            location.href = `./calendar.html?date=${key}#month-view`;
          } else {
            const chosen = dateOf(key);
            state.year = chosen.getFullYear();
            state.month = chosen.getMonth();
            state.selected = key;
            renderMonth();
            $('#month-view').scrollIntoView({behavior:'smooth', block:'start'});
          }
        });
        if (cursor.getDate() === 1) {
          const label = el('span', '', `${cursor.getMonth() + 1}月`);
          label.style.gridColumn = String(Math.floor(index / 7) + 1);
          months.append(label);
        }
        count += items.length;
      } else cell.setAttribute('aria-hidden', 'true');
      grid.append(cell);
    }
    const weeks = Math.ceil(grid.children.length / 7);
    months.style.setProperty('--weeks', String(weeks));
    $('#yearStats').textContent = `${[...byDay.keys()].filter(key => key.startsWith(`${year}-`)).length} 个有记录的日子 · ${count} 篇记录`;
    renderYearChapters();
  }
  function renderYearChapters() {
    const grid = $('#yearMonthGrid');
    if (!grid) return;
    grid.replaceChildren();
    for (let month = 0; month < 12; month++) {
      const prefix = `${state.heatYear}-${String(month + 1).padStart(2, '0')}-`;
      const monthEntries = entries.filter(item => item.date.startsWith(prefix));
      const days = new Set(monthEntries.map(item => item.date)).size;
      const button = el('button', 'chapter-card'); button.type = 'button';
      button.append(el('span', 'chapter-number', String(month + 1).padStart(2, '0')),
        el('strong', '', `${month + 1} 月`),
        el('small', '', days ? `${days} 天有记录 · ${monthEntries.length} 篇` : '等待新的故事'));
      button.addEventListener('click', () => {
        state.year = state.heatYear; state.month = month;
        state.selected = monthEntries[0]?.date || keyOf(new Date(state.year, month, 1, 12));
        renderMonth();
        $('#month-view').scrollIntoView({behavior:'smooth', block:'start'});
      });
      grid.append(button);
    }
  }
  function initYear() {
    if (!$('#heatmapGrid')) return;
    $('#yearPrev').addEventListener('click', () => { state.heatYear--; renderYear(); });
    $('#yearNext').addEventListener('click', () => { state.heatYear++; renderYear(); });
    renderYear();
  }

  function makeCard(entry) {
    const card = el('a', 'entry-card'); card.href = entryUrl(entry);
    const body = el('div');
    const meta = el('div', 'meta');
    const kind = el('span', entry.type === 'note' ? 'note-kind' : '', kindName(entry));
    meta.append(kind, document.createTextNode(fmt(entry.date)));
    body.append(meta);
    if (entry.type === 'note') body.append(el('div', 'category-line', entry.category || '未分类'));
    body.append(el('h3', '', entry.title), el('p', '', entry.summary || ''));
    const arrow = el('span', 'arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
    card.append(body, arrow);
    return card;
  }
  function renderRecent() {
    const list = $('#recentList');
    if (!list) return;
    list.replaceChildren();
    for (const entry of entries.slice(0, 5)) list.append(makeCard(entry));
    if (!entries.length) list.append(el('p', 'empty-message', '还没有记录。写下一篇 Markdown，让这里亮起来。'));
  }
  function renderDue() {
    const list = $('#dueList');
    if (!list) return;
    list.replaceChildren();
    if (!due.length) { list.append(el('p', 'due-empty', '今天没有到期的笔记。去翻翻日历吧。')); return; }
    for (const entry of due.slice(0, 3)) {
      const link = el('a', 'due-item'); link.href = entryUrl(entry);
      link.append(el('strong', '', entry.title), el('span', '', `计划复习 · ${fmt(entry.review)}`));
      list.append(link);
    }
  }
  function renderQuote() {
    const quotes = [
      '“把平凡的一天留住，\n它就有了自己的光。”',
      '“慢一点也没关系，\n你正在走自己的路。”',
      '“那些很小的进步，\n也值得被好好看见。”',
      '“今天不必完整，\n只要真实地度过。”',
      '“写下来，不是为了记住一切，\n是为了有一天能温柔地回望。”',
      '“生活里的微光，\n常常藏在不经意间。”',
      '“让今天成为今天，\n不必急着把它变成明天。”',
      '“有些答案，会在下一次翻阅时出现。”',
      '“留一点空白，\n给还没发生的好事。”',
      '“值得珍藏的，不止是特别的日子。”',
      '“一页一页，\n都是认真生活的痕迹。”'
    ];
    const now = new Date();
    const pick = key => { let hash = 2166136261; for (const digit of key) hash = Math.imul(hash ^ digit.charCodeAt(0), 16777619); return (hash >>> 0) % quotes.length; };
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const chosen = pick(keyOf(now));
    $('#dailyQuote').textContent = quotes[chosen === pick(keyOf(yesterday)) ? (chosen + 1) % quotes.length : chosen];
  }
  function initDogSprite() {
    const sprite = $('#dogSprite');
    if (!sprite) return;
    const showMissing = () => {
      sprite.hidden = true;
      $('#dogAssetHint').hidden = false;
    };
    sprite.addEventListener('error', showMissing);
    if (sprite.complete && sprite.naturalWidth === 0) showMissing();
  }

  function initNotes() {
    const grid = $('#categoryGrid');
    if (!grid) return;
    const params = new URLSearchParams(location.search);
    const requested = params.get('category');
    const categories = [...new Set(notes.map(item => item.category || '未分类'))];
    if (categories.includes(requested)) { state.noteView = 'category'; state.category = requested; }
    else if (params.get('due') === '1') state.noteView = 'due';
    const choices = [{kind:'all',name:'',label:'全部笔记',symbol:'✦',count:notes.length},
      ...categories.map((name,index) => ({kind:'category',name,label:name,symbol:['⌘','◇','☷','✳','◈'][index % 5],count:notes.filter(item => (item.category || '未分类') === name).length}))];
    function renderCategories() {
      grid.replaceChildren();
      for (const choice of choices) {
        const button = el('button', 'category-card'); button.type = 'button';
        const active = choice.kind === state.noteView && (choice.kind !== 'category' || choice.name === state.category);
        if (active) button.classList.add('active');
        button.setAttribute('aria-pressed', String(active));
        button.append(el('span','category-symbol',choice.symbol));
        const info = el('span'); info.append(el('strong','',choice.label),el('small','',`${choice.count} 篇笔记`));
        button.append(info);
        button.addEventListener('click', () => { state.noteView = choice.kind; state.category = choice.name; renderCategories(); renderLibrary(); });
        grid.append(button);
      }
    }
    function renderLibrary() {
      const list = $('#notesList'); list.replaceChildren();
      const visible = notes.filter(item => (state.noteView === 'all' ||
        (state.noteView === 'due' ? !!item.review && item.review <= todayKey : (item.category || '未分类') === state.category)) &&
        (!state.query || [item.title,item.summary,item.category,...(item.tags || []),item.content].join(' ').toLocaleLowerCase().includes(state.query)));
      $('#libraryHeading').textContent = state.noteView === 'all' ? '全部学习笔记' : state.noteView === 'due' ? '今天待复习' : state.category;
      $('#libraryCount').textContent = `${visible.length} 篇`;
      $('#notesEmpty').hidden = !!visible.length;
      $('#showDue').setAttribute('aria-pressed', String(state.noteView === 'due'));
      $('#showDue').firstChild.textContent = state.noteView === 'due' ? '查看全部笔记 ' : '只看待复习 ';
      for (const item of visible) list.append(makeCard(item));
    }
    $('#noteSearch').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); renderLibrary(); });
    $('#showDue').addEventListener('click', () => { state.noteView = state.noteView === 'due' ? 'all' : 'due'; renderCategories(); renderLibrary(); $('#libraryTitle').scrollIntoView({behavior:'smooth'}); });
    $('#notesDueSummary').textContent = due.length ? `有 ${due.length} 篇笔记到了回看的时候。先试着回答，再翻开原文。` : '今天没有到期的笔记。翻一篇感兴趣的内容也很好。';
    renderCategories(); renderLibrary();
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
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
    const html = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*|\/?>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[\w-]+(?==)/g;
    const java = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@\w+|\b(?:public|private|protected|class|new|return|if|else|try|catch|throw|final|static|void|long|int|boolean|true|false|null|this|extends|implements|import|package)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()/g;
    const lua = /--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:local|if|then|else|elseif|end|return|and|or|not|false|true|nil|function)\b|\b\d+\b|\b[A-Za-z_][\w]*(?=\s*\()/g;
    const sql = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|\b(?:SELECT|UPDATE|SET|WHERE|AND|OR|INSERT|INTO|VALUES|FROM|LIMIT|NOW|INTERVAL|MINUTE|NULL|NOT|INDEX|CREATE|UNIQUE|AS|ORDER|BY)\b|\b\d+\b|\b[A-Za-z_][\w]*(?=\s*\()/gi;
    const lang = String(language).toLowerCase();
    const pattern = /^(js|javascript|ts|typescript|jsx)$/.test(lang) ? js : lang === 'css' ? css : lang === 'html' ? html : lang === 'java' ? java : lang === 'lua' ? lua : lang === 'sql' ? sql : null;
    if (!pattern) return escapeHTML(source);
    let result = '', last = 0, match;
    while ((match = pattern.exec(source)) !== null) {
      result += escapeHTML(source.slice(last, match.index));
      const token = match[0];
      let kind;
      if (token.startsWith('//') || token.startsWith('/*') || token.startsWith('<!--') || token.startsWith('--')) kind = 'comment';
      else if (/^['"`]/.test(token)) kind = 'string';
      else if (/^\d/.test(token) || (lang === 'css' && token.startsWith('#'))) kind = 'number';
      else if (token.startsWith('<') || token === '>' || token === '/>') kind = 'tag';
      else if (/^(?:const|let|var|return|function|async|await|if|else|elseif|then|end|for|of|new|class|export|import|from|try|catch|throw|true|false|null|undefined|public|private|protected|final|static|void|long|int|boolean|this|extends|implements|package|local|and|or|not|nil|SELECT|UPDATE|SET|WHERE|INSERT|INTO|VALUES|FROM|LIMIT|NOW|INTERVAL|MINUTE|NOT|INDEX|CREATE|UNIQUE|AS|ORDER|BY)$/i.test(token)) kind = 'keyword';
      else if (lang === 'css' && /^[.#]/.test(token)) kind = 'selector';
      else if (lang === 'css' || lang === 'html' || token.startsWith('@')) kind = 'property';
      else kind = 'function';
      result += `<span class="tok tok-${kind}">${escapeHTML(token)}</span>`;
      last = pattern.lastIndex;
    }
    return result + escapeHTML(source.slice(last));
  }
  function codeBlock(lines, language) {
    const lang = /^[a-zA-Z0-9+#-]{1,20}$/.test(language) ? language.toLowerCase() : '';
    const labels = {js:'JavaScript',javascript:'JavaScript',ts:'TypeScript',typescript:'TypeScript',css:'CSS',html:'HTML',json:'JSON',java:'Java',lua:'Lua',sql:'SQL'};
    const label = Object.hasOwn(labels, lang) ? labels[lang] : (lang ? lang.toUpperCase() : 'CODE');
    return `<div class="md-code"><div class="md-code-head"><span class="code-dots" aria-hidden="true">● ● ●</span><span>${escapeHTML(label)}</span></div><pre><code>${highlightCode(lines.join('\n'), lang)}</code></pre></div>`;
  }
  function pipeCells(line) {
    const trimmed = line.trim();
    return trimmed.startsWith('|') && trimmed.endsWith('|')
      ? trimmed.slice(1, -1).split('|').map(cell => cell.trim()) : null;
  }
  function markdown(source) {
    const lines = String(source || '').replace(/\r\n/g,'\n').split('\n');
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
      if (bullet || numbered) { flushParagraph(); flushQuote(); const target = bullet ? 'ul' : 'ol'; if (list && list !== target) flushList(); if (!list) { list = target; output.push(`<${target}>`); } output.push(`<li>${inline((bullet || numbered)[1])}</li>`); continue; }
      const quoted = /^>\s?(.+)$/.exec(line);
      if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
      flushList(); flushQuote(); paragraph.push(line.trim());
    }
    flushParagraph(); flushList(); flushQuote();
    if (fenced) output.push(codeBlock(code, codeLanguage));
    return output.join('');
  }
  function initReader() {
    if (page !== 'entry') return;
    const id = new URLSearchParams(location.search).get('id');
    const entry = entries.find(item => item.id === id);
    if (!entry) {
      $('#articleTitle').textContent = '找不到这一页';
      $('#articleSummary').textContent = '这篇记录可能已更名或尚未发布。可以从日历或分类笔记重新寻找。';
      $('#articleBody').textContent = '';
      document.title = '找不到记录 · Isaac’s life';
      return;
    }
    $('#articleKind').textContent = entry.type === 'note' ? `${entry.category || '未分类'} · 学习笔记` : '生活记录 · 写给日子的信';
    $('#articleDate').textContent = fmt(entry.date);
    $('#articleTitle').textContent = entry.title;
    $('#articleSummary').textContent = entry.summary || '';
    $('#articleBody').innerHTML = markdown(entry.content);
    const tags = $('#articleTags'); tags.replaceChildren();
    for (const tag of entry.tags || []) tags.append(el('span','',`# ${tag}`));
    const back = $('#readerBack'); back.replaceChildren();
    const link = el('a','',entry.type === 'note' ? '← 返回分类笔记' : '← 返回日历');
    link.href = entry.type === 'note' ? `./notes.html?category=${encodeURIComponent(entry.category || '未分类')}` : `./calendar.html?date=${entry.date}#month-view`;
    back.append(link);
    document.title = `${entry.title} · Isaac’s life`;
  }

  initShared();
  if (page === 'home') {
    $('#heroDate').textContent = `${today.getMonth() + 1} / ${String(today.getDate()).padStart(2, '0')}`;
    $('#heroWeekday').textContent = `${new Intl.DateTimeFormat('zh-CN', {weekday:'long'}).format(today)} · ${today.getFullYear()} 年`;
    $('#heroEntryHint').textContent = itemsOn(todayKey).length ? `今天有 ${itemsOn(todayKey).length} 篇记录` : '今天，还可以写下一页。';
    renderQuote(); initDogSprite(); renderRecent(); renderDue();
  }
  if (page === 'calendar') {
    const requested = new URLSearchParams(location.search).get('date');
    if (validDate(requested)) {
      state.selected = requested;
      const d = dateOf(requested);
      state.year = d.getFullYear(); state.month = d.getMonth(); state.heatYear = state.year;
    }
  }
  initMonth(); initYear(); initNotes(); initReader();
})();
