# 游玩档案 · 数据刷新说明

游戏库页面（`games/index.html`）的数据是**静态快照**，不联网、不依赖第三方接口。

## 两个文件

| 文件 | 作用 |
|---|---|
| `games/playtime.json` | 页面读取的数据：账号、更新时间、每款游戏的时长（分钟/小时）与最近启动日期 |
| `games/names.json` | appid → 游戏名缓存，避免每次刷新都去问 Steam |

## 刷新步骤

```bash
python tools/build-playtime.py    # 读本机 Steam 记录 → games/playtime.json
python tools/fetch-covers.py      # 补新游戏的封面 → games/covers/<appid>.jpg
```

然后提交 `games/playtime.json`、`games/names.json`、`games/covers/` 即可。

- `build-playtime.py` 自动从注册表找 Steam 安装路径和最近使用的账号，
  也可以 `--root D:/steam`、`--account 1022198151` 手动指定；`--no-network` 可完全离线。
- 只收录**启动过**的游戏：Steam 只把这些记录写进 `localconfig.vdf`。
- 新游戏名如果不在缓存里，脚本会问一次商店接口并自动回写 `names.json`。
- 封面抓不到的游戏，页面会退化成带 appid 的占位块，不影响排版。

## 注意

时长来自本机客户端记录，包含云同步下来的累计值；但换设备玩的、尚未同步的部分不在里面。
「最近启动」取自 `LastPlayed`，代表最后一次启动的时间，不是最后一次游玩时长。
