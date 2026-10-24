# 暮色手帖 · 档案室版（莱茵生命风格全站迁移）

以「莱茵生命 R-01 档案室」视觉体系重制的全站：暖白底板 / 墨黑 / 莱茵橙，
DIN 窄体 + 等宽批注，部门制导航，文章按 `RLD-01…` 档案编号排架。

## 怎么打开

- 双击 `index.html` 即可（全部为本地静态文件，无网络请求），或
- 本地服务：`python -m http.server 8850` 后访问 `http://127.0.0.1:8850/`

## 迁移了哪些页面

| 页面 | 内容 |
|------|------|
| `index.html` | 档案板 HERO + 最新 5 篇档案（RLD 编号）+ 复核队列 + 小狗收容舱 + 本月日历 + 开屏动画 |
| `calendar.html` | 全年热力图 + 十二个月的章节 + 月视图（点日期看当天记录） |
| `notes.html` | 今日复习面板 + 分类卡片 + 搜索 + 全部学习笔记 |
| `entry.html` | 文章阅读页（Markdown 排版：橙色标题标记、代码块、表格、标签） |

## 和原站的关系

- `app.js` / `entries.js` **原封未动**：日历逻辑、分类筛选、搜索、复核队列、
  Markdown 渲染、主题记忆全部是原站逻辑，只换了样式与页面骨架。
- `archive.css` 是唯一的新样式表；`body.light` 是「夜间值班」暗色主题
  （右上角按钮切换，选择会被记住）。
- 首页保留了你已上线的开屏动画（`splash.css` / `splash.js`，每次刷新播放；
  想改成每会话一次，把 `splash.js` 里 `mode: 'always'` 改为 `'session'`）。
- 右上角统计（档案总数 / 记录天数 / 今日已录入）由 `index.html` 内的小脚本
  从 `SITE_ENTRIES` 实时计算，不是写死的。

## 想发布到 GitHub Pages

把这个目录的内容覆盖仓库根目录（保留你的 `content/`、`build.py`、
`.github/`），并在 `.github/workflows/pages.yml` 的
"Prepare public files only" 白名单里加入 `archive.css`（其余文件名相同，
`styles.css` / `enhancements.css` 若不再使用可从白名单移除）。
