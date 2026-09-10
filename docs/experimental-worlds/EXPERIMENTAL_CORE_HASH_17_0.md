# Experimental Worlds core hash — Pass 1 working freeze

This records the reproducible core boundary before its native-17.0 acceptance
checkpoint. It is deliberately a working freeze, not the checkpoint tag: the
remaining browser acceptance and controlled data-cutover evidence must still
pass before `checkpoint/experimental-worlds-native-17.0` may be created.

- Source revision: `927ef0b` (`integration/experimental-worlds-three-pass`)
- Manifest: `docs/experimental-worlds/experimental-core-manifest.txt`
- SHA-256: `0114e63d4af10701efbdda4374a3da5dd7be059d85694d55bc90122576bdfce7`
- Generator: `node scripts/hash-experimental-core.mjs <revision>`

The generator hashes the sorted manifest paths and their exact Git blobs. It
rejects missing, duplicate, unsorted, or excluded paths. Adapters,
registration, migrations, tests, documentation, acceptance evidence and
packaging are intentionally outside the hash. The new source revision adds
only the Pass-1 required captured-owner rejection around provider completion;
it is not a World semantic, prompt, renderer, or schema change. Any subsequent
core-byte change requires a new authorized domain change; the later 17.4 pass
must adapt only the excluded host-facing seam.
