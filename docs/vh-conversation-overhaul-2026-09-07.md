# VH conversation overhaul — first implementation milestone

Implemented in the working tree on 7 September 2026. This is a tested first milestone of the consolidated overhaul, not completion of the six-phase plan or proof of natural language quality with a live model.

## Behavior now connected

- The speaking model can submit immediate affect alongside its visible reply using the existing private state tool. Its conversation intention and actual promises can be committed in that same foreground transaction. Existing bounded deltas, adult opt-in, and alcohol-context checks remain in force. No keyword rule automatically rewards compliments or increases sexual arousal.
- The observer enriches understanding after the reply. If foreground affect was committed, its state payload is discarded to prevent counting the reaction twice. If the speaking model omits state, the observer remains a fallback; this is not a guarantee that every provider will submit immediate affect.
- Observer commits validate companion identity, timeline identity, runtime identity, revision and transcript across asynchronous boundaries. Invalidated exchanges and results overtaken by new input are rejected. Already committed response groups cannot apply twice. Each physiological clock remains monotonic.
- Optional asynchronous Labs memory enrichment has been removed from the observer's completion path: its existing mutating implementation does not have independent transaction ownership. The primary observer still writes durable memory. Reintroducing additional enrichment requires a staged, validated transaction.
- The default prompt now carries the current conversation intention, authored player knowledge, private life, fallible beliefs, and the first-turn opening event. Invalidated messages are excluded from history. Instructions ask for participation in the ongoing question, offer, joke or decision, and distinguish transient feeling from durable memory.
- A persisted three-minute active-exchange window permits available characters to start responding to follow-ups immediately. The engine no longer adds a simulated composition timer before provider generation. A newly noticed conversation still has a notification delay; the five-second agency poll and provider latency remain.
- Busy phone checks use a shorter context-dependent interval and wake at the actual calculated eligibility boundary. Private time, sleep and conflict constraints remain. Only communication commitments affect the attention bonus. These are improved heuristics, not yet learned individual timing or semantic urgency appraisal.
- Known availability changes within five minutes enter the conversational context. A recent two-sided exchange can trigger one departure contact through the existing initiative mechanism before availability closes, subject to initiative settings, emotional availability and inbox priority. Handoff attempts have a retry interval; expired departure results cannot publish after their deadline. Availability changes since the last response also provide return context. Actual promises can be recorded through the foreground state tool.
- Background Labs life-beat generation no longer blocks inbox processing. It validates its owner after the request, rejects unknown schedule anchors, and records surviving suggestions only as unexecuted diagnostic proposals. Suggestions no longer become completed life events or certain memories.

## Validation

All 27 engine suites passed, including the new `scratch/companion_overhaul_audit.js`. The cache-key regression found by the full run was repaired and its suite passed afterward. The full browser smoke suite passed all nine scenarios in an isolated Chrome context serving this workspace with external traffic blocked. No real saves or paid provider calls were used.

New assertions exercise stale timeline/revision/transcript/invalidation rejection, observer idempotence, foreground/observer affect ownership, actual reply orchestration, active-exchange persistence and prompt/tool availability, and impending bedtime context. Existing attention tests now assert immediate readiness rather than the removed pre-generation timer. One historical-time emotion fixture now explicitly initializes its simulation clock instead of depending on clock rewinding.

Browser coverage verifies startup, world movement/persistence, VH deferred-inbox recovery and exactly-once send, always-on ownership guard, visible meters, and executable activity interruption/save/reload/completion. The new proactive handoff's full model behavior has not been evaluated with a live provider; its context and deadline guards are covered at kernel level.

## Remaining overhaul work

1. Enforce a complete provider-aware context budget including tool schemas and output reserve. Preserve older unresolved questions under context pressure; filtering invalidated history alone does not solve eviction. This remains a material limitation for small contexts and large profiles.
2. Evaluate multi-turn conversation quality with the user's chosen model: short answers, joint plans, welcomed affection, unwanted pressure, conflict/repair, departures and returns. Measure notification-to-request separately from provider latency, and affect-to-expression agreement rather than requiring every meter to move.
3. Replace remaining label-derived physiology with structured activity properties. Expand executable goal choice beyond existing templates and connect needs, commitments and remembered consequences to selection and interruption decisions.
4. Add explicit continuation intentions and flexible transition choice. Current handoffs use known availability boundaries and a recent-exchange heuristic; they do not yet negotiate bedtime, model accidental sleep, or guarantee return contact without an actual commitment.
5. Consolidate all asynchronous enrichment and life-state mutations under one event/transaction authority. A stale observer is safely rejected but is not automatically rebased and retried.
6. Run the same simulation kernel in the always-on host with leases and durable jobs. The prior guard preventing Python from bypassing browser-owned pending attention remains; closed-UI response execution is not solved by this milestone.

The historical audit reports remain unchanged as baseline evidence. Refer to `vh-consolidated-audit-and-fix-plan-2026-09-07.md` for the full target architecture and acceptance criteria.
