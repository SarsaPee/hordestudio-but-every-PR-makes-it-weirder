# Experimental Worlds core hash — Pass 1 working freeze

This records the reproducible core boundary before its native-17.0 acceptance
checkpoint. It is deliberately a working freeze, not the checkpoint tag: the
remaining browser acceptance and controlled data-cutover evidence must still
pass before `checkpoint/experimental-worlds-native-17.0` may be created.

- Source revision: `107607a` (`integration/experimental-worlds-three-pass`)
- Manifest: `docs/experimental-worlds/experimental-core-manifest.txt`
- SHA-256: `502902e871549df864d99fa9ed42ad4d2ba3ac10778d02f2bd29f21dc5968573`
- Generator: `node scripts/hash-experimental-core.mjs <revision>`

The generator hashes the sorted manifest paths and their exact Git blobs. It
rejects missing, duplicate, unsorted, or excluded paths. Adapters,
registration, migrations, tests, documentation, acceptance evidence and
packaging are intentionally outside the hash. Any subsequent core-byte change
requires a new authorized domain change; the later 17.4 pass must adapt only
the excluded host-facing seam.
