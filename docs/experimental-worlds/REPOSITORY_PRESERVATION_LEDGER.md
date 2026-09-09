# Repository preservation ledger

## 2026-09-09 migration start

- Authoritative source base: `71d00353c4f728c7a743daa4cdae032ada426fe7`
- Authoritative source snapshot commit: `0e1d87e`
- Source tag: `checkpoint/custom-17.0-authoritative-source`
- Migration branch: `integration/experimental-worlds-three-pass`
- Sanitized local 17.0 head is retained as
  `archive/sanitized-17.0.0-local-20260909` and as
  `sanitized-local/17.0.0`.
- Prior dual-origin and partial-native branches/tags remain reachable and are
  classified as rollback/reference only.
- Malformed Finder files were moved out of `.git/refs` in both local Git
  databases and retained under
  `.horde-preservation-20260909/repo-repair-20260909/`.
- Full connectivity checks now report only unreachable objects. No objects
  were pruned.
- The authoritative snapshot excludes Melbourne exports, logs, caches,
  bytecode, credentials, browser database backups, and private media.

## Main reconciliation

The four unpublished local `main` commits were inspected before Pass 0. They
all modify custom World receipt-repair/reasoning behavior rather than a
genuinely application-global facility. The authoritative custom source remains
the behavioral source of truth, so those patches are preserved in history but
are not imported as host-global changes.
