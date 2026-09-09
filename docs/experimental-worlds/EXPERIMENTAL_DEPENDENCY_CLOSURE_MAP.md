# Experimental Worlds dependency-closure map

This is a live Pass-1 relocation record. It is based on the accepted Pass-0
source tag `checkpoint/experimental-worlds-dual-inplace-17.0`, not on file
adjacency alone. A row is marked relocated only after its source body is moved
and browser-proved in the same application.

| Source unit | Relocated destination | Behavioural owner | Host dependencies traced | Lifecycle / persistence | Status |
| --- | --- | --- | --- | --- | --- |
| Integrated Sidecar protocol, Sequence/Scene/Take hierarchy, Reader candidate model, memory graph, traversal/journeys | `experiences/experimental-worlds/runtime/sidecar-core.js` | Experimental Worlds | `normalizeRoleplayOSConfig`, `isPlainObject`, `safeJsonClone`; all are currently resolved from the one host bootstrap and will be adapter-bound before the final core manifest | Mutates only the supplied Experimental World/timeline records; no listeners, timers, database, or provider transport | Relocated byte-for-byte from the Pass-0 source unit; browser reloaded |
| ScenePulse panel, real source-renderer bridge, Handoff Review, Thoughts, source command surfaces | `experiences/experimental-worlds/scenepulse/*.js`, `styles/scene-pulse-worlds.css` | Experimental Worlds | One document overlay root; `document`/`window` DOM APIs; pinned local ScenePulse vendor source; host actions passed by the existing ScenePulse host binding | Owns ScenePulse resize/click/key listeners, timers, panel/effects/overlay roots; existing `unmount` clears the owned roots/listeners | Relocated intact; browser reloaded with the actual Sidecar/ScenePulse view |
| Evidence-backed dossier claims | `experiences/experimental-worlds/runtime/dossier-claims.js` | Experimental Worlds | No host state, provider, document, or storage access; World/session arguments only | Persists under the owning Experimental timeline as `dossierClaims` | Relocated intact |
| Mechanics, relationship axes, cognition, inventory, altered state, World GM proposals | `experiences/experimental-worlds/mechanics/world-mechanics.js` | Experimental Worlds | `HordeDossierClaims`, `getWorldTimeData`, `replaceMacros` | Persists under `session.worldMechanics`; no own listeners/timers/DB | Relocated intact |
| World portrait prompt compiler | `experiences/experimental-worlds/visuals/world-portrait-prompt.js` | Experimental Worlds | Optional current-host `HordeCanonicalImageComposer` contract | Produces request data only; actual media write remains host-owned | Relocated intact |

## Current host-owned services

- One navigation/document/bootstrap and shared modal/toast UI.
- Provider routing, current Settings, model catalog, media transport, files,
  maps, Labs, and the global backup coordinator.
- Pinned ScenePulse vendor import tree. It is a licensed runtime dependency,
  not a second Horde application; the portable build must include it.
- Normal host persistence remains `HordeStudioDB` during relocation. The
  permanent Experimental repository and one-time migration have not yet been
  activated, so no existing World records have been moved or deleted.

## Pending closure units

The in-place World library/studio/play engine, World editor/renderers, World
media helpers, narration/receipt pipeline, and World-only job lifecycle still
reside in `app.js`. They remain Pass-1 work, not an implicit claim that the
boundary is complete. Each will be relocated with its complete dependency
closure, then compared against the Pass-0 browser oracle.
