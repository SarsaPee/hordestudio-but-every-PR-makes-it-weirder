# Customization inventory

This is the Pass-0 ownership classification derived from the actual local
custom 17.0, pristine 17.0, and current callers. Pass 1 will refine function
and file granularity while relocating the already-working Experimental mode;
Pass 2 will add the final pristine-17.4 overlap decision for every retained
global enhancement.

| Feature | Custom 17.0 source | Pristine 17.0 comparison | Final owner | Persistence / service authority | Pass-0 decision and evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Chat and group rooms | Authoritative `app.js` / `index.html` / `style.css` | Not imported | Current Horde host | Existing `HordeStudioDB`, current provider path | Retained unchanged; same-document navigation smoke | Retained global/host |
| Virtual Human and always-on behavior | Authoritative host plus companion files/bridge | Not imported | Current Horde host | Existing companion stores, bridge, provider/media services | Retained; 201 companion checks and always-on audit pass | Retained global/host |
| Video Adventures | Authoritative `video-worlds.js` and host seams | Not imported | Current Horde host | Existing video stores and media services | Retained; same-document smoke; inherited stale audit recorded | Retained global/host |
| Multiplayer and Pip | Authoritative host modules | Stock World-only source/template helpers compared with pristine 17.0 | Current Horde host | Existing host services | One hub/Pip retained; stock World sources use a narrow marked seam | Retained global/host |
| Settings and OpenRouter/provider configuration | Authoritative host | Stock World calls traced to required shared services | Current Horde host | Existing global settings/provider path | One Settings UI/path retained; stock receives explicit service bindings | Retained global enhancement |
| Full backup/restore/transfer | Authoritative host | No host replacement imported | Current Horde host | Host coordinator deliberately includes both authorities | Extended only with validated `stockWorlds17Pass0` payload; browser export proved both fixtures and redaction | Retained global enhancement |
| Shared-library recovery and mirrors | Authoritative host | Not imported | Current Horde host | Existing host sync/mirror authority | Preserved; newer-snapshot confirmation remains baseline behavior | Retained global enhancement |
| Generic media, files, image providers, maps, dialogs, and common UI | Authoritative host | Stock World dependencies traced | Current Horde host | Named host services | Preserved host implementations; injected only where stock 17.0 needs them | Retained global enhancement |
| Existing custom World/session/timeline engine | Authoritative `app.js` World blocks | Differs substantially from pristine local 17.0 | Experimental Worlds | `HordeStudioExperimentalWorldsDB` after controlled Pass-1 cutover | Mechanically relocated, retaining function bodies, into `experiences/experimental-worlds/runtime/`; `app.js` retains registration, state synchronization, navigation and repository seams only | Experimental domain, Pass-1 owned |
| Sidecar, Reader, ScenePulse, Thoughts, inspect/handoff | Authoritative host plus `sidecar/` and `scenepulse/` | Absent/different in pristine stock World | Experimental Worlds | Experimental World/timeline state plus pinned source runtime | Actual Sidecar badge, native ScenePulse workspace, Thoughts, and Handoff Review opened in browser. The pinned source modules, CSS and locales are physically owned under `experiences/experimental-worlds/scenepulse/vendor/ScenePulse`. | Experimental domain, Pass-1 owned |
| People, Locations, graduation, relationship metadata/meters, visuals, outfits | Authoritative custom World implementation | Not substituted with pristine helpers | Experimental Worlds | Experimental World schemas/media; visual briefs are globally persisted settings but retain Experimental semantics | Visual/media, structured documents, outfits, portrait request composition, portable media assets, People and Locations UI are mode-owned. F20 has a browser save/reload proof; F09/F16/F18/F19 remain individually pending acceptance. | Experimental domain, Pass-1 owned |
| Cognition, memory, traversal, journeys, mechanics, altered state, background work | Authoritative custom World implementation | Stock equivalents imported privately only for stock semantics | Experimental Worlds | Experimental World state/jobs; explicit shared host seams for provider, media, settings and diagnostics | No redesign or replacement. The retained Sidecar protocol, memory, mechanics, traversal and background jobs live in the Experimental runtime. Request ownership captures World/timeline/epoch/restore generation before any result can commit. | Experimental domain, Pass-1 owned |
| Normal Worlds | Generated from exact local `hordestudio-17.0.0` sources | Authoritative source of behavior | Stock Worlds | `HordeStudioStockWorlds17Pass0DB` | Pristine UI/runtime/dependency closure imported as second mode and browser-proved | Pass-0 stock domain |
| Stock Worlds registration/lifecycle | New narrow host seam | No equivalent coexistence seam upstream | Host integration seam | Same document and bootstrap | Mount/unmount plus repository readiness; no iframe or second bootstrap | Pass-0 integration |
| Stock Worlds backup registration | New narrow host seam | Required only by temporary second authority | Host integration seam | Global backup coordinator | Validate/export/import/purge paths added; real export proved | Pass-0 integration |
| World sources in Multiplayer | New narrow host seam | World-specific snapshot/template bodies copied from pristine 17.0 | Host integration seam | One host Multiplayer save authority | Both domains carry visible labels, ownership marker, and composite key | Pass-0 integration |

## Pass-0 invariants

- The custom World implementation remains the same implementation under the
  Experimental Worlds identity.
- The pristine stock implementation never reads or writes the custom World
  repository.
- Custom/Experimental code never writes through the temporary stock World
  repository.
- Global enhancements remain host-owned instead of being copied into the
  stock runtime or swallowed by Experimental Worlds.
- Source adjacency was not used as the permanent ownership boundary. The
  relocated units and their call/global/DOM/persistence/provider/job/media
  closure are recorded in `EXPERIMENTAL_DEPENDENCY_CLOSURE_MAP.md`.
