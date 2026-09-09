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
| Existing custom World/session/timeline engine | Authoritative `app.js` World blocks | Differs substantially from pristine local 17.0 | Experimental Worlds | Existing `HordeStudioDB` World stores for Pass 0 only | Product identity changed in place; implementation was not extracted or normalized | Experimental domain, still in-place |
| Sidecar, Reader, ScenePulse, Thoughts, inspect/handoff | Authoritative host plus `sidecar/` and `scenepulse/` | Absent/different in pristine stock World | Experimental Worlds | Existing custom World/timeline state plus source runtime | Actual Sidecar badge, native ScenePulse workspace, Thoughts, and Handoff Review opened in browser | Pass-1 relocation started: Sidecar and ScenePulse runtime moved intact; larger host render seam remains |
| People, Locations, graduation, relationship metadata/meters, visuals, outfits | Authoritative custom World implementation | Not substituted with pristine helpers | Experimental Worlds | Existing custom World schemas/media | Preserved one-to-one for later targeted acceptance | Experimental domain, still in-place |
| Cognition, memory, traversal, journeys, mechanics, altered state, background work | Authoritative custom World implementation | Stock equivalents imported privately only for stock semantics | Experimental Worlds | Existing custom World state/jobs during Pass 0 | No redesign or replacement; Sidecar protocol and World mechanics moved intact, remaining World engine relocation is Pass 1 | Pass-1 relocation in progress |
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
- Source adjacency is not treated as the permanent ownership boundary. The
  complete call/global/DOM/persistence/provider/job/media closure will be
  classified during mechanical Pass-1 relocation.
