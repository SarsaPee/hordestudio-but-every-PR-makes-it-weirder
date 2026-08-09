#!/usr/bin/env python3
"""Local MCP client bridge for Horde Studio.

The browser app never receives provider OAuth tokens. This process binds only
to 127.0.0.1, performs MCP/OAuth on the user's behalf, discovers tool schemas,
and converts returned image URLs/content into stable data URLs.
"""

from __future__ import annotations

import base64
import errno
import hashlib
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import socket
import stat
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = "127.0.0.1"
PORT = int(os.environ.get("HORDE_MCP_PORT", "43127"))
CALLBACK_URL = f"http://{HOST}:{PORT}/oauth/callback"
CLIENT_NAME = "Horde Studio Local MCP Bridge"
APP_DIR = Path(__file__).resolve().parent
MAX_RESPONSE_BYTES = 40 * 1024 * 1024
ALLOWED_ORIGINS = {
    "http://localhost:4173", "http://127.0.0.1:4173",
    "http://localhost:8000", "http://127.0.0.1:8000",
}
PROVIDERS = {
    "higgsfield": {
        "label": "Higgsfield",
        "endpoint": "https://mcp.higgsfield.ai/mcp",
        "docs": "https://higgsfield.ai/mcp",
    },
    "magnific": {
        "label": "Magnific",
        "endpoint": "https://mcp.magnific.com",
        "docs": "https://www.magnific.com/ai/docs/magnific-mcp",
    },
}
STATIC_FILES = {
    "/": ("index.html", "text/html"),
    "/index.html": ("index.html", "text/html"),
    "/style.css": ("style.css", "text/css"),
    "/app.js": ("app.js", "text/javascript"),
    "/presets.js": ("presets.js", "text/javascript"),
    "/boot-diagnostics.js": ("boot-diagnostics.js", "text/javascript"),
    "/policy-panic-world.js": ("policy-panic-world.js", "text/javascript"),
    "/labs-embedded.js": ("labs-embedded.js", "text/javascript"),
    "/labs-embedded-worker.js": ("labs-embedded-worker.js", "text/javascript"),
    "/labs-core.js": ("labs-core.js", "text/javascript"),
    "/labs-tasks.js": ("labs-tasks.js", "text/javascript"),
    "/labs-ui.js": ("labs-ui.js", "text/javascript"),
    "/labs-guide.js": ("labs-guide.js", "text/javascript"),
    "/help-system.js": ("help-system.js", "text/javascript"),
    "/favicon.svg": ("favicon.svg", "image/svg+xml"),
    "/worlds/policy-panic.horde_world": ("Policy Panic at Bramble and Pike.horde_world", "application/json"),
    "/Start%20Horde%20Studio.command": ("Start Horde Studio.command", "application/octet-stream"),
    "/Start%20Horde%20Studio.bat": ("Start Horde Studio.bat", "application/octet-stream"),
    "/start-horde-studio.sh": ("start-horde-studio.sh", "application/octet-stream"),
}

if os.name == "nt":
    CONFIG_DIR = Path(os.environ.get("APPDATA", Path.home())) / "Horde Studio"
elif os.uname().sysname == "Darwin":
    CONFIG_DIR = Path.home() / "Library" / "Application Support" / "Horde Studio"
else:
    CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "horde-studio"
AUTH_FILE = CONFIG_DIR / "mcp-auth.json"

store_lock = threading.RLock()
pending_auth: dict[str, dict[str, Any]] = {}
mcp_sessions: dict[str, dict[str, str]] = {}


def load_store() -> dict[str, Any]:
    with store_lock:
        try:
            value = json.loads(AUTH_FILE.read_text("utf-8"))
            return value if isinstance(value, dict) else {"providers": {}}
        except (OSError, ValueError):
            return {"providers": {}}


def save_store(value: dict[str, Any]) -> None:
    with store_lock:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        temporary = AUTH_FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, indent=2), "utf-8")
        try:
            os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
        temporary.replace(AUTH_FILE)


def provider_record(provider_id: str) -> dict[str, Any]:
    return load_store().get("providers", {}).get(provider_id, {})


def update_provider_record(provider_id: str, patch: dict[str, Any] | None) -> None:
    value = load_store()
    providers = value.setdefault("providers", {})
    if patch is None:
        providers.pop(provider_id, None)
    else:
        providers[provider_id] = {**providers.get(provider_id, {}), **patch}
    save_store(value)


def read_limited(response: Any) -> bytes:
    length = response.headers.get("Content-Length")
    if length and int(length) > MAX_RESPONSE_BYTES:
        raise RuntimeError("Provider response exceeded the 40 MB safety limit.")
    data = response.read(MAX_RESPONSE_BYTES + 1)
    if len(data) > MAX_RESPONSE_BYTES:
        raise RuntimeError("Provider response exceeded the 40 MB safety limit.")
    return data


def http_request(
    url: str, method: str = "GET", headers: dict[str, str] | None = None,
    body: bytes | None = None, timeout: int = 120
) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers.items()), read_limited(response)
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers.items()), read_limited(error)


def json_request(
    url: str, method: str = "GET", headers: dict[str, str] | None = None,
    payload: Any = None, timeout: int = 120
) -> tuple[int, dict[str, str], Any]:
    request_headers = {"Accept": "application/json", **(headers or {})}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode()
        request_headers["Content-Type"] = "application/json"
    status, response_headers, raw = http_request(url, method, request_headers, body, timeout)
    try:
        return status, response_headers, json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, ValueError):
        return status, response_headers, {"raw": raw.decode("utf-8", "replace")}


def parse_www_authenticate(value: str) -> str:
    match = re.search(r'(?:resource_metadata|resource_metadata_url)="([^"]+)"', value or "", re.I)
    return match.group(1) if match else ""


def well_known_candidates(base: str, kind: str) -> list[str]:
    parsed = urllib.parse.urlparse(base)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path.rstrip("/")
    return list(dict.fromkeys([
        f"{origin}/.well-known/{kind}{path}",
        f"{origin}/.well-known/{kind}",
        f"{base.rstrip('/')}/.well-known/{kind}",
    ]))


def fetch_first_json(urls: list[str]) -> tuple[str, dict[str, Any]]:
    for url in urls:
        status, _, data = json_request(url)
        if 200 <= status < 300 and isinstance(data, dict):
            return url, data
    raise RuntimeError(f"Could not discover OAuth metadata from {urls[0]}.")


def discover_oauth(provider_id: str) -> dict[str, Any]:
    endpoint = PROVIDERS[provider_id]["endpoint"]
    probe_payload = {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-11-25", "capabilities": {},
            "clientInfo": {"name": CLIENT_NAME, "version": "1.0"},
        },
    }
    status, headers, _ = json_request(endpoint, "POST", {
        "Accept": "application/json, text/event-stream",
    }, probe_payload)
    auth_header = next((value for key, value in headers.items() if key.lower() == "www-authenticate"), "")
    resource_url = parse_www_authenticate(auth_header)
    if resource_url:
        _, resource = fetch_first_json([resource_url])
    else:
        _, resource = fetch_first_json(well_known_candidates(endpoint, "oauth-protected-resource"))
    servers = resource.get("authorization_servers") or resource.get("authorizationServers") or []
    if not servers:
        raise RuntimeError("The MCP server did not advertise an OAuth authorization server.")
    authorization_server = str(servers[0]).rstrip("/")
    _, metadata = fetch_first_json(well_known_candidates(authorization_server, "oauth-authorization-server"))
    if not metadata.get("authorization_endpoint") or not metadata.get("token_endpoint"):
        raise RuntimeError("OAuth metadata is missing its authorization or token endpoint.")
    return {
        "resource": resource.get("resource", endpoint),
        "authorizationServer": authorization_server,
        "metadata": metadata,
    }


def register_client(metadata: dict[str, Any]) -> dict[str, Any]:
    endpoint = metadata.get("registration_endpoint")
    if not endpoint:
        raise RuntimeError("This provider does not support automatic MCP client registration.")
    status, _, result = json_request(endpoint, "POST", payload={
        "client_name": CLIENT_NAME,
        "client_uri": f"http://{HOST}:{PORT}",
        "redirect_uris": [CALLBACK_URL],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    })
    if not 200 <= status < 300 or not result.get("client_id"):
        message = result.get("error_description") or result.get("error") or f"registration failed ({status})"
        raise RuntimeError(f"OAuth client registration failed: {message}")
    return result


def begin_oauth(provider_id: str) -> str:
    discovery = discover_oauth(provider_id)
    existing = provider_record(provider_id)
    client = existing.get("client") if isinstance(existing.get("client"), dict) else {}
    if not client.get("client_id"):
        client = register_client(discovery["metadata"])
    state_token = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(72)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    pending_auth[state_token] = {
        "provider": provider_id, "verifier": verifier, "created": time.time(),
        "discovery": discovery, "client": client,
    }
    update_provider_record(provider_id, {
        "client": client,
        "authorizationServer": discovery["authorizationServer"],
        "resource": discovery["resource"],
        "oauthMetadata": discovery["metadata"],
    })
    scope = discovery["metadata"].get("scopes_supported") or []
    params = {
        "response_type": "code",
        "client_id": client["client_id"],
        "redirect_uri": CALLBACK_URL,
        "state": state_token,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": discovery["resource"],
    }
    if scope:
        params["scope"] = " ".join(scope)
    return discovery["metadata"]["authorization_endpoint"] + "?" + urllib.parse.urlencode(params)


def exchange_code(state_token: str, code: str) -> str:
    pending = pending_auth.pop(state_token, None)
    if not pending or time.time() - pending["created"] > 900:
        raise RuntimeError("This authorization attempt expired. Return to Horde Studio and connect again.")
    client = pending["client"]
    metadata = pending["discovery"]["metadata"]
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": CALLBACK_URL,
        "client_id": client["client_id"],
        "code_verifier": pending["verifier"],
        "resource": pending["discovery"]["resource"],
    }
    if client.get("client_secret"):
        form["client_secret"] = client["client_secret"]
    status, _, raw = http_request(
        metadata["token_endpoint"], "POST",
        {"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        urllib.parse.urlencode(form).encode(), 60,
    )
    try:
        tokens = json.loads(raw.decode())
    except (UnicodeDecodeError, ValueError):
        tokens = {}
    if not 200 <= status < 300 or not tokens.get("access_token"):
        message = tokens.get("error_description") or tokens.get("error") or f"token exchange failed ({status})"
        raise RuntimeError(f"Provider authorization failed: {message}")
    expires_in = int(tokens.get("expires_in") or 3600)
    update_provider_record(pending["provider"], {
        "tokens": {**tokens, "expires_at": int(time.time()) + expires_in - 30},
        "connectedAt": int(time.time()),
    })
    mcp_sessions.pop(pending["provider"], None)
    return pending["provider"]


def refresh_access_token(provider_id: str) -> str:
    record = provider_record(provider_id)
    tokens = record.get("tokens") or {}
    if tokens.get("access_token") and int(tokens.get("expires_at") or 0) > time.time():
        return tokens["access_token"]
    refresh_token = tokens.get("refresh_token")
    metadata = record.get("oauthMetadata") or {}
    client = record.get("client") or {}
    if not tokens.get("access_token") and not refresh_token:
        raise PermissionError("Provider is not connected. Connect it in Settings.")
    if not refresh_token or not metadata.get("token_endpoint"):
        raise PermissionError("Provider connection expired. Connect it again in Settings.")
    form = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client.get("client_id", ""),
        "resource": record.get("resource", PROVIDERS[provider_id]["endpoint"]),
    }
    if client.get("client_secret"):
        form["client_secret"] = client["client_secret"]
    status, _, raw = http_request(
        metadata["token_endpoint"], "POST",
        {"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        urllib.parse.urlencode(form).encode(), 60,
    )
    try:
        fresh = json.loads(raw.decode())
    except (UnicodeDecodeError, ValueError):
        fresh = {}
    if not 200 <= status < 300 or not fresh.get("access_token"):
        raise PermissionError("Provider connection expired. Connect it again in Settings.")
    merged = {**tokens, **fresh, "expires_at": int(time.time()) + int(fresh.get("expires_in") or 3600) - 30}
    update_provider_record(provider_id, {"tokens": merged})
    return merged["access_token"]


def parse_mcp_body(headers: dict[str, str], raw: bytes, request_id: int | str | None) -> dict[str, Any]:
    content_type = next((value for key, value in headers.items() if key.lower() == "content-type"), "")
    text = raw.decode("utf-8", "replace")
    candidates: list[dict[str, Any]] = []
    if "text/event-stream" in content_type:
        for line in text.splitlines():
            if not line.startswith("data:"):
                continue
            try:
                value = json.loads(line[5:].strip())
                if isinstance(value, dict):
                    candidates.append(value)
            except ValueError:
                continue
    else:
        try:
            value = json.loads(text) if text else {}
            if isinstance(value, dict):
                candidates.append(value)
        except ValueError:
            pass
    result = next((item for item in candidates if request_id is None or item.get("id") == request_id), None)
    if not result:
        raise RuntimeError("The MCP provider returned no usable JSON-RPC response.")
    if result.get("error"):
        error = result["error"]
        raise RuntimeError(error.get("message") if isinstance(error, dict) else str(error))
    return result.get("result") or {}


def mcp_post(provider_id: str, payload: dict[str, Any], timeout: int = 180) -> tuple[dict[str, Any], dict[str, str]]:
    token = refresh_access_token(provider_id)
    endpoint = PROVIDERS[provider_id]["endpoint"]
    session = mcp_sessions.get(provider_id, {})
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    if session.get("id"):
        headers["Mcp-Session-Id"] = session["id"]
    status, response_headers, raw = http_request(
        endpoint, "POST", headers, json.dumps(payload).encode(), timeout
    )
    if status == 401:
        record = provider_record(provider_id)
        tokens = record.get("tokens") or {}
        tokens["expires_at"] = 0
        update_provider_record(provider_id, {"tokens": tokens})
        token = refresh_access_token(provider_id)
        headers["Authorization"] = f"Bearer {token}"
        status, response_headers, raw = http_request(
            endpoint, "POST", headers, json.dumps(payload).encode(), timeout
        )
    if not 200 <= status < 300:
        detail = raw.decode("utf-8", "replace")[:2000]
        raise RuntimeError(f"MCP request failed ({status}): {detail}")
    session_id = next((value for key, value in response_headers.items() if key.lower() == "mcp-session-id"), "")
    if session_id:
        mcp_sessions.setdefault(provider_id, {})["id"] = session_id
    if payload.get("id") is None:
        return {}, response_headers
    return parse_mcp_body(response_headers, raw, payload.get("id")), response_headers


def ensure_mcp(provider_id: str) -> None:
    if mcp_sessions.get(provider_id, {}).get("initialized"):
        return
    result, _ = mcp_post(provider_id, {
        "jsonrpc": "2.0", "id": secrets.randbelow(1_000_000), "method": "initialize",
        "params": {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": CLIENT_NAME, "version": "1.0"},
        },
    }, 60)
    if not result.get("serverInfo"):
        raise RuntimeError("The remote endpoint did not complete the MCP handshake.")
    mcp_post(provider_id, {
        "jsonrpc": "2.0", "method": "notifications/initialized", "params": {}
    }, 30)
    mcp_sessions.setdefault(provider_id, {})["initialized"] = "yes"


def list_tools(provider_id: str) -> list[dict[str, Any]]:
    ensure_mcp(provider_id)
    result, _ = mcp_post(provider_id, {
        "jsonrpc": "2.0", "id": secrets.randbelow(1_000_000),
        "method": "tools/list", "params": {},
    }, 60)
    tools = result.get("tools") or []
    return tools if isinstance(tools, list) else []


def call_tool(provider_id: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    ensure_mcp(provider_id)
    result, _ = mcp_post(provider_id, {
        "jsonrpc": "2.0", "id": secrets.randbelow(1_000_000),
        "method": "tools/call", "params": {"name": name, "arguments": arguments},
    }, 300)
    if result.get("isError"):
        text = " ".join(str(item.get("text", "")) for item in result.get("content", []) if isinstance(item, dict))
        raise RuntimeError(text or "The MCP image tool reported a failure.")
    return result


def walk_values(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_values(child)


def result_image(result: dict[str, Any]) -> tuple[str, str]:
    download_candidates: list[str] = []
    for item in walk_values(result):
        item_type = str(item.get("type", "")).lower()
        data = item.get("data")
        mime = str(item.get("mimeType") or item.get("mime_type") or "")
        if item_type == "image" and isinstance(data, str) and data:
            return f"data:{mime or 'image/png'};base64,{data}", "embedded"
        for key in ("url", "uri", "image_url", "imageUrl", "download_url", "downloadUrl"):
            candidate = item.get(key)
            if isinstance(candidate, str) and re.match(r"^https?://", candidate):
                download_candidates.append(candidate)
        text = item.get("text")
        if isinstance(text, str):
            data_match = re.search(r"data:image/[^;\s]+;base64,[A-Za-z0-9+/=\s]+", text)
            if data_match:
                return re.sub(r"\s+", "", data_match.group(0)), "embedded-text"
            download_candidates.extend(
                match.rstrip(".,]") for match in re.findall(r"https?://[^\s<>()\"']+", text)
            )
    errors: list[str] = []
    for candidate in dict.fromkeys(download_candidates):
        try:
            return download_image(candidate), candidate
        except RuntimeError as error:
            errors.append(str(error))
    if errors:
        raise RuntimeError(
            "The MCP tool returned links, but none were downloadable images. "
            + errors[-1]
        )
    raise RuntimeError("The MCP tool completed without returning an image or downloadable image URL.")


def download_image(url: str) -> str:
    status, headers, data = http_request(url, headers={
        "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
        "User-Agent": "Mozilla/5.0 HordeStudio/12.0",
    }, timeout=120)
    if not 200 <= status < 300:
        raise RuntimeError(f"Could not download the generated image ({status}).")
    content_type = next((value for key, value in headers.items() if key.lower() == "content-type"), "")
    mime = content_type.split(";")[0].strip()
    if not mime.startswith("image/"):
        guessed = mimetypes.guess_type(urllib.parse.urlparse(url).path)[0]
        if not guessed or not guessed.startswith("image/"):
            raise RuntimeError(f"The returned URL was not an image (content type: {mime or 'unknown'}).")
        mime = guessed
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def safe_remote_image_url(value: Any) -> str:
    """Validate browser-inaccessible provider media before proxying it.

    This endpoint is deliberately narrower than a general URL fetcher. It only
    accepts HTTPS assets from providers Horde Studio already talks to and
    refuses credentials, fragments, localhost and private/reserved addresses.
    """
    url = str(value or "").strip()
    parsed = urllib.parse.urlparse(url)
    hostname = (parsed.hostname or "").lower().rstrip(".")
    trusted_suffixes = ("gptproto.com", "openrouter.ai")
    if parsed.scheme != "https" or not hostname or parsed.username or parsed.password:
        raise ValueError("Generated image URLs must be credential-free HTTPS URLs.")
    if not any(hostname == suffix or hostname.endswith("." + suffix) for suffix in trusted_suffixes):
        raise ValueError("That generated image host is not on Horde Studio's provider allowlist.")
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
    except OSError as error:
        raise ValueError("The generated image host could not be resolved.") from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("Generated image URLs may not resolve to a private or reserved address.")
    return url


def loopback_base_url(value: Any, default_port: int) -> str:
    candidate = str(value or f"http://127.0.0.1:{default_port}").strip().rstrip("/")
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Local image endpoints must use localhost, 127.0.0.1, or ::1.")
    return candidate


def multipart_image(data_url: str, filename: str = "horde-reference.png") -> tuple[bytes, str]:
    match = re.match(r"^data:([^;,]+);base64,([\s\S]+)$", str(data_url or ""), re.I)
    if not match:
        raise ValueError("ComfyUI references must be base64 data images.")
    image = base64.b64decode(match.group(2), validate=False)
    boundary = "----HordeStudio" + secrets.token_hex(12)
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {match.group(1)}\r\n\r\n".encode() + image,
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\ninput".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue".encode(),
        f"--{boundary}--".encode(),
    ]
    return b"\r\n".join(parts) + b"\r\n", boundary


def set_workflow_input(workflow: dict[str, Any], node_id: str, input_name: str, value: Any) -> bool:
    node = workflow.get(str(node_id))
    if not isinstance(node, dict) or not isinstance(node.get("inputs"), dict):
        return False
    node["inputs"][input_name] = value
    return True


def detect_workflow_input(workflow: dict[str, Any], class_names: set[str], input_names: list[str]) -> tuple[str, str]:
    for allow_negative in (False, True):
        for node_id, node in workflow.items():
            if not isinstance(node, dict) or str(node.get("class_type", "")) not in class_names:
                continue
            title = str((node.get("_meta") or {}).get("title", "")).lower()
            if not allow_negative and "negative" in title:
                continue
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                continue
            for name in input_names:
                if name in inputs:
                    return str(node_id), name
    return "", ""


def comfy_generate(body: dict[str, Any]) -> str:
    base = loopback_base_url(body.get("baseUrl"), 8188)
    workflow = body.get("workflow")
    if not isinstance(workflow, dict) or not workflow:
        raise ValueError("Paste a ComfyUI workflow saved in API format.")
    workflow = json.loads(json.dumps(workflow))
    prompt = str(body.get("prompt") or "").strip()
    mapping = body.get("mapping") if isinstance(body.get("mapping"), dict) else {}
    prompt_node = str(mapping.get("promptNode") or "")
    prompt_input = str(mapping.get("promptInput") or "text")
    if not prompt_node:
        prompt_node, prompt_input = detect_workflow_input(
            workflow, {"CLIPTextEncode", "CLIPTextEncodeSDXL", "PrimitiveString"}, ["text", "value"]
        )
    if not prompt_node or not set_workflow_input(workflow, prompt_node, prompt_input, prompt):
        raise ValueError("Could not find the positive-prompt input. Configure its node ID and input name.")

    seed_node = str(mapping.get("seedNode") or "")
    seed_input = str(mapping.get("seedInput") or "seed")
    if not seed_node:
        seed_node, seed_input = detect_workflow_input(
            workflow, {"KSampler", "KSamplerAdvanced", "RandomNoise"}, ["seed", "noise_seed"]
        )
    if seed_node:
        set_workflow_input(workflow, seed_node, seed_input, int(body.get("seed") or secrets.randbelow(2**31)))

    reference = str(body.get("reference") or "")
    reference_node = str(mapping.get("referenceNode") or "")
    reference_input = str(mapping.get("referenceInput") or "image")
    if reference and reference_node:
        upload, boundary = multipart_image(reference)
        status, _, raw = http_request(
            base + "/upload/image", "POST",
            {"Accept": "application/json", "Content-Type": f"multipart/form-data; boundary={boundary}"},
            upload, 120,
        )
        uploaded = json.loads(raw.decode("utf-8")) if raw else {}
        if not 200 <= status < 300 or not uploaded.get("name"):
            raise RuntimeError(f"ComfyUI reference upload failed ({status}).")
        if not set_workflow_input(workflow, reference_node, reference_input, uploaded["name"]):
            raise ValueError("The configured ComfyUI reference node/input does not exist.")

    status, _, result = json_request(base + "/prompt", "POST", payload={"prompt": workflow}, timeout=60)
    if not 200 <= status < 300 or not result.get("prompt_id"):
        detail = result.get("error") or result.get("node_errors") or result
        raise RuntimeError(f"ComfyUI rejected the workflow: {detail}")
    prompt_id = str(result["prompt_id"])
    deadline = time.time() + 330
    while time.time() < deadline:
        time.sleep(0.75)
        history_status, _, history = json_request(
            base + "/history/" + urllib.parse.quote(prompt_id), timeout=30
        )
        if not 200 <= history_status < 300:
            continue
        job = history.get(prompt_id) if isinstance(history, dict) else None
        outputs = job.get("outputs") if isinstance(job, dict) else None
        if not isinstance(outputs, dict):
            continue
        for output in outputs.values():
            for image in (output.get("images") if isinstance(output, dict) else []) or []:
                if not isinstance(image, dict) or not image.get("filename"):
                    continue
                query = urllib.parse.urlencode({
                    "filename": image["filename"],
                    "subfolder": image.get("subfolder", ""),
                    "type": image.get("type", "output"),
                })
                return download_image(base + "/view?" + query)
        status_info = job.get("status") if isinstance(job, dict) else {}
        if isinstance(status_info, dict) and status_info.get("status_str") == "error":
            raise RuntimeError("ComfyUI workflow execution failed. Check its terminal for the failing node.")
    raise TimeoutError("ComfyUI generation timed out after 330 seconds.")


def openai_local_generate(body: dict[str, Any]) -> str:
    base = loopback_base_url(body.get("baseUrl"), 7860)
    path = "/" + str(body.get("path") or "images/generations").strip().lstrip("/")
    payload = body.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("Local image request payload is missing.")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    key = str(body.get("apiKey") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    status, _, result = json_request(base + path, "POST", headers, payload, 330)
    if not 200 <= status < 300:
        message = result.get("error") or result.get("message") or result
        raise RuntimeError(f"Local image server rejected the request ({status}): {message}")
    item = (result.get("data") or [{}])[0] if isinstance(result.get("data"), list) else {}
    url = item.get("url") if isinstance(item, dict) else ""
    encoded = item.get("b64_json") if isinstance(item, dict) else ""
    if encoded:
        return f"data:image/png;base64,{encoded}"
    if isinstance(url, str) and url.startswith("data:image/"):
        return url
    if isinstance(url, str) and re.match(r"^https?://", url):
        return download_image(url)
    raise RuntimeError("The local image server returned no image.")


def provider_status(provider_id: str, verify: bool = False) -> dict[str, Any]:
    record = provider_record(provider_id)
    connected = bool((record.get("tokens") or {}).get("access_token"))
    status = {
        "id": provider_id,
        "label": PROVIDERS[provider_id]["label"],
        "endpoint": PROVIDERS[provider_id]["endpoint"],
        "docs": PROVIDERS[provider_id]["docs"],
        "connected": connected,
        "connectedAt": record.get("connectedAt", 0),
    }
    if verify and connected:
        tools = list_tools(provider_id)
        status["toolCount"] = len(tools)
    return status


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "HordeMCPBridge/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[bridge] {self.address_string()} {fmt % args}")

    def origin_allowed(self) -> bool:
        origin = self.headers.get("Origin", "")
        if not origin:
            return True
        try:
            parsed = urllib.parse.urlparse(origin)
            return parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        except ValueError:
            return False

    def cors(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin and self.origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def respond(self, status: int, payload: Any, content_type: str = "application/json") -> None:
        raw = payload.encode() if isinstance(payload, str) else json.dumps(payload).encode()
        self.respond_bytes(status, raw, content_type)

    def respond_bytes(self, status: int, raw: bytes, content_type: str) -> None:
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def serve_app_file(self, path: str) -> bool:
        entry = STATIC_FILES.get(path) or STATIC_FILES.get(urllib.parse.quote(urllib.parse.unquote(path), safe="/"))
        if not entry:
            return False
        filename, content_type = entry
        target = APP_DIR / filename
        try:
            raw = target.read_bytes()
        except OSError:
            self.respond(500, {"error": f"Missing application file: {filename}"})
            return True
        self.respond_bytes(200, raw, content_type)
        return True

    def read_json(self) -> dict[str, Any]:
        declared = int(self.headers.get("Content-Length", "0") or 0)
        if declared > 30 * 1024 * 1024:
            raise ValueError("Request body exceeds the 30 MB safety limit.")
        length = min(declared, 30 * 1024 * 1024)
        raw = self.rfile.read(length)
        value = json.loads(raw.decode()) if raw else {}
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object.")
        return value

    def provider_from_path(self) -> tuple[str, str]:
        match = re.match(r"^/providers/([^/]+)(?:/(.*))?$", urllib.parse.urlparse(self.path).path)
        if not match or match.group(1) not in PROVIDERS:
            raise KeyError("Unknown MCP provider.")
        return match.group(1), match.group(2) or ""

    def do_OPTIONS(self) -> None:
        if not self.origin_allowed():
            return self.respond(403, {"error": "Origin not allowed."})
        self.respond(204, {})

    def do_GET(self) -> None:
        if not self.origin_allowed():
            return self.respond(403, {"error": "Origin not allowed."})
        parsed = urllib.parse.urlparse(self.path)
        try:
            if self.serve_app_file(parsed.path):
                return
            if parsed.path == "/health":
                return self.respond(200, {"ok": True, "service": "Horde Studio MCP Bridge", "version": 1})
            if parsed.path == "/providers":
                return self.respond(200, {"providers": [provider_status(key) for key in PROVIDERS]})
            if parsed.path == "/oauth/callback":
                params = urllib.parse.parse_qs(parsed.query)
                if params.get("error"):
                    raise RuntimeError(params.get("error_description", params["error"])[0])
                provider_id = exchange_code(params.get("state", [""])[0], params.get("code", [""])[0])
                html = f"""<!doctype html><meta charset="utf-8"><title>Connected</title>
                <style>body{{font:16px system-ui;background:#0d0d14;color:#eee;display:grid;place-items:center;height:100vh;margin:0}}
                div{{max-width:520px;padding:32px;border:1px solid #343445;border-radius:16px;background:#171722}}b{{color:#49d17d}}</style>
                <div><b>{PROVIDERS[provider_id]['label']} connected.</b><p>You can close this window and return to Horde Studio.</p></div>"""
                return self.respond(200, html, "text/html")
            provider_id, action = self.provider_from_path()
            if action == "status":
                return self.respond(200, provider_status(provider_id, verify=False))
            if action == "tools":
                tools = list_tools(provider_id)
                return self.respond(200, {"provider": provider_id, "tools": tools})
            return self.respond(404, {"error": "Unknown bridge endpoint."})
        except PermissionError as error:
            self.respond(401, {"error": str(error), "needsAuth": True})
        except Exception as error:
            self.respond(500, {"error": str(error)})

    def do_POST(self) -> None:
        if not self.origin_allowed():
            return self.respond(403, {"error": "Origin not allowed."})
        try:
            parsed_path = urllib.parse.urlparse(self.path).path
            if parsed_path == "/local-image/comfy/generate":
                body = self.read_json()
                return self.respond(200, {"image": comfy_generate(body)})
            if parsed_path == "/local-image/openai/generate":
                body = self.read_json()
                return self.respond(200, {"image": openai_local_generate(body)})
            if parsed_path == "/media/fetch":
                body = self.read_json()
                return self.respond(200, {"image": download_image(safe_remote_image_url(body.get("url")))})
            if parsed_path == "/local-image/status":
                body = self.read_json()
                comfy_base = loopback_base_url(body.get("comfyBaseUrl"), 8188)
                image_base = loopback_base_url(body.get("imageBaseUrl"), 7860)
                try:
                    comfy_status, _, _ = http_request(comfy_base + "/system_stats", timeout=8)
                    comfy_error = ""
                except Exception as error:
                    comfy_status, comfy_error = 0, str(error)
                image_headers = {"Accept": "application/json"}
                if str(body.get("imageApiKey") or "").strip():
                    image_headers["Authorization"] = f"Bearer {str(body['imageApiKey']).strip()}"
                try:
                    image_status, _, _ = http_request(image_base + "/models", headers=image_headers, timeout=8)
                    image_error = ""
                except Exception as error:
                    image_status, image_error = 0, str(error)
                return self.respond(200, {
                    "comfy": 200 <= comfy_status < 300,
                    "comfyStatus": comfy_status,
                    "comfyError": comfy_error,
                    "openaiImage": 200 <= image_status < 300,
                    "openaiImageStatus": image_status,
                    "openaiImageError": image_error,
                })
            provider_id, action = self.provider_from_path()
            body = self.read_json()
            if action == "connect":
                if provider_status(provider_id)["connected"]:
                    try:
                        tools = list_tools(provider_id)
                        return self.respond(200, {"connected": True, "toolCount": len(tools)})
                    except Exception:
                        update_provider_record(provider_id, {"tokens": {}})
                        mcp_sessions.pop(provider_id, None)
                return self.respond(200, {"connected": False, "authUrl": begin_oauth(provider_id)})
            if action == "disconnect":
                update_provider_record(provider_id, None)
                mcp_sessions.pop(provider_id, None)
                return self.respond(200, {"connected": False})
            if action in {"call", "generate"}:
                tool = str(body.get("tool") or "").strip()
                arguments = body.get("arguments")
                if not tool or not isinstance(arguments, dict):
                    return self.respond(400, {"error": "tool and arguments are required."})
                result = call_tool(provider_id, tool, arguments)
                if action == "generate":
                    image, source = result_image(result)
                    return self.respond(200, {"image": image, "source": source})
                return self.respond(200, {"result": result})
            return self.respond(404, {"error": "Unknown bridge endpoint."})
        except PermissionError as error:
            self.respond(401, {"error": str(error), "needsAuth": True})
        except (KeyError, ValueError) as error:
            self.respond(400, {"error": str(error)})
        except Exception as error:
            self.respond(500, {"error": str(error)})


def main() -> None:
    app_url = f"http://{HOST}:{PORT}/"
    try:
        server = ThreadingHTTPServer((HOST, PORT), BridgeHandler)
    except OSError as error:
        if error.errno not in {errno.EADDRINUSE, 48, 98, 10048}:
            raise
        try:
            status, _, raw = http_request(app_url + "health", timeout=3)
            health = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            health, status = {}, 0
        if status != 200 or health.get("service") != "Horde Studio MCP Bridge":
            raise RuntimeError(
                f"Port {PORT} is already used by another application. Close it, then start Horde Studio again."
            ) from error
        print(f"Horde Studio is already running on {app_url}")
        if "--open" in sys.argv:
            import webbrowser
            webbrowser.open(app_url)
        return
    print(f"Horde Studio listening on {app_url}")
    print(f"OAuth callback: {CALLBACK_URL}")
    print(f"Credentials: {AUTH_FILE} (owner-only)")
    if "--open" in sys.argv:
        import webbrowser
        threading.Timer(0.45, lambda: webbrowser.open(app_url)).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
