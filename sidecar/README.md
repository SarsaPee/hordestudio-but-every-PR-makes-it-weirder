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

Not yet bundled as reusable modules: Sequence/Scene planning, full migration
wizard rollback UI, progressive entity promotion, traversal/vehicle adapters,
hierarchical memory workers, and proposal-only World Agent revisions. Those
remain deliberately separate increments rather than undocumented app edits.
