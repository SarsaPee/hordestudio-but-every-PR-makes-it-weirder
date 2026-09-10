# Experimental Worlds core hash — pre-17.4 integration freeze

This records the reproducible immutable Experimental boundary immediately
before reconstruction around the native 17.4 host.

- Source revision: `a1822ab` (`integration/horde-studio-17.4-experimental-worlds`)
- Manifest: `docs/experimental-worlds/experimental-core-manifest.txt`
- SHA-256: `b69d6729e00be0921522529d2cbcbb523163baebac2351a4b6a486d92fa59716`
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
dependencies. The adjacent mutable integration manifest is
`experimental-integration-manifest.txt`; its baseline SHA-256 is
`e308976f934b004414450f63b2f2de98ddeb4f5b87316ad7f8b00bf8ea5abc78`.
Any subsequent core-byte change requires a separately authorized Experimental
change and a new freeze before host integration can resume.
