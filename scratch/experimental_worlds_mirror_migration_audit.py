#!/usr/bin/env python3
"""Executable idempotence/readback guard for the Experimental Worlds mirror move."""

import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("experimental_migration", ROOT / "scripts" / "migrate-experimental-worlds-mirror.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    source, destination = root / "legacy.json", root / "experimental-worlds" / "shared-library.json"
    source.write_text(json.dumps({"version": 1, "revision": 7, "snapshot": {"worlds": [{"id": "same-id", "sidecar": {"turns": [1]}}]}}), "utf-8")
    first, first_hash = MODULE.copy_verify(source, destination)
    second, second_hash = MODULE.copy_verify(source, destination)
    assert first == "copied" and second == "already-present" and first_hash == second_hash
    copied = json.loads(destination.read_text("utf-8"))
    assert copied["snapshot"]["worlds"][0]["id"] == "same-id"
print("experimental mirror migration audit passed")
