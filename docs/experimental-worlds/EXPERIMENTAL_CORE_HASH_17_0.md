# Experimental Worlds core hash — Pass 1 working freeze

This records the reproducible core boundary before its native-17.0 acceptance
checkpoint. It is deliberately a working freeze, not the checkpoint tag: the
remaining browser acceptance and controlled data-cutover evidence must still
pass before `checkpoint/experimental-worlds-native-17.0` may be created.

- Source revision: `a144e3a` (`integration/experimental-worlds-three-pass`)
- Manifest: `docs/experimental-worlds/experimental-core-manifest.txt`
- SHA-256: `bb6b56b65b1136a0fd0680dd8ce050ccc200efbed0d73f48d2a925147b117a93`
- Generator: `node scripts/hash-experimental-core.mjs <revision>`

The generator hashes the sorted manifest paths and their exact Git blobs. It
rejects missing, duplicate, unsorted, or excluded paths. Adapters,
registration, migrations, tests, documentation, acceptance evidence and
packaging are intentionally outside the hash. The frozen domain now includes
the unchanged pinned ScenePulse renderer, styles, and locales under the
mode-owned vendor path, rather than loading them from a repository-level
folder. This working revision also closes the last discovered ambient lore and
plain-object helper lookups with exact private copies, so those source moves
are part of the documented Experimental boundary rather than hidden host
dependencies. Any subsequent core-byte change requires a new authorized
domain change; the later 17.4 pass must adapt only the excluded host-facing
seam.
