# Experimental Worlds split progress

## Current phase: Milestone B — post-cutover acceptance and reconciliation

- [x] Preserve the supplied checklist in this repository.
- [x] Record live and sanitized source checkpoints; keep their histories reachable.
- [x] Create a clean integration branch from upstream `v17.0.0` commit `8d5d68378f3fc1ac06a35ed31e05cff77be45584`.
- [x] Copy the live Experimental Worlds dependency closure into its private package.
- [x] Add the narrow host router, storage/bridge namespace, and first-class navigation.
- [x] Add a copy-verify-idempotent bridge-mirror migration tool; production cutover remains pending.
- [x] Smoke-prove stock save/reload and a distinct Experimental Worlds origin in a clean 17.0 browser profile.
- [x] Complete the mocked-provider Experimental Worlds draft-send/inspect/rewind/resend and persistence acceptance, then tag the full dual-17.0 checkpoint as `checkpoint/experimental-worlds-dual-17.0-acceptance` at `329cdfd`.

## Milestone B — upstream 17.4 verification and package

- [x] Merge exact upstream target `520aa2155b02289f9db1c6740a48e494124d2cca` in staging.
- [x] Preserve upstream maps/VH bridge additions while retaining the narrow Experimental Worlds seam.
- [x] Run upstream engine gates and test a fresh portable extraction.
- [x] Run the available isolated 17.4 storage-transaction and browser-engine smoke gates with a clean Playwright profile; their results are recorded separately from Experimental Worlds acceptance.
- [x] Repeat the retained runtime browser proof after the Milestone A checkpoint. The staged 17.4 F16 portrait save/reload/clear/reload, F18 graduation/save/readback, F19/F20 relationship save/readback, F09 Location graduation, draft-send/rewind-to-draft/resend/reload, same-Day reroll safety, cross-mode deletion/readback, and cross-origin plus same-tab late-response isolation passed with a mocked provider or provider-independent browser run as applicable.
- [x] Live provider evidence on the user-authorized Melbourne timeline exercised real send, settle, reload, Rewind-control readback and earlier reroll. The narrow private guard rejects a same-Day backward reroll clock mutation and its isolated browser reruns pass. This does **not** establish general provider-date coherence: the current live 17.4 send produced a `Late Autumn 2024` header against an August 2026 scenario, recorded in the acceptance ledger without a speculative fix.
- [x] Preserve the outgoing live tree and browser/mirror preimage, deploy the rebuilt portable 17.4 package to the maintained live root, and browser-verify stock `127.0.0.1:43127` plus preserved Experimental Worlds `localhost:43127`. The live launch remains storage-isolated; no mirror was overwritten.

## Open reconciliation and evidence caveats

- The production Experimental Worlds mirror namespace still contains a valid
  but different snapshot from the legacy mirror. The migration tool refused to
  overwrite it; both originals remain in place pending a deliberate browser
  readback and reconciliation decision. Live routing keeps the original
  `localhost` browser authority intact while this remains unresolved.
- The isolated-browser ledger separates observed mocked-provider and
  provider-independent work from live-model evidence. F16, F18, F19, F20 and
  F09 Location have final staged browser/readback proofs; the dual-17.0
  checkpoint proves its retained runtime's F16, delete isolation,
  rewind/resend, late-response ownership, and same-Day reroll guard. The
  current real-provider Melbourne readback remains a genuine unresolved
  failure: its narrator header is temporally inconsistent with the saved
  scenario, and the earlier reroll also produced a contradictory persisted
  ScenePulse date.
