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
| Rewind to draft / resend | At `d0c2329`, in a fresh Chrome profile at `localhost:43140` with the dedicated disposable bridge namespace and mock at `127.0.0.1:43202`, configured Custom API through the real Settings UI, created `Rewind Resend 17.0 Disposable`, chose `Start without life setup`, sent the authored turn `Mocked rewind resend acceptance beat.`, clicked the visible `Rewind to draft` control, observed its in-place `Confirm?` state, and confirmed. Then resent the restored text. | After the real asynchronous save/render settled, the composer held the exact authored text and the submitted user turn had been removed. The resend settled through the mock Narrator and Reader calls; a full reload retained exactly one resent authored turn and a DM reply. | Passed as mocked-provider dual-17.0 browser/save/readback evidence; not live-model proof. |
| Late response | Started a marked delayed attempt, navigated to stock before release. | The test transport audit did not record a delayed request; do not infer a pass from later UI state. | Not run successfully |
| Cross-mode deletion | At `681991d`, used a fresh Chrome profile and the dedicated disposable `43140` bridge namespace to create two synthetic World pairs: stock `127.0.0.1` and Experimental Worlds `localhost`. In the first pair, opened the native stock World Studio delete path and accepted its real `confirm` dialog; then reloaded Experimental Worlds. In the second pair, accepted Experimental Worlds' native delete confirmation; then reloaded stock. | In both directions the deleted fixture disappeared from the owning mode's active World list. After stock deletion, the independent Experimental active world remained. After Experimental deletion, the independent stock active world remained. The app's owning-mode safety-recovery card may retain a recovery copy of its own deleted fixture; it was not treated as an active World and no other mode's state was restored or removed. | Passed as synthetic-only dual-17.0 browser/deletion/reload isolation evidence. No user, backup, production, or staging-copy data was opened or deleted. |
| F16 portrait upload/clear | At `3676323`, in a fresh Chrome profile at `localhost:43140` with dedicated disposable bridge namespace `experimental-worlds-f16-17.0.json`, created synthetic `F16 17.0 Portrait Disposable` through the real Experimental Worlds UI, chose `Start without life setup`, added synthetic Person `Mira`, and attached `assets/worlds/policy-panic/mara-voss.jpg` through the native file input. Closed the native Visuals and World Record dialogs, saved the World, reloaded, reopened Mira, cleared the portrait, saved, and reloaded again. | Clear was enabled after attach and after the first browser reload. It was disabled after clear and the second reload. The preview showed fallback `M` with no `background-image`; no stale media reference remained. | Passed as provider-independent dual-17.0 browser/save/readback evidence. The world, browser profile, and bridge namespace are all disposable and isolated. |
| F18 specialist graduation | Not exercised. | No browser readback. | Not run |
| F19 five-meter save, including zero | Not exercised. | No browser readback. | Not run |
| F20 relationship metadata save | Not exercised. | No browser readback. | Not run |
| F09 Location graduation | Not exercised. | No browser readback. | Not run |

The live provider proof still needs an authorized disposable provider context:
an Experimental Worlds draft-send/inspect/rewind/resend against a real
provider, with the source/receipt provenance retained after reload.
