// 集合管理页面（hash: #/collections）
// 契约依据：SPEC.md 第 5 节（GET/POST/PUT/DELETE /api/collections）、8.1（页面模块契约）、
// 8.5（复用 base.css 公共类：.grid/.card/.btn/.badge/.empty/.toolbar/.form-row/.label/.input/.textarea）、
// 8.6（collections：集合卡片、新建/编辑 openModal 表单（色板 8 色 + 原生 color input）、删除 confirmDialog）。
// 依赖（[前端·框架与设计系统]模块按契约提供）：../api.js、../ui.js、../router.js
import { api } from '../api.js?v=4';
import { h, toast, openModal, confirmDialog, timeAgo, ICONS } from '../ui.js?v=4';
import { navigate } from '../router.js?v=4';

// 页面私有样式（注入 root）
const PAGE_CSS = `
  .plm-muted { color: var(--muted); }
  .plm-toolbar { justify-content: space-between; }
  .plm-hint { font-size: 12px; margin-bottom: 16px; }
  .plm-collection-card { display: flex; flex-direction: column; gap: 10px; cursor: pointer; transition: border-color 0.15s; }
  .plm-collection-card:hover { border-color: var(--accent); }
  .plm-collection-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .plm-dot { width: 14px; height: 14px; border-radius: 50%; flex: 0 0 auto; }
  .plm-collection-name { flex: 1; min-width: 0; font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plm-collection-desc { color: var(--muted); font-size: 13px; line-height: 1.6; min-height: 21px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .plm-collection-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; }
  .plm-collection-foot .plm-muted { font-size: 12px; }
  .plm-collection-actions { display: flex; gap: 4px; }
  /* 新建/编辑弹窗表单（openModal：content 为 DOM 节点，动作按钮走 actions 渲染到 modal-footer） */
  .plm-form { display: flex; flex-direction: column; gap: 14px; min-width: 320px; }
  .plm-field { gap: 6px; margin-bottom: 0; }
  .plm-field .label { font-size: 13px; }
  .plm-color-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .plm-swatch { width: 26px; height: 26px; border: 2px solid var(--border); border-radius: 8px; cursor: pointer; padding: 0; transition: transform 0.15s, border-color 0.15s; }
  .plm-swatch:hover { border-color: var(--muted); }
  .plm-swatch.selected { border-color: var(--text); transform: scale(1.12); }
  .plm-color-custom { display: flex; align-items: center; gap: 8px; margin-left: auto; }
  .plm-color-custom input[type='color'] { width: 36px; height: 26px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--panel-2); cursor: pointer; }
  .plm-hex { font-size: 12px; font-family: var(--font-mono); }
`;

// 预设色板 8 色（档案室色系：橙为主色；全部为纸色/深色背景上都可辨的中深色）
const PALETTE = ['#ff7500', '#c95f00', '#2e9e63', '#1f5fa8', '#b3502e', '#6b4fa0', '#33658a', '#8a4fb0'];
// 颜色合法性（与后端 /api/collections 的校验一致）
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// 统一空态结构（复用 base.css 的 .empty 系列）
function emptyBlock(icon, title, hint, actionBtn) {
  const kids = [h('div', { class: 'empty-icon' }, icon), h('div', { class: 'empty-title' }, title)];
  if (hint) kids.push(h('div', { class: 'empty-hint' }, hint));
  if (actionBtn) kids.push(actionBtn);
  return h('div', { class: 'empty' }, ...kids);
}

// 页面入口（契约 8.1；页面标题「集合管理」由 app.js 顶栏维护）
export async function render(root, params) {
  document.title = '集合 · PromptLab';
  root.appendChild(h('style', {}, PAGE_CSS));

  const countLabel = h('span', { class: 'plm-muted' }, '');
  const stage = h('div', {}); // 承载加载态 / 空态 / 集合网格

  async function reload() {
    stage.replaceChildren(h('div', { class: 'loading' }, '正在加载集合…'));
    countLabel.textContent = '';
    let items;
    try {
      items = await api.get('/api/collections');
    } catch (err) {
      countLabel.textContent = '加载失败';
      stage.replaceChildren(emptyBlock('⚠️', '集合加载失败', err.message));
      toast(`集合加载失败：${err.message}`, 'error');
      return;
    }
    const list = Array.isArray(items) ? items : [];
    countLabel.textContent = `共 ${list.length} 个集合`;
    if (!list.length) {
      stage.replaceChildren(emptyBlock(
        ICONS.collections,
        '还没有集合',
        '集合用来给提示词分组，例如「写作」「编程」「数据分析」。',
        h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, `${ICONS.plus} 新建第一个集合`)
      ));
      return;
    }
    const grid = h('div', { class: 'grid' });
    for (const c of list) grid.appendChild(buildCard(c));
    stage.replaceChildren(grid);
  }

  function buildCard(c) {
    const card = h('div', { class: 'card plm-collection-card', title: '点击查看该集合下的提示词' },
      h('div', { class: 'plm-collection-head' },
        h('span', { class: 'plm-dot', style: { background: c.color || '#ff7500' }, title: c.color || '' }),
        h('span', { class: 'plm-collection-name' }, c.name || '未命名集合'),
        h('span', { class: 'badge' }, `${c.promptCount != null ? c.promptCount : 0} 个提示词`)
      ),
      h('div', { class: 'plm-collection-desc' }, c.description || '暂无描述'),
      h('div', { class: 'plm-collection-foot' },
        h('span', { class: 'plm-muted' }, c.createdAt ? `创建于 ${timeAgo(c.createdAt)}` : ''),
        h('div', { class: 'plm-collection-actions' },
          h('button', {
            class: 'btn btn-ghost icon-btn',
            title: '编辑集合',
            onclick: (e) => { e.stopPropagation(); openEditor(c); }
          }, ICONS.edit),
          h('button', {
            class: 'btn btn-ghost icon-btn',
            title: '删除集合',
            onclick: (e) => { e.stopPropagation(); removeCollection(c); }
          }, ICONS.trash)
        )
      )
    );
    card.addEventListener('click', () => {
      if (c.id != null) navigate('#/library?collectionId=' + encodeURIComponent(c.id));
    });
    return card;
  }

  // 新建/编辑集合弹窗（existing 为 null 表示新建；按钮走 openModal 的 actions，落到 modal-footer）
  function openEditor(existing) {
    const isEdit = existing != null;
    const initialColor = existing && COLOR_RE.test(existing.color) ? existing.color : PALETTE[0];

    const nameInput = h('input', { class: 'input', type: 'text', placeholder: '集合名称（必填）', maxlength: '50' });
    nameInput.value = existing && existing.name ? existing.name : '';
    const descInput = h('textarea', { class: 'textarea', placeholder: '集合描述（可选）', rows: '3' },
      existing && existing.description ? existing.description : '');

    let currentColor = initialColor;
    const hexLabel = h('span', { class: 'plm-muted plm-hex' }, initialColor);
    const colorInput = h('input', { type: 'color', title: '自定义颜色' });
    colorInput.value = initialColor;

    function selectColor(color) {
      currentColor = color;
      colorInput.value = color;
      hexLabel.textContent = color;
      const cur = String(color).toLowerCase();
      swatchEls.forEach((el, i) => el.classList.toggle('selected', PALETTE[i].toLowerCase() === cur));
    }
    const swatchEls = PALETTE.map((color) => h('button', {
      type: 'button',
      class: 'plm-swatch',
      style: { background: color },
      title: color,
      onclick: () => selectColor(color)
    }));
    colorInput.addEventListener('input', () => selectColor(colorInput.value));
    selectColor(initialColor);

    // 提交：校验失败 / 接口报错时返回 false，弹窗保持打开（ui.js openModal 的 actions 约定）
    async function submit() {
      const name = nameInput.value.trim();
      if (!name) {
        toast('请输入集合名称', 'error');
        nameInput.focus();
        return false;
      }
      if (!COLOR_RE.test(currentColor)) {
        toast('颜色格式不正确，需为 #RRGGBB', 'error');
        return false;
      }
      const payload = { name, color: currentColor, description: descInput.value.trim() };
      try {
        if (isEdit) {
          await api.put('/api/collections/' + encodeURIComponent(existing.id), payload);
          toast('集合已更新', 'success');
        } else {
          await api.post('/api/collections', payload);
          toast('集合已创建', 'success');
        }
      } catch (err) {
        toast(`保存失败：${err.message}`, 'error');
        return false;
      }
      reload(); // 成功后由 openModal 自动关闭弹窗
    }

    const form = h('div', { class: 'plm-form' },
      field('名称', nameInput),
      field('颜色', h('div', { class: 'plm-color-row' },
        ...swatchEls,
        h('div', { class: 'plm-color-custom' }, colorInput, hexLabel)
      )),
      field('描述', descInput)
    );
    openModal({
      title: isEdit ? '编辑集合' : '新建集合',
      content: form,
      actions: [
        { label: '取消', ghost: true },
        { label: isEdit ? '保存修改' : '创建集合', primary: true, onclick: submit }
      ]
    });
    nameInput.focus();
  }

  // 删除集合：需 confirmDialog，并明确提示「提示词将变为未分组」（SPEC 8.6）
  async function removeCollection(c) {
    const confirmed = await confirmDialog(
      `确定删除集合「${c.name || ''}」吗？该集合下的提示词将变为未分组（提示词本身不会被删除）。`
    );
    if (!confirmed) return;
    try {
      await api.del('/api/collections/' + encodeURIComponent(c.id));
      toast(`已删除集合「${c.name || ''}」`, 'success');
      reload();
    } catch (err) {
      toast(`删除失败：${err.message}`, 'error');
    }
  }

  function field(labelText, control) {
    return h('div', { class: 'form-row plm-field' },
      h('label', { class: 'label' }, labelText),
      control
    );
  }

  root.appendChild(h('div', { class: 'toolbar plm-toolbar' },
    countLabel,
    h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, `${ICONS.plus} 新建集合`)
  ));
  root.appendChild(h('div', { class: 'plm-muted plm-hint' },
    '点击集合卡片可查看该集合下的提示词；删除集合不会删除提示词，其中的提示词将变为未分组。'));
  root.appendChild(stage);

  await reload();
}
