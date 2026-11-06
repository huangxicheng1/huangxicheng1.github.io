"""把 games/playtime.json 里每款游戏的封面抓到 games/covers/<appid>.jpg。

用法：python tools/fetch-covers.py [--force]

封面来自 Steam 官方 CDN（header.jpg，460x215）。页面渲染时只用本地文件，
所以线上不依赖第三方图床；抓不到的游戏页面会退化成占位块，不影响排版。
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "games" / "playtime.json"
COVERS = ROOT / "games" / "covers"

HOSTS = [
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg",
    "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{id}/header.jpg",
    "https://cdn.akamai.steamstatic.com/steam/apps/{id}/header.jpg",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/capsule_231x87.jpg",
]

# 列表里只显示一百多像素宽的缩略图，存原图太浪费；有 Pillow 就顺手压到 2 倍宽
MAX_WIDTH = 320
QUALITY = 82


def shrink(raw: bytes, target: Path) -> bytes:
    try:
        import io

        from PIL import Image
    except Exception:
        return raw

    with Image.open(io.BytesIO(raw)) as img:
        img = img.convert("RGB")
        if img.width > MAX_WIDTH:
            img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        return out.getvalue()


def fetch(appid: str) -> bytes | None:
    for host in HOSTS:
        try:
            req = urllib.request.Request(host.format(id=appid), headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
            if body[:2] == b"\xff\xd8":  # JPEG 魔数，避免把错误页存成图
                return body
        except Exception:
            continue
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="已有封面也重新下载")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    COVERS.mkdir(parents=True, exist_ok=True)

    got = skipped = failed = 0
    for game in data["games"]:
        appid = game["id"]
        target = COVERS / f"{appid}.jpg"
        if target.exists() and not args.force:
            skipped += 1
            continue
        body = fetch(appid)
        if body:
            target.write_bytes(shrink(body, target))
            got += 1
        else:
            failed += 1
            print(f"  抓不到封面：{appid} {game['name']}")

    total = sum(p.stat().st_size for p in COVERS.glob("*.jpg"))
    print(f"封面：新增 {got} · 已有 {skipped} · 失败 {failed} · 合计 {len(list(COVERS.glob('*.jpg')))} 张 / {total / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
