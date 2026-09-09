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
| Live provider / Melbourne reroll | In the user-authorized disposable `Melbourne — Canonical` timeline `Fork of New Timeline 5` at the unchanged legacy live installation (`localhost:43127`, visibly reporting 17.0.0), sent `I tell Charlotte that I accepted the M&M role, ask whether Sarah needs a hand with the ginger beer crates, and order a soda water while I wait.` against the configured Gemini 3.8 Flash provider. The response settled with the authored action, Sidecar relationship updates, and reader provenance. The real visible `Rewind to draft` control restored the exact text to the composer; after resend, one real `Reroll` was invoked. | The reroll produced a fresh response, then the persisted ScenePulse payload inspector showed date `8/14/2026 (Friday)` removed and `11/17/2023 (Friday)` added; its source header and the native panel showed the same contradictory November 2023 date after a browser reload. The deterministic World clock remained a separate implementation detail; this result proves a persisted contradictory ScenePulse projection, not a claim that every canonical field was rewritten. | **Failed real-provider reroll acceptance.** This is direct live-17.0 evidence on user-authorized disposable data, not staged-17.4 evidence and not a deployment authorization. |
| Rewind to draft / resend | At `d0c2329`, in a fresh Chrome profile at `localhost:43140` with the dedicated disposable bridge namespace and mock at `127.0.0.1:43202`, configured Custom API through the real Settings UI, created `Rewind Resend 17.0 Disposable`, chose `Start without life setup`, sent the authored turn `Mocked rewind resend acceptance beat.`, clicked the visible `Rewind to draft` control, observed its in-place `Confirm?` state, and confirmed. Then resent the restored text. | After the real asynchronous save/render settled, the composer held the exact authored text and the submitted user turn had been removed. The resend settled through the mock Narrator and Reader calls; a full reload retained exactly one resent authored turn and a DM reply. | Passed as mocked-provider dual-17.0 browser/save/readback evidence; not live-model proof. |
| Late response | Started a marked delayed attempt, navigated to stock before release. | The test transport audit did not record a delayed request; do not infer a pass from later UI state. | Not run successfully |
| Cross-mode deletion | At `681991d`, used a fresh Chrome profile and the dedicated disposable `43140` bridge namespace to create two synthetic World pairs: stock `127.0.0.1` and Experimental Worlds `localhost`. In the first pair, opened the native stock World Studio delete path and accepted its real `confirm` dialog; then reloaded Experimental Worlds. In the second pair, accepted Experimental Worlds' native delete confirmation; then reloaded stock. | In both directions the deleted fixture disappeared from the owning mode's active World list. After stock deletion, the independent Experimental active world remained. After Experimental deletion, the independent stock active world remained. The app's owning-mode safety-recovery card may retain a recovery copy of its own deleted fixture; it was not treated as an active World and no other mode's state was restored or removed. | Passed as synthetic-only dual-17.0 browser/deletion/reload isolation evidence. No user, backup, production, or staging-copy data was opened or deleted. |
| F16 portrait upload/clear | At `3676323`, in a fresh Chrome profile at `localhost:43140` with dedicated disposable bridge namespace `experimental-worlds-f16-17.0.json`, created synthetic `F16 17.0 Portrait Disposable` through the real Experimental Worlds UI, chose `Start without life setup`, added synthetic Person `Mira`, and attached `assets/worlds/policy-panic/mara-voss.jpg` through the native file input. Closed the native Visuals and World Record dialogs, saved the World, reloaded, reopened Mira, cleared the portrait, saved, and reloaded again. | Clear was enabled after attach and after the first browser reload. It was disabled after clear and the second reload. The preview showed fallback `M` with no `background-image`; no stale media reference remained. | Passed as provider-independent dual-17.0 browser/save/readback evidence. The world, browser profile, and bridge namespace are all disposable and isolated. |
| F18 specialist graduation | Not exercised. | No browser readback. | Not run |
| F19 five-meter save, including zero | Not exercised. | No browser readback. | Not run |
| F20 relationship metadata save | Not exercised. | No browser readback. | Not run |
| F09 Location graduation | Not exercised. | No browser readback. | Not run |

The real-provider prerequisite is now available and has been exercised on
the disposable Melbourne timeline. Its reroll date regression is a live
acceptance failure that must be addressed and repeated in the isolated
integration context before a dual-17.0 milestone pass can be claimed.
