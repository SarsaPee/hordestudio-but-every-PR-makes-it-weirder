#!/usr/bin/env python3
"""Deterministic contract audit for the crash-safe Virtual Human handoff."""

import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import horde_mcp_bridge as bridge


temporary = tempfile.TemporaryDirectory()
queue_file = Path(temporary.name) / "always-on-queue.json"
runtime = bridge.AlwaysOnRuntime(queue_file=queue_file, start_thread=False)
runtime._generate = lambda human, kind: {
    "decision": kind,
    "text": "caught up while you were away",
    "reason": "bounded test",
    "next_check_minutes": 120,
}
now = int(time.time() * 1000)
status = runtime.sync({
    "enabled": True,
    "clientId": "audit-client",
    "dailyLimit": 2,
    "minimumMinutes": 120,
    "humans": [{
        "id": "ash", "name": "Ash", "timelineId": "main",
        "messagesEnabled": True, "socialEnabled": False,
        "messageDueAt": now - 1, "hasSpoken": True,
        "context": "A grounded test person.", "recentMessages": [],
        "provider": {
            "baseUrl": "http://127.0.0.1:1234/v1",
            "headers": {"Authorization": "Bearer must-remain-in-memory"},
            "model": "tiny-test", "temperature": 0.7, "maxTokens": 200,
        },
    }],
})
assert status["armed"] is True
assert "must-remain-in-memory" not in str(status)
runtime.last_heartbeat = time.time() - 1000
runtime._tick()
events = runtime.pending_events("audit-client")
assert len(events) == 1 and events[0]["kind"] == "message"
assert runtime.pending_events("wrong-client") == []
queue_text = queue_file.read_text("utf-8")
assert events[0]["id"] in queue_text
assert "must-remain-in-memory" not in queue_text

restored = bridge.AlwaysOnRuntime(queue_file=queue_file, start_thread=False)
assert len(restored.pending_events("")) == 1
runtime.acknowledge([events[0]["id"]])
assert runtime.pending_events("audit-client") == []
assert events[0]["id"] not in queue_file.read_text("utf-8")

runtime.paused = False
runtime.enabled = True
runtime.humans = {"ash": runtime.humans["ash"]}
runtime.last_heartbeat = time.time() - 1000
runtime.humans["ash"]["messageDueAt"] = now - 1
runtime._generate = lambda *_: (_ for _ in ()).throw(RuntimeError("provider down"))
for _ in range(5):
    runtime.humans["ash"]["nextAllowedAt"] = 0
    runtime._tick()
assert runtime.status()["paused"] is True
assert runtime.status()["pauseReason"] == "provider circuit breaker"
runtime.stop()
assert runtime.status()["enabled"] is False
temporary.cleanup()
print("Always-on runtime audit passed")
