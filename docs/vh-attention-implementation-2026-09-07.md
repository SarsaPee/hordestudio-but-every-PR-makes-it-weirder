# VH attention: first implementation

This implements the first layer of the realism proposal: contextual attention using existing activities, commitments, human dynamics, and relationship state. It does not implement the complete goal/action and autobiographical-memory overhaul.

## Behavior

Messages now persist an attention lifecycle: waiting, deferred, composing, ready, withheld, forgotten, or answered. Delivery is separate from noticing. A busy person can open a message without being able to answer; a sleeping person cannot read it. A future check time is a reconsideration point, not a guaranteed reply time.

The agency loop reevaluates attention when the relevant situation changes or a check becomes due. An activity ending early can release attention before a previous check time. A new activity can interrupt composition. Existing energy and stress determine available capacity; warmth, resentment, anger, social need, and due promises influence willingness. Company raises interruption cost, and private activities remain protected. A due promise can motivate contact but is never marked fulfilled merely because attention returns.

Once a message is noticed, text length and media type supply a bounded effort estimate. The delivered pending inbox is assessed together so a ready short message cannot bypass the effort of a long follow-up. No regex classifies message meaning or urgency. This means a short emergency and a short greeting are not yet semantically distinguished.

Conflict can withhold a response while preserving eligibility for reconsideration as pressure eases. Repeated postponement with low engagement can remove a message from active attention after a day; this is a bounded policy, not a general model of human forgetting. A later conversation can still bring older messages back into the existing inbox batch.

Each message retains up to eight decision transitions. The latest decision appears in existing agency diagnostics. The dialogue prompt receives recorded reasons for delays, with instructions not to invent interruptions or recite diagnostics. Live provider behavior has not been tested in this pass.

## Integration and compatibility

- Attention survives timeline normalization and IndexedDB reload. Invalidated and undelivered messages cannot trigger a response.
- Immediate-reply presets continue to bypass delays. No-reply opt-outs remove the relationship withholding gate.
- Legacy pending messages without attention migrate when the agency next evaluates them. Old scheduled timestamps no longer guarantee execution despite changed circumstances.
- Durable reply jobs already claimed by the generation layer keep their existing retry/ownership rules. Attention does not cancel an already issued provider request.
- UI status describes pending attention instead of presenting a scheduled response as a promise.
- Idle polls leave unchanged waiting/ready state clean, avoiding a full save every few seconds.
- The local always-on helper does not execute this attention kernel. Pending attention-managed conversations therefore wait for the app to reopen; they are excluded from helper message generation. Stale helper replies cannot consume those pending messages. Other always-on behavior is not replaced by this layer.

## Verification

```sh
node scripts/check-engine.js
node scratch/browser_engine_smoke_audit.js
```

The first command checks syntax and 25 suites, including ten new attention scenarios. The browser suite requires Playwright and Chromium, with optional `HORDE_PLAYWRIGHT_MODULE` and `HORDE_BROWSER_EXECUTABLE` overrides. It uses isolated synthetic saves and blocks external traffic.

Tests exercise circumstance-dependent outcomes, early release and interruption, composition persistence, due promises, private activity, changing relationship pressure, message effort, postponement, immediate settings, invalidation, inbox batching, and idle-save stability. Browser coverage exercises the real agency loop, read/deferred persistence across reload, resumed composition, and always-on bypass protection.

## Next engine work

1. Share the decision kernel with the always-on runtime so closed-app replies can follow the same rules instead of waiting for the browser.
2. Add grounded message appraisal after perception: meaning, urgency, ambiguity, topic sensitivity, and conversational obligations. Keep uncertain interpretations separate from facts.
3. Replace descriptive life plans with executable activities and goals that have prerequisites, durations, interruption costs, outcomes, and consequences. Existing schedule/temporary activity state currently supplies attention context.
4. Connect specific relationship episodes, promises, and recalled experiences to decisions. Current relationship pressure uses existing aggregate values rather than retrieving and interpreting individual memories.
5. Tune the explicit policy weights against longer scenario runs and interactive sessions. This is a testable behavioral foundation, not evidence of complete emergent human behavior.
