"""Build the small, dependency-free content index used by this static site.

Run `python build.py` after editing Markdown. GitHub Actions runs it on publish.
Front matter intentionally supports only simple key: value lines and comma-separated tags.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
OUTPUT = ROOT / "entries.js"
REQUIRED = {"title", "date", "type", "summary"}


def parse(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    if not text.startswith("---\n"):
        raise ValueError(f"{path}: missing front matter opening ---")
    try:
        header, body = text[4:].split("\n---\n", 1)
    except ValueError as exc:
        raise ValueError(f"{path}: missing front matter closing ---") from exc
    fields: dict[str, str] = {}
    for line in header.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"{path}: invalid front matter line: {line!r}")
        key, value = line.split(":", 1)
        key = key.strip().lower()
        if key in fields:
            raise ValueError(f"{path}: duplicate field {key}")
        fields[key] = value.strip().strip('"\'')
    missing = REQUIRED - fields.keys()
    if missing:
        raise ValueError(f"{path}: missing fields: {', '.join(sorted(missing))}")
    if fields.get("draft", "false").lower() in {"true", "yes", "1"}:
        return None
    if fields["type"] not in {"diary", "note"}:
        raise ValueError(f"{path}: type must be diary or note")
    for name in ("date", "review"):
        if fields.get(name):
            try:
                parsed = dt.date.fromisoformat(fields[name])
                if parsed.isoformat() != fields[name]:
                    raise ValueError()
            except ValueError as exc:
                raise ValueError(f"{path}: {name} must be YYYY-MM-DD") from exc
    if not body.strip():
        raise ValueError(f"{path}: body is empty")
    return {
        "id": path.relative_to(CONTENT).with_suffix("").as_posix(),
        "title": fields["title"],
        "date": fields["date"],
        "type": fields["type"],
        "category": fields.get("category", "未分类") if fields["type"] == "note" else "生活",
        "summary": fields["summary"],
        "tags": [tag.strip() for tag in fields.get("tags", "").split(",") if tag.strip()],
        "review": fields.get("review", ""),
        "content": body.strip(),
    }


def main() -> None:
    paths = sorted(CONTENT.rglob("*.md"))
    entries = [entry for path in paths if (entry := parse(path)) is not None]
    entries.sort(key=lambda entry: (entry["date"], entry["id"]), reverse=True)
    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":")).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    OUTPUT.write_text("// Generated from content/*.md by build.py; do not edit by hand.\nwindow.SITE_ENTRIES = " + payload + ";\n", encoding="utf-8")
    print(f"Built {len(entries)} public entries into {OUTPUT.name}")


if __name__ == "__main__":
    main()
