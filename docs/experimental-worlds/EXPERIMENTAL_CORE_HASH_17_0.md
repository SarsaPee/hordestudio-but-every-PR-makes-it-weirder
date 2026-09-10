# Experimental Worlds core hash — Pass 1 working freeze

This records the reproducible core boundary before its native-17.0 acceptance
checkpoint. It is deliberately a working freeze, not the checkpoint tag: the
remaining browser acceptance and controlled data-cutover evidence must still
pass before `checkpoint/experimental-worlds-native-17.0` may be created.

- Source revision: `43c77ef` (`integration/experimental-worlds-three-pass`)
- Manifest: `docs/experimental-worlds/experimental-core-manifest.txt`
- SHA-256: `6953be2649731e8733a371587138af94faaf3523fa6cdc00257a8257aaf58f34`
- Generator: `node scripts/hash-experimental-core.mjs <revision>`

The generator hashes the sorted manifest paths and their exact Git blobs. It
rejects missing, duplicate, unsorted, or excluded paths. Adapters,
registration, migrations, tests, documentation, acceptance evidence and
packaging are intentionally outside the hash. The frozen domain now includes
the unchanged pinned ScenePulse renderer, styles, and locales under the
mode-owned vendor path, rather than loading them from a repository-level
folder. This working revision also closes the last discovered ambient lore and
plain-object helper lookups with exact private copies, and replaces direct
host model-catalog variable reads with the explicit adapter seam, so those source moves
are part of the documented Experimental boundary rather than hidden host
dependencies. Any subsequent core-byte change requires a new authorized
domain change; the later 17.4 pass must adapt only the excluded host-facing
seam.
