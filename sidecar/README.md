# Horde Sidecar Bundle

This directory is a portable, upstream-oriented Sidecar implementation bundle.
It deliberately contains contracts, modules, adapters and hook documentation;
it never contains copied Horde Studio application files.

## Current foundation

- `inline_legacy` preserves the current receipt/classifier/repair behavior.
- `sidecar` is the new canonical reconciliation mode.
- Existing worlds normalize to Inline Legacy unless explicitly migrated.
- New worlds opt into Sidecar by default.
- Timeline protocol state coordinates provenance, questions, takes and packets;
  canonical game state remains owned by Horde's validator/reducer pipeline.

Later increments add the two-call loop, semantic time, questions, packets,
direct conversation, hierarchy, traversal, memory and proposal-only agents.
