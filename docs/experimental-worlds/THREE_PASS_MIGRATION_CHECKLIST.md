# Three-pass Experimental Worlds migration

This file amends and controls the implementation sequence described in
`CODEX_ONE_APP_EXPERIMENTAL_WORLDS.md`. Where an older split document or
checkpoint conflicts with this checklist, this checklist wins.

## Local implementation truth

- Custom implementation: `hordestudio live instance v2-pre17.4-20260909-1700`
- Pristine stock 17.0: `hordestudio-17.0.0`
- Pristine stock 17.4: `hordestudio-17.4.0`
- Git history is provenance only. Runtime behavior is determined from these
  three local trees.
- The prior dual-origin integration and partial native shell are superseded
  rollback/reference implementations, not foundations for new work.

## Pass 0: rename the room and add stock Worlds

- [x] Rename the existing custom Worlds identity to **Experimental Worlds** in
  place, with only the coexistence changes that are demonstrably necessary.
- [x] Import actual stock Worlds and its complete World-specific dependency
  closure from the pristine local 17.0 tree.
- [x] Preserve the existing custom Chat, Virtual Human, Video, Settings,
  providers, backup, media, maps, files, and other global enhancements.
- [x] Keep existing custom persistence untouched. Use
  `HordeStudioStockWorlds17Pass0DB` only for temporary stock-World authority.
- [x] Prove both World modes and all ordinary modes in one document, origin,
  bootstrap generation, and application instance.
- [x] Tag the accepted result
  `checkpoint/experimental-worlds-dual-inplace-17.0`.

Pass-0 implementation and evidence are recorded in
`STOCK_WORLDS_17_PASS0_IMPORT_MAP.md`, `CUSTOMIZATION_INVENTORY.md`, and
`PASS0_ACCEPTANCE_LEDGER.md`. Pass 1 has not begun.

## Pass 1: detach the working Experimental mode

- [ ] Satisfy the **stock-removal independence invariant**: with the stock
  Worlds runtime and stylesheet excluded, Experimental Worlds still loads and
  runs from its own code, styles, data model, renderers, media semantics,
  Sidecar, ScenePulse, jobs, and lifecycle. It may use only explicitly
  versioned host-adapter services (for example provider transport, generic
  media primitives, navigation and global settings), never a stock-World
  helper, store, renderer, stylesheet, DOM root, listener or bootstrap.
- [ ] Where the accepted custom system and stock Worlds need equivalent code,
  preserve an Experimental-owned copy rather than retaining an implicit shared
  World dependency. Duplication is intentional during this split; later
  convergence is a separate, explicitly approved task.
- [ ] Relocate the working custom implementation mechanically into
  mode-owned source without redesigning it.
- [ ] Trace and classify complete dependency closures by behavioral owner.
- [ ] Keep global enhancements host-owned and route host facilities through a
  narrow `ExperimentalWorldsHostAdapter`.
- [ ] Keep normal host/stock authority in `HordeStudioDB`; move Experimental
  authority to `HordeStudioExperimentalWorldsDB` through a staged,
  checksummed, preimaged, journalled, idempotent migration.
- [ ] Scope lifecycle and immutable asynchronous operation ownership.
- [ ] Include Experimental data and referenced media in global backup even
  while the mode is disabled.
- [ ] Commit a stable Experimental core manifest and reproducible Git-blob
  SHA-256 hash.
- [ ] Prove parity with Pass 0 and tag
  `checkpoint/experimental-worlds-native-17.0`.

## Pass 2: upgrade the host around the frozen room

- [ ] Apply the actual pristine-local 17.0 to pristine-local 17.4 host
  evolution to the accepted native 17.0 split.
- [ ] Use 17.4 implementations for upstream-owned host modes and stock Worlds.
- [ ] Reconcile each retained global enhancement once against actual 17.4.
- [ ] Keep every Experimental core manifest entry byte-identical; adapt only
  excluded adapters, shims, registration, migration, tests, and packaging.
- [ ] Classify every final hunk versus pristine local 17.4.
- [ ] Prove the unchanged acceptance matrix and tag
  `checkpoint/experimental-worlds-native-17.4`.

## Acceptance and cutover

- [ ] Record F09, F16, F18, F19, and F20 individually with browser actions,
  readback, tested revision, fixture, and provider mode.
- [ ] Prove real ScenePulse, Sidecar, Reader, inspect, rewind-to-draft, resend,
  persistence, lifecycle teardown, and delayed-result ownership.
- [ ] Prove isolated synthetic deletion, media isolation, full restore,
  interrupted-restore recovery, and fresh-profile transfer.
- [ ] Preserve the requested default-off acknowledgement, reset control,
  five-second activation countdown, and `EXPERIMENTAL` badge.
- [ ] Build and test a portable package without private/runtime-reference data
  or developer-directory dependencies.
- [ ] Preserve the live preimage, migrate, deploy, and verify on
  `http://localhost:43127` only after every earlier gate passes.
- [ ] Publish the accepted maintained lineage without force rewriting history.

## Defect discipline

Only fix defects introduced by or blocking this migration, data safety,
ownership, lifecycle, or required acceptance. Record unrelated and inherited
defects and continue. The Melbourne temporal/date discrepancy is a baseline
defect unless this migration measurably changes it.
