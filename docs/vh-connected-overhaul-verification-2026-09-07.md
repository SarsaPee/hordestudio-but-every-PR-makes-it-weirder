# VH connected simulation: implementation and offline verification

This implementation follows the consolidated September 7 audit. It records the current changes; the earlier audit remains a historical baseline, not a description of the revised implementation.

## Implemented

- Shared pure simulation core used by the browser and local Node worker: attention, physiology, emotions, schedules and executable activities. Python owns background transport and leases.
- Structured schedule effects replace activity-label matching for basic energy, stress, social need and hunger. Hunger and exhaustion can propose executable meal/recovery goals. Goals survive interruption and reload, with completion consequences and memory receipts.
- Persistent conversation topic, open question, intention and pause/resume state feeds prompts. Activity handoffs and return intentions can inform initiative. This depends on valid model receipts; it does not force a goodbye at every boundary.
- Foreground affect can commit with the reply. Delayed observers have ownership checks and a bounded retry; they cannot execute life changes. Emotional arousal and sexual arousal remain distinct; affectionate text does not automatically imply sexual willingness.
- Final request budgeting includes tool schemas, output reserve and media overhead. A compact grounded prompt is available for foreground requests. Observer requests retain the source exchange alongside their instructions. Estimates are conservative, not exact provider token counts. Requests that still cannot fit fail explicitly while retaining pending messages.
- Local background transactions execute the shared kernel, commit immediate affect, preserve queued replies across queue restart, reject reclaimed leases, and import against timeline revision/transcript ownership. Failed browser saves roll back before acknowledgement. Replays deduplicate. Only eligible read messages are consumed; attachments remain pending for the browser's modality-aware pipeline.
- Active chat persona selection persists per timeline. Meter rendering is verified for positive and zero values.
- Social starter buttons create focused editable drafts. Blank drafts survive normalization/reload and are excluded from published starter posts.
- Dedicated **Virtual Human Studio → Chat style** panel: writing voice, usual reply length, conversational habits, example exchanges and habits to avoid. Settings persist and enter speaking prompts; examples are marked as style examples rather than biographical facts.

## Verification

All checks used synthetic state and offline/mocked providers; no paid model calls or personal save edits.

- `node scripts/check-engine.js`: **28/28** suites, including new shared simulation parity, structured physiology, request budgeting, draft persistence and conversation-state checks. Syntax checks cover the app and four new runtime modules.
- `scratch/browser_engine_smoke_audit.js`: **12/12** scenarios in isolated Chrome, with external requests blocked. Includes stalled inbox recovery, active persona reload, visible meters, activity interruption/completion, both social buttons, saved Chat style prompt inclusion, and transactional background import. Chat style screenshot visually inspected after modal transition completed.
- `python3 scratch/vh_host_transaction_audit.py`: passes with the real Node worker and mocked generation. Covers unread/future-message exclusion, media deferral, immediate affect, one-batch consumption, credential-free queue persistence, lease reclaim and stop during generation.
- `python3 scratch/always_on_runtime_audit.py`: passes.
- `git diff --check` and portable shell syntax check pass.

Browser audit requires Playwright and Chromium/Chrome; it accepts `HORDE_PLAYWRIGHT_MODULE` and `HORDE_BROWSER_EXECUTABLE`. Host audits require Node and a Python version supported by the launcher. No dependencies were downloaded for these checks.

## Activation and limits

Restart the local Horde launcher, then reload the app to load the Python changes and new scripts. This work did not restart the user's running launcher or inspect their actual VH's provider trace.

The host resolves Node from `HORDE_NODE_EXECUTABLE`, a platform-specific `runtime/<platform>-<architecture>/node`, or PATH. An existing local runtime was copied for this Mac; it is ignored by Git and is not automatically shipped in portable builds. Other installations need Node 18+ available to the host. A missing runtime is surfaced in background status.

Provider credentials are kept in memory, not persisted with queued events. A launcher restart preserves queued replies but requires browser re-arming before new background provider calls. The worker permits one outstanding transaction per browser snapshot; it does not run an unlimited unseen conversation. Background media replies remain browser-dependent. Background state receipts currently apply affect and conversation state, not the full browser memory/commitment tool pipeline.

Live language quality remains unverified by explicit user choice. Offline checks establish execution, persistence and prompt construction, not believable chemistry, semantic appraisal, or consistently natural pacing from every provider. The new shared core is a stronger base; these results are not a blanket claim that the complete life simulator is shippable.
