# Pass-0 acceptance ledger

## Result

**PASS — checkpoint eligible.**

- Browser-tested implementation commit: `3b64149`
- Generated stock runtime SHA-256:
  `003b542ec932bb8cb5d640c91e79abb661c0eb740e6ad7704086d807d621d7b6`
- Isolated acceptance URL: `http://127.0.0.1:43141/?pass0=v12-final`
- Acceptance browser: separate in-app browser surface using the isolated
  staging server/profile
- Live `http://localhost:43127`: not modified or restarted
- Provider classification: provider-independent except where explicitly noted

The two disposable records used for persistence proof were:

- Stock: `PASS0 Stock Isolation 20260909`
- Experimental: `PASS0 Experimental Isolation 20260909`

Both descriptions were edited through their real Studio UI on the final
candidate and read back after reload.

## Browser ledger

| Acceptance | Status | Browser action and observed result | Provider mode |
| --- | --- | --- | --- |
| One origin/document/bootstrap | Passed | Navigated Chat → Virtual Human → Worlds → Experimental Worlds → Video Adventures → Multiplayer → Pip → Settings. Every step retained origin `http://127.0.0.1:43141`, bootstrap token `1:48434963-53fc-418b-a87f-5e9274c649c3`, and document token `5f3da2cb-6585-45da-9aa9-48c78c328da2`. | Provider-independent |
| One application script | Passed | Each navigation sample reported one `app.js`, one stock mode runtime, zero iframes, and the same URL/document tokens. | Provider-independent |
| Existing host modes retained | Passed | The current custom Chat Library, Virtual Human, Video Adventures, Multiplayer, Pip, and Settings opened under the same host shell. | Provider-independent smoke |
| Product identity | Passed | Sidebar and library show `Worlds` and `Experimental Worlds` as separate first-class entries. Experimental carries the `EXPERIMENTAL` badge; no V2/successor wording is used. | Provider-independent |
| Stock World library | Passed | The generated pristine UI showed the four included 17.0 Worlds plus the disposable stock record. The Experimental disposable record was absent. | Provider-independent |
| Stock edit/save/reload | Passed | Opened the stock fixture in the actual stock Studio, changed Short Description, clicked Save World, reloaded, and read back `Synthetic disposable stock-world persistence fixture — final Pass 0 browser proof.` | Provider-independent |
| Stock play/session flow | Passed | Entered `Policy Panic at Bramble & Pike`, opened the pristine New Session Setup, and used Start without life setup. The stock play HUD, timeline, locations, stats, items, rules, and local scene appeared. | Provider-independent |
| Stock movement/save/readback | Passed | Clicked `→ to Bramble & Pike Parking Lot`; location changed from Reception Lobby, time advanced from 8:57 to 8:58, and the movement ledger entry appeared. Reloading and reopening the World read back the parking-lot location, time, and ledger entry. | Local transition passed; follow-up narrator call lacked authorization |
| Stock preset UI | Passed | In the disposable stock World’s real AI Config, selected `Freaky Frankenstein 4 MAX`, clicked Fine-Tune, and observed `Fine-Tune: Freaky Frankenstein 4 MAX (World)` with its full pristine block editor. | Provider-independent |
| Experimental library persistence | Passed | The Experimental library showed the Experimental disposable record and not the stock disposable record. Edited its description through the real custom Studio, saved, reloaded, and read back the exact final text. | Provider-independent |
| Preserved Experimental runtime | Passed | Entered the custom `Policy Panic` World and observed the actual Sidecar timeline badge, Timelines, Sequence/Scene controls, native ScenePulse workspace, Inner Thoughts, relationships, People data, and World-specific toolbar. | Provider-independent fixture smoke |
| ScenePulse/Sidecar renderer | Passed | Clicked the real ScenePulse `Inspect` action. The native `ScenePulse and Sidecar handoff review` opened with the sealed `TOUR_EXAMPLE_DATA`, Sidecar projection, relationship-web status, field comparisons, and provenance text. This is explicitly fixture evidence, not a real authored-turn claim. | Provider-independent fixture |
| Independent authorities | Passed | After repeated mode switches and reloads, stock retained only its stock fixture and Experimental retained only its Experimental fixture; both had independent five-World lists. | Provider-independent |
| Cold Multiplayer source load | Passed | In a new tab, opened Multiplayer before mounting stock Worlds, switched its template tab to Worlds, and observed sources from both authorities after the asynchronous repository-ready re-render. | Provider-independent |
| Duplicate source provenance | Passed | Same-ID included Worlds are deliberately not deduplicated. Multiplayer displayed `Experimental Worlds · …` and `Worlds · …`; source buttons carry composite domain keys. Selecting the stock disposable source opened a populated Create Multiplayer Campaign dialog. | Provider-independent |
| Full backup includes both domains | Passed | Used Settings → Data & Backup → Export Full Backup. The resulting 11,240,779-byte JSON contains five Experimental Worlds, five stock Worlds, both final fixture descriptions, stock `loc_parking` timeline readback, and database identity `HordeStudioStockWorlds17Pass0DB`. | Provider-independent |
| Backup credential redaction | Passed | Recursive credential-field inspection found zero non-empty API key, access token, refresh token, client secret, or password fields. | Provider-independent |
| Browser runtime errors | Passed with expected provider limitation | No migration/runtime error appeared. One stock movement follow-up narrator request returned `401 Missing Authentication header` in the isolated profile; the local authoritative movement still persisted and read back. | Real provider blocked: missing isolated-profile auth |

The final backup export is intentionally outside the repository in the private
Downloads folder; it is not a shipped fixture. Its SHA-256 is
`64d142a6a7c4e94274b57cb3fee7f135d088af15f36ca700f2b4fd4881babb60`.

## Static and regression ledger

| Check | Result |
| --- | --- |
| `node --check` on host, generator, analyzer, verifier, and generated runtime | Passed |
| Deterministic rebuild from pristine local 17.0 | Passed; all generated bytes match |
| Scope-aware runtime closure audit | Passed; zero implicit Horde/app globals |
| DOM/markup closure audit | Passed; 386/386 source IDs unique, all fragments balanced, no required init target missing |
| Stock host-assumption audit | Passed; no remaining Pass-0 blocker |
| `scratch/world_systems_audit.js` | Passed, 16 checks |
| `scratch/multiplayer_engine_audit.js` | Passed |
| `scratch/settings_modal_ui_audit.js` | Passed, 5 checks |
| `scratch/companion_audit.js` | Passed, 201 checks |
| `scratch/always_on_vh_audit.js` | Passed |
| `git diff --check` | Passed |

Four legacy suites remain red on both the Pass-0 tree and the untouched
authoritative custom source with the same failures:

- `engine_audit.js`: three inherited harness/source-shape assertions fail
  (`window` missing in the VM harness and two stale substring expectations).
- `workspace_restore_audit.js`: expects an obsolete exact `app.js` cache key.
- `settings_persistence_audit.js`: expects three persistence call sites while
  the authoritative source already has four.
- `video_worlds_audit.js`: contains an inherited brittle HTML ordering/regex
  expectation around the Fal selector.

These are recorded baseline test defects. Pass 0 did not repair them.

## Provider limitation

The isolated browser profile has no usable authorization header for the
configured `deepseek/deepseek-v4-flash` narrator route. A real narrator turn
therefore requires a provider/API key to be configured in that isolated
profile (or an explicitly authorized settings transfer). This did not block
the UI, validation, local movement, IndexedDB save, reload, or backup proofs.

## Deliberately not claimed at Pass 0

The following belong to Pass 1/native-17.0 and the repeated Pass-2/native-17.4
matrix, not the Pass-0 behavioral-separation gate:

- permanent Experimental repository migration and idempotent journal;
- byte-stable Experimental core manifest/hash;
- default-off opt-in and five-second acknowledgement;
- F09, F16, F18, F19, and F20 final browser acceptance;
- authored send/inspect/rewind/resend proof;
- delayed-result ownership matrix;
- synthetic cross-domain deletion and media-reference isolation;
- destructive restore, interrupted recovery, and fresh-profile transfer;
- portable-package and live-cutover acceptance.

The shared-library warning that another local snapshot needs confirmation and
the Melbourne temporal/date inconsistency remain known baseline matters; they
were not expanded into Pass-0 bug fixing.
