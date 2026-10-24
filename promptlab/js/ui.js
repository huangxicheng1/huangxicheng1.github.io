// DOM 组件库（零依赖，SPEC 8.3）。
// 注意：本模块顶层不得访问 window/document（SPEC 第 0 节），所有 DOM 操作都在函数内完成。

/** 展平任意嵌套的 children；跳过 null/undefined/布尔值。 */
function flattenChildren(children, out = []) {
  for (const child of children) {
    if (child == null || typeof child === 'boolean') continue;
    if (Array.isArray(child)) flattenChildren(child, out);
    else out.push(child);
  }
  return out;
}

/**
 * 创建 DOM 元素。
 * @param {string} tag 标签名
 * @param {object} [attrs] 属性对象：
 *   - class（或 className）：字符串类名
 *   - style：样式对象（如 { marginTop: '8px' }），逐项赋给 el.style
 *   - dataset：data-* 属性对象（如 { id: 'p-001' } → data-id="p-001"）
 *   - on* ：事件监听（如 onclick / oninput → addEventListener）
 *   - 其余键：优先按 DOM 属性赋值，失败或不存在时回退 setAttribute
 * @param {...(string|number|Node|Array)} children 字符串/数字→文本节点；Node→直接挂载；数组→递归展平
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === 'class' || key === 'className') {
        el.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset') {
        Object.assign(el.dataset, value);
      } else if (key.startsWith('on') && key.length > 2 && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        try {
          if (key in el && typeof el[key] !== 'function') el[key] = value;
          else el.setAttribute(key, value);
        } catch (e) {
          el.setAttribute(key, value); // 只读属性等异常场景回退为特性设置
        }
      }
    }
  }
  for (const child of flattenChildren(children)) {
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else {
      el.appendChild(child);
    }
  }
  // select 的 value 需要在选项挂载完成后设置才能选中生效
  if (tag === 'select' && attrs && attrs.value != null) {
    el.value = String(attrs.value);
  }
  return el;
}

// —— Toast（右上角浮层） ——

let toastContainer = null;

/**
 * 右上角浮层提示，3 秒后自动消失（点击可提前关闭）。
 * @param {string} message 文案（纯文本展示，不做 HTML 解析）
 * @param {'info'|'success'|'error'} [type='info'] 提示类型（影响左侧色条）
 * @returns {HTMLElement} toast 元素
 */
export function toast(message, type = 'info') {
  if (!toastContainer || !toastContainer.isConnected) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const el = h('div', { class: `toast toast-${type || 'info'}`, role: 'status' }, String(message ?? ''));
  toastContainer.appendChild(el);
  let timer = 0;
  const dismiss = () => {
    if (!el.isConnected) return;
    clearTimeout(timer);
    el.classList.add('toast-out'); // 淡出后再移除
    setTimeout(() => el.remove(), 200);
  };
  timer = setTimeout(dismiss, 3000);
  el.addEventListener('click', dismiss);
  return el;
}

// —— Modal / Confirm ——

/**
 * 渲染模态框底部的一个动作按钮。动作可以是：
 *  - Node：直接作为按钮挂载（调用方完全自定义）；
 *  - 对象：{ label|text, primary?, danger?, ghost?, class|className?, type?, onclick(close)? }。
 *    onclick 返回 false 或抛出异常时保持模态框不关闭；否则在回调完成后自动关闭。
 */
function renderModalAction(action, close) {
  if (action instanceof Node) return action;
  const cfg = action || {};
  const classes = ['btn'];
  if (cfg.primary) classes.push('btn-primary');
  if (cfg.danger) classes.push('btn-danger');
  if (cfg.ghost) classes.push('btn-ghost');
  const extra = cfg.class || cfg.className || '';
  if (extra) classes.push(extra);
  return h('button', {
    type: cfg.type || 'button',
    class: classes.join(' '),
    onclick: async () => {
      if (!cfg.onclick) {
        close();
        return;
      }
      let keepOpen = false;
      try {
        const r = await cfg.onclick(close);
        keepOpen = r === false;
      } catch (e) {
        keepOpen = true; // 回调抛错（如表单校验失败）时保持打开
      }
      if (!keepOpen) close();
    },
  }, cfg.label ?? cfg.text ?? '确定');
}

/**
 * 打开模态框。
 * @param {object} options
 * @param {string} [options.title] 标题
 * @param {Node|string} [options.content] 内容：Node 直接挂载；字符串按纯文本展示
 * @param {Array} [options.actions=[]] 底部动作（见 renderModalAction）
 * @param {() => void} [options.onClosed] 任意方式关闭后的回调（仅触发一次）
 * @returns {{ close(): void }}
 */
export function openModal({ title, content, actions = [], onClosed } = {}) {
  let closed = false;

  const closeBtn = h('button', { class: 'modal-close', type: 'button', 'aria-label': '关闭' }, '✕');

  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-header' },
      h('div', { class: 'modal-title' }, title == null ? '' : String(title)),
      closeBtn),
    h('div', { class: 'modal-body' }, content instanceof Node ? content : String(content ?? '')),
    h('div', { class: 'modal-footer' },
      (Array.isArray(actions) ? actions : []).map((action) => renderModalAction(action, close))),
  );
  const overlay = h('div', { class: 'modal-overlay' }, box);

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    document.body.classList.remove('modal-open');
    if (typeof onClosed === 'function') onClosed();
  }

  /** Esc 关闭。 */
  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  closeBtn.addEventListener('click', close);
  // 仅点击遮罩自身（而非冒泡自内容区）时关闭
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  document.body.classList.add('modal-open'); // 打开期间锁定页面滚动
  document.body.appendChild(overlay);
  try {
    closeBtn.focus(); // 初始焦点落在关闭按钮上，Esc 可立即生效
  } catch (e) {
    /* 某些环境不允许聚焦，忽略 */
  }
  return { close };
}

/**
 * 确认对话框（确定 / 取消）。
 * @param {string} message 提示文案
 * @returns {Promise<boolean>} 点击「确定」resolve true；取消/Esc/遮罩关闭 resolve false
 */
export function confirmDialog(message) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title: '确认操作',
      content: h('div', { class: 'confirm-message' }, String(message ?? '')),
      actions: [
        { label: '取消', ghost: true, onclick: () => { result = false; } },
        { label: '确定', primary: true, onclick: () => { result = true; } },
      ],
      onClosed: () => resolve(result),
    });
  });
}

// —— 纯文本/HTML 工具 ——

/**
 * HTML 转义：& < > " ' 五个字符。
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 相对时间描述。
 * 规则：1 分钟内 → '刚刚'；1 小时内 → 'N 分钟前'；24 小时内 → 'N 小时前'；
 *       7 天内 → 'N 天前'；更早（或未来超过 1 天）→ 日期 'YYYY-MM-DD'。
 * @param {string} iso ISO 8601 时间字符串
 * @returns {string}
 */
export function timeAgo(iso) {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return '刚刚'; // 未来时间也按「刚刚」处理
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return String(iso).slice(0, 10); // 与 ISO 字符串前缀一致的日期显示
}

/**
 * 极简 Markdown 渲染 → 安全 HTML 字符串（先整体 escapeHtml 再做替换，杜绝注入）。
 * 支持：# ~ ###### 标题、**粗体**、`行内代码`、```代码块```、- / * 无序列表、空行分段、行内换行 <br>。
 * 返回值外层包裹 <div class="md">…</div>，便于 base.css 统一排版。
 * @param {string} text 原始文本
 * @returns {string}
 */
export function renderMarkdown(text) {
  if (text == null) return '<div class="md"></div>';
  let src = escapeHtml(String(text));

  // 1) 先摘出围栏代码块，占位符保护其内容不被行内规则处理
  const blocks = [];
  src = src.replace(/```([\s\S]*?)```/g, (_m, code) => {
    const cleaned = String(code).replace(/^\n/, '').replace(/\n$/, '');
    blocks.push(`<pre class="md-pre"><code>${cleaned}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  // 2) 行内规则（粗体 / 行内代码）
  const inline = (s) => s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

  // 3) 逐行结构化：标题、列表、段落
  const out = [];
  let para = [];
  let listOpen = false;
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listOpen) {
      out.push('</ul>');
      listOpen = false;
    }
  };
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const blockMatch = /^\u0000(\d+)\u0000$/.exec(line.trim());
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    const listMatch = /^[-*]\s+(.*)$/.exec(line);
    if (blockMatch) {
      flushPara();
      closeList();
      out.push(blocks[Number(blockMatch[1])]);
    } else if (headingMatch) {
      flushPara();
      closeList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2].trim())}</h${level}>`);
    } else if (listMatch) {
      flushPara();
      if (!listOpen) {
        out.push('<ul>');
        listOpen = true;
      }
      out.push(`<li>${inline(listMatch[1].trim())}</li>`);
    } else if (line.trim() === '') {
      flushPara();
      closeList();
    } else {
      para.push(line);
    }
  }
  flushPara();
  closeList();

  // 4) 还原代码块占位符（兼容占位符未被单独成行的极端情况）
  let html = `<div class="md">${out.join('')}</div>`;
  html = html.replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[Number(i)] ?? '');
  return html;
}

/**
 * 把行级 diff（[{t:'eq'|'add'|'del', text}]，见 lib/diff.js）渲染为 HTML：
 * add 绿底、del 红底、eq 常规；外层包裹 <div class="diff">。
 * @param {Array<{t:string, text:string}>} diff
 * @returns {string}
 */
export function diffHtml(diff) {
  const rows = (Array.isArray(diff) ? diff : []).map((line) => {
    if (line == null) return '';
    const t = line.t || 'eq';
    const text = line.text == null ? '' : String(line.text);
    const cls = t === 'add' ? 'diff-add' : t === 'del' ? 'diff-del' : 'diff-eq';
    const sign = t === 'add' ? '+' : t === 'del' ? '-' : '·';
    return `<div class="diff-line ${cls}"><span class="diff-sign">${sign}</span><span class="diff-text">${escapeHtml(text) || '&nbsp;'}</span></div>`;
  });
  return `<div class="diff">${rows.join('')}</div>`;
}

/** 侧栏 / 按钮用的图标字符（与 SPEC 8.3 逐字一致）。 */
export const ICONS = {
  library: '🗂️',
  runs: '▶️',
  collections: '📁',
  stats: '📊',
  settings: '⚙️',
  plus: '➕',
  search: '🔍',
  back: '←',
  run: '🚀',
  trash: '🗑️',
  edit: '✏️',
  version: '🕒',
  diff: '🔎',
  export: '📤',
  import: '📥',
  theme: '🌗',
};
