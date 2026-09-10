#!/usr/bin/env python3
"""Fail a portable build when advertised Virtual Humans are not first-class files."""

from pathlib import Path
import re
import sys


BUNDLES = (
    ("ashlyn-reynolds-human.js", "ashlyn-reynolds-v1"),
    ("jane-harlow-human.js", "jane-harlow-v1"),
)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify-portable-humans.py APP_DIR")

    app_dir = Path(sys.argv[1]).resolve()
    html = (app_dir / "index.html").read_text(encoding="utf-8")
    if "data-horde-bundled-human" in html:
        raise SystemExit("portable index still contains fragile inline human scripts")
    csp = re.search(
        r'<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"',
        html,
        flags=re.IGNORECASE,
    )
    if not csp:
        raise SystemExit("portable index has no Content-Security-Policy")
    script_src = re.search(r"script-src\s+([^;]+)", csp.group(1), flags=re.IGNORECASE)
    if not script_src or "'self'" not in script_src.group(1).split():
        raise SystemExit("portable CSP does not allow its first-class script files")

    for filename, bundle_id in BUNDLES:
        script_tag = re.search(
            rf'<script\s+src="{re.escape(filename)}(?:\?[^\"]*)?"></script>',
            html,
            flags=re.IGNORECASE,
        )
        if not script_tag:
            raise SystemExit(f"portable index does not load {filename}")
        script_path = app_dir / filename
        if not script_path.is_file():
            raise SystemExit(f"portable package is missing {filename}")
        source = script_path.read_text(encoding="utf-8")
        if bundle_id not in source or "HORDE_INCLUDED_HUMANS" not in source:
            raise SystemExit(f"{filename} is not a valid {bundle_id} built-in")

    print("Portable built-in humans: first-class files loaded at application boot")


if __name__ == "__main__":
    main()
