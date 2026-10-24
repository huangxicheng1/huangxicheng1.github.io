// 前端 hash 路由工具（零依赖，SPEC 8.1）。
// 约定：hash 形如 '#/library'、'#/prompt/p-001?from=1&to=2'；空 hash 默认落到 '/library'。
// 注意：本模块顶层不得访问 window/document（SPEC 第 0 节），location 只在函数内读取。

/**
 * 解析当前 location.hash。
 * @returns {{ path: string, parts: string[], query: Record<string, string> }}
 *   path  - 形如 '/library' 或 '/prompt/p-001'（不含查询串，末尾多余 '/' 会被去掉）
 *   parts - path 去掉首部 '/' 后按 '/' 切分的段数组，如 ['prompt', 'p-001']
 *   query - 查询参数对象（重复键取最后一个值）
 */
export function parseHash() {
  let raw = '';
  if (typeof location !== 'undefined' && location.hash) raw = location.hash;
  raw = raw.replace(/^#/, '');
  if (!raw || raw === '/') raw = '/library';

  const qIndex = raw.indexOf('?');
  const pathPart = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : raw.slice(qIndex + 1);

  let path = pathPart || '/library';
  if (!path.startsWith('/')) path = '/' + path; // 容错：'#library' → '/library'
  if (path.length > 1) path = path.replace(/\/+$/, ''); // '/library/' → '/library'

  // 路径段做安全解码（非法百分号序列保持原样）
  const parts = path.split('/').slice(1).map((seg) => {
    try {
      return decodeURIComponent(seg);
    } catch (e) {
      return seg;
    }
  });

  const query = {};
  if (queryPart) {
    for (const [key, value] of new URLSearchParams(queryPart).entries()) {
      query[key] = value; // 后出现的键覆盖先出现的（重复键取最后一个）
    }
  }
  return { path, parts, query };
}

/**
 * 跳转到指定 hash（如 navigate('#/prompt/p-001')），会写入浏览器历史并触发 hashchange。
 * @param {string} hash 形如 '#/prompt/p-001'
 */
export function navigate(hash) {
  if (typeof location === 'undefined') return;
  location.hash = hash;
}
