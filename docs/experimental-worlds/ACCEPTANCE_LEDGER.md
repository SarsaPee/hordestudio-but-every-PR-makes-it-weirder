# Experimental Worlds acceptance ledger

This is a browser-evidence ledger. It records only observed results; source
checks and the portable package do not substitute for an unchecked row.

## Run boundary

- Stock revision: `169eecd` plus the uncommitted acceptance-only bridge
  override for `HORDE_EXPERIMENTAL_SHARED_LIBRARY_FILE`.
- Browser: isolated in-app profile on `127.0.0.1:43132` (stock) and
  `localhost:43132` (Experimental Worlds).
- Backend mirror: `Horde Studio/acceptance/experimental-worlds-17.0.json`,
  separate from both production mirror paths.
- Provider mode: localhost OpenAI-compatible mock at `127.0.0.1:43200`.
  This is a browser test with a mocked provider, not live-model evidence.

| Item | Fixture and browser action | Readback | Result |
| --- | --- | --- | --- |
| Stock persistence | Created `Stock Acceptance Disposable`, saved, exited to stock Worlds list. | Card remained in the stock list. | Passed (synthetic) |
| Experimental persistence | Created `Experimental Acceptance Disposable`, saved and entered its default timeline. | Reload retained the world, timeline, Sidecar and mocked turn. | Passed (synthetic) |
| Mocked turn | Selected the local mock through the real Experimental Worlds Settings UI, then sent `Mocked acceptance turn two`. | The UI showed the authored user turn, a mock response, provenance controls, and `Rewind to draft`. | Passed (mocked provider) |
| Rewind to draft | Activated the in-place control; it changed to `Confirm rewind to draft`. | The in-app browser failed to dispatch the confirmation action reliably. | Incomplete; no pass claimed |
| Late response | In `Experimental 17.4 F09 Location Disposable`, the corrected disposable mock recorded a held Reader request for `ACCEPTANCE_DELAY`. Before its explicit `/release`, a first-class Stock 17.4 document at `127.0.0.1:43136` became the active browser context. | After release, the response/settlement remained only in the original Experimental timeline. The Stock document remained its independent one-character, zero-room library with no injected response or Experimental world. | Passed for cross-origin mode isolation with mocked provider; same-tab mode/timeline switching remains unproven |
| Cross-mode deletion | Opened the real delete confirmation for the disposable Experimental World only. | The in-app browser dialog bridge stalled before accept/cancel; no destructive retry was made. | Incomplete; no pass claimed |
| F16 portrait upload/clear | Not exercised. | No browser readback. | Not run |
| F18 specialist graduation | In staged 17.4 `Experimental 17.4 F18 Disposable`, sent the seeded Mira candidate through the actual mocked transport, opened Inspect, staged World review, created and confirmed the durable Person, verified Mira in People, saved, and manually published the isolated mirror. | Mirror revision 1 retained the canonical entity ID, `candidate_mira`, exact source turn/snapshot IDs, `fertStatus: "N/A"`, `fertNotes: "No relevant state"`, all three goals, and observed outfit provenance. | Passed as mocked-provider browser/save/readback evidence on `c1838d0`; not live-model proof |
| F19 five-meter save, including zero | In staged 17.4 `Experimental 17.4 Relationship Rerun`, used the real Experimental Worlds UI and local mocked transport to produce Mira's relationship, then saved the World and manually published the isolated mirror. | Mirror revision 3 retained the directed relationship projection `affection: 5`, `desire: 0`, `trust: 38`, `stress: 55`, `compatibility: 30`. A fresh browser document reopened the same timeline and native ScenePulse panel, visibly showing the five values and labels, including Desire `0`. | Passed as mocked-provider browser/save/readback evidence on `28d6832`; not live-model proof |
| F20 relationship metadata save | In that same staged 17.4 fixture, used native ScenePulse edit mode to change Time Known to `five weeks` and Milestone to `Accepted five-meter metadata fixture`, saved the source panel, saved the World, and manually published. | Mirror revision 3 retained both values in the human-edit, translation, and directed-relationship provenance; the fresh browser document visibly showed both values while the five meters remained unchanged. | Passed as mocked-provider browser/save/readback evidence on `28d6832`; not live-model proof |
| F09 Location graduation | In staged 17.4 `Experimental 17.4 F09 Location Disposable`, sent `ACCEPTANCE_SCENEPULSE_LOCATION` through the real UI and local mocked transport, opened native ScenePulse Inspect, staged the accepted `Acceptance Archive` location for World review, created the durable record, confirmed the explicit modal, saved, and manually published the isolated mirror. | Browser showed `New location discovered: Acceptance Archive`; mirror revision 5 retained canonical `loc_mttmdwkh_zki36`, `Acceptance District`, `building`, `Ground floor`, the exact Reader snapshot and source-turn IDs, reader evidence, and the promoted candidate's `canonicalMatchId`. | Passed as mocked-provider browser/save/readback evidence on `dcbe687`; not live-model proof |

The live provider proof still needs an authorized disposable provider context:
an Experimental Worlds draft-send/inspect/rewind/resend against a real
provider, with the source/receipt provenance retained after reload.
