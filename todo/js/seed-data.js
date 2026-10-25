// seed-data.js — 事务科初始数据
// 首次访问（浏览器无本地数据）时的起步库：只预置分组结构，任务列表为空，
// 从第一行输入开始就是用户自己的内容（此前版本带演示任务，已按用户要求移除）。

/** 今天本地日期的 ISO 串（YYYY-MM-DD） */
export function iso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const GROUPS = [
  { id: 'g-work', name: '工作', color: '#ff7500' },
  { id: 'g-life', name: '生活', color: '#2e9e63' },
  { id: 'g-learn', name: '学习', color: '#1f5fa8' },
  { id: 'g-health', name: '健康', color: '#b3502e' },
  { id: 'g-key', name: '重要事项', color: '#8a4fb0' },
];

/** 构建初始库：预置分组，任务为空。 */
export function buildSeed() {
  return {
    meta: { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    groups: structuredClone(GROUPS),
    tasks: [],
  };
}
