# Pass 1 native-17.0 acceptance ledger

This ledger is intentionally incomplete until all rows are browser-proved. A
source guard, a ZIP or upstream engine test is never substituted for a row.
All staging work below uses `127.0.0.1` only; `localhost:43127` has not been
changed.

| Check | Status | Revision / fixture | Browser evidence | Provider mode |
| --- | --- | --- | --- | --- |
| One document/bootstrap and mode navigation | Passed | `0f822e9`, retained `Policy Panic at Bramble & Pike` | Same staging document retained its origin and sidebar while Chat, Worlds and Experimental Worlds were entered. There is one `app.js` script; no iframe or alternate host route. | Provider-independent |
| Experimental source relocation | Passed smoke | `107607a`, retained five-World library | The browser rendered the moved Experimental library, its five retained worlds, original editor entry and native New Session Setup. The browser did not report a bootstrap failure. | Provider-independent |
| Experimental CSS closure | Passed smoke | `107607a`, retained `Policy Panic` | Native session setup and retained Experimental library rendered after the complete World Engine CSS unit was loaded from the mode-owned stylesheet. | Provider-independent |
| Default-off acknowledgement | Passed | `107607a`, fresh `127.0.0.1:43142` profile | Experimental Worlds opened a same-document warning. The checkbox started a five-second countdown; only then did Enable enter the mode. The normal Chat Library stayed usable when declined. | Provider-independent |
| Acknowledgement reset | Implemented; browser row pending | `107607a` | Settings → Data & Backup exposes Reset acknowledgement; it changes only the opt-in setting and preserves the Experimental repository. | Provider-independent |
| Stock-removal source boundary | Passed static; browser removal row pending | `b3565bb` | `node scripts/verify-experimental-stock-removal.mjs` verified 16 core files and the adapter contain no stock World runtime/database reference. A temporary package/browser run with stock assets physically absent remains required. | Provider-independent |
| Experimental migration stage/readback | Implemented; acceptance pending | `d5ff72a`, `107607a` | Repository stages and checksums the complete legacy World snapshot with immutable preimage/journal. Final host-key removal is deliberately an explicit controlled cutover, never normal startup. | Provider-independent |
| Global backup/restore/recovery | Implemented; acceptance pending | `4ecf78e` | Versioned manifest includes host, stock temporary repository and Experimental repository even while disabled; full delete/restore/readback/interruption/fresh-profile browser proof remains required. | Provider-independent |
| F09 Location graduation | Pending | synthetic fixture required | Not yet browser-tested. | Mocked provider |
| F16 portrait upload/save/reload/clear | Pending | synthetic fixture required | Not yet browser-tested. | Provider-independent |
| F18 specialist graduation | Pending | seeded candidate required | Not yet browser-tested. | Mocked provider |
| F19 five relationship meters including zero/decrease | Pending | synthetic fixture required | Not yet browser-tested. | Provider-independent |
| F20 relationship metadata | Pending | synthetic fixture required | Not yet browser-tested. | Provider-independent |
| Rewind/resend and delayed-result ownership | Pending | deterministic delayed transport | Not yet browser-tested. | Mocked provider |
| Cross-domain deletion/media isolation | Pending | disposable isolated profile only | Not yet browser-tested. | Provider-independent |

## Baseline defect discipline

The Melbourne temporal/date inconsistency remains a pre-existing baseline
issue. It is not being changed during this extraction unless a test proves the
split introduced a regression.
