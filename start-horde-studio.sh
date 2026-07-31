#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 horde_mcp_bridge.py --open
elif command -v python >/dev/null 2>&1; then
  exec python horde_mcp_bridge.py --open
else
  echo "Python 3 is required. Install it, then run this launcher again."
  exit 1
fi
