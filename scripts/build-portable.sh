#!/usr/bin/env sh
set -eu

VERSION="${1:-12.0.1}"
ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d)
APP_DIR="$BUILD_DIR/Horde Studio"
OUTPUT_DIR="$ROOT_DIR/dist"
OUTPUT_FILE="$OUTPUT_DIR/Horde-Studio-v${VERSION}-portable.zip"

cleanup() {
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT INT TERM

mkdir -p "$APP_DIR" "$OUTPUT_DIR"

for file in \
  index.html \
  app.js \
  style.css \
  presets.js \
  boot-diagnostics.js \
  labs-embedded.js \
  labs-embedded-worker.js \
  labs-core.js \
  labs-tasks.js \
  labs-ui.js \
  policy-panic-world.js \
  favicon.svg \
  horde_mcp_bridge.py \
  README.md \
  MCP_SETUP.md \
  "Start Horde Studio.command" \
  "Start Horde Studio.bat" \
  start-horde-studio.sh
do
  cp "$ROOT_DIR/$file" "$APP_DIR/"
done

chmod +x "$APP_DIR/Start Horde Studio.command" "$APP_DIR/start-horde-studio.sh"
rm -f "$OUTPUT_FILE"

if command -v zip >/dev/null 2>&1; then
  (cd "$BUILD_DIR" && zip -9 -q -r "$OUTPUT_FILE" "Horde Studio")
else
  python3 - "$BUILD_DIR" "$OUTPUT_FILE" <<'PY'
import pathlib
import sys
import zipfile

source = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted((source / "Horde Studio").rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(source))
PY
fi

printf '%s\n' "$OUTPUT_FILE"
