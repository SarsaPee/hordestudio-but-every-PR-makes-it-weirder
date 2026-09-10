# Pass 1 native-17.0 acceptance ledger

This ledger is intentionally incomplete until all rows are browser-proved. A
source guard, a ZIP or upstream engine test is never substituted for a row.
All staging work below uses `127.0.0.1` only; `localhost:43127` has not been
changed.

| Check | Status | Revision / fixture | Browser evidence | Provider mode |
| --- | --- | --- | --- | --- |
| One document/bootstrap and mode navigation | Passed | current Pass-1 tree, isolated `127.0.0.1:43142` profile | The same staging document and sidebar entered stock Worlds, the Experimental acknowledgement, and Experimental Worlds without an origin, document, or bootstrap change. There is one `app.js` script; no iframe or alternate host route. | Provider-independent |
| Experimental source relocation | Passed smoke | `a84cba9`, retained five-World library | The browser rendered the moved Experimental library, its five retained worlds, original editor entry and native New Session Setup. The pinned ScenePulse renderer, styles, locales and source modules are now physically mode-owned under `experiences/experimental-worlds/scenepulse/vendor/ScenePulse`; the original repository-level copy is no longer loaded. | Provider-independent |
| Experimental CSS closure | Passed smoke | `107607a`, retained `Policy Panic` | Native session setup and retained Experimental library rendered after the complete World Engine CSS unit was loaded from the mode-owned stylesheet. | Provider-independent |
| Default-off acknowledgement | Passed | `107607a`, fresh `127.0.0.1:43142` profile | Experimental Worlds opened a same-document warning. The checkbox started a five-second countdown; only then did Enable enter the mode. The normal Chat Library stayed usable when declined. | Provider-independent |
| Acknowledgement reset | Implemented; browser row pending | `107607a` | Settings → Data & Backup exposes Reset acknowledgement; it changes only the opt-in setting and preserves the Experimental repository. | Provider-independent |
| Stock-removal source boundary | Passed | `23180f9`, disposable local stockless copy at `127.0.0.1:43143` | Physically removed `experiences/stock-worlds-17-pass0/runtime.js` from the copy's only document. Worlds was disabled; Experimental Worlds acknowledged and entered normally, rendered its retained four-world library, and opened Vaelora's native New Session Setup. No stock runtime was loaded or required. This test copy is not a shipped artifact. | Provider-independent |
| Experimental migration stage/readback/idempotency | Passed | current Pass-1 tree, synthetic `PASS1 LEGACY CUTOVER DISPOSABLE` at isolated `127.0.0.1:43144` | Created the fixture through the preserved custom 17.0 Worlds UI, then served the split runtime at the same isolated origin. Startup captured and checksummed the complete legacy host preimage, staged/read back the World data in `HordeStudioExperimentalWorldsDB`, then removed only the active legacy World keys. The fixture appeared in Experimental Worlds after acknowledgement, survived a reload, and was absent from stock Worlds. The runtime logged the verified cutover once; the following reload was a no-op. | Provider-independent |
| Global backup/restore/recovery | Implemented; acceptance pending | current Pass-1 tree | A versioned manifest now stages and checksums independent host, temporary-stock and Experimental partitions, retaining each preimage in its own journal before apply. Startup replays only verified interrupted stages. Delete/restore/readback/interruption/fresh-profile browser proof remains required. | Provider-independent |
| F09 Location graduation | Pending | synthetic fixture required | Not yet browser-tested. | Mocked provider |
| F16 portrait upload/save/reload/clear | Pending | synthetic fixture required | Not yet browser-tested. | Provider-independent |
| F18 specialist graduation | Pending | seeded candidate required | Not yet browser-tested. | Mocked provider |
| F19 five relationship meters including zero/decrease | Pending | synthetic fixture required | Not yet browser-tested. | Provider-independent |
| F20 relationship metadata | Passed | `23180f9`, `PASS1 EXPERIMENTAL DISPOSABLE`; `PASS1 RELATIONSHIP ALPHA` → `PASS1 RELATIONSHIP BETA` | In the real Experimental People editor, created both synthetic records, added the directional relationship, authored `cold truce — PASS1 metadata` with score `0`, saved the World, reloaded the application, reopened the record, and read back the exact metadata and `0`. | Provider-independent |
| Rewind/resend and delayed-result ownership | Implemented; browser proof pending | `927ef0b`, deterministic delayed transport required | Each ordinary Experimental provider turn now captures mode, World, timeline, epoch, restore generation and effective model/provider settings. Navigation aborts the foreground request and every state-commit route rejects a mismatched owner. Rewind/resend and delayed-response browser proof remain required. | Mocked provider |
| Cross-domain save/reload isolation | Passed save half; deletion/media pending | isolated `127.0.0.1:43142`, `PASS1 EXPERIMENTAL DISPOSABLE` and `PASS1 STOCK DISPOSABLE` | Created and saved a disposable World through each real editor. Experimental showed five records while stock showed five independently (the other domain's synthetic record was absent). A browser-native stock delete confirmation could not be accepted by the available automation; no deletion was claimed. Media remains pending. | Provider-independent |

## Baseline defect discipline

The Melbourne temporal/date inconsistency remains a pre-existing baseline
issue. It is not being changed during this extraction unless a test proves the
split introduced a regression.
