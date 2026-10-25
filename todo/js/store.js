// store.js — 事务科本地数据层（localStorage 键 'todo-db-v1'，首次访问载入演示种子）
import { buildSeed, GROUPS } from './seed-data.js?v=5';

const KEY = 'todo-db-v1';

function readDb() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const db = JSON.parse(raw);
    if (!db || !Array.isArray(db.tasks) || !Array.isArray(db.groups)) return null;
    return db;
  } catch (e) {
    return null;
  }
}

const listeners = new Set();

function saveDb(d, { touch = true } = {}) {
  if (touch) d.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(d));
  for (const fn of [...listeners]) {
    try { fn(); } catch (e) { /* 监听器异常不影响存储 */ }
  }
}

/** 订阅数据变更（云同步用）：任何写入（增删改/采纳远端）后触发。 */
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 用远端数据整体替换本地（保留远端的 meta.updatedAt，作为下次比较的基准）。 */
export function replaceDb(newDb) {
  if (!newDb || !Array.isArray(newDb.tasks) || !Array.isArray(newDb.groups)) return false;
  db = structuredClone(newDb);
  saveDb(db, { touch: false });
  return true;
}

let db = readDb();
if (!db) {
  db = buildSeed();
  saveDb(db);
}

export function getDb() {
  return db;
}

export function getGroups() {
  // 收件箱不是一个分组，而是「未排期」的任务；界面上单独呈现
  return db.groups;
}

export function groupById(id) {
  return db.groups.find((g) => g.id === id) || null;
}

export function addTask({ title, groupId, date }) {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const task = {
    id: 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    title: clean,
    groupId: groupId && groupById(groupId) ? groupId : null,
    date: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    done: false,
    createdAt: new Date().toISOString().slice(0, 10),
    completedAt: null,
  };
  db.tasks.push(task);
  saveDb(db);
  return task;
}

export function toggleTask(id) {
  const task = db.tasks.find((x) => x.id === id);
  if (!task) return null;
  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
  saveDb(db);
  return task;
}

export function deleteTask(id) {
  const before = db.tasks.length;
  db.tasks = db.tasks.filter((x) => x.id !== id);
  saveDb(db);
  return db.tasks.length < before;
}

/** 任务是否属于某个分组筛选（groupId 为 null 表示「全部」） */
export function tasksByGroup(groupId) {
  return groupId == null ? db.tasks : db.tasks.filter((x) => x.groupId === groupId);
}

/** 某天的任务（先未完成后已完成，组内按创建序） */
export function tasksOnDate(dateIso, groupId) {
  return db.tasks
    .filter((x) => x.date === dateIso && (groupId == null || x.groupId === groupId))
    .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
}

/** 逾期未完成（有日期且早于今天且未完成） */
export function overdueTasks(todayIso, groupId) {
  return db.tasks.filter(
    (x) => !x.done && x.date && x.date < todayIso && (groupId == null || x.groupId === groupId),
  );
}

/** 未排期（收件箱） */
export function inboxTasks(groupId) {
  return db.tasks.filter((x) => x.date == null && (groupId == null || x.groupId === groupId));
}

/** 各分组任务计数（只统计未完成） */
export function groupCounts() {
  const map = new Map();
  for (const g of db.groups) map.set(g.id, 0);
  let inbox = 0;
  for (const x of db.tasks) {
    if (x.done) continue;
    if (x.groupId && map.has(x.groupId)) map.set(x.groupId, map.get(x.groupId) + 1);
  }
  inbox = db.tasks.filter((x) => !x.done && (x.groupId == null || !map.has(x.groupId))).length;
  return { groups: map, inbox };
}

/** 今日进度：{done, total, percent} */
export function todayProgress(todayIso) {
  const list = db.tasks.filter((x) => x.date === todayIso);
  const done = list.filter((x) => x.done).length;
  return { done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
}

/** 未完成总数 */
export function openCount() {
  return db.tasks.filter((x) => !x.done).length;
}
