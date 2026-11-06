"""从本机 Steam 客户端记录生成游戏库数据（games/playtime.json）。

用法：
    python tools/build-playtime.py                 # 自动找 Steam 与账号
    python tools/build-playtime.py --root D:/steam
    python tools/build-playtime.py --account 1022198151

数据来源：<Steam>/userdata/<账号>/config/localconfig.vdf 里
Software\\Valve\\Steam\\apps\\<appid> 的 Playtime（分钟）与 LastPlayed（unix 秒）。
游戏名优先取 games/names.json 缓存，缺失时问一次 Steam 商店接口并回写缓存。

输出只包含"启动过"的游戏；从未启动过的不会出现在 localconfig 里。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = ROOT / "games" / "names.json"
OUTPUT = ROOT / "games" / "playtime.json"


# ---------------------------------------------------------------- VDF 解析

TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|\{|\}|(//[^\n]*)')


def parse_vdf(text: str) -> dict:
    tokens = []
    for match in TOKEN.finditer(text):
        if match.group(2):
            continue
        tokens.append(match.group(1) if match.group(1) is not None else match.group(0))

    index = 0

    def block() -> dict:
        nonlocal index
        node: dict = {}
        while index < len(tokens):
            token = tokens[index]
            index += 1
            if token == "}":
                return node
            if token == "{":
                continue
            if index < len(tokens) and tokens[index] == "{":
                index += 1
                node[token] = block()
            else:
                node[token] = tokens[index] if index < len(tokens) else ""
                index += 1
        return node

    return block()


def dig(node: dict, path: list[str]):
    cur = node
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


# ---------------------------------------------------------------- 名字补齐

def store_name(appid: str) -> str | None:
    url = "https://store.steampowered.com/api/appdetails?" + urllib.parse.urlencode(
        {"appids": appid, "l": "schinese"}
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace"))
        node = data.get(appid) or {}
        if node.get("success") and node.get("data", {}).get("name"):
            return node["data"]["name"]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------- 主流程

def find_userdata(steam_root: Path, wanted: str | None) -> Path:
    base = steam_root / "userdata"
    if not base.is_dir():
        raise SystemExit(f"找不到 {base}，请用 --root 指定 Steam 安装目录")
    cands = [d for d in base.iterdir() if (d / "config" / "localconfig.vdf").is_file()]
    if wanted:
        cands = [d for d in cands if d.name == wanted] or cands
    if not cands:
        raise SystemExit("userdata 里没有带 localconfig.vdf 的账号")
    return max(cands, key=lambda d: (d / "config" / "localconfig.vdf").stat().st_mtime)


def steam_root_from_registry() -> Path | None:
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
            return Path(winreg.QueryValueEx(key, "SteamPath")[0])
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", help="Steam 安装目录")
    ap.add_argument("--account", help="只读这个账号（userdata 下的数字目录名）")
    ap.add_argument("--no-network", action="store_true", help="不联网补名字")
    args = ap.parse_args()

    root = Path(args.root) if args.root else steam_root_from_registry()
    if not root or not root.is_dir():
        raise SystemExit("找不到 Steam 安装目录，请用 --root 指定")
    ud = find_userdata(root, args.account)

    tree = parse_vdf((ud / "config" / "localconfig.vdf").read_text(encoding="utf-8", errors="replace"))
    apps = dig(tree, ["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]) or {}

    names = json.loads(NAMES.read_text(encoding="utf-8")) if NAMES.is_file() else {}
    added = 0
    games = []
    for appid, node in apps.items():
        if not isinstance(node, dict):
            continue
        minutes = int(node.get("Playtime") or 0)
        last = int(node.get("LastPlayed") or 0)
        if minutes <= 0:
            continue
        name = names.get(appid)
        if not name and not args.no_network:
            name = store_name(appid)
            if name:
                names[appid] = name
                added += 1
        games.append(
            {
                "id": appid,
                "name": name or f"appid {appid}",
                "hours": round(minutes / 60, 1),
                "minutes": minutes,
                "last": dt.date.fromtimestamp(last).isoformat() if last else None,
            }
        )

    games.sort(key=lambda g: (-g["minutes"], g["name"]))
    total = round(sum(g["minutes"] for g in games) / 60, 1)

    payload = {
        "account": ud.name,
        "updated": dt.date.today().isoformat(),
        "totalHours": total,
        "count": len(games),
        "games": games,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if added:
        NAMES.write_text(json.dumps(names, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"账号 {ud.name}：{len(games)} 款 · 累计 {total} 小时 → {OUTPUT.relative_to(ROOT)}")
    if added:
        print(f"补到 {added} 个新游戏名，已回写 names.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
