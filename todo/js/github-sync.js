// github-sync.js — 云同步：把事务科数据直接读写到 GitHub 仓库（静态站点的标准做法）
// 模型：
//   远端文件 todo-data/todo.json（不进部署白名单，不在公开页面上，但公开仓库可通过 API 读取）
//   读：匿名即可（公开仓库）；写：需要细粒度 PAT（Contents: Read and write，仅限本仓库）
//   策略：启动时拉取，远端较新则采纳远端；本地每次修改后防抖 4s 推送（单人使用，最后写入优先）
import * as store from './store.js?v=6';

const OWNER = 'huangxicheng1';
const REPO = 'huangxicheng1.github.io';
const BRANCH = 'main';
const PATH = 'todo-data/todo.json';
const API_BASE = 'https://api.github.com';

const TOKEN_KEY = 'td-gh-token';
const LAST_SYNC_KEY = 'td-last-sync';
const REMOTE_AT_KEY = 'td-remote-at';

const PUSH_DEBOUNCE_MS = 4000;

let token = null;
try { token = localStorage.getItem(TOKEN_KEY) || null; } catch (e) { token = null; }

let pushTimer = null;
let pushing = false;
let replacing = false; // 采纳远端时的本地写回不触发再次推送

/** 状态机：local（无令牌）/ ok（已同步）/ syncing（推送中）/ error（⚠） */
let status = { kind: token ? 'ok' : 'local', message: '', at: null };
const statusListeners = new Set();

function setStatus(kind, message) {
  status = { kind, message: message || '', at: new Date() };
  for (const fn of [...statusListeners]) {
    try { fn(status); } catch (e) { /* 界面回调异常不影响同步 */ }
  }
}

export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function getStatus() {
  return status;
}

export function hasToken() {
  return !!token;
}

export function getTokenHint() {
  if (!token) return '';
  return token.slice(0, 4) + '····' + token.slice(-4);
}

export function setToken(value) {
  token = String(value || '').trim() || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* 存储不可用时仅本次会话生效 */ }
  setStatus(token ? 'ok' : 'local', token ? '令牌已保存' : '已清除令牌，回到本地模式');
  if (token) pullOnBoot();
}

/* ---------------- GitHub API ---------------- */

async function gh(path, options = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { ...options, headers });
  return res;
}

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64decode(b64) {
  return decodeURIComponent(escape(atob(String(b64).replaceAll('\n', ''))));
}

/** 拉取远端数据文件。返回 {remote: object|null, sha: string|null} */
async function fetchRemote() {
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}&t=${Date.now()}`);
  if (res.status === 404) return { remote: null, sha: null };
  if (!res.ok) {
    const hint = res.status === 401 ? '令牌无效或已过期' : res.status === 403 ? '令牌权限不足（需要 Contents 读写）' : `GitHub 返回 ${res.status}`;
    throw new Error(hint);
  }
  const data = await res.json();
  let remote = null;
  try { remote = JSON.parse(b64decode(data.content)); } catch (e) {
    throw new Error('远端数据文件不是有效的 JSON');
  }
  if (!remote || !Array.isArray(remote.tasks)) throw new Error('远端数据格式不认识（缺少 tasks）');
  return { remote, sha: data.sha };
}

/** 启动时拉取：远端更新时间晚于本地 → 采纳远端（单人使用策略） */
export async function pullOnBoot() {
  if (!token) return;
  try {
    const { remote } = await fetchRemote();
    if (!remote) {
      setStatus('ok', '云端还没有数据，首次修改后会自动创建');
      schedulePush(800);
      return;
    }
    const local = store.getDb();
    const remoteAt = String(remote.meta && remote.meta.updatedAt || '');
    const localAt = String(local.meta && local.meta.updatedAt || '');
    if (remoteAt > localAt) {
      replacing = true;
      try {
        store.replaceDb(remote);
      } finally {
        replacing = false;
      }
      markSynced('已从云端拉取较新的数据');
    } else {
      markSynced('云端不比本地新，继续使用本地数据');
    }
  } catch (err) {
    setStatus('error', err.message);
  }
}

/** 记住最近一次见到的云端版本时间（推送前核对，防止旧标签页把过期数据写回云端）。 */
function rememberRemoteAt(remote) {
  if (remote && remote.meta && remote.meta.updatedAt) {
    try { localStorage.setItem(REMOTE_AT_KEY, String(remote.meta.updatedAt)); } catch (e) { /* 忽略 */ }
  }
}
function knownRemoteAt() {
  try { return localStorage.getItem(REMOTE_AT_KEY) || ''; } catch (e) { return ''; }
}

/** 推送本地数据到远端（带 409 重试一次）。
 *  防复活保护：推送前核对云端版本——若云端比我上次见到时更新（别的设备/标签页写过），
 *  先采纳云端并放弃本次推送，避免残留旧数据的标签页把过期内容写回云端。 */
export async function push() {
  if (!token || pushing) return;
  pushing = true;
  setStatus('syncing', '正在同步到 GitHub…');
  try {
    const { remote, sha } = await fetchRemote();
    const knownAt = knownRemoteAt();
    if (remote) {
      const remoteAt = String(remote.meta && remote.meta.updatedAt || '');
      if (knownAt && remoteAt > knownAt) {
        // 云端在我上次同步之后被更新过：本地基线已过期，采纳云端、跳过本次推送
        replacing = true;
        try { store.replaceDb(remote); } finally { replacing = false; }
        rememberRemoteAt(remote);
        markSynced('云端有更新，已拉取（本次未推送）');
        return;
      }
    }
    const db = store.getDb();
    const body = {
      message: 'todo-data: 网页端同步',
      content: b64encode(JSON.stringify(db, null, 2)),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;
    const putUrl = '/repos/' + OWNER + '/' + REPO + '/contents/' + PATH;
    let res = await gh(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409 || res.status === 422) {
      const fresh = await fetchRemote();
      if (fresh.sha) body.sha = fresh.sha;
      res = await gh(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    if (res.status === 401 || res.status === 403) {
      setStatus('error', res.status === 401 ? '令牌无效或已过期' : '令牌权限不足（需要 Contents 读写）');
      return;
    }
    if (!res.ok) {
      setStatus('error', '同步失败：GitHub 返回 ' + res.status);
      return;
    }
    rememberRemoteAt({ meta: { updatedAt: db.meta.updatedAt } });
    markSynced('已同步到 GitHub');
  } catch (err) {
    setStatus('error', '网络请求失败：' + (err.message || '无法连接 api.github.com'));
  } finally {
    pushing = false;
  }
}

function markSynced(message) {
  try { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); } catch (e) { /* 忽略 */ }
  setStatus('ok', message);
}

export function lastSyncText() {
  let iso = null;
  try { iso = localStorage.getItem(LAST_SYNC_KEY); } catch (e) { iso = null; }
  if (!iso) return '尚未同步';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚同步';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟前同步';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} 同步`;
}

/** 数据变更 → 防抖推送 */
export function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  if (!token || replacing) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; push(); }, delay);
}

/** 初始化：订阅本地数据变更；有令牌则启动拉取。 */
export function init() {
  store.onChange(() => schedulePush());
  if (token) pullOnBoot();
  // 标签页重新获得焦点时自动核对云端（防止长时间开着的旧标签页推送过期数据）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && token && !pushing) pullOnBoot();
  });
}
