# Horde Studio: preserve Experimental Worlds, restore stock 17.0, then integrate upstream 17.4

Prepared 9 September 2026. Implementation handoff for Codex.

## 1. Product instruction and scope

Pause feature development at a safe boundary. Preserve the highly customized Worlds implementation that currently exists across the project repository and live installation. Split it into a first-class experience called **Experimental Worlds**. The existing **Worlds** experience must become the actual upstream implementation again.

This is a separation and integration task, not a new roleplay architecture, another ScenePulse port, or a reconstruction of custom features from their old plans.

Execute two distinct, testable milestones:

**Milestone A:** stock Horde Studio 17.0.0, including stock Worlds, runs alongside the preserved current Experimental Worlds implementation.

**Milestone B:** advance the stock application from the verified upstream 17.0.0 baseline to the complete verified upstream 17.4.0 release. Experimental Worlds continues running its preserved implementation through the boundaries established in A.

Do not skip A by upgrading first. Do not stop at A and report the final task complete.

The finished deliverable is one installation of Horde Studio 17.4.0 with its ordinary upstream experiences, including Worlds, plus Experimental Worlds. The experimental experience is an alternative system, not a promised successor to Worlds. Do not label it Worlds V2, Worlds 2.0, the new Worlds, or a replacement for stock Worlds.

Use `experimental-worlds` as the new product identifier unless a collision is discovered. Change presentation labels and new routing identifiers deliberately. Do not mass-rename persisted fields, old version identifiers, historical documentation, or existing function names containing `V2`; those may be compatibility identities rather than branding.

This instruction supersedes earlier constraints requiring all experimental behavior to remain in the stock `app.js`, but only to the extent required for this separation. It does not authorize an independent SillyTavern host, a second competing Reader, or replacement of the working ScenePulse experience.

## 2. Evidence, pinned references and limitations

The following references were verified remotely during preparation:

| Role | Repository/ref | Resolved commit |
| --- | --- | --- |
| Clean historical stock baseline | `ddkhan24/hordestudio`, `v17.0.0` | `8d5d68378f3fc1ac06a35ed31e05cff77be45584` |
| Stock upgrade target | `ddkhan24/hordestudio`, `v17.4.0` | `520aa2155b02289f9db1c6740a48e494124d2cca` |
| Published custom reference, NOT complete local authority | `SarsaPee/hordestudio-but-every-PR-makes-it-weirder`, branch `17.0.0` | `ecd5faa94fd7abe6b340e17381b20c86a6efce95` |

The annotated tag-object SHAs are not the peeled commit SHAs above. Verify the objects before implementation; do not infer the baseline from a branch or folder name. [S1-S3]

The supplied cross-fork comparison reports 104 commits ahead and four behind, with merge base `8ae922719d9f96c2c822412b13a993745e9f77a0`. It is not a complete record of unpushed work, and its three-dot file list is not a literal subtraction of the current 17.4 tree from the current fork. Use endpoint comparisons as well as ancestry comparisons. [S4, S11]

The published custom comparison already touches `app.js`, `style.css`, `index.html`, `horde_mcp_bridge.py`, presets, help, dossier claims, Sidecar modules and tests. The separate upstream 17.0-to-17.4 comparison changes these central application surfaces and adds shared VH modules, browser tests and packaging changes. This is why separation must include the dependencies, not only the Worlds view markup. [S4-S5]

Remote source material inspected for this brief includes those comparisons, tagged references, navigation HTML, the existing Sidecar integration/extraction documents, upstream persistence tests, engine-integrity notes and portable-build script. The very large `app.js` was not readable in full through the remote connector, and a local clone was unavailable in this research environment. No claim is made that its complete dependency graph has already been audited.

The live Mac files, uncommitted changes, browser data and running application were not inspected here. Local inspection is mandatory. The user explicitly says significant current ScenePulse work is absent or incomplete on the pushed branch. The current local implementation, reconciled across the two trees, is the behavioral source for Experimental Worlds.

## 3. Establish the source of every retained feature

Inspect the known project area and discover actual roots, symlinks, Git worktrees and launchers before editing. Previously reported paths include:

- `/Users/davidmigdale/Documents/Horde Studio Project/hordestudio-but-every-PR-makes-it-weirder`
- `/Users/davidmigdale/Documents/Horde Studio Project/hordestudio live instance v2`

These are discovery hints, not permission to overwrite either directory. An old directory called `17.0` is not necessarily a clean upstream checkout. A historically read-only/control tree must remain protected; create a new integration worktree rather than repurposing it silently.

Record, separately for each tree: actual path, remote URLs, checked-out branch and commit, staged/unstaged changes, required untracked source, local-only commits, active launch process, served document root and browser origin. Establish which loaded bundle is actually running; disk state and a long-open browser tab can differ.

Build a short preservation map: feature or dependency, authoritative local source, differences in the other tree, intended destination, and the test that demonstrates preservation. Resolve differences by behavior and code, not modification time or whole-file copying. Keep both snapshots even after choosing an integration source.

Account for custom non-World changes too. A newer visual pipeline, provider fix or preset in the live installation must not disappear merely because it is not inside the old Worlds function block. Keep experimental dependencies private where possible. Preserve genuinely unrelated custom work separately and identify any small host-level patches it requires; do not silently delete it or quietly broaden this task into another redesign.

## 4. Pause safely and create recoverable checkpoints

Stop starting new feature work and new autonomous jobs. Let safe in-flight operations complete, or use the existing cancellation/recovery boundary and record their state. Do not kill a partially applying world operation and pretend the resulting snapshot is clean. Do not indiscriminately terminate Python/Node/browser processes or restart the active bridge before identifying its owner.

Create local source checkpoints and backups for BOTH trees. A Git tag captures committed state only. Also preserve staged/unstaged diffs, required untracked code and the exact current files needed to recover the working application. Keep credentials, private world exports, generated media, logs and `.env` material out of public commits. Do not push, force-push, delete branches, reset hard, or run destructive clean commands as part of discovery.

Back up the actual persisted application data and its referenced media. Record the browser origin and any server-side persistence roots. Verify that at least one backup can be read/restored in an isolated test context. A Git checkout is not a browser-database backup.

Capture a baseline behavior report and screenshots of the running experimental experience. Run relevant existing tests and classify known failures before relocation. Do not require every previously open feature to be finished before this separation begins.

Carry forward the user's reported outstanding proof items without claiming they are complete: F16 portrait upload/clear; F18 specialist fields through Person graduation; F19 saved five-meter relationship edits; F20 saved relationship metadata; and actual Location graduation under F09. These are existing acceptance obligations, not new feature requests. Use the split's regression work to exercise them, but do not manufacture passes from source-text tests.

## 5. Keep stock at upstream paths; add an experimental package

The preferred integration foundation is a NEW branch/worktree based on the exact upstream 17.0.0 commit. Import the reconciled experimental dependency set there as an addition. Keep original custom history reachable in the preserved source branches and record those references in the manifest. This avoids re-merging the entire custom history into the stock lane.

Do not rewrite published history, use an `ours` merge to manufacture false integration, or replay 104 old feature commits into stock. Do not use the current fork's branch name as the historical stock baseline.

Conceptual layout, adjusted only for actual dependencies:

```text
repository/
  app.js                         upstream application at its normal path
  index.html                     upstream document + narrow mode registration
  style.css                      upstream stylesheet
  horde_mcp_bridge.py             upstream bridge + enumerated integration seam if needed
  ...                            other upstream files at original paths
  experiences/
    experimental-worlds/
      entry.*
      runtime/                   preserved experimental implementation
      ui/                        preserved view/editor assets
      styles/
      sidecar/
      scenepulse/
      compat/                    private pinned dependencies where necessary
      manifest.json
  integration/
    experimental-worlds/         small navigation/storage/service hooks, if needed
  docs/experimental-worlds/
  tests or existing scratch convention/
```

Do not move the entire upstream project into a new `worlds/stock/shared/...` organization. Every upstream reorganization you invent is another update conflict you then own.

The layout is not an instruction to decompose the current code into dozens of new modules. Preserve existing boundaries and source shapes first. A private, largely intact experimental runtime is acceptable if that is the safest initial extraction. Temporary duplication of a dependency is preferable to making Experimental Worlds depend on a stock helper whose semantics will change in 17.4.

Keep executable maintenance source, not just a frozen minified blob. Package-local copies are runtime dependencies, not untracked backup copies. Give each a source reference and purpose. Avoid a symlink to the user's live folder or loading code from a developer-only absolute path.

## 6. Define what actually belongs to Experimental Worlds

The extraction unit is the complete dependency closure of the current custom experience: everything required to run it, even if the original author placed it in a global application file.

Follow callers and registrations for world creation/editing, People and Locations, sessions, Timeline/Sequence/Scene/Turn/Take handling, world generation, movement/time handling, Sidecar/Reader, receipt validation and commit, direct GM refinement, ScenePulse runtime/UI/preferences, candidate graduation, cognition/memory/vector jobs, retrieval/context compilation, source traces and inspectors, world-specific mechanics, visual/outfit generation, asset references, backup/import/export, and related background work.

The historical fork documents name useful search anchors such as `executeWorldTurn`, `validateWorldTurnReceipt`, `commitWorldTurnReceipt`, `processStructuredActions`, `ensureSidecarProtocol`, `buildSidecarScenePacket`, and memory/vehicle/traversal helpers. Their old line numbers and instructions to reapply custom features to stock 16.7 are NOT the plan for this task. Use them as archaeological hints, then follow the current code. [S6-S7]

For each dependency choose: experimental-owned; safely shared through a stated contract; upstream-owned; or outside this task and preserved. The deciding question is what behavior it controls, not whether its name starts with `world`.

Do not replace the current renderers, prompts, entity model, native ScenePulse markup, memory logic or visual-authoring behavior during extraction. Do not reintroduce the old sidebar as fallback. Do not integrate ScenePulseN's new parallel/custom-panel features in this task. Existing implemented experimental features stay; unimplemented proposals remain a later workstream.

## 7. Use a real runtime boundary, not two buttons pointing at one engine

Add an ordinary first-class **Experimental Worlds** navigation entry beside **Worlds**. All upstream experiences must remain reachable and behave as upstream: Chat Library, Virtual Human, Worlds, Video Adventures and existing auxiliary navigation. The tagged HTML supplies their actual names and routes. [S8]

Give the experimental experience an independent entry and state context. Booting stock must not start Experimental Worlds' Reader, world migration, memory jobs or scene subscriptions. Booting Experimental Worlds must not accidentally start a second stock World scheduler or duplicate VH agency from a copied bootstrap.

Prefer a lazy feature entry with isolated state and explicit lifecycle when the current code permits it. If preserving the global/DOM assumptions safely requires a separate full document, use an integrated same-installation route with working navigation back, or another proved browsing-context boundary. Do not execute two complete legacy `app.js` bootstraps in the same JavaScript global scope. Do not assume an iframe solves storage or backend isolation.

The entry can be a separate document without becoming a separately installed product. However, two developer worktrees on unrelated ports, an external browser link and no integrated navigation are not the requested final handoff. A browsing-context workaround must still preserve full-size ScenePulse overlays, keyboard behavior, focus, scrolling, export/downloads and normal navigation. Do not introduce a SillyTavern iframe/runtime.

For same-document mounting, scope DOM queries, event delegation and CSS, including detached overlays appended to `body`, thought panels, portrait pickers and global shortcuts. For separate-document mounting, private CSS is preferable to changing every source selector. Either way, prove stock styles cannot reshape Experimental Worlds and experimental styles cannot leak back into stock.

Switching experiences must preserve drafts and scroll/history selection. Pending work must be finished, cancelled, or safely detached under an explicit operation owner. Late results may update only their originating stored context if still eligible, never whichever mode is now visible. Test active jobs, not just idle tab changes.

## 8. Isolate persistence BEFORE stock startup can migrate anything

Distinct routes or tabs do not isolate Web Storage or IndexedDB on the same origin. Separate database namespaces also do not create a security boundary against other same-origin code; they establish deliberate application ownership that must be enforced by entry points and tests. [S12]

The stock persistence audit references a shared `saveState`/`persistStateSnapshot` flow, World manifests under `HordeDB.get('worlds')`, and legacy migration during `loadState`. Therefore changing only the world list's UI filter or adding one field to World records is insufficient. Inspect the entire write envelope. [S9]

Prefer distinct stock/experimental database namespaces if the current full-state writer makes store-level isolation fragile. Scope localStorage keys, settings mirrors, draft buffers, caches, migration flags, active selections, revision guards, broadcast channels, worker jobs and server-side data roots too. Keep stock data in stock's expected internal schema; expose any needed database-name configuration through a minimal documented bootstrap seam rather than rewriting stock World semantics.

The required guarantees are:

- Stock boot, normalization, save, import, deletion, recovery and pruning cannot modify Experimental Worlds records or assets.
- Experimental operations cannot overwrite a stock application's stale full-state snapshot or update its Worlds manifest.
- Neither background host can discover the other's jobs simply because an ID or storage filename matches.
- A stock migration never reads a customized world as a stock schema it should repair.
- A mode selector, record kind, namespace or route is not trusted solely because a caller happened to supply it; mutation entry points resolve and verify their context.

Perform migration as copy, verify, then guarded cutover. Read the existing data using the owning current implementation before running stock on that origin. Make a consistent snapshot, including pending operation identities and source/asset references. Copy experimental state into its namespace; verify IDs, relationships, timelines, source revisions, media ancestry and representative content; reopen it through the experimental loader; only then activate the new navigation.

Do not silently empty the existing library, rewrite all experimental worlds as stock, or leave mixed legacy data available for stock auto-migration. Keep the preimage backup untouched. Quarantine ambiguous old records with an explanation, not a name-based guess. Stock may start with a clean, isolated world library and known-compatible fixtures while older records are classified.

Preserve non-World user data as well: existing Chat Library records, Virtual Humans, personas, application preferences and their media must remain available to their intended upstream experiences. Plan any copy into a stock namespace explicitly and verify it with the stock loader. Separating the world libraries is not permission to ship an apparently empty application around the experiment or lose unrelated saved work. Credentials require their existing secure handling, not a public export.

Migration must be idempotent, restartable, and detectable after interruption. A second startup must not recopy stale originals over newer work or create duplicate people/locations. Under storage pressure, stop before destructive cleanup and preserve the source. Do not delete the last original media copy to make the migration fit.

Preserve the existing origin by default. If a deliberate new origin is chosen, move data through an explicit tested export/import route and retain the old origin until readback succeeds. Changing `localhost` to `127.0.0.1`, a port, or protocol is not a harmless cosmetic operation for stored browser data. [S12]

## 9. Pin shared service contracts; do not build a new platform first

Sharing is permitted when a service is genuinely independent of World meaning. Provider transport, credential resolution, generic blob storage, notifications and file operations can have narrow adapters. Do not create a universal capability bus or plugin marketplace just to move this code.

A shared helper that normalizes People, decides presence, advances time, compiles a World prompt or applies a relationship is not merely plumbing. Preserve the experimental version or adapt it behind a contract. Do not inherit the 17.4 implementation accidentally through a global function with the same name.

Inspect custom bridge endpoints, structured-output handling, reasoning controls, tracing, image/FIBO requests, media import, and worker protocols. The experimental frontend must not be kept old while its backend silently becomes incompatible.

Choose the smallest safe boundary per service: a compatible shared bridge with explicit capabilities and separately owned experimental routes; or a pinned private compatibility module/process managed by the same launcher if contracts cannot safely be shared yet. A private process is acceptable only as a documented dependency, with a distinct data root, lifecycle, version and local endpoint. Do not make the user install or launch an unrelated second app.

Requests, results and persisted jobs must retain product/workspace/world/timeline/attempt ownership as appropriate. Test cancellation, wrong owner, late response, incompatible capability and restart. Never silently substitute a new provider/model/schema as an extraction repair.

Preserve existing security and localhost-binding behavior. Do not disable CSP, widen CORS to all origins or expose secrets to solve a routing problem. Credential sharing must use an explicit application facility, not URLs, logs or public manifests. Share immutable media only with correct reference ownership; the simpler first implementation may keep separate assets rather than introduce shared garbage-collection risks.

## 10. Milestone A: prove stock 17.0 plus the current experiment

In the integration worktree, the root application starts from verified upstream 17.0.0. Do not rebuild stock Worlds by trying to undo custom changes hunk by hunk. Bring in Experimental Worlds and the minimum host seams.

Produce a stock-parity report against that exact upstream tree. Every difference outside experimental-owned files must have a named purpose: mode registration, storage bootstrap, bridge contract, packaging, tests/docs, or separately preserved user work. No unlisted custom World semantics may remain active in stock `app.js`.

Do not merely hide custom fields in stock. Stock World creation, editing, generation, transactions and persistence must use stock implementations. Experimental Worlds must use the preserved custom equivalents.

Prove in a real browser:

1. Clean stock 17.0 starts, and a synthetic stock World can be created/opened/saved/reloaded and used through its normal turn/movement flow.
2. The preserved experimental test world opens with native ScenePulse, correct People/Locations, history and current scene. A saved-draft send/inspect/rewind-to-draft/resend loop still works without losing provenance or duplicating work.
3. Save/reload both experiences, switch repeatedly, then repeat with jobs and draft edits pending. Same-named and deliberately same-ID synthetic records in isolated namespaces do not collide.
4. Trigger stock save, migration, deletion and background work while the experiment exists. Verify experimental domain content and assets are unchanged. Repeat in the other direction. Document only intentional cosmetic/shared-preference changes.
5. Reopen from the actual integration launcher on a fresh tab, not a stale running page. Confirm served build identities for both products.

Use copies of the user's representative world and synthetic data, not destructive experiments on the sole live library. Existing provider permissions still apply; real calls should use the authorized disposable test context and be distinguished from mocks.

Tag the successful dual-17.0 checkpoint. Its experimental package hash and behavioral evidence become the reference for the next step. Do not block the whole run on unrelated old defects; record baseline defects and protect against regressions. Isolation, data-loss and boot failures ARE phase blockers.

## 11. Milestone B: integrate the complete upstream 17.4 release

Only after A passes, fetch the exact 17.4 target and integrate the COMPLETE upstream release into the stock application. This is not selective cherry-picking of the features we happen to want. It includes upstream Worlds, Virtual Human, video, shared modules, bridge, assets, tests, launcher/release changes and other shipped paths. Do not change the scope to upgrading Worlds alone.

Use `fetch` and an explicit verified merge/update in the integration worktree, not a blind `git pull` in either dirty live tree. The upstream tags provide the exact target; do not drift to whatever newer `main` happens to be at execution time. An update tool should fail visibly on unreviewed conflicts, not overwrite files to manufacture success.

Keep original upstream paths so normal history remains useful. Resolve only the enumerated host seams. If a conflict requires rewriting experimental domain semantics, the boundary is incomplete: repair or pin that dependency rather than surrendering the preserved implementation to upstream's World model.

Do not merge the historical custom branch back into the stock lane. Do not cherry-pick 17.4 World reducers into Experimental Worlds. Changes inside the experimental package during this phase need an explicit compatibility reason and regression evidence; a silent upgrade of its model, clock, memory or schema is out of scope.

Upstream 17.4's notes specifically include VH/shared simulation and photo changes as well as stronger World transactions, persistence, movement and background validation. Preserve their actual feature ownership; do not describe every VH change as a new Worlds feature. Upstream's own verification uses synthetic data and mocked providers, which does not prove live provider quality. [S10]

Repeat stock parity checks against pinned 17.4 and repeat the experimental baseline tests. Record any changes in the experimental content hash and explain every one. The desired normal result is an unchanged experimental core with only narrowly tested adapter changes where needed.

Final UI/version reporting should say Horde Studio 17.4.0 and show Experimental Worlds with its independent build/revision or Alpha label in suitable diagnostics. Do not make the experiment pretend it implements upstream World's 17.4 semantics.

## 12. Final acceptance must include a packaged installation

The upstream portable builder copies an explicit file list, then selected asset and relay directories. A folder present in the repository is not automatically shipped. Extend packaging deliberately and verify every required experimental asset, module, schema, worker and license notice. [S13]

Build a combined portable artifact and test it from a fresh extraction directory. It must not load code from the original checkout, live folder, absolute Mac paths, an existing developer server, a symlink, or development `node_modules`.

Demonstrate the regular upstream modes, stock Worlds and Experimental Worlds from the same installation. Verify navigation, reload, server routing, dynamic imports, CSS, detached overlays, worker paths, imports/exports and media loading. Preserve launcher ownership checks and stable origins; an old launcher must not silently kill the process serving another installation.

The experimental startup must load real saved/test-world data, not blend tutorial fixture fields into a live scene. Keep a labelled demo as a demo. Missing live coverage stays missing/stale as defined by the existing product, not filled from a sample cafe.

Finish with one designated maintained project checkout and a live installation built from that integration revision. Deploy the tested package through an audited file manifest only after preserving the old live installation and quiescing its writers. Verify project-build/live served-file parity, including private experimental modules and bridge versions. Do not mirror one old source tree over another, delete private files because they are absent upstream, or leave the new build working only in a temporary test worktree. Keep protected reference trees as references and record where future development and launch now occur.

Include an explicit experimental export discriminator and reader/version checks where compatible with existing export formats. Stock import must not silently strip unknown fields from an experimental export. It should reject or route it appropriately. Cross-mode conversion is a later, explicit copy operation; building a general converter is out of scope.

The final combined build must carry forward the five outstanding feature proofs from section 4. Mark genuine remaining failures accurately. Packaging and relocation do not turn untested behavior into tested behavior.

## 13. Minimum regression matrix

| Boundary | Required proof |
| --- | --- |
| Sources | Both local trees preserved; selected feature sources and unpushed work accounted for |
| Stock 17 baseline | Tagged stock behavior works before the update, with an enumerated host patch set |
| Experimental entry | Correct private code, CSS, preferences and source modules load; no old sidebar fallback |
| Storage | Cross-mode boot/save/migrate/delete/prune cannot touch the other mode's domain or media |
| Existing data | Verified copy/cutover, stable IDs, idempotent rerun, safe interrupted migration |
| Async lifecycle | Switch/reload/cancel/late response cannot publish into the wrong experience or Timeline |
| Shared bridge | Actual request shapes, returned controls and job owner survive the 17.4 bridge change |
| Stock 17.4 | Whole upstream release integrated; standard modes and upstream test gates exercised |
| Experimental continuity | Representative scene, thoughts, relationships, memory, visuals and draft loop match baseline |
| F16 | Upload, save/reload, clear, reload; correct portrait association and fallback |
| F18 | Meaningful supplied specialist state plus N/A survive Person graduation and reload |
| F19 | Five values and labels save/reload exactly, including zero/decrease and correct directed identity |
| F20 | Type, phase, time and milestone save/reload without changing meters or another relationship |
| F09 place proof | Scene-local place graduates/matches the intended Location and parent, without duplication |
| Package | Fresh extraction runs both modes without external checkout files or missing modules |
| Update rehearsal | The actual A-to-B update demonstrates the boundary; remaining upstream diffs are allowlisted |

Keep source-shape guards as migration tripwires, but use behavioral tests and browser interaction for acceptance. A test that merely finds the new label, file name or callback does not prove separation.

Run the repository's current relevant suites and upstream 17.4's documented engine/browser gates, resolving their environment in the test worktree. The documented commands include `node scripts/check-engine.js`, `node scratch/browser_storage_transaction_audit.js`, and `node scratch/browser_engine_smoke_audit.js`. These cover defined invariants, not the whole custom product. [S14]

## 14. Future update contract

Add one maintained intake document and a small verification script using the existing toolchain. Record upstream base/target, Experimental Worlds revision, file ownership, host patch allowlist, capability versions, data namespaces and test commands.

A routine future update should be: fetch a pinned upstream release into staging; update the upstream-owned tree in place; reapply/review the small registration and service seams; run stock parity and cross-mode regression; build and test the combined package; deploy. A new collision with experimental-owned paths fails for review.

Do not claim arbitrary future releases are automatically compatible. The achieved guarantee is narrower and useful: an upstream World rewrite no longer requires semantically merging that rewrite into the experimental World implementation. Browser, bridge, persistence or provider contract changes can still need small compatibility changes, which must be visible and tested.

There is no requirement to make Experimental Worlds permanently frozen. It continues normal development on its own code and data model. Pinned compatibility code can be reduced later when a shared contract has actually proved safe. That future cleanup is not a prerequisite for this extraction.

## 15. Work sequence and reporting discipline

Proceed autonomously through preservation, extraction, Milestone A, Milestone B and packaging. Do not pause for routine naming, tab-placement or field-ownership questions already decided here. Ask only where a genuinely irreversible or substantively conflicting local state cannot be resolved safely from source and backups.

Persist this full handoff in the integration repository and maintain a short progress ledger beside it. After context compaction, reread the current phase and outstanding acceptance items. Do not let a compressed recollection turn the task back into a ScenePulse redesign.

Use coherent commits: provenance/checkpoints; experimental package and dependency relocation; host registration and lifecycle; storage/cutover; verified dual 17 baseline; upstream 17.4 integration; package/test evidence. Preserve sensitive backups outside public commits.

Final report must identify:

- Both starting local trees and the exact selected custom-source checkpoints.
- Clean upstream 17.0 and target17.4 SHAs; the integration branch and phase checkpoints.
- What moved and what deliberately remained shared, including bridge and media ownership.
- Exact data namespaces, migration/readback results and rollback procedure.
- Stock parity differences, each explained, plus experimental core/hash preservation through upgrade.
- Browser evidence for both modes, existing open F proofs, isolation and the send/rewind/resend loop.
- Fresh-package evidence and the exact artifact for handoff, with credentials/private data excluded.
- Genuine unresolved items and the next ordinary upstream update procedure.

Definition of done: a person can launch the combined Horde Studio 17.4 installation, use the real upstream Worlds, select Experimental Worlds and use the preserved custom system, save/reload both, and update upstream-owned files without merging two different World models together.

**Preserve the working experiment. Restore stock 17.0 around it. Prove both. Then update the stock application to 17.4. Do not start over.**

## Source index

These are research references, not claims that the local integration already passes.

[S1] Upstream 17.0 annotated tag, peeled to commit `8d5d68378f3fc1ac06a35ed31e05cff77be45584`:
`https://api.github.com/repos/ddkhan24/hordestudio/git/tags/42f3b78d70fa166e562c77152b58ecea1747cf01`

[S2] Upstream 17.4 annotated tag, peeled to commit `520aa2155b02289f9db1c6740a48e494124d2cca`:
`https://api.github.com/repos/ddkhan24/hordestudio/git/tags/8455c8f3727f9cdb38b3c137a4ba90b2057e562e`

[S3] Published custom branch reference at inspection:
`https://api.github.com/repos/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/git/ref/heads/17.0.0`

[S4] User-supplied comparison, whose refs should be frozen before local analysis:
`https://github.com/ddkhan24/hordestudio/compare/v17.4.0...SarsaPee:hordestudio-but-every-PR-makes-it-weirder:17.0.0`

[S5] Stock release-to-release comparison:
`https://github.com/ddkhan24/hordestudio/compare/v17.0.0...v17.4.0`

[S6] Historical custom integration map (source anchors, not current task instructions):
`https://github.com/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/blob/ecd5faa94fd7abe6b340e17381b20c86a6efce95/sidecar/patches/16.7-integration-manifest.md`

[S7] Historical extraction map:
`https://github.com/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/blob/ecd5faa94fd7abe6b340e17381b20c86a6efce95/docs/migrations/16.7.0-runtime-extraction-map.md`

[S8] Tagged upstream 17.0 navigation/boot document:
`https://github.com/ddkhan24/hordestudio/blob/8d5d68378f3fc1ac06a35ed31e05cff77be45584/index.html`

[S9] Stock persistence regression contract:
`https://github.com/ddkhan24/hordestudio/blob/520aa2155b02289f9db1c6740a48e494124d2cca/scratch/persistence_hotfix_audit.js`

[S10] Upstream 17.4 release notes:
`https://github.com/ddkhan24/hordestudio/blob/520aa2155b02289f9db1c6740a48e494124d2cca/docs/releases/v17.4.0.md`

[S11] Official Git diff semantics:
`https://git-scm.com/docs/git-diff`
Worktree reference for non-destructive parallel inspection:
`https://git-scm.com/docs/git-worktree`

[S12] Browser origin and storage ownership:
`https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy`

[S13] Upstream explicit portable-build file list:
`https://github.com/ddkhan24/hordestudio/blob/520aa2155b02289f9db1c6740a48e494124d2cca/scripts/build-portable.sh`

[S14] Upstream engine-integrity notes, limitations and browser test commands:
`https://github.com/ddkhan24/hordestudio/blob/520aa2155b02289f9db1c6740a48e494124d2cca/docs/engine-integrity-implementation-2026-09-06.md`
