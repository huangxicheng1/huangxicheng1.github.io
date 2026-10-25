// seed-data.js — 事务科演示数据（以「今天」为锚点动态生成 ±2 周，保证任何时候打开月历都是活的）
// 分组与任务内容为演示用，可在界面里随意增删。

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

let seq = 0;
function t(title, groupId, offsetDays, done) {
  return {
    id: 't-' + String(++seq).padStart(3, '0'),
    title,
    groupId,
    date: offsetDays === null ? null : iso(offsetDays),
    done: !!done,
    createdAt: iso(offsetDays === null ? -3 : offsetDays),
    completedAt: done ? iso(offsetDays === null ? -1 : offsetDays) : null,
  };
}

/** 构建整库种子：过去几天大多已完成，今天与未来是待办。 */
export function buildSeed() {
  const tasks = [
    // —— 过去（基本都做完了） ——
    t('写下本月三个重点', 'g-key', -6, true),
    t('整理书桌与收纳', 'g-life', -6, true),
    t('产品方案讨论', 'g-work', -5, true),
    t('阅读 · 设计心理学', 'g-learn', -5, true),
    t('去游泳 45 分钟', 'g-health', -5, true),
    t('确认周末聚餐', 'g-life', -5, true),
    t('整理用户访谈笔记', 'g-work', -4, true),
    t('课程 · 色彩与构图', 'g-learn', -4, true),
    t('新版本评审', 'g-work', -4, false), // 逾期未完成的例子
    t('补充水果与鲜花', 'g-life', -4, true),
    t('公园散步', 'g-health', -3, true),
    t('读书笔记 · 第一期', 'g-learn', -3, true),
    t('给朋友挑生日礼物', 'g-life', -3, true),
    t('周计划与团队同步', 'g-work', -2, true),
    t('晚间拉伸', 'g-health', -2, true),
    t('打磨首页交互', 'g-work', -1, true),
    t('整理旅行愿望清单', 'g-life', -1, true),
    t('练习英语听力 20 分钟', 'g-learn', -1, true),

    // —— 今天 ——
    t('把这周的报销单交掉', 'g-work', 0, false),
    t('给妈妈回电话', 'g-life', 0, false),
    t('月度分享会', 'g-key', 0, false),
    t('预约周末展览', 'g-life', 0, false),
    t('阅读 · 留白的力量', 'g-learn', 0, true),
    t('慢跑 3 公里', 'g-health', 0, false),

    // —— 未来 ——
    t('设计系统颜色整理', 'g-work', 1, false),
    t('写一页学习笔记', 'g-learn', 1, false),
    t('阳台植物浇水', 'g-life', 1, false),
    t('晚间瑜伽', 'g-health', 1, false),
    t('朋友的生日', 'g-key', 2, false),
    t('可用性测试复盘', 'g-work', 2, false),
    t('整理订阅与账单', 'g-life', 2, false),
    t('读完《设计中的设计》第三章', 'g-learn', 2, false),
    t('项目阶段交付', 'g-work', 3, false),
    t('骑行 · 河边路线', 'g-health', 3, false),
    t('备份资料与文件', 'g-life', 3, false),
    t('周进度回顾', 'g-work', 4, false),
    t('和朋友看电影', 'g-life', 4, false),
    t('练习英语听力 30 分钟', 'g-learn', 4, false),
    t('周末徒步', 'g-health', 5, false),
    t('逛周末市集', 'g-life', 5, false),
    t('整理本周灵感', 'g-work', 6, false),
    t('阅读 · 做好一件事', 'g-learn', 6, false),
    t('确认交付细节', 'g-work', 7, false),
    t('预约牙齿检查', 'g-health', 8, false),
    t('交周报', 'g-work', 9, false),
    t('作品集内容更新', 'g-learn', 9, false),
    t('月末复盘', 'g-key', 10, false),
    t('整理桌面文件', 'g-life', 10, false),
    t('为下个月做准备', 'g-work', 11, false),

    // —— 收件箱（未排期） ——
    t('想买一台便携显示器', 'g-life', null, false),
    t('收藏的论文还没读', 'g-learn', null, false),
    t('给工位添一盏小灯', 'g-life', null, false),
  ];

  return {
    meta: { version: 1, createdAt: new Date().toISOString() },
    groups: structuredClone(GROUPS),
    tasks,
  };
}
