# Experimental Worlds split progress

## Current phase: Milestone A — extraction and host isolation

- [x] Preserve the supplied checklist in this repository.
- [x] Record live and sanitized source checkpoints; keep their histories reachable.
- [x] Create a clean integration branch from upstream `v17.0.0` commit `8d5d68378f3fc1ac06a35ed31e05cff77be45584`.
- [x] Copy the live Experimental Worlds dependency closure into its private package.
- [x] Add the narrow host router, storage/bridge namespace, and first-class navigation.
- [x] Add a copy-verify-idempotent bridge-mirror migration tool; production cutover remains pending.
- [ ] Browser-prove dual 17.0 and tag the checkpoint.

## Next phase: Milestone B — complete upstream 17.4 integration

Do not begin until the dual-17.0 checkpoint passes. Merge the exact target
`520aa2155b02289f9db1c6740a48e494124d2cca`, then replay only the documented
host seams and run stock, experimental, storage, package, and browser checks.
