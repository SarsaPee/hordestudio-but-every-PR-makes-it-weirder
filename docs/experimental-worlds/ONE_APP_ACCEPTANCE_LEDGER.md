# One-app Experimental Worlds acceptance ledger

Revision under test: uncommitted one-app correction atop `2b19d9106cdcf458c55cfbca85b4ca44358f6652`.

| Check | Fixture/action | Result |
| --- | --- | --- |
| U01 same document/origin | Staging bridge at `http://localhost:43128`; browser opened Chat Library, Experimental Worlds, stock Worlds, then reloaded. | **Passed**. URL, document title and sidebar shell remained `localhost:43128`; no redirect occurred. |
| U03 default-off acknowledgement | Opened Experimental Worlds before enabling. | **Passed**. Native view showed acknowledgment, disabled Enable control, and did not create a Reader/job. |
| Global Settings entry | At `localhost:43128`, reopened current Settings after native enablement. Its `Experimental Worlds` control showed `Enabled for this browser profile` and `Open mode`, using the same current Settings modal. | **Passed browser smoke**. |
| Native persistence isolation | Acknowledged, enabled, created `experimental-synthetic-mtty49jj`, returned to stock Worlds, reloaded, reopened Experimental Worlds. | **Passed**. The synthetic Experimental World remained; stock Worlds remained separately rendered. |
| U08 backup registration | Native mode registers `experimental-worlds` with the global coordinator at startup, independent of the enabled flag. | **Implemented; browser export/readback pending**. |
| Legacy same-origin import | Native repository only probes `HordeStudioDB` after explicit user action and copies nonconflicting values while retaining archive provenance. | **Implemented; legacy-profile browser proof pending**. |
| U02/U04 host parity | Current shell, Chat/VH/Video/Settings/OpenRouter were not replaced and Experimental Worlds receives a small host contract. | **Static + same-document smoke passed; full cross-experience browser matrix pending**. |
| U07/U09-U11 restore and cross-domain destructive matrix | Synthetic domain collision/deletion, actual media restore, fresh-profile transfer, interrupted restore and both-origin reconciliation. | **Not run**. |
| U12-U15 custom runtime preservation | ScenePulse, Sidecar/Reader, rewind/resend, F09/F16/F18/F19/F20, memory, travel, mechanics and visuals. | **Not complete**. The native repository is present, but these executable custom modules remain to be extracted from the protected oracle. |
| U18 fresh portable package | Built `Horde-Studio-v17.4.0-one-app-portable.zip`; archive audit found 78 files, all required native modules, and no `experiences/experimental-worlds/runtime/`, `.env`, or bytecode. Extracted it to `/tmp/horde-one-app.kH6LUg`, served only that extraction at `localhost:43129`, and opened Experimental Worlds. | **Passed native package browser smoke**. The fresh app retained the same document/origin and showed the default-off acknowledgment; it did not require the checkout or preserved runtime. |

## Baseline issue deliberately not expanded

The Melbourne real-provider temporal inconsistency remains a recorded baseline
issue. This correction does not change narrative/time semantics unless native
extraction introduces a demonstrable regression.
