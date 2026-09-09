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
| Late response | Started a marked delayed attempt, navigated to stock before release. | The test transport audit did not record a delayed request; do not infer a pass from later UI state. | Not run successfully |
| Cross-mode deletion | Opened the real delete confirmation for the disposable Experimental World only. | The in-app browser dialog bridge stalled before accept/cancel; no destructive retry was made. | Incomplete; no pass claimed |
| F16 portrait upload/clear | Not exercised. | No browser readback. | Not run |
| F18 specialist graduation | In staged 17.4 `Experimental 17.4 F18 Disposable`, sent the seeded Mira candidate through the actual mocked transport, opened Inspect, staged World review, created and confirmed the durable Person, verified Mira in People, saved, and manually published the isolated mirror. | Mirror revision 1 retained the canonical entity ID, `candidate_mira`, exact source turn/snapshot IDs, `fertStatus: "N/A"`, `fertNotes: "No relevant state"`, all three goals, and observed outfit provenance. | Passed as mocked-provider browser/save/readback evidence on `c1838d0`; not live-model proof |
| F19 five-meter save, including zero | Not exercised. | No browser readback. | Not run |
| F20 relationship metadata save | Not exercised. | No browser readback. | Not run |
| F09 Location graduation | Not exercised. | No browser readback. | Not run |

The live provider proof still needs an authorized disposable provider context:
an Experimental Worlds draft-send/inspect/rewind/resend against a real
provider, with the source/receipt provenance retained after reload.
