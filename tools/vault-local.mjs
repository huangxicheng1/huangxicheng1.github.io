#!/usr/bin/env node
/**
 * 封存室 · 本地预览
 * ---------------------------------------------------------------------------
 * 只在本机跑：直接读 _private/ 里的明文笔记，不做加密、不要口令、不提交。
 * 改完 .md 刷新浏览器就行，不用跑构建。
 *
 * 用法：
 *   node tools/vault-local.mjs             # 默认 http://127.0.0.1:8787/vault/
 *   node tools/vault-local.mjs --port 9000
 *
 * 只监听 127.0.0.1，同一局域网的其他设备也连不上。
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNotes } from "./vault-shared.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE = join(ROOT, "_private");
const PAGE = join(ROOT, "vault", "index.html");

const portFlag = process.argv.indexOf("--port");
const PORT = Number(portFlag > -1 ? process.argv[portFlag + 1] : 0) || 8787;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

function page() {
  let notes = [];
  let warning = "";
  try {
    notes = loadNotes(PRIVATE);
  } catch (error) {
    warning = String(error && error.message ? error.message : error);
  }
  // 明文直接内联进页面：这是本机预览，不做加密，也不需要口令。
  const bridge = `<script>window.VAULT_LOCAL = ${JSON.stringify({ notes })}${
    warning ? `; window.VAULT_LOCAL_WARNING = ${JSON.stringify(warning)}` : ""
  };</script>`;
  return readFileSync(PAGE, "utf8").replace('<script defer src="./data.js"></script>', bridge);
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path === "/vault" || path === "/vault/" || path === "/vault/index.html") {
    const html = page();
    response.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return response.end(html);
  }

  const allowed = /^\/(vault\/(vault-app\.js|vault\.css)|archive\.css|favicon\.svg|logo\.png)$/;
  if (!allowed.test(path)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("404 · 本地预览只提供封存室页面本身");
  }

  const file = join(ROOT, normalize(path).replace(/^([/\\])+/, ""));
  if (!existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  response.end(readFileSync(file));
});

server.listen(PORT, "127.0.0.1", () => {
  const count = (() => { try { return loadNotes(PRIVATE).length; } catch { return 0; } })();
  console.log(`封存室 · 本地预览已启动： http://127.0.0.1:${PORT}/vault/`);
  console.log(`读取目录： ${PRIVATE}（当前 ${count} 篇，明文不上传、不加密）`);
  console.log("改完笔记直接刷新页面，Ctrl+C 结束。");
});
