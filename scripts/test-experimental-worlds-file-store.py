#!/usr/bin/env python3
"""Focused durability checks for the root-file Experimental Worlds authority."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from horde_mcp_bridge import ExperimentalWorldsFileStore


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="horde-experimental-worlds-") as temporary:
        root = Path(temporary) / "data" / "experimental-worlds"
        store = ExperimentalWorldsFileStore(root)

        initial = store.read()
        assert initial["authority"] == "root-files"
        assert initial["revision"] == 0
        assert initial["records"]["worlds"] == []

        snapshot = {
            "worlds": [{"id": "world_alpha", "name": "Alpha / World", "mediaAssets": []}],
            "worldInstances": {"world_alpha": {"activeSessionId": "timeline_one", "sessions": []}},
            "activeWorldId": "world_alpha",
            "worldRecoverySnapshots": {},
            "worldMediaAssets": {
                "world_alpha": [{"id": "portrait", "source": "data:image/png;base64,AA=="}]
            },
            "workspace": {"route": "play", "worldId": "world_alpha", "timelineId": "timeline_one"},
            "savedModelCatalogs": {"openrouter": {"version": 1, "models": []}},
            "roleplayOSSources": [{"id": "source_one", "name": "Source One"}],
            "theme": "midnight",
        }
        status, saved = store.mutate({
            "operation": "publishSnapshot",
            "expectedRevision": 0,
            "snapshot": snapshot,
            "reason": "test-save",
            "invalidateRestore": False,
        })
        assert status == 200
        assert saved["revision"] == 1
        assert saved["records"]["generation"] == 1
        assert saved["records"]["savedModelCatalogs"] == snapshot["savedModelCatalogs"]
        assert saved["records"]["roleplayOSSources"] == snapshot["roleplayOSSources"]

        active = json.loads((root / "state.json").read_text("utf-8"))
        assert active["_format"] == ExperimentalWorldsFileStore.FORMAT
        assert active["checksum"] == ExperimentalWorldsFileStore._checksum(active["records"])
        assert len(list((root / "snapshots").glob("*.json"))) == 1

        mirror = json.loads((root / "worlds" / "world_alpha.horde_world").read_text("utf-8"))
        assert mirror["_format"] == "horde-world"
        assert mirror["_version"] == 2
        assert mirror["mediaAssets"][0]["id"] == "portrait"
        portable, filename = store.portable_world("world_alpha")
        assert portable == mirror
        assert filename == "Alpha_World.horde_world"

        # A browser reload may re-publish its already hydrated snapshot. It
        # must not create another 32 MB-class root snapshot or rewrite derived
        # World mirrors when no user data changed.
        active_bytes = (root / "state.json").read_bytes()
        mirror_bytes = (root / "worlds" / "world_alpha.horde_world").read_bytes()
        active_mtime = (root / "state.json").stat().st_mtime_ns
        mirror_mtime = (root / "worlds" / "world_alpha.horde_world").stat().st_mtime_ns
        status, unchanged = store.mutate({
            "operation": "publishSnapshot",
            "expectedRevision": 1,
            "snapshot": snapshot,
            "reason": "reload-no-op",
            "invalidateRestore": False,
        })
        assert status == 200
        assert unchanged["revision"] == 1
        assert unchanged["records"]["generation"] == 1
        assert len(list((root / "snapshots").glob("*.json"))) == 1
        assert (root / "state.json").read_bytes() == active_bytes
        assert (root / "worlds" / "world_alpha.horde_world").read_bytes() == mirror_bytes
        assert (root / "state.json").stat().st_mtime_ns == active_mtime
        assert (root / "worlds" / "world_alpha.horde_world").stat().st_mtime_ns == mirror_mtime

        status, staged = store.mutate({
            "operation": "setMany",
            "expectedRevision": 1,
            "records": {"restoreStage": {"id": "stage-one"}},
        })
        assert status == 200
        assert staged["revision"] == 2
        conflict_status, conflict = store.mutate({
            "operation": "removeMany",
            "expectedRevision": 1,
            "keys": ["restoreStage"],
        })
        assert conflict_status == 409
        assert conflict["records"]["restoreStage"]["id"] == "stage-one"

        # A damaged active document recovers from the newest verified rolling
        # snapshot rather than silently starting with an empty World library.
        (root / "state.json").write_text("{broken", "utf-8")
        recovered = store.read()
        assert recovered["recovery"]["recovered"] is True
        assert recovered["records"]["activeWorldId"] == "world_alpha"
        assert json.loads((root / "state.json").read_text("utf-8"))["checksum"]

        purged = store.purge("DELETE EXPERIMENTAL WORLDS")
        assert purged["records"]["worlds"] == []
        assert not root.exists()

    print("Experimental Worlds root files: atomic save, mirrors, conflicts, recovery, and purge passed")


if __name__ == "__main__":
    main()
