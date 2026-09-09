#!/usr/bin/env python3
"""Disposable OpenAI-compatible transport for browser acceptance runs.

It never leaves localhost, records only endpoint names and request classes, and
can hold one marked chat completion until ``POST /release``. It is deliberately
not a production provider or a substitute for live-model verification.
"""

from __future__ import annotations

import json
import re
import threading
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


release = threading.Event()
audit: list[dict[str, object]] = []
temporal_fixture_calls = 0
temporal_fixture_enabled = False
delay_next_request = False


def completion(body: dict[str, object]) -> dict[str, object]:
    global temporal_fixture_calls
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    text = " ".join(str(item.get("content") or "") for item in messages if isinstance(item, dict))
    tool_names = [str(item.get("function", {}).get("name") or "") for item in body.get("tools", []) if isinstance(item, dict)]
    if "commit_world_turn" in tool_names:
        # A native no-op commit still crosses Horde's real tool parser,
        # receipt validator, checkpoint guard and settlement transaction.  It
        # deliberately creates no people, locations, meters or facts; Mira
        # remains a Reader-derived candidate until the author promotes her in
        # the normal review UI.
        # The fixture must not assert a location from a prior disposable
        # world.  Generated start-location IDs are intentionally per-world;
        # use the current canonical ID supplied in this actual narrator call.
        # If the prompt does not expose one, omit the assertion entirely.
        location_ids = re.findall(r"loc_start_[A-Za-z0-9_-]+", text)
        scene = {
            "player_location_changed": False,
            "present_character_ids": ["player"],
            "nearby_character_ids": [],
            "scene_state": "active",
        }
        if location_ids:
            scene["player_location_id"] = location_ids[-1]
        receipt = {
            "turn_id": "acceptance-noop-commit",
            "summary": "Disposable acceptance fixture: no canonical mutation.",
            "scene": scene,
            "events": [], "entity_updates": [], "state_updates": {}
        }
        return {
            "id": "acceptance-mock-commit", "object": "chat.completion", "created": 0,
            "model": str(body.get("model") or "acceptance-mock"),
            "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                "role": "assistant", "content": "", "tool_calls": [{
                    "id": "acceptance-commit", "type": "function",
                    "function": {"name": "commit_world_turn", "arguments": json.dumps(receipt)}
                }]
            }}]
        }
    # A browser acceptance fixture for the real Reader -> candidate-review ->
    # World promotion path.  The marker comes from a disposable authored turn;
    # it is never enabled by production configuration and never pretends to be
    # live-model evidence.  Its deliberately complete candidate lets the UI,
    # validators, translation reducer and persistence path run unchanged.
    if "[SIDECAR READER]" in text and "ACCEPTANCE_SCENEPULSE_LOCATION" in text:
        content = json.dumps({
            "mode": "full",
            "summary": "Seeded disposable ScenePulse location candidate for browser acceptance.",
            "changed_fields": ["scenePulse", "candidateStructures"],
            "semantic_interpretation": {
                "scene": {"topic": "location graduation fixture", "description": "A disposable browser-only place reading."},
                "scenePulse": {
                    "time": "10:15", "date": "Acceptance Day", "elapsed": "a moment",
                    "location": "Acceptance Archive", "weather": "clear", "temperature": "mild",
                    "sceneTopic": "location graduation", "sceneMood": "focused",
                    "sceneInteraction": "exploration", "sceneTension": "low",
                    "sceneSummary": "The player enters the Acceptance Archive.",
                    "soundEnvironment": "paper rustling", "witnesses": [], "charactersPresent": [],
                    "northStar": "Exercise the location-review seam.",
                    "mainQuests": [], "sideQuests": [], "plotBranches": [],
                    "relationships": [], "characters": []
                },
                "characterIntelligence": [{
                    "subjectRef": "player", "name": "Player", "relevance": "controlled",
                    "presence": {"mode": "active", "location": "Acceptance Archive"},
                    "activity": {"text": "The player authored the acceptance location fixture turn.", "epistemicKind": "user_explicit_action", "confidence": "high", "uncertainty": "", "evidence": "The visible player input."}
                }],
                "candidateStructures": [{
                    "candidateId": "candidate_acceptance_archive", "candidateType": "location", "label": "Acceptance Archive",
                    "description": "A quiet public archive with a map wall and labelled stacks.", "status": "accepted", "presence": "active",
                    "details": {"region": "Acceptance District", "mapType": "building", "floor": "Ground floor"},
                    "evidence": [{"text": "The authored acceptance beat places the player inside the Acceptance Archive."}]
                }]
            },
            "unresolved": [], "proposed_questions": [], "time_evidence": {},
            "controlled_character_evidence": []
        })
    elif "[SIDECAR READER]" in text and "ACCEPTANCE_SCENEPULSE_CANDIDATE" in text:
        content = json.dumps({
            "mode": "full",
            "summary": "Seeded disposable ScenePulse candidate for browser acceptance.",
            "changed_fields": ["scenePulse", "candidateStructures"],
            "semantic_interpretation": {
                "scene": {"topic": "acceptance fixture", "description": "A disposable browser-only scene."},
                "scenePulse": {
                    "time": "09:00", "date": "Acceptance Day", "elapsed": "a moment",
                    "location": "Acceptance Square", "weather": "clear", "temperature": "mild",
                    "sceneTopic": "candidate promotion", "sceneMood": "focused",
                    "sceneInteraction": "conversation", "sceneTension": "low",
                    "sceneSummary": "Mira offers a sealed letter in Acceptance Square.",
                    "soundEnvironment": "quiet street", "witnesses": [],
                    # ScenePulse's source renderer uses human display names
                    # for its active roster. The opaque candidate ID remains
                    # in the character/relationship records for the Horde
                    # translation boundary; using it here would make the
                    # upstream display filter correctly hide Mira.
                    "charactersPresent": ["Mira"], "northStar": "Exercise the durable-review seam.",
                    "mainQuests": [], "sideQuests": [], "plotBranches": [],
                    "relationships": [{
                        "relationshipId": "rel_mira", "characterId": "candidate_mira", "name": "Mira",
                        "relType": "Ally", "relPhase": "Wary", "timeTogether": "3 weeks",
                        "milestone": "Offered a sealed letter", "affection": 5, "affectionLabel": "warming",
                        "trust": 38, "trustLabel": "building", "desire": 0, "desireLabel": "none",
                        "stress": 55, "stressLabel": "moderate", "compatibility": 30,
                        "compatibilityLabel": "uncertain"
                    }],
                    "characters": [{
                        "characterId": "candidate_mira", "name": "Mira", "aliases": ["The Courier"],
                        "role": "Courier", "outfit": "rain-dark coat", "posture": "leaning close",
                        "proximity": "at the fountain", "notableDetails": "sealed letter and ink-stained gloves",
                        "inventory": ["sealed letter"], "fertStatus": "N/A",
                        "fertNotes": "No relevant state", "immediateNeed": "Hear the answer",
                        "shortTermGoal": "Leave unseen", "longTermGoal": "Clear her name"
                    }]
                },
                # The real Reader validator requires coverage for the
                # controlled character as well as the new candidate.  This
                # says only what the disposable authored input establishes;
                # it supplies no private thought or canonical mutation.
                "characterIntelligence": [{
                    "subjectRef": "player", "name": "Player", "relevance": "controlled",
                    "presence": {"mode": "active", "location": "Acceptance Square"},
                    "activity": {"text": "The player authored the acceptance fixture turn.", "epistemicKind": "user_explicit_action", "confidence": "high", "uncertainty": "", "evidence": "The visible player input."}
                }],
                "candidateStructures": [{
                    "candidateId": "candidate_mira", "candidateType": "character", "label": "Mira",
                    "role": "Courier", "description": "A rain-dark courier holding a sealed letter.",
                    "status": "accepted", "presence": "active", "clothingDescription": "rain-dark coat",
                    "details": {"outfit": "rain-dark coat", "posture": "leaning close", "proximity": "at the fountain", "notableDetails": "sealed letter and ink-stained gloves"},
                    "evidence": [{"text": "Mira offers a sealed letter in the authored acceptance beat."}]
                }]
            },
            "unresolved": [], "proposed_questions": [], "time_evidence": {},
            "controlled_character_evidence": []
        })
    elif temporal_fixture_enabled and "[SIDECAR READER]" not in text:
        # Reproduce the exact live-provider failure safely: after one accepted
        # narrator header at 6:33 PM on Day 1, a reroll returns 6:32 PM still
        # on Day 1. The browser acceptance test proves the runtime declines
        # to convert that provider regression into a 1,439-minute clock jump.
        temporal_fixture_calls += 1
        time = "6:33 PM" if temporal_fixture_calls == 1 else "6:32 PM"
        content = f"[ 🕰️ Time {time} | 🗓️ Day 1 - Friday, August 14, 2026 AD | 📍 Acceptance Square | ☁️ Clear, 54 °F ]\n\nCharlotte keeps the acceptance fixture at the bar while the same authored scene continues."
    else:
    # Valid compact JSON is useful for UI paths that request a structured
    # translation; ordinary narrator paths receive plain, labelled fixture
    # prose. Neither response asserts a live-model result.
        content = (json.dumps({
            "name": "Acceptance Location", "description": "Seeded mocked provider candidate.",
            "status": "settled", "confidence": "high",
        }) if "JSON" in text.upper() else "Mocked acceptance response. The fixture remains in its own timeline.")
    return {
        "id": "acceptance-mock", "object": "chat.completion", "created": 0,
        "model": str(body.get("model") or "acceptance-mock"),
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_: object) -> None:
        return

    def send_json(self, status: int, value: object) -> None:
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(raw)

    def send_stream(self, value: dict[str, object]) -> None:
        choice = value["choices"][0]
        message = choice["message"]
        tool_calls = message.get("tool_calls") if isinstance(message, dict) else None
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        if isinstance(tool_calls, list) and tool_calls:
            # Receipt settlement is a native streamed tool call. Preserve that
            # OpenAI-compatible shape so the browser takes its real parser,
            # validator, and commit path rather than seeing empty prose.
            delta = {"role": "assistant", "tool_calls": []}
            for index, call in enumerate(tool_calls):
                function = call.get("function") if isinstance(call, dict) else {}
                delta["tool_calls"].append({
                    "index": index,
                    "id": str(call.get("id") or f"acceptance-tool-{index}"),
                    "type": "function",
                    "function": {
                        "name": str(function.get("name") or ""),
                        "arguments": str(function.get("arguments") or ""),
                    },
                })
            event = {"choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
            self.wfile.write(f"data: {json.dumps(event)}\n\n".encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            return
        content = str(message.get("content") or "") if isinstance(message, dict) else ""
        chunks = [content[:max(1, len(content) // 2)], content[max(1, len(content) // 2):]]
        for chunk in chunks:
            event = {"choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}]}
            self.wfile.write(f"data: {json.dumps(event)}\n\n".encode())
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def do_OPTIONS(self) -> None:
        self.send_json(204, {})

    def do_GET(self) -> None:
        if self.path == "/v1/models":
            return self.send_json(200, {"object": "list", "data": [{"id": "acceptance-mock", "object": "model"}]})
        if self.path == "/audit":
            return self.send_json(200, {"requests": audit})
        self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        global temporal_fixture_calls, temporal_fixture_enabled, delay_next_request
        if self.path == "/temporal-reset":
            temporal_fixture_calls = 0
            temporal_fixture_enabled = True
            return self.send_json(200, {"temporal_fixture": "armed"})
        if self.path == "/delay-next":
            delay_next_request = True
            release.clear()
            return self.send_json(200, {"delay_next": "armed"})
        if self.path == "/release":
            release.set()
            return self.send_json(200, {"released": True})
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path != "/v1/chat/completions":
            return self.send_json(404, {"error": "not found"})
        messages = body.get("messages") if isinstance(body.get("messages"), list) else []
        # The real Worlds narrator assembles the authored turn into its
        # complete provider prompt; it is not guaranteed to remain a literal
        # ``role: user`` message by the time it reaches an OpenAI-compatible
        # transport.  This mock therefore detects its disposable marker in
        # the same complete request string used by ``completion`` above.
        request_text = " ".join(str(item.get("content") or "") for item in messages if isinstance(item, dict))
        delayed = delay_next_request or "ACCEPTANCE_DELAY" in request_text
        if delay_next_request:
            delay_next_request = False
        audit.append({
            "path": self.path,
            "delayed": delayed,
            "stream": body.get("stream") is True,
            "model": str(body.get("model") or ""),
            # Classification only: acceptance evidence must distinguish the
            # real Narrator and Reader calls without retaining their prompts.
            "reader": "[SIDECAR READER]" in " ".join(str(item.get("content") or "") for item in messages if isinstance(item, dict)),
            "candidate_marker": "ACCEPTANCE_SCENEPULSE_CANDIDATE" in " ".join(str(item.get("content") or "") for item in messages if isinstance(item, dict)),
            "temporal_marker": "ACCEPTANCE_TEMPORAL_SAME_DAY_ROLLBACK" in request_text,
        })
        if delayed:
            release.wait(30)
        result = completion(body)
        if body.get("stream") is True:
            return self.send_stream(result)
        self.send_json(200, result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Disposable Horde Studio acceptance mock")
    parser.add_argument("--port", type=int, default=43200)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
