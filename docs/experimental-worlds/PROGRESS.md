# Experimental Worlds split progress

## Current phase: Milestone A — acceptance completion

- [x] Preserve the supplied checklist in this repository.
- [x] Record live and sanitized source checkpoints; keep their histories reachable.
- [x] Create a clean integration branch from upstream `v17.0.0` commit `8d5d68378f3fc1ac06a35ed31e05cff77be45584`.
- [x] Copy the live Experimental Worlds dependency closure into its private package.
- [x] Add the narrow host router, storage/bridge namespace, and first-class navigation.
- [x] Add a copy-verify-idempotent bridge-mirror migration tool; production cutover remains pending.
- [x] Smoke-prove stock save/reload and a distinct Experimental Worlds origin in a clean 17.0 browser profile.
- [ ] Complete the provider-backed Experimental Worlds draft-send/inspect/rewind/resend and persistence acceptance, then tag the full dual-17.0 checkpoint.

## Staged, not approved: Milestone B — upstream 17.4 verification and package

- [x] Merge exact upstream target `520aa2155b02289f9db1c6740a48e494124d2cca` in staging.
- [x] Preserve upstream maps/VH bridge additions while retaining the narrow Experimental Worlds seam.
- [x] Run upstream engine gates and test a fresh portable extraction.
- [x] Run the available isolated 17.4 storage-transaction and browser-engine smoke gates with a clean Playwright profile; their results are recorded separately from Experimental Worlds acceptance.
- [~] Repeat the full browser proof after the Milestone A checkpoint. The staged 17.4 F16 portrait save/reload/clear/reload, F18 graduation/save/readback, F19/F20 relationship save/readback, and F09 Location graduation passed with a mocked provider or provider-independent browser run as applicable. Cross-origin late-response isolation passed with the mock, but same-tab switching and cross-mode deletion remain unproven; the complete dual-17.0 acceptance checkpoint is still required before promotion.
- [ ] Perform guarded live mirror cutover/deployment only after the remaining browser acceptance items pass.

## Recorded blockers before live cutover

- The production Experimental Worlds mirror namespace contains a valid but
  different snapshot from the legacy mirror. The migration tool refused to
  overwrite it; both originals remain in place pending a deliberate readback
  and reconciliation decision.
- The isolated-browser ledger now separates observed mocked-provider and
  provider-independent work from outstanding proof. F18 graduation has now
  passed in both the 17.0 acceptance worktree and staged 17.4 as mocked-provider
  browser/save/readback evidence. The staged 17.4 relationship fixture has
  also passed F19's five values including zero and F20's metadata save/readback
  through the native source panel, plus F09 Location graduation through the
  native explicit-review modal. Cross-origin late-response isolation passed
  with the mock transport, while in-place rewind confirmation, F16 native file
  attachment, same-tab late-response switching, and cross-mode deletion still
  lack completed browser proof.
- Cross-mode deletion reached the synthetic Experimental and Stock 17.0 delete
  paths, but the isolated browser's JavaScript-dialog/CDP channel stalled
  before an accept/cancel result. No user, backup, production, or staging-copy
  world was deleted.
