# Stock Worlds 17.0 Pass-0 import map

## Accepted implementation

- Browser-tested implementation commit: `3b64149`
- Pristine source tree: `../hordestudio-17.0.0`
- Temporary persistence authority: `HordeStudioStockWorlds17Pass0DB`
- Generated runtime SHA-256:
  `003b542ec932bb8cb5d640c91e79abb661c0eb740e6ad7704086d807d621d7b6`
- Generated stylesheet SHA-256:
  `e4b0c14ae0ac7e08c314421249f619994eba4b224dc3d1b1419089c782d1da51`
- Source map SHA-256:
  `1c20f69721ab75904670131a8a3e594bbf754bdb31bc108a5769437678d65faf`

The generated source map records the immutable local-source checksums:

| Pristine file | SHA-256 |
| --- | --- |
| `app.js` | `3648f33660f9004e047ae8a4b2e08fe31c7ba6daf60c4deec4da024d6569da7d` |
| `index.html` | `80b2697bf1bc868eec667da46fc5b041015224a95e534f3abf9eb3800ee13271` |
| `style.css` | `e4b0c14ae0ac7e08c314421249f619994eba4b224dc3d1b1419089c782d1da51` |

`scripts/build-stock-worlds-pass0.mjs` parses the exact local 17.0
`app.js`, selects the World declarations and their dependency closure, copies
the required HTML ranges, and wraps that source in the minimum Pass-0
coexistence boundary. `scripts/verify-stock-worlds-pass0.mjs` rebuilds all
three generated files in a temporary directory and requires byte equality.

Reproduce the committed output with:

```sh
node --expose-internals scripts/verify-stock-worlds-pass0.mjs \
  ../hordestudio-17.0.0 experiences/stock-worlds-17-pass0
```

## Pristine source units

The complete machine-readable list is
`experiences/stock-worlds-17-pass0/source-map.json`. Its coarse source units
are:

| Local 17.0 `app.js` lines | Ownership |
| --- | --- |
| 1452–1569 | World import validation |
| 2726–3506 | Bundled Worlds, schema migration, and World media |
| 4011–4627 | World AI Builder |
| 8362–9624 | World receipt, transaction, and ledger logic |
| 11926–32300 | World editor, play, simulation, audits, and memory |
| 39684–39807 | World visual generation |

The exact local 17.0 HTML ranges are:

| Local 17.0 `index.html` lines | Surface |
| --- | --- |
| 168–196 | World library |
| 481–700 | World play, check, and map |
| 703–1575 | World Studio |
| 4361–4550 | World play overlays and memory inspector |
| 4556–4592 | World preset and scheduler overlays |
| 4613–4714 | World dossier and session setup overlays |
| 4749–4820 | World audit and clock overlays |
| 4888–4905 | World directory record inspector |

There are 498 selected top-level declarations. Thirteen selected helpers are
not reachable from the current stock entrypoints; they remain because they are
inside the known pristine World units and removing them would be an unnecessary
semantic edit during Pass 0.

## Mixed pristine units adapted at the boundary

Only mixed host/World functions were narrowed. Their World statements remain
copied from the exact 17.0 source; unrelated branches were not brought into the
private runtime.

| Unit | Retained behavior | Excluded behavior |
| --- | --- | --- |
| `setupAIBuilderLogic` | World builder | Character builder |
| `setupConfigSearchableDropdown` | World model picker | Character picker |
| `summarizeStory` | World summary | Chat summary |
| `invalidateEpisodicFrom` | World episodic invalidation | Chat continuity mutation |
| `consolidateSessionEpisodicMemoryRun` | World memory | Chat continuity/enrichment |
| `setupVectorMemoryViewerEvents` | World memory inspector | Chat force-archive path |
| `renderVectorMemoryList` | World episodic/biography views | Chat and Room sources |
| `multiplayerCurrentSession` | World session lookup | Chat session lookup |
| `buildWorldMultiplayerSnapshot` | Stock World snapshot | Nothing; copied as a World unit |
| `buildMultiplayerCampaignTemplate` | Stock World campaign template | Chat template |
| `setupCatalogModelSearchFields` | World agent model field | Video, Settings, embedding, and Room fields |
| `setupPresetEditor` / `renderPresetEditor` | World preset editor | Character preset editor |

## Coexistence boundary

The stock runtime has one IIFE and no application `init()` or second Horde
bootstrap. It mounts into an open ShadowRoot under
`#stock-worlds-pass0-mount` in the existing document.

The mechanisms have deliberately different jobs:

- Shadow DOM contains stock selectors, duplicate IDs, overlays, and pristine
  17.0 CSS. It does not isolate JavaScript semantics or persistence.
- The IIFE keeps stock mutable variables and declarations private.
- A document proxy routes stock selector/event access to the ShadowRoot.
- A restricted state proxy keeps World records local and exposes only named
  shared host data.
- The stock repository opens only `HordeStudioStockWorlds17Pass0DB`.
- Host functions explicitly provide provider, media, model-catalog, dialog,
  Labs, mechanics, and persistence services.
- The existing host owns navigation, Settings, Chat, Virtual Human, Video,
  Multiplayer, Pip, and the only application bootstrap.

No iframe, alternate hostname, `location.assign`, copied old host mode, or
second full `app.js` is part of the Pass-0 runtime.

## Explicit stock assumptions that cross the Shadow boundary

These are consciously retained 17.0/global-host seams, not claims of Shadow
DOM isolation. Pass 1 will turn the broad ones into the permanent boundary.

| Assumption | Pass-0 treatment |
| --- | --- |
| Shared provider settings and catalog | Read through the host binding; `toolShyModels` and `structuredModel` remain global settings and may be updated by pristine stock UI. |
| System presets | Read and imported through the shared host preset collection; they remain an application-global facility. |
| Personas and active persona | Read through the explicit proxy so stock timeline setup retains 17.0 behavior. |
| Character roster | Read by pristine World memory consolidation; no stock write path to host characters exists. |
| Current ordinary Chat text | A read-only clone is exposed for pristine `{{lastMessage}}`-family macro behavior. |
| Provider transport, image/media helpers, regex, Labs, and mechanics | Called through named host services; no copied host Settings/provider stack exists. |
| Toasts, confirm, prompt, and modal UI | Intentionally rendered by the one host document. |
| Root theme variables | Inherited from the current host; the complete stock stylesheet remains byte-identical inside the ShadowRoot. |
| Multiplayer | One host hub asks the stock runtime for cloned, ownership-marked sources and campaign templates. Sources use composite keys and visible `Worlds` / `Experimental Worlds` labels. |

The closure audit found no unresolved Horde/application identifier in the
generated runtime. Remaining free identifiers are standard ECMAScript or
browser globals plus the IIFE bootstrap `window` reference.

## Persistence and backup behavior

- Custom/Experimental World data remains in the authoritative application’s
  existing `HordeStudioDB` stores during Pass 0.
- Stock Worlds reads and writes only `HordeStudioStockWorlds17Pass0DB`.
- A full backup includes the stock repository under `stockWorlds17Pass0`, even
  if stock Worlds was never mounted in that document.
- Restoring a Pass-0 backup validates and imports that domain.
- Restoring an older complete backup purges the temporary stock domain before
  pristine reseeding, rather than retaining unrelated stock timelines.
- Hard reset explicitly purges both authorities.

This temporary persistence arrangement is the behavioral proof boundary. It
is not the permanent Pass-1 repository design.
