# 暮色手帖

一个可以部署在 GitHub Pages 的**多页静态网站**：安静的星空夜色、全年记录热力图、按天查看的日历、分类学习笔记、独立文章阅读页、会动的像素小狗与每日寄语。

## 页面

- `index.html`：首页、日历格里的记录标题、最近记录、像素小狗和今日寄语；全年记录集中在日历页。
- `calendar.html`：全年热力图与可翻月日历；点击有颜色的日子可定位到当月，记录标题直接在日期格里显示并可打开正文。窄屏时可横向滚动日历。
- `notes.html`：按 `category` 分类、搜索笔记、筛选待复习。
- `entry.html?id=...`：一篇记录的独立阅读页面。从日历或笔记点进去即可，无需手写链接。

这四个页面用相对路径互相跳转。本项目发布到 `huangxicheng1/huangxicheng1.github.io` 后，访问地址是 `https://huangxicheng1.github.io/`；将来迁移到项目仓库时也能适配 `/仓库名/`。文章使用共用阅读页和不同的 `id` 参数；如果想为每篇文章生成单独的物理 HTML 文件，也可以扩展构建器。

## 本地预览

直接用浏览器打开 `index.html`；也可以在项目目录运行 `python -m http.server 8000`，访问 `http://localhost:8000/`。演示文章已全部移除；目前 `content/diary/` 有 2026 年 10 月 22 日及 23 日的面试记录，日历会在对应日期显示标题。以后将自己的 Markdown 放到 `content/` 并运行 `python build.py` 即可填充。面试邀请属于敏感信息，公开站点和仓库中不放入入会链接、会议号或联系人电话；请从原始邀请查看。

你提供的鸟形插画裁掉透明外缘后保存在 `logo.png`，作为四个页面页眉、页脚的标识；从同一图案制作的 `favicon.ico` 和 `apple-touch-icon.png` 用于浏览器标签及加入主屏幕图标。你新下载的小狗动画已复制为项目根目录的 `dog.gif`，首页直接播放 GIF，不再对小狗整体施加跳动动画；从这张 GIF 第一帧提取的 `dog-still.png` 用于“减少动态效果”设置下的静止显示。图片无需联网，网站不会读取位置；天气模块和定位请求已经移除。每日寄语根据打开页面时的日期选定，当天固定；跨日后刷新页面，寄语、日历和复习清单会一起更新。

## 写 Markdown

在 `content/diary/` 或 `content/notes/` 中创建 `.md` 文件：

```md
---
title: HTTP 缓存，重新讲一遍
date: 2026-10-20
type: note
category: 前端基础
summary: 把强缓存与协商缓存拆开讲清楚。
tags: 八股文, HTTP, 浏览器
review: 2026-10-27
draft: false
---
先不看答案，试着自己解释。

## 我的理解

正文写在这里。
```

- `type` 填 `note`（笔记）或 `diary`（日记）；`category` 用于笔记分类，未填归到“未分类”，`tags` 用英文逗号分隔。
- `review` 是下一次复习的日期，使用 `YYYY-MM-DD`。到期的笔记会出现在首页提醒和笔记页筛选里；**点击笔记不会自动标记完成或计算下一次复习时间**，需要自己修改该字段并重新发布。
- `draft: true` 不进入发布的 `entries.js`，但如果仓库是公开的，Markdown 源文件依然会被别人看见；不要将敏感或不想公开的内容放在公开仓库。
- 正文支持标题、列表、引用、`**加粗**`、`*斜体*`、`==暖色重点标记==`、行内代码、代码围栏及 http(s) 链接。在代码围栏后标注 `js` 或 `css` 等语言，JavaScript/TypeScript、CSS、HTML 有离线轻量语法高亮；其他语言仍有清晰的代码块样式。暂未实现表格、图片、双向链接及嵌入 HTML。
- 笔记的样式会在你发布自己的内容后显示；空白站点不会包含演示文章。

编辑后运行 `python build.py`，更新项目根目录的 `entries.js`。如果只改了 Markdown 却没有在本地运行，部署工作流也会在发布前重新构建。网站本身没有写入后端；写日记要通过本地文件或 GitHub 网页编辑器提交。

## 发布到 GitHub Pages

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 工作流 `.github/workflows/pages.yml` 会运行 `build.py`，将四个 HTML 页面、CSS、JS、公开记录索引、`dog.gif`、`dog-still.png`、`logo.png`、`favicon.ico` 与 `apple-touch-icon.png` 一起发布；源 Markdown 不直接进入 Pages 产物。
4. 在 Actions 中确认 `Publish diary` 运行成功，从 Pages 设置获取站点地址。

GitHub Pages 公开可访问；即便使用私有仓库，发布的网站也不是私人保险箱。当前没有网站内编辑、账号、跨设备复习状态同步；只把明暗主题偏好存在当前浏览器。
