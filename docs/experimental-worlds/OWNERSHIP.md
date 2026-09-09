# Experimental Worlds ownership map

This map records the extraction boundary used for Milestone A. It is intentionally
small: stock files remain at their upstream paths, while the preserved runtime
lives under `experiences/experimental-worlds/runtime`.

| Area | Owner | Source / boundary | Verification |
| --- | --- | --- | --- |
| Stock app, Worlds, normal navigation | upstream | repository root at pinned upstream release | exact-tag diff and stock browser smoke |
| Experimental document, ScenePulse, Sidecar, Reader, timeline and memory | Experimental Worlds | private preserved runtime copied from the live instance | source hash, Experimental Worlds browser flow |
| Experimental styles, vendor styles, overlays and portraits | Experimental Worlds | private runtime paths and localhost document | no stock CSS in Experimental Worlds document |
| Browser state, drafts, media and caches | origin-owned | existing `localhost` for Experimental Worlds; stock uses `127.0.0.1` | cross-origin same-ID regression |
| Bridge-side shared-library snapshots and background queues | namespace-owned | explicit `experimental-worlds` bridge namespace | readback and cross-mode mutation regression |
| Provider credentials and generic HTTP transport | shared only by explicit bridge capability | no credentials in package or commit | bridge capability smoke |

The sanitized repository is a reference tree only. The live instance is the
authoritative source of the preserved runtime at this checkpoint.
