#!/usr/bin/env python3
"""Disposable OpenAI-compatible transport for browser acceptance runs.

It never leaves localhost, records only endpoint names and request classes, and
can hold one marked chat completion until ``POST /release``. It is deliberately
not a production provider or a substitute for live-model verification.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


release = threading.Event()
audit: list[dict[str, object]] = []


def completion(body: dict[str, object]) -> dict[str, object]:
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    text = " ".join(str(item.get("content") or "") for item in messages if isinstance(item, dict))
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
        content = str(value["choices"][0]["message"]["content"])
        chunks = [content[:max(1, len(content) // 2)], content[max(1, len(content) // 2):]]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
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
        if self.path == "/release":
            release.set()
            return self.send_json(200, {"released": True})
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path != "/v1/chat/completions":
            return self.send_json(404, {"error": "not found"})
        messages = body.get("messages") if isinstance(body.get("messages"), list) else []
        user_text = " ".join(str(item.get("content") or "") for item in messages if isinstance(item, dict) and item.get("role") == "user")
        delayed = "ACCEPTANCE_DELAY" in user_text
        audit.append({"path": self.path, "delayed": delayed, "stream": body.get("stream") is True, "model": str(body.get("model") or "")})
        if delayed:
            release.wait(30)
        result = completion(body)
        if body.get("stream") is True:
            return self.send_stream(result)
        self.send_json(200, result)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 43200), Handler).serve_forever()
