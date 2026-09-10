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
| Integrated Sidecar protocol, Sequence/Scene/Take hierarchy, Reader candidate model, memory graph, traversal/journeys | `experiences/experimental-worlds/runtime/sidecar-core.js` | Experimental Worlds | Generic current-host utilities only; no stock World runtime, storage, reducer or CSS dependency | Mutates only the supplied Experimental World/timeline records; no listeners, timers, database, or provider transport | Relocated from the Pass-0 source unit; browser reloaded |
| ScenePulse panel, real source-renderer bridge, Handoff Review, Thoughts, source command surfaces | `experiences/experimental-worlds/scenepulse/*.js`, `styles/scene-pulse-worlds.css` | Experimental Worlds | One document overlay root; `document`/`window` DOM APIs; pinned local ScenePulse vendor source; host actions passed by the existing ScenePulse host binding | Owns ScenePulse resize/click/key listeners, timers, panel/effects/overlay roots; existing `unmount` clears the owned roots/listeners | Relocated intact; browser reloaded with the actual Sidecar/ScenePulse view |
| Evidence-backed dossier claims | `experiences/experimental-worlds/runtime/dossier-claims.js` | Experimental Worlds | No host state, provider, document, or storage access; World/session arguments only | Persists under the owning Experimental timeline as `dossierClaims` | Relocated intact |
| Vector embedding cache, semantic/lexical memory recall and cache namespace | `experiences/experimental-worlds/runtime/experimental-vector-memory.js` | Experimental Worlds | The explicit `ExperimentalWorldsHost.getEmbedding` primitive and shared effective embedding settings only; no host cache, host database or Chat-memory record access | Persists only as `experimentalVectorEmbeddingCache` in `HordeStudioExperimentalWorldsDB`; cache writes are bounded and owned by the Experimental repository | Relocated as a private cache in `b9e69e2`; runtime ownership audit passes. Browser reproof remains pending. |
| Mechanics, relationship axes, cognition, inventory, altered state, World GM proposals | `experiences/experimental-worlds/mechanics/world-mechanics.js` | Experimental Worlds | `HordeDossierClaims`, `getWorldTimeData`, `replaceMacros` | Persists under `session.worldMechanics`; no own listeners/timers/DB | Relocated intact |
| World portrait prompt compiler | `experiences/experimental-worlds/visuals/world-portrait-prompt.js` | Experimental Worlds | Optional current-host `HordeCanonicalImageComposer` contract | Produces request data only; actual media write remains host-owned | Relocated intact |
| World presentation, portable media assets, image briefs, structured visual documents, portrait/outfit state, Fibo request composition | `experiences/experimental-worlds/visuals/world-visual-media-core.js` | Experimental Worlds | Generic host image read/resize remains in `app.js`; `isPlainObject`, `safeJsonClone`, `cssColor`, `livingClamp`; the explicit visual-media adapter exposes only shared `imageGuidePresets` and Experimental media-dirty notification. `worldNpcPortraitSource` remains an Experimental renderer relocation dependency. | Mutates only the supplied World record, its visual projects and embedded media; a per-button outfit confirmation timer remains subject to the later full lifecycle pass. Global settings retain/persist brief values but do not own World visual semantics. | Relocated mechanically from the Pass-0 source block (62,264 original bytes; three narrow host seams). Browser reloaded and opened the real Visuals tab with 13 embedded assets, presentation controls, image pipelines and saved-brief controls intact. |
| World visual provider choice, model fallback and generated-image portability | `experiences/experimental-worlds/visuals/world-visual-provider-core.js` | Experimental Worlds | Effective provider setting through the visual-media adapter; current host-owned provider catalog/transport helpers, secure media stabilizer and generic image normalization remain explicit pending adapter dependencies | Produces selected provider/model and portable image data only; no World repository access | Relocated mechanically from the Pass-0 source unit; one effective-settings seam. Browser reload preserved the actual Visuals tab and its inherited provider selectors, model controls, portable-media summary and saved briefs. |
| World Studio editor, locations/people/items directories, travel, factions, sandbox, lore, AI configuration, HUD/stats, World Architect, audit and exact custom World save/recovery behaviors | `experiences/experimental-worlds/runtime/world-studio-core.js` | Experimental Worlds | Dialog/navigation/media/provider/maps/files are current-host services; persistence is the dedicated Experimental repository. No stock World runtime, renderer, store or stylesheet dependency. | Owns the Experimental World editor and its mutation/render path. | Mechanical relocation with source audit; browser reload preserved the real Presentation tab, assets and original controls under one document/bootstrap. |
| World Play engine: checks, narrator/prompt pipeline, session/turn/sequence/timeline flow, replay, state projections, custom game rules and native narrative renderer | `experiences/experimental-worlds/runtime/world-play-core.js` | Experimental Worlds | Current host modal/toast, provider, settings, generic media and persistence services remain explicit closure work; it does not import, inspect metadata for, or call stock Worlds. The host alone dispatches a marked stock Multiplayer request to the pristine stock runtime. | Owns the real custom World Play behavior and its World/session/timeline mutation and rendering path. | Mechanical 8,919-line relocation from the accepted Pass-0 source with byte-for-byte audit. Browser reload is performed before this relocation is checkpointed. |
| Outfit inference, session-scoped views, weather/time, shops, factions, society, consequences, traversal/presence and World context composition | `experiences/experimental-worlds/runtime/world-session-core.js` | Experimental Worlds | Current host modal/toast, generic map/media and persistence coordination are explicit closure work; no stock Worlds implementation is used. | Owns the custom World/session visual and simulation semantics that sit between a generated turn and the Play/Sidecar views. | Mechanical 4,068-line relocation from the accepted Pass-0 source with byte-for-byte audit. |
| World Agent proposals, calibration/repair passes, World audit and batch reconciliation | `experiences/experimental-worlds/runtime/world-intelligence-core.js` | Experimental Worlds | Current host provider transport/effective settings, diagnostics and persistence coordination are explicit closure work; no stock Worlds implementation is used. | Owns the Experimental World background cognition, proposal and validation semantics. | Mechanical 4,547-line relocation from the accepted Pass-0 source with byte-for-byte audit. |
| Canonical receipts, Sidecar orchestration, real ScenePulse/Reader integration, World timelines/Sequences/Takes, cognition/memory, relationship and quest translation, native ScenePulse UI binding and World ledger | `experiences/experimental-worlds/runtime/world-protocol-core.js` | Experimental Worlds | Explicit host closure remains provider transport/effective settings, the adapter-exposed embedding primitive, modal/toast/navigation, generic media and repository/backup coordination. Semantic cache and recall logic are Experimental-owned; no stock Worlds store, renderer or helper is used. | Owns all custom World protocol state, prompt semantics, asynchronous workflow, Reader/ScenePulse behavior and World-domain staging/commit logic. | Mechanical 10,649-line relocation from the accepted Pass-0 source with byte-for-byte audit; reproof after the private memory transfer remains pending. |
| Experimental visual presentation, structured visual documents, outfits, Scene Inspector, Sidecar backstage/reader, World Studio and World Play styles | `experiences/experimental-worlds/styles/world-visuals-and-sidecar.css` | Experimental Worlds | Host design tokens and generic controls only. No stock Worlds stylesheet. Its mechanically preserved source file also still carries retained global-host CSS sections, which are tracked for physical relocation rather than treated as Experimental dependencies. | Owns the exact relocated custom World CSS units. | The complete `WORLD ENGINE` CSS unit plus the final visual/Sidecar unit are copied mechanically from Pass-0. The old host copies are compatibility duplicates only; Experimental owns and loads this source directly. |
| Visual editor state, crop/fill/revision UI, location backgrounds, portrait requests and World visual generation actions | `experiences/experimental-worlds/visuals/world-visual-editor-core.js` | Experimental Worlds | Current host generic image transport/normalization, provider transport and media persistence coordination remain explicit adapter closure work. | Owns custom visual editor semantics and target-specific World media actions. | Mechanical 2,070-line relocation from the accepted Pass-0 source with byte-for-byte audit. |

## Current host-owned services

- One navigation/document/bootstrap and shared modal/toast UI.
- Provider routing, current Settings, model catalog, media transport, files,
  maps, Labs, and the global backup coordinator.
- `host-adapters/experimental-worlds/visual-media-host-adapter.js` is the
  current narrow bridge for the relocated visual core. It exposes no host
  state object, stock World records, provider credentials, or stock writer.
- Pinned ScenePulse vendor import tree. It is a licensed runtime dependency,
  not a second Horde application; the portable build must include it.
- Normal host persistence remains `HordeStudioDB`; it is not renamed or
  repurposed. `HordeStudioExperimentalWorldsDB` is the permanent World-domain
  authority. The repository stages, checksums and journals legacy imports and
  restores before applying them.

## Remaining Pass-1 closure and proof work

- The explicit host adapter is the only allowed bridge for the narrowed
  persistence and shared-continuity seams. Stock Multiplayer dispatch is a
  host-owned one-way routing decision; Experimental code contains no stock
  marker branch. Provider/media
  utilities are still current-host services and need their final adapter
  inventory before the native checkpoint.
- The old `style.css` copies of relocated World CSS are retained only as
  temporary same-host compatibility copies; they are not loaded by, imported
  by, or required by the Experimental runtime source.
- `world-visuals-and-sidecar.css` was mechanically copied from the custom
  source, so its Virtual Human, Labs, Pip, Multiplayer and responsive-shell
  chunks remain active retained host CSS for now. They are not stock-World
  dependencies, but must be physically returned to the host stylesheet before
  the native checkpoint; that relocation must preserve cascade order and is
  not a reason to reinterpret any World CSS.
- The remaining work is acceptance and lifecycle proof: data cutover
  finalization/idempotency, restore journal recovery, deterministic late-result
  rejection, targeted F09/F16/F18/F19/F20 UI paths and stock-removal browser
  verification. It is not a license to redesign the relocated core.
