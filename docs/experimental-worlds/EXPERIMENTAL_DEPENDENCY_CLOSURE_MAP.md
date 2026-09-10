# Experimental Worlds dependency-closure map

This is a live Pass-1 relocation record. It is based on the accepted Pass-0
source tag `checkpoint/experimental-worlds-dual-inplace-17.0`, not on file
adjacency alone. A row is marked relocated only after its source body is moved
and browser-proved in the same application.

## Stock-removal independence invariant

Pass 1 is incomplete until Experimental Worlds can run with
`experiences/stock-worlds-17-pass0/runtime.js` and its stylesheet absent. No
Experimental source, CSS, persistence, DOM root, event handler or lifecycle
may require a stock-World helper or selector. A current Horde host service is
allowed only through the narrow Experimental host adapter; equivalent World
semantics are copied into the Experimental-owned runtime rather than shared
with stock Worlds. This deliberately permits temporary duplication.

| Source unit | Relocated destination | Behavioural owner | Host dependencies traced | Lifecycle / persistence | Status |
| --- | --- | --- | --- | --- | --- |
| Integrated Sidecar protocol, Sequence/Scene/Take hierarchy, Reader candidate model, memory graph, traversal/journeys | `experiences/experimental-worlds/runtime/sidecar-core.js` | Experimental Worlds | `normalizeRoleplayOSConfig`, `isPlainObject`, `safeJsonClone`; all are currently resolved from the one host bootstrap and will be adapter-bound before the final core manifest | Mutates only the supplied Experimental World/timeline records; no listeners, timers, database, or provider transport | Relocated byte-for-byte from the Pass-0 source unit; browser reloaded |
| ScenePulse panel, real source-renderer bridge, Handoff Review, Thoughts, source command surfaces | `experiences/experimental-worlds/scenepulse/*.js`, `styles/scene-pulse-worlds.css` | Experimental Worlds | One document overlay root; `document`/`window` DOM APIs; pinned local ScenePulse vendor source; host actions passed by the existing ScenePulse host binding | Owns ScenePulse resize/click/key listeners, timers, panel/effects/overlay roots; existing `unmount` clears the owned roots/listeners | Relocated intact; browser reloaded with the actual Sidecar/ScenePulse view |
| Evidence-backed dossier claims | `experiences/experimental-worlds/runtime/dossier-claims.js` | Experimental Worlds | No host state, provider, document, or storage access; World/session arguments only | Persists under the owning Experimental timeline as `dossierClaims` | Relocated intact |
| Mechanics, relationship axes, cognition, inventory, altered state, World GM proposals | `experiences/experimental-worlds/mechanics/world-mechanics.js` | Experimental Worlds | `HordeDossierClaims`, `getWorldTimeData`, `replaceMacros` | Persists under `session.worldMechanics`; no own listeners/timers/DB | Relocated intact |
| World portrait prompt compiler | `experiences/experimental-worlds/visuals/world-portrait-prompt.js` | Experimental Worlds | Optional current-host `HordeCanonicalImageComposer` contract | Produces request data only; actual media write remains host-owned | Relocated intact |
| World presentation, portable media assets, image briefs, structured visual documents, portrait/outfit state, Fibo request composition | `experiences/experimental-worlds/visuals/world-visual-media-core.js` | Experimental Worlds | Generic host image read/resize remains in `app.js`; `isPlainObject`, `safeJsonClone`, `cssColor`, `livingClamp`; the explicit visual-media adapter exposes only shared `imageGuidePresets` and Experimental media-dirty notification. `worldNpcPortraitSource` remains an Experimental renderer relocation dependency. | Mutates only the supplied World record, its visual projects and embedded media; a per-button outfit confirmation timer remains subject to the later full lifecycle pass. Global settings retain/persist brief values but do not own World visual semantics. | Relocated mechanically from the Pass-0 source block (62,264 original bytes; three narrow host seams). Browser reloaded and opened the real Visuals tab with 13 embedded assets, presentation controls, image pipelines and saved-brief controls intact. |
| World visual provider choice, model fallback and generated-image portability | `experiences/experimental-worlds/visuals/world-visual-provider-core.js` | Experimental Worlds | Effective provider setting through the visual-media adapter; current host-owned provider catalog/transport helpers, secure media stabilizer and generic image normalization remain explicit pending adapter dependencies | Produces selected provider/model and portable image data only; no World repository access | Relocated mechanically from the Pass-0 source unit; one effective-settings seam. Browser reload preserved the actual Visuals tab and its inherited provider selectors, model controls, portable-media summary and saved briefs. |
| World Studio editor, locations/people/items directories, travel, factions, sandbox, lore, AI configuration, HUD/stats, World Architect, audit and exact custom World save/recovery behaviors | `experiences/experimental-worlds/runtime/world-studio-core.js` | Experimental Worlds | Existing custom host primitives are still resolved by the current global surface while the adapter closure is completed: modal/toast/navigation, generic media, provider transport, maps/files, shared settings and host persistence coordination. It has no stock Worlds import, renderer, store or stylesheet dependency. | Owns the Experimental World editor and the mutation/render path for its custom World records. Persistent repository routing remains the next explicit ownership change. | Mechanical 7,538-line relocation from the accepted Pass-0 source with byte-for-byte audit. Browser reloaded the real Experimental World Presentation tab, including 13 stored assets and the original controls, under the one staging document/bootstrap. |
| Experimental visual presentation, structured visual documents, outfits, Scene Inspector and Sidecar backstage/reader presentation styles | `experiences/experimental-worlds/styles/world-visuals-and-sidecar.css` | Experimental Worlds | Host design tokens and generic controls only. No stock Worlds stylesheet. | Owns the exact style rules for the relocated custom visual/media/Sidecar renderer unit. | Mechanical 562-line relocation from the final Pass-0 CSS source unit with byte-for-byte audit; loaded by the same document before bootstrap. Earlier mixed World-play CSS remains a separately tracked relocation unit. |

## Current host-owned services

- One navigation/document/bootstrap and shared modal/toast UI.
- Provider routing, current Settings, model catalog, media transport, files,
  maps, Labs, and the global backup coordinator.
- `host-adapters/experimental-worlds/visual-media-host-adapter.js` is the
  current narrow bridge for the relocated visual core. It exposes no host
  state object, stock World records, provider credentials, or stock writer.
- Pinned ScenePulse vendor import tree. It is a licensed runtime dependency,
  not a second Horde application; the portable build must include it.
- Normal host persistence remains `HordeStudioDB` during relocation. The
  permanent Experimental repository and one-time migration have not yet been
  activated, so no existing World records have been moved or deleted.

## Pending closure units

The in-place World library/studio/play engine, World editor/renderers (such as
`worldNpcPortraitSource`), narration/receipt pipeline, and World-only job
lifecycle still reside in `app.js`. They remain Pass-1 work, not an implicit
claim that the boundary is complete. Each will be relocated with its complete
dependency closure, then compared against the Pass-0 browser oracle.

The corresponding World-only CSS remains in `style.css` except for the
already-relocated native ScenePulse stylesheet. It must be moved alongside its
renderer into Experimental-owned styles and scoped to the Experimental mount.
Shared host tokens and controls stay host-owned; stock World selectors never
become an Experimental dependency.
