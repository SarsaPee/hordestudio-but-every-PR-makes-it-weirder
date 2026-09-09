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
| Rewind to draft | In both preserved dual-17.0 `Experimental Acceptance Disposable` and staged-17.4 `Experimental 17.4 F09 Location Disposable`, used the visible in-place `Rewind to draft` control on a settled synthetic turn. A fresh staged-17.4 reload against the exact served runtime then attempted keyboard activation on `Experimental 17.4 F18 Disposable`. | In-app browser click activation left the control at `Rewind to draft`; the fresh keyboard attempt returned to the Experimental Worlds library rather than exposing `Confirm?`. No rewind, draft readback, or resend was attempted. | Incomplete; browser-adapter failure, no product pass claimed |
| Late response | Cross-origin: in `Experimental 17.4 F09 Location Disposable`, the disposable mock held a Reader request for `ACCEPTANCE_DELAY`; before `/release`, a first-class Stock 17.4 document at `127.0.0.1:43136` became active. Same-tab: in a fresh profile, armed the mock to hold the source World’s first narrator stream, sent `ACCEPTANCE_DELAY same-tab-world-switch`, entered a separate synthetic Experimental World before `/release`, then released it. | Cross-origin settlement remained only in the original Experimental timeline. In the same-tab run, the destination’s real message count stayed `0 → 0`; it contained neither the source turn nor held reply after a full reload. | Passed as mocked-provider staged browser ownership proof on the post-`6495bce` worktree; real model behavior is not implied. |
| Cross-mode deletion — staged 17.4 | In a fresh Chrome profile on the staged server, created two pairs of synthetic worlds in the separately-owned `127.0.0.1` Stock and `localhost` Experimental origins. Used each real World Studio delete control and accepted the native browser confirmation only for the disposable named fixture. | After deleting Stock’s fixture, reload retained its Experimental counterpart. After deleting Experimental’s fixture, reload retained its Stock counterpart. Each deleted fixture disappeared only from its owning active library. | Passed as synthetic-only staged browser/deletion/reload isolation evidence on `4604948`; no user, backup, production, or staging-copy world was opened or deleted. |
| F16 portrait upload/clear | In dual-17.0 `Experimental Acceptance Disposable`, opened synthetic Person `Mira`'s native Visuals inspector; native `Upload` and disabled `Clear` were visible. | Available browser adapter has no file-attachment capability and did not surface a native chooser; no image was written, saved/reloaded, or cleared. | Blocked by browser-automation capability; not provider-related and no pass claimed |
| F16 portrait upload/clear — staged 17.4 | At `91060c9`, in a fresh Chrome profile at `localhost:43139` with disposable backend/mirror `experimental-worlds-headless-f16-17.4.json`, created synthetic `F16 Portrait Disposable` through the real UI, selected `Start without life setup`, added synthetic Person `Mira` in World Studio → People, and attached the repository fixture `assets/worlds/policy-panic/mara-voss.jpg` through the native file input. After closing the actual child Visuals dialog and its parent World Record dialog, used the ordinary `Save World` control; then reopened Mira after a full browser reload, used native `Clear`, saved, and reloaded again. | The native clear control was enabled after upload and remained enabled after save/reload. After clear/save/reload it was disabled. The rendered portrait preview was the one-token fallback `M` with no `background-image`, proving no stale media reference remained. | Passed as a provider-independent staged browser/save/readback proof; all worlds, browser storage, and mirror data were disposable and isolated. The equivalent dual-17.0 run passed at `d0c2329`. |
| F18 specialist graduation | In staged 17.4 `Experimental 17.4 F18 Disposable`, sent the seeded Mira candidate through the actual mocked transport, opened Inspect, staged World review, created and confirmed the durable Person, verified Mira in People, saved, and manually published the isolated mirror. | Mirror revision 1 retained the canonical entity ID, `candidate_mira`, exact source turn/snapshot IDs, `fertStatus: "N/A"`, `fertNotes: "No relevant state"`, all three goals, and observed outfit provenance. | Passed as mocked-provider browser/save/readback evidence on `c1838d0`; not live-model proof |
| F19 five-meter save, including zero | In staged 17.4 `Experimental 17.4 Relationship Rerun`, used the real Experimental Worlds UI and local mocked transport to produce Mira's relationship, then saved the World and manually published the isolated mirror. | Mirror revision 3 retained the directed relationship projection `affection: 5`, `desire: 0`, `trust: 38`, `stress: 55`, `compatibility: 30`. A fresh browser document reopened the same timeline and native ScenePulse panel, visibly showing the five values and labels, including Desire `0`. | Passed as mocked-provider browser/save/readback evidence on `28d6832`; not live-model proof |
| F20 relationship metadata save | In that same staged 17.4 fixture, used native ScenePulse edit mode to change Time Known to `five weeks` and Milestone to `Accepted five-meter metadata fixture`, saved the source panel, saved the World, and manually published. | Mirror revision 3 retained both values in the human-edit, translation, and directed-relationship provenance; the fresh browser document visibly showed both values while the five meters remained unchanged. | Passed as mocked-provider browser/save/readback evidence on `28d6832`; not live-model proof |
| F09 Location graduation | In staged 17.4 `Experimental 17.4 F09 Location Disposable`, sent `ACCEPTANCE_SCENEPULSE_LOCATION` through the real UI and local mocked transport, opened native ScenePulse Inspect, staged the accepted `Acceptance Archive` location for World review, created the durable record, confirmed the explicit modal, saved, and manually published the isolated mirror. | Browser showed `New location discovered: Acceptance Archive`; mirror revision 5 retained canonical `loc_mttmdwkh_zki36`, `Acceptance District`, `building`, `Ground floor`, the exact Reader snapshot and source-turn IDs, reader evidence, and the promoted candidate's `canonicalMatchId`. | Passed as mocked-provider browser/save/readback evidence on `dcbe687`; not live-model proof |
| Same-Day reroll temporal guard — staged 17.4 | In a fresh Chrome profile, configured the real Experimental Worlds Settings UI to a disposable local OpenAI-compatible mock, created `Temporal Reroll Disposable`, armed the mock only after setup, sent `ACCEPTANCE_TEMPORAL_SAME_DAY_ROLLBACK`, then used the visible native Reroll control. The mock returned Day 1 `6:33 PM` for the authored turn and Day 1 `6:32 PM` for reroll. | The actual second response visibly contained `Time 6:32 PM`. The world clock stayed `8:00 AM`; after a full browser reload it remained exactly `8:00 AM`. Mock audit confirmed the authored send and reroll reached the narrator transport. | Passed as a mocked-provider staged browser/save/reload regression proof on `717fcbc`; this proves the safe rejection path, not live-model acceptance. |

Real-provider live-17.0 evidence is recorded in the dual-17.0 ledger. It
proved draft restoration but exposed a reroll regression: a same-Day-1
one-minute-backward header was treated as a 1,439-minute clock advance and
the accepted ScenePulse projection retained a contradictory calendar date
after reload. The private temporal guard was patched in both integration
worktrees, covered by the semantic-time audit, and now passed the staged
isolated browser rerun above. The preserved dual-17.0 Milestone-A rerun
remains outstanding.

## Separate staged 17.4 automation gates

On 9 September 2026, the staged worktree passed `node scripts/check-engine.js`
(41/41 suites), then passed `node scratch/browser_storage_transaction_audit.js`
and `node scratch/browser_engine_smoke_audit.js` with the desktop-provided
Playwright module and a clean Chrome process/profile. The storage audit proved
stale-tab conflicts, serialized writes, rollback on cloning failure and one
canonical writer. The engine smoke audit exercised the real 17.4 application
in an isolated origin and passed its persistence, job-ownership, map, VH,
photo, gallery and asset checks. These are regression evidence only: they do
not substitute for the unchecked Experimental Worlds browser rows above.
