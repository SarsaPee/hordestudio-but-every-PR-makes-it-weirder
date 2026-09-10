# Experimental Worlds core hash — Pass 1 working freeze

This records the reproducible core boundary before its native-17.0 acceptance
checkpoint. It is deliberately a working freeze, not the checkpoint tag: the
remaining browser acceptance and controlled data-cutover evidence must still
pass before `checkpoint/experimental-worlds-native-17.0` may be created.

- Source revision: `b9e69e2` (`integration/experimental-worlds-three-pass`)
- Manifest: `docs/experimental-worlds/experimental-core-manifest.txt`
- SHA-256: `f7e8a4f7f77d2eeef3b6836b6d2e5401f1f30403fbd578cb7a79f24b18806fe7`
- Generator: `node scripts/hash-experimental-core.mjs <revision>`

The generator hashes the sorted manifest paths and their exact Git blobs. It
rejects missing, duplicate, unsorted, or excluded paths. Adapters,
registration, migrations, tests, documentation, acceptance evidence and
packaging are intentionally outside the hash. The frozen domain now includes
the unchanged pinned ScenePulse renderer, styles, and locales under the
mode-owned vendor path, rather than loading them from a repository-level
folder. Any subsequent core-byte change requires a new authorized domain
change; the later 17.4 pass must adapt only the excluded host-facing seam.
