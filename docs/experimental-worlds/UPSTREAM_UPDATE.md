# Experimental Worlds upstream update contract

## Pinned integration

- Clean stock base: `8d5d68378f3fc1ac06a35ed31e05cff77be45584` (`v17.0.0`)
- Current stock target: `520aa2155b02289f9db1c6740a48e494124d2cca` (`v17.4.0`)
- Experimental runtime checkpoint: `71d00353c4f728c7a743daa4cdae032ada426fe7` plus the preserved live working-tree patch in the private checkpoint archive
- Browser origins: stock `http://127.0.0.1:<port>`; Experimental Worlds `http://localhost:<port>`
- Bridge mirrors: stock upstream services; Experimental Worlds `Horde Studio/experimental-worlds/shared-library.json`

## Host patch allowlist

Only these upstream-owned paths may carry Experimental Worlds integration code:

- `app.js`: the release-display correction from the upstream tag's stale `17.3.0` string to the verified `17.4.0` release label; no Worlds behavior changes.
- `index.html`: navigation registration and one script tag.
- `experimental-worlds-navigation.js`: origin-aware navigation target.
- `horde_mcp_bridge.py`: localhost document dispatch, explicit Experimental Worlds static allowlist, and private recovery-mirror routes.
- `scripts/build-portable.sh`: explicit package inclusion.
- `scripts/migrate-experimental-worlds-mirror.py`: one-time copy/verify utility.

Experimental semantics, CSS, ScenePulse, Sidecar, memory, visuals/outfits, and
their private bridge compatibility source remain under `experiences/experimental-worlds/`.

The v17.4.0 tag itself retains `HORDE_STUDIO_VERSION = '17.3.0'`. This build
changes that display-only constant to `17.4.0`; it is the sole stock-parity
exception outside the Experimental Worlds host seams and is documented here so
future tag comparisons do not mistake it for a World-model change.

## Routine update

1. Fetch a pinned upstream release into staging and merge it; never pull into the live installation.
2. Run `node scripts/check-experimental-worlds-boundary.js <upstream-commit>`; a new collision outside the allowlist fails for review.
3. Run upstream engine/browser gates, then open both browser origins and repeat cross-mode save/reload, pending-work, and delete checks.
4. Build the portable archive, extract it freshly, and verify both documents and private assets before deployment.
5. Preserve the outgoing live installation, run the mirror copy/readback tool, quiesce only the identified old launcher, deploy the archive, then recheck both origins.

Provider, browser, or bridge contract failures are explicit compatibility work;
they are not permission to merge upstream World semantics into Experimental Worlds.
