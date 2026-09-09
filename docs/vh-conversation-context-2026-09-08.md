# VH conversation context — September 8, 2026

Implemented general conversation realism improvements without changing content-intensity controls.

## Changes

- A conversation receipt can record a brief subjective impression, an exact evidence quote and a bounded duration (5–360 minutes). The engine links it to a perceived player message. Invalidated, future and unread messages cannot supply evidence. This is temporary conversational context, not biography or a second numeric mood change.
- Impressions survive state normalization/reload and pause/resume. Their salience decreases with elapsed time and they leave the prompt at expiry. Repeating the identical evidence quote does not refresh the same impression. This is not a general anti-exploitation limit on all model-proposed mood deltas.
- Prompts distinguish conversational bandwidth from interest or willingness. Bandwidth uses structured availability, energy, stress, regulation cooldown, actual company and active activities. It does not infer intimacy from activity-label keywords or create consent. Existing sexual-context logic was not changed in this pass.
- Full and compact prompts receive active impressions and bandwidth. Foreground and observer state schemas share the conversation structure. The background worker uses the same reaction and context helpers.
- An empty or conversation-only receipt no longer counts as immediate affect. Missing observer state is no longer replaced with a fabricated neutral reaction. Background events carry an explicit affect-commit flag, so a simulation snapshot alone is not proof of affect. Valid repaired receipts update the foreground ownership flag.

## Verification

All checks were offline using synthetic state and mocked providers.

- 29/29 engine suites, including a new conversation-context audit.
- 12/12 isolated Chrome scenarios, with external requests blocked.
- Both Python host audits passed; the transaction audit now verifies a grounded reaction and its affect ownership flag through the real shared worker.
- The reply transaction suite passed again after correcting the repaired-receipt ownership flag.
- JavaScript syntax and git whitespace checks passed.

The activity engine already supported interruption, persisted progress, resumption and completion consequences. Its regression checks passed; this pass did not add a new activity category or rewrite those mechanics.

## Limits and activation

An exact source quote establishes provenance, not semantic correctness. The model can still misinterpret that quote; no live-model conversation quality evaluation was performed. Carryover is an optional receipt field, so providers that omit it do not acquire an invented impression. These changes do not guarantee natural dialogue or replace the broader audit backlog.

Restart the local launcher and reload the app for the Python event metadata and cache-versioned JavaScript changes. Existing personal saves were not edited during verification.
