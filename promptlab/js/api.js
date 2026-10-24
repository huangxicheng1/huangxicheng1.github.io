// api.js — 静态版本地数据层（GitHub Pages 版 PromptLab）
// 与桌面版 public/js/api.js 接口逐字一致：api.get/post/put/del/streamPost(path, body, onChunk)。
// 区别：不走 HTTP，全部在浏览器内完成；数据持久化在 localStorage（键 'plm-db-v1'），
//       首次访问自动 fetch('./seed.json') 载入种子数据。
// 端点语义与桌面版后端（lib/api/*.js）逐条对齐；错误统一 throw Error(中文消息)。

/* ---------------- 本地存储引擎（对应桌面版 lib/store.js） ---------------- */

const DB_KEY = 'plm-db-v1';

function emptyDb() {
  return {
    meta: { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    settings: {
      llm: {
        mode: 'mock',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 1024,
      },
    },
    collections: [],
    prompts: [],
    runs: [],
  };
}

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.prompts)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeDb(data) {
  data.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

/** 读库（不存在则载入种子；种子也没有则空库）。 */
async function loadDb() {
  const existing = readDb();
  if (existing) return existing;
  try {
    const res = await fetch('./seed.json');
    if (res.ok) {
      const seed = await res.json();
      if (seed && typeof seed === 'object' && Array.isArray(seed.prompts)) {
        writeDb(seed);
        return readDb();
      }
    }
  } catch (e) {
    /* 离线或种子缺失：空库起步 */
  }
  const fresh = emptyDb();
  writeDb(fresh);
  return fresh;
}

/** update(mutator)：深拷贝草稿上修改后整体持久化，返回修改后的库（与桌面版 Store.update 语义一致）。 */
async function update(mutator) {
  const data = await loadDb();
  const draft = structuredClone(data);
  mutator(draft);
  writeDb(draft);
  return draft;
}

const readyPromise = loadDb();

/* ---------------- 工具 ---------------- */

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ---------------- diff（对应 lib/diff.js，逐行移植） ---------------- */

function diffLines(a, b) {
  const la = String(a).split('\n');
  const lb = String(b).split('\n');
  const n = la.length;
  const m = lb.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (la[i] === lb[j]) {
      result.push({ t: 'eq', text: la[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ t: 'del', text: la[i] });
      i++;
    } else {
      result.push({ t: 'add', text: lb[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ t: 'del', text: la[i] });
    i++;
  }
  while (j < m) {
    result.push({ t: 'add', text: lb[j] });
    j++;
  }
  return result;
}

/* ---------------- Mock 引擎 + Live 适配（对应 lib/api/llm.js，逐行移植） ---------------- */

function strHash(input) {
  const s = String(input == null ? '' : input);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INTENT_DEFS = [
  {
    label: '翻译',
    keywords: ['翻译', '译成', '译文', 'translate', '中译英', '英译中', '译为'],
    analyses: [
      '检测到「{kw}」相关要求，判断这是一项翻译任务：需要在忠实原意的基础上完成语言转换，并保持术语、语气与文体一致。',
      '提示词中出现「{kw}」，属于翻译类意图：先理解原文语境，再用目标语言的自然表达重写，避免生硬直译。',
    ],
    frames: [
      ['通读原文，明确主题、体裁与目标读者', '逐句翻译，优先保证信息完整与术语统一', '对文化差异和惯用表达做本地化处理', '最后通读润色，核对语气与原文对齐'],
      ['确认源语言、目标语言与文体（正式或口语）', '完成正文翻译，保持句式自然流畅', '对拿不准的术语给出备选译法', '附上译文与原文的简要对照说明'],
    ],
  },
  {
    label: '代码',
    keywords: ['代码', '编程', '函数', 'bug', '调试', '重构', 'sql', 'python', 'javascript', '算法', '接口', 'api'],
    analyses: [
      '识别到「{kw}」等关键词，判断这是一项编程任务：需要给出可运行的实现，并说明关键设计取舍。',
      '提示词围绕「{kw}」展开，属于代码类需求：先明确输入输出与边界条件，再落地实现与自测。',
    ],
    frames: [
      ['澄清需求：明确输入、输出与边界条件', '给出思路：核心数据结构与处理步骤', '输出完整代码，并附必要注释', '说明复杂度、潜在坑点与自测用例'],
      ['把任务拆解为可执行的小步骤', '编写代码，保持命名与结构清晰', '交代如何运行与验证结果', '提示常见错误与后续改进方向'],
    ],
  },
  {
    label: '数据分析',
    keywords: ['分析', '数据', '统计', '指标', '洞察', '报表', '环比', '趋势', '占比'],
    analyses: [
      '检测到「{kw}」相关内容，判断这是一项数据分析任务：需要从数据中提炼结论，并给出量化依据。',
      '提示词涉及「{kw}」，属于分析类意图：先明确口径，再看结构与变化，最后落到可执行建议。',
    ],
    frames: [
      ['明确分析目标与数据口径', '拆解维度：总量、结构与变化', '给出结论，并为每条结论附量化证据', '提出可执行的后续动作'],
      ['先概览整体情况与异常点', '按维度逐项展开对比分析', '归纳关键发现并按重要性排序', '给出建议与需要补充的数据'],
    ],
  },
  {
    label: '总结',
    keywords: ['总结', '摘要', '归纳', '提炼', '要点', '概括', '周报', '复盘'],
    analyses: [
      '识别到「{kw}」等意图词，判断这是一项总结提炼任务：需要压缩信息并保留关键结论。',
      '提示词围绕「{kw}」展开，属于总结类需求：按重要度取舍内容，输出结构清晰的要点。',
    ],
    frames: [
      ['先给出一句话核心结论', '按重要度列出 3–5 条要点', '标注需要跟进的事项或风险', '保持简洁，剔除重复信息'],
      ['通读材料，圈出关键信息', '分层归纳：结论、依据、细节', '用短句输出，方便快速阅读', '结尾提示尚未覆盖的盲区'],
    ],
  },
  {
    label: '写作',
    keywords: ['写作', '文章', '文案', '撰写', '故事', '标题', '续写', '润色', '开头'],
    analyses: [
      '检测到「{kw}」相关要求，判断这是一项写作任务：需要先定文体与读者，再组织语言与结构。',
      '提示词中出现「{kw}」，属于写作意图：围绕主题搭建结构，再填充有细节感的内容。',
    ],
    frames: [
      ['确定文体、语气与目标读者', '搭建结构：开头、主体、结尾', '填充内容，加入具体细节或例子', '通读润色，删去冗余表达'],
      ['先列提纲，确认逻辑顺序', '逐段展开，保持每段一个重点', '检查用词与语气是否统一', '收尾呼应主题并留出记忆点'],
    ],
  },
  {
    label: '审查',
    keywords: ['审查', '评审', '检查', '批改', '审阅', '反馈', '评估'],
    analyses: [
      '识别到「{kw}」等关键词，判断这是一项评审检查任务：需要给出明确判断与可改进项。',
      '提示词围绕「{kw}」展开，属于审查类需求：按维度逐项检查，并给出分级反馈。',
    ],
    frames: [
      ['明确评审标准与检查维度', '逐项检查并给出通过或待改进的结论', '对每个问题给出具体修改建议', '整体评价并指出优先级最高的一项'],
      ['先总览，判断整体质量', '按正确性、完整性、表达分别细查', '列出问题清单与修改建议', '给出复查通过的判定条件'],
    ],
  },
  {
    label: '头脑风暴',
    keywords: ['头脑风暴', '创意', '点子', '构思', '命名', '起名', '灵感'],
    analyses: [
      '检测到「{kw}」相关内容，判断这是一项创意发散任务：需要在数量与多样性之间取得平衡。',
      '提示词涉及「{kw}」，属于头脑风暴类意图：先发散再多轮收敛，保留可落地的方案。',
    ],
    frames: [
      ['先发散：不限形式列出候选想法', '按维度分组并去掉重复项', '筛选出 3–5 个可行方案', '为每个方案给出一句话理由'],
      ['明确目标与约束条件', '快速产出一批候选方案', '按新颖性与可行性评估', '推荐最优解并说明取舍'],
    ],
  },
  {
    label: '教育辅导',
    keywords: ['面试', '试题', '出题', '讲解', '教学', '课程', '知识点', '学习'],
    analyses: [
      '识别到「{kw}」等关键词，判断这是一项教学辅导任务：需要由浅入深并配合示例讲解。',
      '提示词围绕「{kw}」展开，属于教育类需求：先讲概念，再举例，最后用练习巩固。',
    ],
    frames: [
      ['用一句话讲清核心概念', '给出一个具体例子辅助理解', '列出常见误区与易错点', '附 2–3 道练习题巩固'],
      ['评估当前水平与学习目标', '拆解知识点并安排学习顺序', '逐点讲解，配示例说明', '布置练习并给出检验标准'],
    ],
  },
];

const DEFAULT_INTENT = {
  label: '通用',
  keywords: [],
  analyses: [
    '未命中特定领域关键词，按通用任务处理：先复述目标，再分步给出可直接使用的结果。',
    '这是一个通用型请求：将围绕目标拆解步骤，逐项给出清晰、具体的内容。',
  ],
  frames: [
    ['复述任务目标，确认理解无误', '把任务拆解为可执行的子步骤', '逐项展开，给出具体内容', '收尾自查：完整性与可用性'],
    ['先给出整体结论或方案概览', '再分点展开细节与理由', '标注前提条件与限制', '给出下一步行动建议'],
  ],
};

const NO_VARIABLE_NOTES = [
  '本次运行没有收到任何变量输入，提示词按原文直接执行。',
  '未检测到变量赋值；如需代入具体内容，可在运行前填写变量。',
];

const MOCK_HINTS = [
  '以上内容由本地 Mock 引擎确定性生成，未调用任何真实模型。前往「设置」页配置 OpenAI 兼容接口并切换为 Live 模式，即可获得真实响应。',
  '这是本地 Mock 输出：相同输入总是得到相同结果。想接入真实模型，请到「设置」页填写 baseUrl 与 apiKey，并切换为 Live 模式。',
];

function detectIntent(promptText) {
  const lower = promptText.toLowerCase();
  for (const def of INTENT_DEFS) {
    for (const kw of def.keywords) {
      if (lower.includes(kw.toLowerCase())) return { def, kw };
    }
  }
  return { def: DEFAULT_INTENT, kw: null };
}

async function runMock(finalPrompt, variables) {
  const promptText = String(finalPrompt == null ? '' : finalPrompt);
  const seed = strHash(promptText);
  const { def, kw } = detectIntent(promptText);
  const analysis = def.analyses[seed % def.analyses.length].replaceAll('{kw}', kw == null ? def.label : kw);
  const frame = def.frames[(seed >>> 8) % def.frames.length];
  const varsObj =
    variables != null && typeof variables === 'object' && !Array.isArray(variables) ? variables : {};
  const names = Object.keys(varsObj);
  let context;
  if (names.length === 0) {
    context = NO_VARIABLE_NOTES[(seed >>> 16) % NO_VARIABLE_NOTES.length];
  } else {
    context = names
      .map((name, index) => {
        const raw = varsObj[name];
        const value = raw === undefined || raw === null ? '' : String(raw);
        return `${index + 1}. ${name}：${value === '' ? '（未填写）' : value}`;
      })
      .join('\n');
  }
  const hint = MOCK_HINTS[(seed >>> 4) % MOCK_HINTS.length];
  const response = [
    '【任务解析】',
    analysis,
    '',
    '【变量上下文】',
    context,
    '',
    '【建议输出框架】',
    ...frame.map((point, i) => `${i + 1}. ${point}`),
    '',
    '【Mock 模式提示】',
    hint,
  ].join('\n');
  await sleep(12 + (seed % 24));
  return { response, ok: true, error: null };
}

const LIVE_TIMEOUT_MS = 60000;

function httpStatusHint(status) {
  if (status === 401) return '鉴权失败，请检查 apiKey';
  if (status === 403) return '无权限访问，请检查 apiKey 与账号权限';
  if (status === 404) return '接口路径不存在，请检查 baseUrl';
  if (status === 429) return '请求过于频繁或额度不足';
  if (status >= 500) return '模型服务端错误，请稍后重试';
  return '请求被拒绝，请检查请求参数';
}

async function runLive(settings, finalPrompt) {
  const s = settings != null && typeof settings === 'object' ? settings : {};
  const baseUrl = String(s.baseUrl == null ? '' : s.baseUrl).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return { response: '', ok: false, error: '未配置 baseUrl，请先在设置页填写 OpenAI 兼容接口地址' };
  }
  const url = `${baseUrl}/chat/completions`;
  try {
    new URL(url);
  } catch (e) {
    return { response: '', ok: false, error: 'baseUrl 配置无效，无法构造请求地址' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (s.apiKey) headers.Authorization = `Bearer ${s.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: s.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: String(finalPrompt == null ? '' : finalPrompt) }],
        temperature: typeof s.temperature === 'number' ? s.temperature : 0.7,
        max_tokens: typeof s.maxTokens === 'number' ? s.maxTokens : 1024,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { response: '', ok: false, error: `模型接口返回错误状态 ${res.status}：${httpStatusHint(res.status)}` };
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      return { response: '', ok: false, error: '模型接口响应不是有效的 JSON' };
    }
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const content =
      choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
    if (!content) {
      return { response: '', ok: false, error: '模型接口响应格式异常：未找到生成文本' };
    }
    return { response: content, ok: true, error: null };
  } catch (err) {
    const name = (err && err.name) || '';
    const msg = String((err && err.message) || '');
    if (name === 'AbortError' || name === 'TimeoutError' || /abort|timeout/i.test(msg)) {
      return { response: '', ok: false, error: '请求超时：模型接口 60 秒内未响应' };
    }
    return { response: '', ok: false, error: '网络请求失败：无法连接到模型接口（静态版由浏览器直连，请确认该服务允许跨域 CORS）' };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 端点实现（与 lib/api/*.js 语义逐条对齐） ---------------- */

const VARIABLE_RE = /\{\{\s*([a-zA-Z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*\}\}/g;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}
function copyTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t) => typeof t === 'string');
}
function normalizeCollectionId(v) {
  return typeof v === 'string' && v !== '' ? v : null;
}
function buildLastRunAtMap(runs) {
  const map = new Map();
  for (const run of runs) {
    if (!run || typeof run.promptId !== 'string') continue;
    const at = String(run.createdAt);
    const prev = map.get(run.promptId);
    if (prev === undefined || at > prev) map.set(run.promptId, at);
  }
  return map;
}
function requireObject(body) {
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, '请求体必须是 JSON 对象');
  }
  return body;
}

const handlers = [
  // —— prompts ——
  {
    method: 'GET', pattern: '/api/prompts',
    async run({ query }) {
      const data = await loadDb();
      const { q, tag, collectionId, sort } = query;
      let list = data.prompts;
      if (typeof q === 'string' && q !== '') {
        const needle = q.toLowerCase();
        list = list.filter((p) =>
          String(p.title || '').toLowerCase().includes(needle) ||
          String(p.description || '').toLowerCase().includes(needle) ||
          String(p.body || '').toLowerCase().includes(needle));
      }
      if (typeof tag === 'string' && tag !== '') {
        list = list.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag));
      }
      if (typeof collectionId === 'string' && collectionId !== '') {
        list = collectionId === 'null'
          ? list.filter((p) => p.collectionId == null)
          : list.filter((p) => p.collectionId === collectionId);
      }
      const lastRunAt = buildLastRunAtMap(data.runs);
      const arr = [...list];
      if (sort === 'title') {
        arr.sort((a, b) => String(a.title).toLowerCase() < String(b.title).toLowerCase() ? -1 : String(a.title).toLowerCase() > String(b.title).toLowerCase() ? 1 : 0);
      } else if (sort === 'created') {
        arr.sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
      } else {
        arr.sort((a, b) => (String(a.updatedAt) < String(b.updatedAt) ? 1 : -1));
      }
      const items = arr.map((p) => ({
        id: p.id, title: p.title, description: p.description, body: p.body,
        tags: copyTags(p.tags), collectionId: p.collectionId == null ? null : p.collectionId,
        createdAt: p.createdAt, updatedAt: p.updatedAt, currentVersion: p.currentVersion,
        versionsCount: Array.isArray(p.versions) ? p.versions.length : 0,
        lastRunAt: lastRunAt.get(p.id) ?? null,
      }));
      return { items, total: items.length };
    },
  },
  {
    method: 'POST', pattern: '/api/prompts',
    async run({ body }) {
      const input = requireObject(body);
      if (!isNonEmptyString(input.title) || !isNonEmptyString(input.body)) {
        throw new ApiError(400, 'title 与 body 必填且不能为空');
      }
      const title = input.title;
      const description = typeof input.description === 'string' ? input.description : '';
      const tags = copyTags(input.tags);
      const now = new Date().toISOString();
      const prompt = {
        id: uuid(), title, description, body: input.body, tags,
        collectionId: normalizeCollectionId(input.collectionId),
        createdAt: now, updatedAt: now, currentVersion: 1,
        versions: [{ v: 1, title, description, tags: [...tags], body: input.body, note: '初始版本', savedAt: now }],
      };
      await update((d) => { d.prompts.push(prompt); });
      return prompt;
    },
  },
  {
    method: 'GET', pattern: '/api/prompts/:id',
    async run({ params }) {
      const data = await loadDb();
      const p = data.prompts.find((x) => x.id === params.id);
      if (!p) throw new ApiError(404, '提示词不存在');
      return p;
    },
  },
  {
    method: 'PUT', pattern: '/api/prompts/:id',
    async run({ params, body }) {
      const input = requireObject(body);
      if (input.title !== undefined && !isNonEmptyString(input.title)) throw new ApiError(400, 'title 不能为空');
      if (input.body !== undefined && !isNonEmptyString(input.body)) throw new ApiError(400, 'body 不能为空');
      const id = params.id;
      if (!(await loadDb()).prompts.some((x) => x.id === id)) throw new ApiError(404, '提示词不存在');
      const updated = await update((d) => {
        const p = d.prompts.find((x) => x.id === id);
        const now = new Date().toISOString();
        if (input.title !== undefined) p.title = input.title;
        if (input.description !== undefined) p.description = typeof input.description === 'string' ? input.description : '';
        if (input.tags !== undefined) p.tags = copyTags(input.tags);
        if (input.collectionId !== undefined) p.collectionId = normalizeCollectionId(input.collectionId);
        if (typeof input.body === 'string' && input.body !== p.body) {
          p.body = input.body;
          const nextV = p.versions.length + 1;
          p.versions.push({
            v: nextV, title: p.title, description: p.description, tags: [...p.tags],
            body: p.body, note: typeof input.note === 'string' ? input.note : '', savedAt: now,
          });
          p.currentVersion = nextV;
        }
        p.updatedAt = now;
      });
      return updated.prompts.find((x) => x.id === id);
    },
  },
  {
    method: 'DELETE', pattern: '/api/prompts/:id',
    async run({ params }) {
      const id = params.id;
      if (!(await loadDb()).prompts.some((x) => x.id === id)) throw new ApiError(404, '提示词不存在');
      await update((d) => {
        d.prompts = d.prompts.filter((p) => p.id !== id);
        d.runs = d.runs.filter((r) => r.promptId !== id);
      });
      return { ok: true };
    },
  },
  {
    method: 'GET', pattern: '/api/prompts/:id/versions',
    async run({ params }) {
      const p = (await loadDb()).prompts.find((x) => x.id === params.id);
      if (!p) throw new ApiError(404, '提示词不存在');
      return [...p.versions].sort((a, b) => b.v - a.v).map((ver) => ({
        v: ver.v, savedAt: ver.savedAt, note: ver.note, title: ver.title,
        description: ver.description, tags: copyTags(ver.tags),
      }));
    },
  },
  {
    method: 'GET', pattern: '/api/prompts/:id/diff',
    async run({ params, query }) {
      const p = (await loadDb()).prompts.find((x) => x.id === params.id);
      if (!p) throw new ApiError(404, '提示词不存在');
      const from = Number(query.from);
      const to = Number(query.to);
      const maxV = p.versions.length;
      const ok = (n) => Number.isInteger(n) && n >= 1 && n <= maxV;
      if (!ok(from) || !ok(to)) throw new ApiError(400, 'from/to 必须是有效的版本号');
      const fromVer = p.versions.find((v) => v.v === from);
      const toVer = p.versions.find((v) => v.v === to);
      return { from: { v: from, body: fromVer.body }, to: { v: to, body: toVer.body }, diff: diffLines(fromVer.body, toVer.body) };
    },
  },
  {
    method: 'POST', pattern: '/api/prompts/:id/rollback',
    async run({ params, body }) {
      const input = requireObject(body);
      const id = params.id;
      const p = (await loadDb()).prompts.find((x) => x.id === id);
      if (!p) throw new ApiError(404, '提示词不存在');
      const target = Number(input.version);
      if (!Number.isInteger(target) || target < 1 || target > p.versions.length) {
        throw new ApiError(400, 'version 必须是有效的版本号');
      }
      const updated = await update((d) => {
        const cur = d.prompts.find((x) => x.id === id);
        const src = cur.versions.find((v) => v.v === target);
        const now = new Date().toISOString();
        const nextV = cur.versions.length + 1;
        cur.versions.push({
          v: nextV, title: cur.title, description: cur.description, tags: copyTags(cur.tags),
          body: src.body, note: `回滚自 v${target}`, savedAt: now,
        });
        cur.body = src.body;
        cur.currentVersion = nextV;
        cur.updatedAt = now;
      });
      return updated.prompts.find((x) => x.id === id);
    },
  },

  // —— runs ——
  {
    method: 'POST', pattern: '/api/prompts/:id/run',
    async run({ params, body }) {
      const data = await loadDb();
      const prompt = (data.prompts || []).find((p) => p.id === params.id);
      if (!prompt) throw new ApiError(404, '提示词不存在');
      let variables = {};
      const input = body || {};
      if (input.variables !== undefined) {
        const v = input.variables;
        if (v === null || typeof v !== 'object' || Array.isArray(v)) {
          throw new ApiError(400, 'variables 必须是「变量名 → 值」的对象');
        }
        variables = { ...v };
      }
      const settingsLlm = (data.settings && data.settings.llm) || {};
      const mode = input.mode !== undefined && input.mode !== null ? input.mode : settingsLlm.mode || 'mock';
      if (mode !== 'mock' && mode !== 'live') throw new ApiError(400, 'mode 只能为 mock 或 live');
      const finalPrompt = String(prompt.body == null ? '' : prompt.body).replace(VARIABLE_RE, (_m, name) => {
        const value = variables == null ? undefined : variables[name];
        return value === undefined || value === null ? '' : String(value);
      });
      const startedAt = Date.now();
      const result = mode === 'mock' ? await runMock(finalPrompt, variables) : await runLive(settingsLlm, finalPrompt);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      const ok = !!(result && result.ok);
      const responseText = ok ? String(result.response || '') : '';
      const run = {
        id: uuid(), promptId: prompt.id, promptTitle: prompt.title,
        promptVersion: prompt.currentVersion, variables, finalPrompt, mode, ok,
        error: ok ? null : String((result && result.error) || '未知错误'),
        response: responseText, latencyMs,
        tokensIn: Math.ceil(finalPrompt.length / 2),
        tokensOut: Math.ceil(responseText.length / 2),
        createdAt: new Date().toISOString(),
      };
      await update((d) => { d.runs.unshift(run); });
      return run;
    },
  },
  {
    method: 'GET', pattern: '/api/runs',
    async run({ query }) {
      const data = await loadDb();
      let runs = Array.isArray(data.runs) ? data.runs : [];
      if (query.promptId !== undefined && query.promptId !== '') {
        runs = runs.filter((r) => r.promptId === query.promptId);
      }
      const sorted = [...runs].sort((a, b) => {
        const ac = String(a.createdAt || '');
        const bc = String(b.createdAt || '');
        return ac < bc ? 1 : ac > bc ? -1 : 0;
      });
      let limit = 50;
      if (query.limit !== undefined && query.limit !== '') {
        const n = Number(query.limit);
        if (Number.isFinite(n) && n >= 0) limit = Math.floor(n);
      }
      return { items: sorted.slice(0, limit), total: sorted.length };
    },
  },

  // —— collections ——
  {
    method: 'GET', pattern: '/api/collections',
    async run() {
      const data = await loadDb();
      const counts = new Map();
      for (const p of data.prompts) {
        if (p && p.collectionId != null) counts.set(p.collectionId, (counts.get(p.collectionId) || 0) + 1);
      }
      return [...data.collections]
        .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || String(a.id).localeCompare(String(b.id)))
        .map((c) => ({ ...c, promptCount: counts.get(c.id) || 0 }));
    },
  },
  {
    method: 'POST', pattern: '/api/collections',
    async run({ body }) {
      const input = body || {};
      if (typeof input.name !== 'string' || input.name.trim() === '') throw new ApiError(400, '集合名称不能为空');
      const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
      let color = input.color === undefined ? '#ff7500' : input.color;
      if (typeof color !== 'string' || !COLOR_RE.test(color)) throw new ApiError(400, '颜色格式非法，应为 #RRGGBB');
      const collection = {
        id: uuid(), name: input.name.trim(), color,
        description: typeof input.description === 'string' ? input.description : '',
        createdAt: new Date().toISOString(),
      };
      const saved = await update((d) => { d.collections.push(collection); });
      return saved.collections.find((c) => c.id === collection.id);
    },
  },
  {
    method: 'PUT', pattern: '/api/collections/:id',
    async run({ params, body }) {
      const id = params.id;
      if (!(await loadDb()).collections.some((c) => c.id === id)) throw new ApiError(404, '集合不存在');
      const input = body || {};
      if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim() === '')) {
        throw new ApiError(400, '集合名称不能为空');
      }
      const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
      if (input.color !== undefined && (typeof input.color !== 'string' || !COLOR_RE.test(input.color))) {
        throw new ApiError(400, '颜色格式非法，应为 #RRGGBB');
      }
      const saved = await update((d) => {
        const c = d.collections.find((x) => x.id === id);
        if (input.name !== undefined) c.name = input.name.trim();
        if (input.color !== undefined) c.color = input.color;
        if (input.description !== undefined) c.description = typeof input.description === 'string' ? input.description : '';
      });
      return saved.collections.find((c) => c.id === id);
    },
  },
  {
    method: 'DELETE', pattern: '/api/collections/:id',
    async run({ params }) {
      const id = params.id;
      if (!(await loadDb()).collections.some((c) => c.id === id)) throw new ApiError(404, '集合不存在');
      await update((d) => {
        d.collections = d.collections.filter((c) => c.id !== id);
        for (const p of d.prompts) {
          if (p && p.collectionId === id) p.collectionId = null;
        }
      });
      return { ok: true };
    },
  },

  // —— stats ——
  {
    method: 'GET', pattern: '/api/stats',
    async run() {
      const data = await loadDb();
      const prompts = Array.isArray(data.prompts) ? data.prompts : [];
      const runs = Array.isArray(data.runs) ? data.runs : [];
      const promptCount = prompts.length;
      const versionCount = prompts.reduce((sum, p) => sum + (Array.isArray(p.versions) ? p.versions.length : 0), 0);
      const runCount = runs.length;
      const tagMap = new Map();
      for (const p of prompts) {
        const seen = new Set();
        for (const tag of Array.isArray(p.tags) ? p.tags : []) {
          if (typeof tag !== 'string' || tag === '' || seen.has(tag)) continue;
          seen.add(tag);
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        }
      }
      const tagCounts = [...tagMap.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, 15);
      const recentRuns = [...runs]
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || String(b.id ?? '').localeCompare(String(a.id ?? '')))
        .slice(0, 5);
      const lastRunAtMap = new Map();
      for (const r of runs) {
        if (!r || typeof r !== 'object' || !r.promptId || !r.createdAt) continue;
        const prev = lastRunAtMap.get(r.promptId);
        if (prev === undefined || String(r.createdAt) > String(prev)) lastRunAtMap.set(r.promptId, r.createdAt);
      }
      const recentPrompts = [...prompts]
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) || String(b.id ?? '').localeCompare(String(a.id ?? '')))
        .slice(0, 5)
        .map((p) => ({
          id: p.id, title: p.title, description: p.description ?? '', body: p.body ?? '',
          tags: Array.isArray(p.tags) ? [...p.tags] : [], collectionId: p.collectionId ?? null,
          createdAt: p.createdAt ?? null, updatedAt: p.updatedAt ?? null,
          currentVersion: p.currentVersion ?? (p.versions || []).length,
          versionsCount: (p.versions || []).length, lastRunAt: lastRunAtMap.get(p.id) || null,
        }));
      const now = new Date();
      const days = [];
      const dayIndex = new Map();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
        const full = d.toISOString().slice(0, 10);
        dayIndex.set(full, days.length);
        days.push({ date: full.slice(5, 10), count: 0 });
      }
      for (const r of runs) {
        if (!r || typeof r !== 'object' || !r.createdAt) continue;
        const t = new Date(r.createdAt);
        if (Number.isNaN(t.getTime())) continue;
        const idx = dayIndex.get(t.toISOString().slice(0, 10));
        if (idx !== undefined) days[idx].count++;
      }
      return { promptCount, versionCount, runCount, tagCounts, recentRuns, recentPrompts, runsByDay: days };
    },
  },

  // —— settings ——
  {
    method: 'GET', pattern: '/api/settings',
    async run() {
      const data = await loadDb();
      const llm = { ...{ mode: 'mock', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 1024 }, ...(data.settings && data.settings.llm) || {} };
      const key = typeof llm.apiKey === 'string' ? llm.apiKey : '';
      return { llm: { ...llm, apiKey: key ? '····' + key.slice(-4) : '' } };
    },
  },
  {
    method: 'PUT', pattern: '/api/settings',
    async run({ body }) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.llm !== 'object' || body.llm === null || Array.isArray(body.llm)) {
        throw new ApiError(400, '请求体必须是 { llm: {…} } 形式的 JSON 对象');
      }
      const patch = body.llm;
      const data = await loadDb();
      const current = { ...{ mode: 'mock', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 1024 }, ...(data.settings && data.settings.llm) || {} };
      const next = { ...current };
      if (patch.mode !== undefined) {
        if (patch.mode !== 'mock' && patch.mode !== 'live') throw new ApiError(400, 'mode 只能为 mock 或 live');
        next.mode = patch.mode;
      }
      for (const key of ['baseUrl', 'model']) {
        if (patch[key] !== undefined) next[key] = patch[key] === null ? '' : String(patch[key]);
      }
      if (patch.apiKey !== undefined) {
        if (!(typeof patch.apiKey === 'string' && patch.apiKey.startsWith('····'))) {
          next.apiKey = patch.apiKey === null ? '' : String(patch.apiKey);
        }
      }
      if (patch.temperature !== undefined) {
        const t = Number(patch.temperature);
        if (!Number.isFinite(t)) throw new ApiError(400, 'temperature 必须是数字');
        next.temperature = t;
      }
      if (patch.maxTokens !== undefined) {
        const n = Number(patch.maxTokens);
        if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'maxTokens 必须是非负数字');
        next.maxTokens = Math.floor(n);
      }
      await update((d) => {
        if (!d.settings) d.settings = {};
        d.settings.llm = next;
      });
      const key = typeof next.apiKey === 'string' ? next.apiKey : '';
      return { llm: { ...next, apiKey: key ? '····' + key.slice(-4) : '' } };
    },
  },

  // —— import / export ——
  {
    method: 'GET', pattern: '/api/export',
    async run() {
      return structuredClone(await loadDb());
    },
  },
  {
    method: 'POST', pattern: '/api/import',
    async run({ body }) {
      if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, '请求体必须是 JSON 对象：{data, mode}');
      }
      if (body.mode !== 'merge' && body.mode !== 'replace') throw new ApiError(400, 'mode 必须是 "merge" 或 "replace"');
      const d0 = body.data;
      if (d0 === null || typeof d0 !== 'object' || Array.isArray(d0)) {
        throw new ApiError(400, '导入数据非法：data 必须是整库 JSON 对象（含 collections/prompts/runs）');
      }
      for (const key of ['collections', 'prompts', 'runs']) {
        if (d0[key] !== undefined && !Array.isArray(d0[key])) throw new ApiError(400, `导入数据非法：data.${key} 必须是数组`);
      }
      const inLists = {
        collections: Array.isArray(d0.collections) ? d0.collections : [],
        prompts: Array.isArray(d0.prompts) ? d0.prompts : [],
        runs: Array.isArray(d0.runs) ? d0.runs : [],
      };
      let result;
      if (body.mode === 'replace') {
        await update((d) => {
          d.collections = structuredClone(inLists.collections);
          d.prompts = structuredClone(inLists.prompts);
          d.runs = structuredClone(inLists.runs);
        });
        result = { addedPrompts: inLists.prompts.length, addedCollections: inLists.collections.length, addedRuns: inLists.runs.length };
      } else {
        const added = { addedPrompts: 0, addedCollections: 0, addedRuns: 0 };
        await update((d) => {
          const collectionIds = new Set(d.collections.map((c) => (c && c.id) ?? null));
          for (const c of inLists.collections) {
            if (!c || typeof c !== 'object' || c.id === undefined || collectionIds.has(c.id)) continue;
            collectionIds.add(c.id);
            d.collections.push(structuredClone(c));
            added.addedCollections++;
          }
          const promptIds = new Set(d.prompts.map((p) => (p && p.id) ?? null));
          for (const p of inLists.prompts) {
            if (!p || typeof p !== 'object' || p.id === undefined || promptIds.has(p.id)) continue;
            promptIds.add(p.id);
            d.prompts.push(structuredClone(p));
            added.addedPrompts++;
          }
          for (const r of inLists.runs) {
            if (!r || typeof r !== 'object') continue;
            d.runs.push(structuredClone(r));
            added.addedRuns++;
          }
        });
        result = added;
      }
      return result;
    },
  },
];

/* ---------------- 路由匹配与对外接口 ---------------- */

function matchPattern(pattern, pathname) {
  const ps = pattern.split('/');
  const xs = pathname.split('/');
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) {
      if (!xs[i]) return null;
      params[ps[i].slice(1)] = xs[i];
    } else if (ps[i] !== xs[i]) {
      return null;
    }
  }
  return params;
}

function splitPath(pathWithQuery) {
  const qIndex = pathWithQuery.indexOf('?');
  const pathname = qIndex === -1 ? pathWithQuery : pathWithQuery.slice(0, qIndex);
  const query = {};
  if (qIndex !== -1) {
    for (const part of pathWithQuery.slice(qIndex + 1).split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const k = eq === -1 ? part : part.slice(0, eq);
      const v = eq === -1 ? '' : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
      query[k] = v;
    }
  }
  return { pathname, query };
}

async function dispatch(method, pathWithQuery, body) {
  await readyPromise;
  const { pathname, query } = splitPath(pathWithQuery);
  for (const route of handlers) {
    if (route.method !== method) continue;
    const params = matchPattern(route.pattern, pathname);
    if (!params) continue;
    return route.run({ params, query, body });
  }
  throw new ApiError(404, '接口不存在');
}

const STREAM_CHUNK_SIZE = 16;
const STREAM_CHUNK_DELAY = 15;

async function streamPost(pathWithQuery, body, onChunk) {
  // 静态版：mock 模式在本地按 16 字符/15ms 的节奏模拟 SSE 流；其余情形按普通调用返回。
  const { pathname, query } = splitPath(pathWithQuery);
  const run = await dispatch('POST', pathname, body);
  const wantStream = query.stream === '1' && run && run.mode === 'mock' && typeof onChunk === 'function';
  if (wantStream) {
    const chars = Array.from(String(run.response || ''));
    for (let i = 0; i < chars.length; i += STREAM_CHUNK_SIZE) {
      onChunk(chars.slice(i, i + STREAM_CHUNK_SIZE).join(''));
      await sleep(STREAM_CHUNK_DELAY);
    }
  }
  return run;
}

export const api = {
  get: (path) => dispatch('GET', path),
  post: (path, body) => dispatch('POST', path, body),
  put: (path, body) => dispatch('PUT', path, body),
  del: (path) => dispatch('DELETE', path),
  streamPost,
};

/** 危险操作辅助：清空本地库（设置页「恢复初始种子」等场景用）。 */
export async function resetLocalDb() {
  localStorage.removeItem(DB_KEY);
  await loadDb();
}
