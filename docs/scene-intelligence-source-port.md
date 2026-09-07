# ScenePulse source-port manifest

Scene Intelligence adapts components from the local `SillyTavern-ScenePulse-main`
source tree. Horde keeps its state, persistence, authority graph, Reader/Sidecar
calls and Timeline lifecycle in `app.js`; no SillyTavern host/runtime code is
loaded or shipped as runtime plumbing.

## Adapted source map

| ScenePulse source | Horde target/use |
| --- | --- |
| `src/builtins/prompt.js`, `schema.js`, `src/prompts/assembler.js`, `slots.js` | Reader scene dimensions and evidence-scoped per-character thought/need/goal contract in `app.js`. Horde removes forced completion and invented-biography rules. |
| `src/generation/pipeline.js`, `delta-merge.js` | Accepted-base delta/full snapshot semantics and keyed merged character/candidate records. |
| `src/ui/panel.js`, `update-panel.js`; `css/panel.css`, `dashboard.css`, `variables.css` | Workspace shell, scene header, density and toolbar styling. |
| `src/ui/section.js`; `css/sections.css` | Collapsible Scene Intelligence sections and compact badges. |
| `src/ui/thoughts.js`; `css/thoughts.css` | Labelled, focused current-thought view for settled Reader impressions. |
| `src/ui/relationship-web.js`, `relationship-graph.js`, `sparklines.js`; relationship CSS | Directed Horde relationship rendering with only actual axis samples and preserved gaps. |
| `src/ui/character-wiki.js`, `character-history.js`, `timeline.js`, `diff-viewer.js` | All Known Characters, accepted snapshot selection and read-only history/diff surfaces. |
| `src/ui/loading.js`; loading, responsive, mobile, tablet and accessibility CSS | Actual pipeline health/retry states, responsive workspace composition and reduced-motion/focus support. |

## Deliberately not ported

- SillyTavern events, chat interception, DOM roots, settings storage and global
  context management.
- Extension-owned tracker snapshots or any direct tracker mutation.
- Name-only canonical matching, forced meter values, automatic time rewriting,
  fixed-NPC output caps and forced/fictional field completion.

## Attribution and license handling

ScenePulse is GPL-3.0. The local upstream `LICENSE` remains the source copy.
Before distributing a build containing substantial reused source/CSS, verify
the repository's distribution obligations and retain the required upstream
copyright/license material. This manifest and `THIRD_PARTY_NOTICES.md` record
the dependency; they do not assert that a notice alone resolves licensing.
