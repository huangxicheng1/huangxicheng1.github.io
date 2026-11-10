/** 封存室与公开站共用的笔记读取逻辑：走 _private/，只在本机用。 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function walkMarkdown(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkMarkdown(full));
    else if (name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out.sort();
}

export function parseNote(file, root) {
  const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const where = relative(root, file);
  if (!raw.startsWith("---\n")) throw new Error(`${where}: 缺少开头的 --- 分隔线`);
  const close = raw.indexOf("\n---\n", 4);
  if (close < 0) throw new Error(`${where}: 缺少结尾的 --- 分隔线`);
  const header = raw.slice(4, close);
  const body = raw.slice(close + 5).trim();
  if (!body) throw new Error(`${where}: 正文是空的`);

  const fields = {};
  for (const line of header.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const cut = line.indexOf(":");
    if (cut < 0) throw new Error(`${where}: front matter 行格式不对 -> ${JSON.stringify(line)}`);
    const key = line.slice(0, cut).trim().toLowerCase();
    if (key in fields) throw new Error(`${where}: 字段重复 -> ${key}`);
    fields[key] = line.slice(cut + 1).trim().replace(/^["']|["']$/g, "");
  }
  for (const key of ["title", "date"]) {
    if (!fields[key]) throw new Error(`${where}: 缺少字段 ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) throw new Error(`${where}: date 必须是 YYYY-MM-DD`);
  const type = (fields.type || "note").toLowerCase();
  if (!["note", "diary"].includes(type)) throw new Error(`${where}: type 只能是 note 或 diary`);
  const visibility = (fields.visibility || "locked").toLowerCase();
  if (!["locked", "vault"].includes(visibility)) throw new Error(`${where}: visibility 只能是 locked（进笔记库）或 vault（只在封存室）`);

  return {
    id: relative(root, file).replace(/\.md$/i, "").split(/[\\/]/).join("/"),
    title: fields.title,
    date: fields.date,
    type,
    category: fields.category || (type === "note" ? "未分类" : "生活"),
    summary: fields.summary || "",
    tags: (fields.tags || "").split(",").map(tag => tag.trim()).filter(Boolean),
    review: fields.review || "",
    visibility,
    content: body
  };
}

export function loadNotes(root) {
  const notes = walkMarkdown(root).map(file => parseNote(file, root));
  notes.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
  return notes;
}
