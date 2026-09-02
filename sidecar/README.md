# Horde Sidecar Bundle

This directory is a portable, upstream-oriented Sidecar implementation bundle.
It deliberately contains contracts, modules, adapters and hook documentation;
it never contains copied Horde Studio application files.

## Implemented 16.7 integration

- `inline_legacy` preserves the current receipt/classifier/repair behavior.
- `sidecar` is the new canonical reconciliation mode.
- Existing worlds normalize to Inline Legacy unless explicitly migrated.
- New worlds opt into Sidecar by default.
- A normal Sidecar turn makes two foreground calls only: a tool-free Narrator
  stream (visible prose plus hidden `<scene_handoff>`) and one Sidecar native
  `commit_world_turn` tool call.
- Sidecar writes only through Horde's native
  `validateWorldTurnReceipt → commitWorldTurnReceipt → processStructuredActions`
  seam. Its failure preserves narration, records an audit trace when enabled,
  and queues a persistent question rather than invoking Legacy repair.
- Backstage cards retain the handoff, native receipt and next-turn packet with
  the narrative turn. A direct Sidecar conversation is intentionally separate
  from roleplay history and never itself advances time or a scene.
- Temporal handoff wording is retained as evidence beside the canonical clock;
  no phrase-to-duration lookup is part of this bundle.
- Timeline protocol state coordinates provenance, questions, takes and packets;
  canonical game state remains owned by Horde's validator/reducer pipeline.
- `runtime/timeline-model.js` provides the portable `Timeline → Sequence →
  Scene → Turn` lifecycle. Each committed Sidecar turn is attached to the
  active sequence and scene. Closing a sequence is explicit; the next one is
  created only after the author asks for and approves an out-of-world planning
  packet generated with the Narrator configuration.
- `runtime/promotion-model.js` stages newly implied places and characters as
  evidence-backed provisional records during normal Sidecar reconciliation.
  They cannot silently become canonical. The author may explicitly promote a
  record through the native reducer; likely canonical duplicates instead become
  stable reconciliation questions.
- `runtime/traversal-vehicle-model.js` keeps point-to-point and route-based
  coverage separate over Horde's existing exit topology. It resolves an
  interior request to a trustworthy external pickup/drop-off anchor, makes
  route travel use authored stops only, and represents rideshares as temporary
  journey containers rather than locations. Persistent vehicles retain an
  entity identity, parked anchor, and explicit access roles.
- `runtime/memory-graph.js` keeps a Sidecar-only source-pinned
  `World History → Episode → Scene/Sequence` graph. Episode work is queued in
  five-turn batches and, after a valid objective summary, fans out only to
  characters whose perception coverage changed. Cognition is first-person,
  epistemically typed, provenance-linked, and never feeds objective canon.
- The Story Memory Inspector exposes those derived cognition records by
  canonical character ID and separately exposes unresolved place references.
  They can be removed contextually without touching raw roleplay history.
- In Sidecar worlds the World Agent is disabled by default and proposal-only
  when enabled. Its packet is visible to Sidecar but cannot commit world state.
- World Studio now exposes the selected-world migration review/backup/restore
  path, dedicated traversal-method and vehicle authoring/inspection screens,
  and runtime journey diagnostics.
- The Story Memory Inspector supports canonical-character scoping, prerequisite
  checks, stale/missing counts, progress callbacks, contextual deletion, and
  semantic retrieval over committed World History, Episodes, cognition,
  locations, and unresolved references. Global settings control consolidation
  budgets, cadence, concurrency, and embedding-cache retention.
- World Agent proposal packets have a visible Sidecar review path, and the
  timeline browser exposes active branches, fork parents, committed turn
  counts, and branch-local provenance.
- Persona setup supports a streamed, one-draft generation path from current
  world/history evidence with model, budget, and provenance controls.

The bundle remains host-oriented: Horde Studio persistence and presentation
layers stay in the application, while this directory provides the reusable
contracts, runtime modules, and integration manifest for an upstream PR.
