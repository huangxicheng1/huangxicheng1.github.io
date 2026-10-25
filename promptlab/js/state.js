// 响应式状态（观察者模式，零依赖，SPEC 8.4）。
// 注意：本模块顶层不得访问 window/document（SPEC 第 0 节），
// 因此 theme 的 localStorage 读取/写入都放在函数内（getSavedTheme/applyTheme）。

/**
 * 创建一个轻量响应式 store。
 * @param {object} initial 初始状态（浅拷贝保留）
 * @returns {{
 *   get(): object,
 *   set(patch: object): void,          // 浅合并并通知所有订阅者
 *   subscribe(fn: (state: object) => void): () => void  // 返回取消订阅函数
 * }}
 */
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get() {
      return state;
    },
    set(patch) {
      state = { ...state, ...patch }; // 浅合并
      for (const fn of [...listeners]) {
        try {
          fn(state);
        } catch (e) {
          console.error('store 订阅回调执行出错:', e);
        }
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

// 全局单例：跨页面共享的 UI 状态。
// - theme：当前主题（'dark' | 'light'），由 app.js 初始化；任何模块 store.set({ theme }) 即可切换，
//   app.js 的订阅会同步 html[data-theme] 与 localStorage（设置页主题切换即走此通道）。
// - prompts：提示词库页的列表缓存（页面模块自行读写）。
// - filters：提示词库页的筛选状态（q / tag / collectionId）。
export const store = createStore({
  theme: null,
  prompts: null,
  filters: { q: '', tag: null, collectionId: null },
});

/**
 * 读取持久化主题（localStorage 键 'plm-theme'），缺失/非法时回退默认 'dark'。
 * 在函数内访问 localStorage，保证本模块可被 Node 做 import 链接检查。
 * @returns {'dark' | 'light'}
 */
/**
 * 读取持久化主题（全站统一键 'muse-theme'，与档案室/事务科共用一份记忆）。
 * 主站约定：'light' = 夜间值班，'dark'/未设 = 纸色；工坊内部值为 'light'=纸色 / 'dark'=夜间，
 * 读取边界做一次翻译。缺失/读取失败时回退默认纸色。
 * @returns {'dark' | 'light'}
 */
export function getSavedTheme() {
  try {
    return localStorage.getItem('muse-theme') === 'light' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}

/**
 * 应用并持久化主题：写入 html[data-theme] 与全站统一键 'muse-theme'（翻译为主站约定值）。
 * @param {string} theme 'dark' | 'light'（其他值一律按 'dark' 处理）
 * @returns {'dark' | 'light'} 规范化后实际应用的主题值
 */
export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  try {
    localStorage.setItem('muse-theme', t === 'dark' ? 'light' : 'dark');
  } catch (e) {
    /* localStorage 不可用时仅本次会话生效，忽略持久化失败 */
  }
  document.documentElement.dataset.theme = t;
  // Chromium 改 dataset 触发属性选择器时，CSS 变量级联传播可能不完整（部分底色残留旧主题值），
  // 强制一轮完整样式失效重算。
  const html = document.documentElement;
  html.classList.add('theme-kick');
  void html.offsetHeight;
  requestAnimationFrame(() => {
    html.classList.remove('theme-kick');
    void html.offsetHeight;
  });
  return t;
}
