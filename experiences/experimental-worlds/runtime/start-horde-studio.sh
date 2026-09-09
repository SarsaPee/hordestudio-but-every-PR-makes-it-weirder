#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

# Prefer a local .venv if it exists
if [ -x ".venv/bin/python" ]; then
    exec .venv/bin/python horde_mcp_bridge.py --open
fi

# Prefer uv if installed
if command -v uv >/dev/null 2>&1; then
    exec uv run horde_mcp_bridge.py --open
fi

# Fallback: system Python
if command -v python3 >/dev/null 2>&1; then
    exec python3 horde_mcp_bridge.py --open
elif command -v python >/dev/null 2>&1; then
    exec python horde_mcp_bridge.py --open
else
    echo "Python 3 is required. Install it or use uv." >&2
    exit 1
fi
