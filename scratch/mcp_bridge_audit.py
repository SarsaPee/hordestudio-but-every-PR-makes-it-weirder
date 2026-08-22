#!/usr/bin/env python3
"""Offline contract checks for the Horde Studio localhost MCP bridge."""

import base64
import errno
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import horde_mcp_bridge as bridge


class McpBridgeAudit(unittest.TestCase):
    def test_bundled_companion_media_is_public_and_present(self):
        media_roots = dict(bridge.STATIC_MEDIA_ROOTS)
        self.assertIn("/assets/bundled/", media_roots)
        ashlyn = media_roots["/assets/bundled/"] / "ashlyn-media"
        self.assertTrue((ashlyn / "01.jpg").is_file())
        self.assertTrue((ashlyn / "16.mp4").is_file())
        self.assertNotIn("/assets/bundled/ashlyn-social/", media_roots)

    def test_launcher_serves_every_labs_runtime_asset(self):
        expected = {
            "/labs-embedded.js",
            "/labs-embedded-worker.js",
            "/labs-needle.js",
            "/labs-needle-worker.js",
            "/labs-core.js",
            "/labs-tasks.js",
            "/labs-ui.js",
        }
        self.assertTrue(expected.issubset(bridge.STATIC_FILES))
        for path in expected:
            filename, content_type = bridge.STATIC_FILES[path]
            self.assertEqual(content_type, "text/javascript")
            self.assertTrue((bridge.APP_DIR / filename).is_file())

    @mock.patch.object(bridge, "http_request")
    @mock.patch.object(bridge, "ThreadingHTTPServer")
    def test_relaunch_reuses_an_existing_horde_bridge(self, server, request):
        server.side_effect = OSError(errno.EADDRINUSE, "busy")
        request.return_value = (
            200,
            {"Content-Type": "application/json"},
            json.dumps({
                "service": "Horde Studio MCP Bridge",
                "build": bridge.BRIDGE_BUILD,
                "appInstance": bridge.APP_INSTANCE_ID,
            }).encode(),
        )
        with mock.patch.object(sys, "argv", ["horde_mcp_bridge.py"]):
            bridge.main()

    @mock.patch.object(bridge, "http_request")
    @mock.patch.object(bridge, "ThreadingHTTPServer")
    def test_relaunch_refuses_an_unrelated_service_on_the_port(self, server, request):
        server.side_effect = OSError(errno.EADDRINUSE, "busy")
        request.return_value = (
            200,
            {"Content-Type": "application/json"},
            json.dumps({"service": "Something Else"}).encode(),
        )
        with mock.patch.object(sys, "argv", ["horde_mcp_bridge.py"]):
            with self.assertRaises(RuntimeError):
                bridge.main()

    def test_local_image_urls_are_restricted_to_the_local_network(self):
        self.assertEqual(
            bridge.loopback_base_url("http://localhost:8188/", 8188),
            "http://localhost:8188",
        )
        self.assertEqual(
            bridge.loopback_base_url("http://192.168.1.42:8188/", 8188),
            "http://192.168.1.42:8188",
        )
        self.assertEqual(
            bridge.loopback_base_url("http://[fd12:3456::42]:8188/", 8188),
            "http://[fd12:3456::42]:8188",
        )
        with self.assertRaises(ValueError):
            bridge.loopback_base_url("https://example.com/v1", 7860)
        with self.assertRaises(ValueError):
            bridge.loopback_base_url("https://8.8.8.8:8188", 8188)
        with self.assertRaises(ValueError):
            bridge.loopback_base_url("http://169.254.169.254:8188", 8188)

    @mock.patch.object(bridge.socket, "getaddrinfo")
    def test_generated_media_proxy_is_https_global_and_provider_scoped(self, lookup):
        lookup.return_value = [(2, 1, 6, "", ("93.184.216.34", 443))]
        self.assertEqual(
            bridge.safe_remote_image_url("https://cdn.gptproto.com/jobs/output.png?sig=1"),
            "https://cdn.gptproto.com/jobs/output.png?sig=1",
        )
        with self.assertRaises(ValueError):
            bridge.safe_remote_image_url("https://untrusted.example/output.png")
        with self.assertRaises(ValueError):
            bridge.safe_remote_image_url("http://gptproto.com/output.png")

    @mock.patch.object(bridge.socket, "getaddrinfo")
    def test_generated_media_proxy_rejects_private_dns_results(self, lookup):
        lookup.return_value = [(2, 1, 6, "", ("127.0.0.1", 443))]
        with self.assertRaises(ValueError):
            bridge.safe_remote_image_url("https://gptproto.com/output.png")

    def test_workflow_mapping_prefers_positive_prompt(self):
        workflow = {
            "1": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Negative Prompt"},
                "inputs": {"text": "bad"},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Positive Prompt"},
                "inputs": {"text": "old"},
            },
        }
        node, field = bridge.detect_workflow_input(
            workflow, {"CLIPTextEncode"}, ["text"]
        )
        self.assertEqual((node, field), ("2", "text"))
        self.assertTrue(bridge.set_workflow_input(workflow, node, field, "new"))
        self.assertEqual(workflow["2"]["inputs"]["text"], "new")

    @mock.patch.object(bridge, "download_image", return_value="data:image/png;base64,result")
    @mock.patch.object(bridge.time, "sleep")
    @mock.patch.object(bridge, "json_request")
    def test_comfy_generation_queues_polls_and_fetches_output(
        self, request, _sleep, download
    ):
        def response(url, method="GET", headers=None, payload=None, timeout=120):
            if url.endswith("/prompt"):
                self.assertEqual(payload["prompt"]["2"]["inputs"]["text"], "new scene")
                return 200, {}, {"prompt_id": "job-1"}
            if "/history/job-1" in url:
                return 200, {}, {
                    "job-1": {
                        "outputs": {
                            "9": {
                                "images": [{
                                    "filename": "out.png",
                                    "subfolder": "",
                                    "type": "output",
                                }]
                            }
                        }
                    }
                }
            raise AssertionError(url)

        request.side_effect = response
        result = bridge.comfy_generate({
            "baseUrl": "http://127.0.0.1:8188",
            "prompt": "new scene",
            "workflow": {
                "2": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {"text": "old"},
                }
            },
        })
        self.assertEqual(result, "data:image/png;base64,result")
        self.assertIn("/view?", download.call_args.args[0])

    @mock.patch.object(bridge, "json_request")
    def test_openai_compatible_local_image_accepts_base64(self, request):
        request.return_value = 200, {}, {
            "data": [{"b64_json": base64.b64encode(b"image").decode()}]
        }
        result = bridge.openai_local_generate({
            "baseUrl": "http://127.0.0.1:7860/v1",
            "path": "/images/generations",
            "payload": {"model": "local-model", "prompt": "portrait"},
        })
        self.assertTrue(result.startswith("data:image/png;base64,"))
        self.assertEqual(
            request.call_args.args[0],
            "http://127.0.0.1:7860/v1/images/generations",
        )

    def test_www_authenticate_resource_metadata(self):
        value = 'Bearer realm="mcp", resource_metadata="https://example.test/meta"'
        self.assertEqual(bridge.parse_www_authenticate(value), "https://example.test/meta")

    def test_well_known_candidates_keep_mcp_path(self):
        candidates = bridge.well_known_candidates(
            "https://provider.test/mcp", "oauth-protected-resource"
        )
        self.assertIn(
            "https://provider.test/.well-known/oauth-protected-resource/mcp",
            candidates,
        )

    def test_json_and_sse_mcp_responses(self):
        payload = {"jsonrpc": "2.0", "id": 9, "result": {"tools": []}}
        self.assertEqual(
            bridge.parse_mcp_body(
                {"Content-Type": "application/json"}, json.dumps(payload).encode(), 9
            ),
            {"tools": []},
        )
        sse = (
            b'event: message\n'
            b'data: {"jsonrpc":"2.0","id":9,"result":{"tools":[{"name":"image"}]}}\n\n'
        )
        result = bridge.parse_mcp_body(
            {"content-type": "text/event-stream"}, sse, 9
        )
        self.assertEqual(result["tools"][0]["name"], "image")

    def test_embedded_image_wins_without_network_download(self):
        raw = base64.b64encode(b"fake-png").decode()
        image, source = bridge.result_image({
            "content": [
                {"type": "text", "text": "Docs: https://provider.test/docs"},
                {"type": "image", "mimeType": "image/png", "data": raw},
            ]
        })
        self.assertEqual(source, "embedded")
        self.assertEqual(image, f"data:image/png;base64,{raw}")

    @mock.patch.object(bridge, "http_request")
    def test_result_image_skips_non_image_links(self, request):
        def response(url, *args, **kwargs):
            if url.endswith("/docs"):
                return 200, {"Content-Type": "text/html"}, b"<html>docs</html>"
            return 200, {"Content-Type": "image/jpeg"}, b"jpeg"

        request.side_effect = response
        image, source = bridge.result_image({
            "content": [{
                "type": "text",
                "text": "Docs https://provider.test/docs image https://cdn.test/output",
            }]
        })
        self.assertEqual(source, "https://cdn.test/output")
        self.assertTrue(image.startswith("data:image/jpeg;base64,"))

    def test_auth_store_is_owner_only_and_disconnect_removes_provider(self):
        with tempfile.TemporaryDirectory() as directory:
            auth_file = Path(directory) / "mcp-auth.json"
            with mock.patch.object(bridge, "CONFIG_DIR", Path(directory)), \
                    mock.patch.object(bridge, "AUTH_FILE", auth_file):
                bridge.update_provider_record("higgsfield", {
                    "tokens": {"access_token": "secret"}
                })
                self.assertEqual(
                    auth_file.stat().st_mode & 0o777,
                    0o600,
                )
                bridge.update_provider_record("higgsfield", None)
                self.assertNotIn(
                    "higgsfield",
                    bridge.load_store().get("providers", {}),
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
