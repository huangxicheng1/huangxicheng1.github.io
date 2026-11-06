/* ============================================================================
 * 阅读页目录（toc.js）
 * ----------------------------------------------------------------------------
 * 从 app.js 渲染好的 #articleBody 里读 h2 / h3，生成：
 *   1) 宽屏左侧固定索引栏（当前章节高亮 + 阅读进度 + 栏内自动滚动）
 *   2) 窄屏正文顶部的可折叠目录
 * 两者共用同一份数据，切换宽度时不需要重新生成。
 *
 * 依赖：仅依赖 app.js 已经给标题写好的 id（app.js 的 markdown() 会生成）。
 * 页面没有标题、或只有一两个标题时，整套目录不渲染。
 * ========================================================================== */

(function () {
  'use strict';

  if (document.body.dataset.page !== 'entry') return;

  const articleBody = document.getElementById('articleBody');
  if (!articleBody) return;

  const MIN_SECTIONS = 3;
  const OFFSET = 140;          // 判定「当前章节」的视口参考线
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* 只取有 id 的标题，跳过渲染失败的空标题 */
  const heads = Array.prototype.filter.call(
    articleBody.querySelectorAll('h2, h3'),
    node => node.id && node.textContent.trim()
  );
  if (heads.length < MIN_SECTIONS) return;

  /* ------------------------------------------------------------ 结构 */

  function makeList() {
    const list = document.createElement('ol');
    list.className = 'toc-list';

    heads.forEach(heading => {
      const item = document.createElement('li');
      item.className = heading.tagName === 'H3' ? 'toc-item is-sub' : 'toc-item';

      const link = document.createElement('a');
      link.className = 'toc-link';
      link.href = '#' + heading.id;
      link.dataset.tocId = heading.id;

      const dot = document.createElement('span');
      dot.className = 'toc-dot';
      dot.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'toc-text';
      text.textContent = heading.textContent.trim().replace(/\s+/g, ' ');

      link.append(dot, text);
      item.append(link);
      list.append(item);
    });

    return list;
  }

  function makeBody() {
    const wrap = document.createElement('div');
    wrap.className = 'toc-body';
    wrap.append(makeList());
    return wrap;
  }

  const rail = document.createElement('nav');
  rail.className = 'toc-rail';
  rail.setAttribute('aria-label', '本文目录');

  const head = document.createElement('p');
  head.className = 'toc-head';
  const headMain = document.createElement('span');
  headMain.textContent = '目录';
  const headSub = document.createElement('em');
  headSub.textContent = 'CONTENTS';
  head.append(headMain, headSub);

  const progress = document.createElement('div');
  progress.className = 'toc-progress';
  progress.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('span');
  bar.className = 'toc-bar';
  progress.append(bar);

  const meta = document.createElement('p');
  meta.className = 'toc-meta';
  const count = document.createElement('span');
  count.textContent = heads.length + ' 节';
  const pct = document.createElement('span');
  pct.className = 'toc-pct';
  pct.textContent = '0%';
  meta.append(count, pct);

  rail.append(head, progress, meta, makeBody());
  document.body.append(rail);

  const inline = document.createElement('details');
  inline.className = 'toc-inline';

  const summary = document.createElement('summary');
  const sumMain = document.createElement('span');
  sumMain.textContent = '本文目录';
  const sumSub = document.createElement('em');
  sumSub.textContent = heads.length + ' 节 · CONTENTS';
  summary.append(sumMain, sumSub);
  inline.append(summary, makeBody());

  const panel = document.querySelector('.reader-panel');
  if (panel) {
    const before = panel.querySelector('.reader-rule');
    panel.insertBefore(inline, before && before.parentNode === panel ? before : null);
  }

  /* 标题少的短笔记，默认展开反而更顺手 */
  inline.open = heads.length <= 8;

  /* 开屏动画结束后再淡入（iframe / 后台标签页里 rAF 可能迟迟不跑，补个兜底） */
  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    rail.classList.add('is-ready');
  }
  requestAnimationFrame(reveal);
  setTimeout(reveal, 900);

  /* ------------------------------------------------------------ 版式：索引栏 or 折叠目录 */

  /* 左边距够不够站一个索引栏，只有实测正文才知道：
     批注走廊打开时 .wrap 会变宽到 1320，正文整体左右挪，按 50% - Npx 写死
     的位置就会算歪（1700–1839 那段原来是「索引栏被藏、折叠目录又没启用」）。 */
  const RAIL_BOX = 208;        // 索引栏整体宽（border-box，已含内边距，与 toc.css 一致）
  const GUTTER = 28;           // 索引栏与正文之间留的空档
  const MIN_LEFT = 10;         // 索引栏左边至少留这么多，再挤就换折叠目录

  /* 索引栏起笔位置：和文章主标题对齐，往下滚就贴到视口顶部（留 30px） */
  const MIN_TOP = 30;
  const titleEl = document.getElementById('articleTitle');
  const anchorY = titleEl ? titleEl.getBoundingClientRect().top + window.scrollY : 0;
  let railTop = NaN;
  let mode = '';

  function decideMode() {
    const box = panel ? panel.getBoundingClientRect() : null;
    const left = box ? box.left - RAIL_BOX - GUTTER : -1;
    const next = left >= MIN_LEFT ? 'rail' : 'inline';

    if (next !== mode) {
      mode = next;
      document.body.dataset.toc = mode;
    }
    if (mode === 'rail') rail.style.left = Math.round(left) + 'px';
  }

  function placeRail() {
    if (mode !== 'rail' || !anchorY) return;

    const top = Math.max(MIN_TOP, Math.round(anchorY - window.scrollY));
    if (top === railTop) return;
    railTop = top;
    rail.style.top = top + 'px';
    rail.style.maxHeight = Math.max(200, window.innerHeight - top - 36) + 'px';
  }

  let activeId = '';
  let frame = 0;

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;

    /* 索引栏和窄屏折叠目录共用同一份状态，两边一起标 */
    const links = document.querySelectorAll('.toc-link');
    for (let i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-active', links[i].dataset.tocId === id);
    }

    /* 让高亮项留在索引栏可视范围内（不打扰页面滚动） */
    const target = rail.querySelector('.toc-link.is-active');
    if (!target) return;
    const box = rail.querySelector('.toc-body');
    if (!box || box.scrollHeight <= box.clientHeight + 2) return;

    const boxRect = box.getBoundingClientRect();
    const linkRect = target.getBoundingClientRect();
    if (linkRect.top < boxRect.top + 4) {
      box.scrollTop -= boxRect.top + 8 - linkRect.top;
    } else if (linkRect.bottom > boxRect.bottom - 4) {
      box.scrollTop += linkRect.bottom - boxRect.bottom + 8;
    }
  }

  function measure() {
    frame = 0;

    decideMode();
    placeRail();

    const y = window.scrollY;
    const reference = y + OFFSET;

    /* 取最后一个已经越过参考线的标题 */
    let current = heads[0].id;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top + y <= reference) current = heads[i].id;
      else break;
    }
    /* 已经滑到底部时，收尾到最后一节 */
    if (y + window.innerHeight >= document.documentElement.scrollHeight - 4) {
      current = heads[heads.length - 1].id;
    }
    setActive(current);

    const span = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = span > 0 ? Math.min(1, Math.max(0, y / span)) : 0;
    bar.style.width = (ratio * 100).toFixed(1) + '%';
    pct.textContent = Math.round(ratio * 100) + '%';
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  /* 字体、首屏内容都安定下来之后重量一次，免得 left 停在「还没有滚动条 /
     字体还没换过来」那一刻的旧值上 */
  window.addEventListener('load', schedule);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(schedule).catch(function () {});
  }

  /* 批注走廊（annotate.js）会在批注加载完、或窗口变宽变窄时给 body 挂 / 摘
     .an-wide，正文会跟着变宽、左右挪，这里盯一下 body 的 class 重新量一次。
     只监听 class，不会和上面自己写的 data-toc 打架。 */
  if (window.MutationObserver) {
    new MutationObserver(schedule).observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /* ------------------------------------------------------------ 点击跳转 */

  function jump(event) {
    const link = event.target.closest('.toc-link');
    if (!link) return;
    event.preventDefault();

    const heading = document.getElementById(link.dataset.tocId);
    if (!heading) return;

    heading.scrollIntoView({
      behavior: REDUCED.matches ? 'auto' : 'smooth',
      block: 'start'
    });

    if (history.replaceState) {
      history.replaceState(null, '', '#' + link.dataset.tocId);
    }
    setActive(link.dataset.tocId);
  }

  rail.addEventListener('click', jump);
  inline.addEventListener('click', jump);

  /* 带 #锚点 的网址（分享出去或刷新回来）直接落到对应章节：
     正文是脚本注入的，浏览器解析时的自动跳锚点会落空，这里补一次。 */
  let startHash = '';
  try { startHash = decodeURIComponent(location.hash.slice(1)); } catch { startHash = ''; }
  if (startHash) {
    const target = document.getElementById(startHash);
    if (target && articleBody.contains(target)) {
      requestAnimationFrame(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }));
    }
  }

  measure();
})();
