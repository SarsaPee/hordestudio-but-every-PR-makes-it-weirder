#!/usr/bin/env python3
"""Bake advertised Virtual Humans into a portable Horde Studio index."""

from pathlib import Path
import sys


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: embed-portable-humans.py ROOT_DIR INDEX_HTML")

    root = Path(sys.argv[1]).resolve()
    index_path = Path(sys.argv[2]).resolve()
    html = index_path.read_text(encoding="utf-8")
    bundles = (
        ("ashlyn-reynolds-human.js", "ashlyn-reynolds-v1"),
        ("jane-harlow-human.js", "jane-harlow-v1"),
    )

    for filename, bundle_id in bundles:
        source_path = root / filename
        source = source_path.read_text(encoding="utf-8")
        if bundle_id not in source:
            raise SystemExit(f"{filename} does not contain {bundle_id}")
        if "</script" in source.lower():
            raise SystemExit(f"{filename} cannot be safely embedded in HTML")

        prefix = f'<script src="{filename}'
        start = html.find(prefix)
        if start < 0:
            raise SystemExit(f"index.html is missing the {filename} script tag")
        end = html.find("</script>", start)
        if end < 0:
            raise SystemExit(f"index.html has a malformed {filename} script tag")
        end += len("</script>")
        inline = (
            f'<script data-horde-bundled-human="{bundle_id}">\n'
            f'{source.rstrip()}\n'
            f'</script>'
        )
        html = html[:start] + inline + html[end:]

    index_path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
