/* 门户/游戏库 —— 交互脚本（背景余烬 / 中英切换 / 卡面缩略图 / 导航高亮） */
'use strict';
(function () {

  /* ============ 中英切换（存在 data-i18n 元素时生效） ============ */
  const I18N = {
    en: {
      nav_home: 'HOME', nav_about: 'ABOUT', nav_skills: 'SKILLS', nav_projects: 'PROJECTS',
      nav_contact: 'CONTACT', nav_games: 'GAME LIBRARY', nav_archive: 'ARCHIVE',
    },
  };
  const ZH = {};
  const btn = document.getElementById('langToggle');
  if (btn) {
    let lang = 'zh';
    const nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach((n) => { ZH[n.dataset.i18n] = n.textContent; });
    btn.addEventListener('click', () => {
      lang = lang === 'zh' ? 'en' : 'zh';
      btn.textContent = lang === 'zh' ? 'EN' : '中';
      const dict = lang === 'en' ? I18N.en : ZH;
      nodes.forEach((n) => {
        const v = dict[n.dataset.i18n];
        if (v) n.textContent = v;
      });
    });
  }

  /* ============ 导航锚点高亮（仅处理 # 锚点链接） ============ */
  const secs = ['home', 'about', 'skills', 'projects', 'contact'];
  const navLinks = document.querySelectorAll('.links a');
  window.addEventListener('scroll', () => {
    let cur = 'home';
    for (const id of secs) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < 160) cur = id;
    }
    navLinks.forEach((a) => {
      const h = a.getAttribute('href');
      if (h && h.startsWith('#')) a.classList.toggle('on', h === '#' + cur);
    });
  }, { passive: true });

})();
