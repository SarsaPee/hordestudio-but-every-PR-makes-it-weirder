#!/usr/bin/env sh
set -eu

VERSION="${1:-16.7.0}"
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
  labs-needle.js \
  labs-needle-worker.js \
  labs-core.js \
  labs-tasks.js \
  labs-guide.js \
  labs-ui.js \
  help-system.js \
  rpg-mechanics.js \
  multiplayer-engine.js \
  multiplayer.js \
  ashlyn-reynolds-human.js \
  jane-harlow-human.js \
  policy-panic-world.js \
  favicon.svg \
  horde_mcp_bridge.py \
  README.md \
  THIRD_PARTY_NOTICES.md \
  MCP_SETUP.md \
  "Start Horde Studio.command" \
  "Start Horde Studio.bat" \
  start-horde-studio.sh
do
  cp "$ROOT_DIR/$file" "$APP_DIR/"
done

# Pass 0 adds pristine stock 17.0 Worlds as a same-document mode. Ship only
# its generated runtime and stylesheet; source maps and pristine reference
# trees remain development/provenance material.
mkdir -p "$APP_DIR/experiences/stock-worlds-17-pass0"
cp "$ROOT_DIR/experiences/stock-worlds-17-pass0/runtime.js" \
  "$ROOT_DIR/experiences/stock-worlds-17-pass0/style.css" \
  "$APP_DIR/experiences/stock-worlds-17-pass0/"

# Pass 1 begins the mechanical relocation of the accepted Experimental Worlds
# implementation. Ship the relocated runtime, never the old reference tree.
mkdir -p "$APP_DIR/experiences/experimental-worlds/runtime" \
  "$APP_DIR/host-adapters/experimental-worlds"
cp "$ROOT_DIR/experiences/experimental-worlds/runtime/sidecar-core.js" \
  "$ROOT_DIR/experiences/experimental-worlds/runtime/dossier-claims.js" \
  "$ROOT_DIR/experiences/experimental-worlds/runtime/world-studio-core.js" \
  "$APP_DIR/experiences/experimental-worlds/runtime/"
mkdir -p "$APP_DIR/experiences/experimental-worlds/mechanics" \
  "$APP_DIR/experiences/experimental-worlds/visuals" \
  "$APP_DIR/experiences/experimental-worlds/scenepulse" \
  "$APP_DIR/experiences/experimental-worlds/styles"
cp "$ROOT_DIR/experiences/experimental-worlds/mechanics/world-mechanics.js" \
  "$APP_DIR/experiences/experimental-worlds/mechanics/"
cp "$ROOT_DIR/experiences/experimental-worlds/visuals/world-portrait-prompt.js" \
  "$ROOT_DIR/experiences/experimental-worlds/visuals/world-visual-media-core.js" \
  "$ROOT_DIR/experiences/experimental-worlds/visuals/world-visual-provider-core.js" \
  "$APP_DIR/experiences/experimental-worlds/visuals/"
cp "$ROOT_DIR/host-adapters/experimental-worlds/visual-media-host-adapter.js" \
  "$APP_DIR/host-adapters/experimental-worlds/"
cp "$ROOT_DIR/experiences/experimental-worlds/scenepulse/scene-pulse-worlds.js" \
  "$ROOT_DIR/experiences/experimental-worlds/scenepulse/scenepulse-source-runtime.js" \
  "$APP_DIR/experiences/experimental-worlds/scenepulse/"
cp "$ROOT_DIR/experiences/experimental-worlds/styles/scene-pulse-worlds.css" \
  "$ROOT_DIR/experiences/experimental-worlds/styles/world-visuals-and-sidecar.css" \
  "$APP_DIR/experiences/experimental-worlds/styles/"
# The native Source Runtime dynamically imports its pinned local ScenePulse
# source modules. Keep that licensed vendor tree in the portable build; it is
# runtime code, not an alternate Horde installation or development worktree.
mkdir -p "$APP_DIR/scenepulse"
cp -R "$ROOT_DIR/scenepulse/vendor" "$APP_DIR/scenepulse/"

# Built-in humans follow the same boot path as the rest of the application.
# Packaging must copy both definitions and must never rewrite them into inline
# scripts (which CSP correctly blocks). Treat either missing file as a fatal
# release error rather than shipping an apparently empty Human library.
python3 "$ROOT_DIR/scripts/verify-portable-humans.py" "$APP_DIR"

# Bundled Virtual Humans and Worlds can reference normalized media by relative
# path. Keep those runtime assets portable without shipping heavy marketing or
# development artwork in the application archive.
if [ -d "$ROOT_DIR/assets/bundled" ]; then
  mkdir -p "$APP_DIR/assets"
  cp -R "$ROOT_DIR/assets/bundled" "$APP_DIR/assets/"
fi

# Internet multiplayer is bring-your-own relay. Ship the small auditable Worker
# source and setup guide so portable users are not dependent on this repository.
mkdir -p "$APP_DIR/docs"
cp "$ROOT_DIR/docs/multiplayer.md" "$APP_DIR/docs/"
cp -R "$ROOT_DIR/multiplayer-relay" "$APP_DIR/"

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
