# 划词批注（annotations）

阅读页（`entry.html`）右侧的划线批注层。选中正文任意一句 → 点「＋」→ 写 → 保存，
批注会以 JSON 形式提交进本仓库的 `annotations/`，随 Pages 一起发布，任何人打开都能看见。

## 文件

| 文件 | 作用 |
|---|---|
| `annotate.js` | 定位、渲染、划词、读写 GitHub Contents API |
| `annotate.css` | 高亮、侧栏卡片、抽屉、登录弹层（明暗两套） |
| `annotations/<文章 id>.json` | 每篇文章一个批注文件，路径与 `content/` 对应 |
| `.github/workflows/pages.yml` | 部署白名单里已加入 `annotate.js annotate.css annotations` |

数据长这样：

```json
{
  "version": 1,
  "entry": "notes/java-log-tracing-guide",
  "annotations": [
    {
      "id": "an_k3j9x2",
      "quote": "一次请求的订单号。用户点一下生成，从头到尾只该有一个。",
      "prefix": "**traceId**：",
      "suffix": "",
      "start": 2259,
      "body": "这句是全文的锚点。",
      "author": "huangxicheng1",
      "created": "2026-11-03T04:55:57.922Z"
    }
  ]
}
```

`quote` 是划中的原文，`prefix` / `suffix` 是前后各 28 个字，`start` 是它在正文纯文本里的位置。
渲染时先看 `start` 处的字还对不对，不对就全文找同一句（取离 `start` 最近的），再不对就用前后文兜底，
全都对不上就进「未定位」——批注不丢，列表里还能编辑或删除。

## 首次配置：一次 token

浏览器直连 `api.github.com` 需要一个有写权限的凭证。**GitHub 的 OAuth 授权接口不给跨域**
（`github.com/login/device/code` 的响应里没有 `Access-Control-Allow-Origin`），纯静态站拿不到它，
所以第一次要手工贴一次 token：

1. 打开 <https://github.com/settings/personal-access-tokens/new>
2. Token name 随便写，Expiration 建议 90 天
3. Repository access → **Only select repositories** → 选 `huangxicheng1.github.io`
4. Permissions → Repository permissions → **Contents** = **Read and write**，其余全部 No access
5. Generate token，复制那串 `github_pat_…`

回到博客任意一篇笔记，划一段字 → 点「＋」→ 把 token 粘进去 → 保存并验证。
登录名会显示在批注抽屉底部，之后这台浏览器就不用再登。

token 只存在 `localStorage`，不会进仓库、不会出现在任何 URL 里，只从浏览器发给 `api.github.com`。
换设备或清缓存后要重新贴一次。失效了（401）会提示重新登录。

## 日常用法

- **写**：选中文字 → 右侧浮出「＋」→ 点它 → 写 → 保存（`Ctrl/⌘ + Enter` 也行）
- **看**：宽屏时卡片排在正文右边那一栏，一根细线连着原文；窄屏时点高亮弹出浮层
- **改 / 删**：鼠标移到卡片上，右下角出现「编辑 / 删除」，删除要再点一次确认
- **总览**：右下角「批注 N」打开列表，含未定位的条目
- **生效时间**：保存后当前页立刻能看到；线上其他人约 1 分钟后（等 Actions 重新部署）看到

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 点「＋」弹出登录框 | 还没登录，或 token 已失效 |
| 保存失败 403 | token 没给 Contents: Read and write，或仓库选错了 |
| 保存失败 409 | 别的设备刚改过，会自动合并重试一次；还失败就刷新页面 |
| 批注显示「未定位」 | 原文被改过、那句话找不到了，进列表手动改或删 |
| 卡片不出现 | 窗口宽度不足 1280 时没有右侧走廊，点高亮看浮层即可 |
| 线上 404 | 检查 `pages.yml` 的白名单里有没有 `annotate.js annotate.css annotations` |

## 想换成「点一下授权」

需要加一个几行的中转服务（Cloudflare Worker 之类）转发 device flow 的两个请求，
前端把 `openLogin()` 里贴 token 的那段换成轮询即可。目前的实现是有意做成零依赖、零后端的。

## 可见性

`annotations/` 在公开仓库里，所以**批注是公开的**。想只给自己看，得换成私有存储，不是加个开关的事。
