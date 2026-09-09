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
- [ ] Repeat the full browser proof after the Milestone A checkpoint.
- [ ] Perform guarded live mirror cutover/deployment only after the remaining browser acceptance items pass.
