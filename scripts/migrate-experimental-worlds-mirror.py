#!/usr/bin/env python3
"""Copy the legacy Experimental Worlds recovery mirror without overwriting data.

Run this only after preserving the legacy file and before the combined launcher
first serves Experimental Worlds at its preserved localhost origin. The browser
database is not rewritten by this tool; it remains owned by that origin.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path


def digest(value: object) -> tuple[bytes, str]:
    if not isinstance(value, dict):
        raise ValueError("Recovery mirror must contain a JSON object.")
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return encoded, hashlib.sha256(encoded).hexdigest()


def copy_verify(source: Path, destination: Path) -> tuple[str, str]:
    source_value = json.loads(source.read_text("utf-8"))
    encoded, source_hash = digest(source_value)
    if destination.exists():
        _, destination_hash = digest(json.loads(destination.read_text("utf-8")))
        if destination_hash != source_hash:
            raise RuntimeError("Destination already differs; refusing to overwrite either recovery mirror.")
        return "already-present", source_hash
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    _, destination_hash = digest(json.loads(destination.read_text("utf-8")))
    if destination_hash != source_hash:
        raise RuntimeError("Readback hash differs after copy; original was retained and destination needs review.")
    return "copied", source_hash


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    arguments = parser.parse_args()
    if arguments.source.resolve() == arguments.destination.resolve():
        raise SystemExit("Source and destination must be distinct.")
    result, value_hash = copy_verify(arguments.source, arguments.destination)
    print(json.dumps({"result": result, "sha256": value_hash, "source": str(arguments.source), "destination": str(arguments.destination)}))


if __name__ == "__main__":
    main()
