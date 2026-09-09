# Horde Studio: ONE application, preserved global enhancements, Experimental Worlds as a native mode

Prepared 9 September 2026. Corrective implementation handoff for Codex.

## 0. Controlling instruction: correct the extraction, do not preserve the workaround as the product

Deliver ONE current Horde Studio application, in ONE browser document at ONE normal origin, with ONE application bootstrap, ONE shared settings/provider/service layer, all current upstream experiences, and a separately implemented **Experimental Worlds** mode.

The user's desired result is:

```text
Horde Studio 17.4.0 + retained application-wide custom enhancements
    Chat Library                         current upstream implementation
    Virtual Human                        current upstream implementation
    Worlds                               current upstream World engine
    Experimental Worlds [EXPERIMENTAL]    extracted custom World engine
    Video Adventures                     current upstream implementation
    Other existing upstream experiences  current upstream implementations
    Shared application services          current upstream + retained global custom work
```

Selecting Experimental Worlds MUST NOT select an older Horde Studio application. Opening Virtual Human, Chat, Settings, or Video Adventures while Experimental Worlds is active must use exactly the same current implementations and the same appropriate saved records as opening them from ordinary Worlds.

This brief supersedes the earlier split brief and generated ownership/update/acceptance rules wherever they allow:

- A complete old application shipped as the final Experimental Worlds runtime.
- Cross-host navigation between `localhost` and `127.0.0.1` as the mode switch.
- A second app document, iframe, webview, or second full bootstrap disguised as a mode.
- Keeping global backup, UI, provider, or other custom improvements only inside the old runtime.
- Treating the host as necessarily byte-identical to upstream except for a tiny registration patch.

The earlier preserved runtime remains valuable as a reference and rollback artifact. It is not the accepted final runtime boundary. Do not delete it before equivalence and data preservation are proved. Do not copy it wholesale again under a new filename or wrap it in an IIFE and call that extraction.

Do not rename the feature Worlds V2, Worlds 2.0, Next Worlds, or anything implying that one World engine supersedes or outranks the other. Use **Experimental Worlds** and an **EXPERIMENTAL** badge. Preserve historical IDs and schema names unless a real migration requires changing them.

The current task is extraction, restoration of global enhancements, integration, testing, and deployment. Do not add ScenePulseN parallel lanes, new condition trackers, or redesign the roleplay engine during it. Preserve any such features already implemented locally.

## 1. Evidence and research limits

This handoff inspected the published integration at commit `2b19d9106cdcf458c55cfbca85b4ca44358f6652`, not the changing live Mac process. At that revision:

- `experiences/experimental-worlds/runtime/index.html` contains the older application's Chat Library, Virtual Human, Video Adventures, Multiplayer, Pip, Personas and Settings as well as the renamed Worlds entry. [S1]
- `OWNERSHIP.md` separates whole browser origins, uses an inert experimental background contract, and retains selected image compatibility privately. [S2]
- `UPSTREAM_UPDATE.md` restricts global integration to a short host allowlist and keeps the preserved implementation under the private runtime. That contract now needs replacement, not cosmetic editing. [S3]
- The earlier supplied brief explicitly permitted separate full documents and largely intact runtimes. This correction removes that allowance; do not reread that older permission after compaction and reintroduce the same result. [S4]
- The acceptance/commit records report useful prior isolated browser work, but not proof of the same-document architecture requested here. They also record an existing provider/date inconsistency. Preserve that record as a baseline issue rather than making its repair the prerequisite for this task. [S5]

The user specifically identifies full-state backups and restores, cross-browser/device transfer, application UI tweaks, and the custom OpenRouter system as GLOBAL improvements that must survive in the unified host. Treat these as explicit requirements, not as already independently verified functions. Discover their actual source and behavior locally.

The large monolithic `app.js` returned empty content through the remote file connector, and a direct source download was unavailable in the research container. This is not a complete dependency audit or a claim that every customization has been located. Codex must inspect the local source before editing. Function/module names proposed below are design contracts, not claims that those APIs already exist.

Pinned historical references:

```text
upstream v17.0.0  8d5d68378f3fc1ac06a35ed31e05cff77be45584
upstream v17.4.0  520aa2155b02289f9db1c6740a48e494124d2cca
reviewed split   2b19d9106cdcf458c55cfbca85b4ca44358f6652
```

Use the current maintained integration branch after checking for subsequent work. Do not reset to these references or force another 17.0-to-17.4 migration ceremony. The stock upgrade already exists. The old 17.0 trees are comparison sources, not a requirement to downgrade and repeat the completed upgrade.

## 2. Three ownership categories, not two

The prior mistake was putting everything into either stock upstream or the frozen experimental application. Classify retained behavior into THREE categories:

| Category | Responsibility | Destination |
| --- | --- | --- |
| Upstream application | Current Chat, VH, Video, stock Worlds, ordinary shell and services | Existing upstream paths, with small necessary integration points |
| Retained global custom enhancements | Full-state backup/restore/transfer, OpenRouter improvements, app-wide UI changes, generic provider/media/map/file improvements | Shared host-owned modules used across applicable experiences |
| Experimental World domain | Custom world state, scenes, timelines, Sidecar, ScenePulse, cognition, traversal, mechanics, graduation and World-specific authoring | Experimental mode-owned modules and scoped repositories |

Global improvements must work with Experimental Worlds **disabled**. Disabling the experiment must not remove better backups, provider controls or general UI improvements.

Keep stock Worlds' domain behavior upstream-shaped. That does NOT require discarding useful global enhancements to produce a pristine stock application. A global backup button, shared model browser or shell improvement may legitimately differ from upstream while stock World turn/state rules remain unchanged.

Classify by behavior and callers, not by filenames or a `world` prefix. A helper named `requestCompanionPhoto` may serve multiple experiences; a generic-looking `normalizeEntity` may encode experimental assumptions. Follow the actual execution path.

Every identified customization needs a destination and preservation test. Acceptable outcomes are retained globally, retained in Experimental Worlds, replaced by a verified behaviorally equivalent upstream implementation, or a specific conflict requiring a decision. "Archived in the reference copy" is not preservation of an active feature. Do not silently retire anything.

## 3. Local source and data inventory

Known paths are discovery hints, not permission to overwrite:

```text
/Users/davidmigdale/Documents/Horde Studio Project/hordestudio live instance v2
/Users/davidmigdale/Documents/Horde Studio Project/hordestudio-but-every-PR-makes-it-weirder
/Users/davidmigdale/Documents/Horde Studio Project/hordestudio-integrated-17.4-experimental-worlds
```

The live installation was authoritative for the custom behavior before the split. It has reportedly since been replaced by the combined deployment, so its ROOT `app.js` may now be stock. Locate the actual preserved custom source and any changes since deployment; do not assume the old path still has its old contents. The sanitized repository remains an incomplete historical reference. Preserve the unrelated non-Git `hordestudio` directory until its provenance is established.

Record active launch roots, current commits, dirty source, untracked implementation files, loaded asset versions, browser origins, database names, mirror paths, media roots and operating jobs. Preserve committed and uncommitted source plus current data from BOTH now-used origins. Do not assume the stock origin is still empty or the older 638 MB snapshot is current.

Use five comparison inputs where available: clean upstream 17.0, the pre-split custom implementation, the preserved custom runtime including later patches, clean upstream 17.4, and the current maintained/live integration. This is how global changes outside Worlds are recovered without blindly copying old files over 17.4.

Create `CUSTOMIZATION_INVENTORY.md` with these columns:

```text
feature | actual source/callers | current user-visible behavior |
owner/destination | upstream overlap | data affected |
preservation test | status
```

Inventory must explicitly include:

- Full-state backup, backup history, export/import, restore, local mirrors and cross-browser/device transfer.
- OpenRouter catalog/model selection, routing/inheritance, provider settings, reasoning/output controls, streaming, cancellation and response normalization actually implemented.
- Global layout/sidebar controls, common dialogs/pickers, help, navigation and styling changes.
- Image/media transport and asset preservation versus World-specific visual document/outfit authority.
- Existing generic maps/provider integrations where present, separate from fictional Location and traversal semantics.
- Non-World saved chats, Humans, personas, presets, settings and media.
- Experimental World features including local-only ScenePulse, memory and visual work.

Pause ongoing unrelated feature work safely. Use a new correction worktree. Preserve real source and data before editing, but do not spend the run repeatedly rebuilding inventories once the actual boundary is known.

## 4. Native mode boundary: one shell, one document

Register Experimental Worlds with the current host's normal navigation/view mechanism. Use a distinct view identity such as `experimental-worlds` and its own mount container. A hash or normal client-side route is acceptable. Changing the hostname, port, application document or application version is not.

The implementation should resemble this responsibility layout, reusing current module conventions rather than imposing a new framework:

```text
app.js                                  current bootstrap + limited integration hooks
index.html                              one shell and navigation
style.css                               current host styles
host-adapters/experimental-worlds.js     implementation of the host contract
shared/backup-*                         retained/enhanced global backup facility
shared/provider-*                      retained/enhanced common provider facilities
shared/ui-*                            extracted global UI behavior where useful
experiences/experimental-worlds/
    entry.js                            create/mount/activate/deactivate/dispose
    model/                              custom World domain
    turn/                               Narrator/Reader/Sidecar operation paths
    memory/                             cognition, consolidation and retrieval
    travel/                             spatial/traversal/journey behavior
    ui/                                 mode views, dossiers, editors, ScenePulse adapters
    persistence/                        experimental repositories and migration
    visuals/                            World-specific structured visual integration
    scenepulse/                         actual source UI modules and scoped styles
    manifest.json                       mode identity and required host capabilities
```

These folders are illustrative, not a quota. Cohesive larger modules are acceptable. Success is not a file count or minifying the same old application.

A classic `app.js` can dynamically import an ES module without converting every upstream script to modules. Use ordinary lexical module boundaries and explicit exports; importing a module does not inherently dispose its listeners or protect against all global access. [S6]

The root bootstrap should register/load the mode and supply its dependencies, not absorb thousands of lines of copied experimental implementation. Root changes may also be necessary to preserve global custom enhancements, but keep their substantive code modular where practical.

No second shell, hidden app, iframe, alternate WebView, `location.assign` mode bridge, patched `document` global, eval-based extraction, or whole-old-app wrapper. Read-only reference trees may remain outside the shipped runtime. Moving the old app into `app-run.js` fails this requirement just as moving it into `runtime/app.js` did.

## 5. Extract executable behavior, not just a renamed World view

Trace the custom Worlds entry points and their dependencies. Extract actual implementations, including declarations, state access, prompt construction, event handlers, HTML fragments and cleanup. Use reliable parsing/source analysis for function boundaries; do not rely on naive brace counting or source strings evaluated at runtime.

Experimental-owned behavior includes the existing World/session model; People/Locations and candidate identity; Timeline/Sequence/Scene/Turn/Take ancestry; Sidecar questions and reconciliation; Reader profiles and evidence; actual ScenePulse interface and tracking; relationships; cognition/episodic memory/vector retrieval; semantic time; traversal methods/routes/vehicles/journeys; Altered State and implemented mechanics; Backstage; graduation; experimental World editors; and World-specific visual bindings.

Remove ambient dependencies on the old full application: old `state.worlds`, current-world getters, global selectors, old Settings DOM, old provider configuration, old `saveState`, copied VH lifecycle and old common media APIs.

For each dependency:

1. Keep it mode-owned if it defines experimental World meaning.
2. Move it into shared host infrastructure if it is an application-wide custom improvement.
3. Bind to the current host implementation if the contract is suitable and its behavior is preserved.
4. Retain a small, named World-specific compatibility helper only when it genuinely represents a domain requirement. It must have documented purpose and tests, not a hidden old provider/settings stack.

Do not extract old Chat, Virtual Human, Video Adventures, Pip, Multiplayer, global Settings, generic catalog browsers or backup UIs into the mode. Reaching them through a dependency chain means the chain needs an interface, not that the whole application is a necessary dependency.

Preserve the current code's behavior first. Do not rewrite thoughts, replace ScenePulse markup, simplify rich fields into generic cards, change the World model, or repair unrelated narrative quality while moving it.

## 6. Explicit host interfaces, minimal abstraction

Create the adapter close enough to existing host state/functions that it can access them deliberately. Supply a small service object when creating the experimental mode. The mode must not import the whole monolithic host or read undocumented global state. `app.js` may call registration code inside its existing scope; it need not export every internal function.

Conceptual services, implemented only where an existing caller needs them:

| Host capability | Required behavior |
| --- | --- |
| Navigation and dialogs | Same current shell; owned overlay roots; draft-aware leave handling |
| Settings and model catalog | Single global UI and persisted source; preserved world/role override precedence |
| Text/embedding/vision/image requests | Existing allowed provider routes, credentials, model controls, streaming, cancellation, finish metadata and diagnostics |
| Media/files | Import, resolve, read, save and reference assets without an old duplicate catalog |
| Backup coordinator | Register data partitions, serialize/validate/restore, enumerate asset roots |
| Task services | Shared transport infrastructure with scoped owners, limits, cancellation and completion |
| Notifications/logs | User-readable status; technical traces in Inspect/Backstage |
| Optional map/provider clients | Geographic/provider data only, not experimental movement authority |

The names of these services are illustrative. Avoid a dependency-injection framework, universal plugin marketplace or generic command bus project. A small documented object and existing modules are enough.

The host's provider layer executes requests. The mode constructs its narrative and Reader prompts, resolves its role-level settings against global defaults, and decides domain consequences. Shared transport never silently replaces the mode's prompt, truncates supported metadata, or changes its model/reasoning policy because another view is selected.

Capture operation ownership when starting a request: mode, world, timeline, Take/source revision and attempt where applicable. Capture effective model/profile controls too. Completion must not consult whatever world is now selected.

Version the small integration contract, or otherwise check required capabilities explicitly. A missing capability should produce a useful mode error and leave the rest of Horde usable. Do not silently fall back to the frozen application.

Updating the implementation behind a compatible host interface should benefit all its consumers. Updating an incompatible interface requires an adapter adjustment. No architecture can promise arbitrary future changes never break consumers. The useful goal is limited compatibility work, not immunity.

## 7. Preserve global custom enhancements as active host features

### 7.1 OpenRouter and provider controls

Recover the actual custom OpenRouter implementation and integrate it once with current host provider infrastructure. Preserve its real model-selection, settings and request behavior rather than replacing it with whichever stock UI happens to be simpler.

There must not be a stock OpenRouter browser and an old experimental OpenRouter browser. The common Settings UI must be the same component opened from Chat, VH, Worlds and Experimental Worlds. Effective per-role/world overrides remain legitimate and should not be flattened into one global model.

Inventory configured catalog filters, presets, provider preferences, pricing displays, context/output metadata, reasoning settings, error handling and fallback policy only where present. Do not invent new controls to satisfy this document. Do not infer runtime capabilities from marketing model names.

Verify the actual request payload and response handling through the shared route, including finish reasons, tool/structured output, usage and cancellation as supported. A UI showing the right model name is not proof that the request used it. Credentials remain under the existing secure host policy; do not put them in URLs, logs or public exports.

### 7.2 Global UI work

Promote application-wide tweaks into current shell-owned code/styles. The retained custom sidebar toggle is an example visible in the preserved document, not an exhaustive inventory. [S1]

Keep global navigation, reusable pickers, settings/dialog improvements and other discovered UI changes available across the application where intended. Keep ScenePulse styling and experimental World controls owned by the experimental view.

Do not revert a useful global change merely to make the root diff smaller. Record intentional host deviations from upstream separately from stock World-domain deviations.

### 7.3 Visuals, media and map services

Separate image/provider transport and common assets from experimental visual-authoring semantics. The current host should own shared requests and media facilities. The experimental mode may retain its structured visual document, outfit bindings, review/history and World-specific editing behavior.

Current upstream media improvements must remain available without a second entire image stack, while existing custom protections such as source preservation and non-mutating outfit selection must not be lost. If both implement the same capability differently, record the concrete conflict and preserve the stronger required behavior rather than silently choosing one by version number.

Maps provider IDs and route responses are not fictional Location IDs or permission to move actors. Host providers may be shared; experimental location/travel meaning stays private.

## 8. Full-state backup and restore: the global recovery feature is load-bearing

Preserve the user's existing global recovery workflow. The target is a portable application-state archive that can move between browsers/devices, be used in an isolated agent test environment, and restore captured worlds, histories, preferences and generated media after accidental deletion.

This is NOT merely a single-world export, a shallow `state` JSON dump, a database filename copy, or a live mirror that follows deletions. Distinguish a synchronization mirror from an independently retained recovery snapshot. Reuse and extend the existing implementation instead of designing a backup platform from scratch.

### Coverage

Create an explicit backup manifest covering all application-owned logical partitions: current chats/Humans/personas/presets/settings, stock worlds and sessions, experimental worlds and complete experimental history, and the media/asset graph required to restore them. Preserve useful existing recovery history under its retention policy without recursively embedding every previous backup in every new backup.

Include archive format and per-partition schema versions, record counts, asset identifiers, byte lengths/checksums, inclusion/exclusion notes and a consistent snapshot identity. Provider secrets and private tokens are excluded by default under existing policy. Local file handles, blob URLs and machine paths alone are not portable asset contents.

The mode registers persistence and asset serializers with the GLOBAL backup facility. Backups must still include saved experimental data when the mode is disabled or unopened; do not boot ScenePulse, start an LLM call or run a gameplay migration merely to export data. Lightweight data adapters can load separately from the feature UI.

If a required local/generated asset cannot be recovered into the archive, report it as missing or incomplete before claiming a full backup. Do not silently reduce source resolution or treat an expired remote URL as a saved image.

### Consistent capture and guarded restore

Flush or safely checkpoint participating writes and record a consistent cut. Include browser-owned data and any required bridge-held data/media without letting stale mirrors become the source of truth automatically.

Validate the complete archive, supported schemas, references and asset integrity before replacing active data. Create a recoverable pre-restore backup. Quiesce relevant writers, stage data, commit/cut over according to the actual storage design, read back and reload application contexts deliberately. Full restore is an explicit user command; merely opening an archive must not apply it.

IndexedDB transactions span declared stores in one database, not arbitrary databases plus files. If the design uses multiple databases or a bridge, do not claim one atomic transaction across them. Use a bounded journal/recovery boundary so interruption either leaves the previous data usable or enters an explicit resumable recovery state. Reuse existing mechanisms where they suffice. [S7]

Increment a dataset/restore generation outside the restored historical operation namespace, invalidate stale jobs and reject responses started before the restore. A world ID reappearing after restore does not authorize an old request to mutate it. Reconcile or invalidate mirrors so an apparently higher mirror revision cannot silently undo the user's deliberate restore.

Full restore reproduces the chosen captured application state, subject to explicit compatibility migration. It does not undo external provider spending, external actions or data never captured in the backup. Partial/share-with-agent exports, where offered, must be clearly distinguished from a private full recovery archive.

### Essential browser proof

Create synthetic data in both World modes plus a Chat/VH and a generated-image fixture. Make a global backup from ordinary Settings. Delete a disposable world and remove the image through real UI actions. Restore the archive, reload, and verify the deleted records, history links and exact image asset return. Import that archive into a genuinely fresh isolated profile and verify both modes and non-World data without access to old browser storage.

Also test an interrupted/invalid restore and a late model response crossing a restore generation. Do not use the sole live Melbourne world for destructive tests. This authorizes destruction of synthetic acceptance fixtures only.

## 9. One origin with separate World data authority

One application does not require a single undifferentiated World schema. Stock and experimental data must remain independently owned even though they share the page and host services.

Use explicitly namespaced repositories/stores or separately named databases on the SAME origin, whichever minimally fits the existing writer. There is one global settings/library authority, not copies inherited from two full applications. Preserve stock's expected logical World view and experimental's expected World view without placing all records into an array that both normalizers scan.

The root aggregate saver must not write an old snapshot over experimental state. Stock migrations/deletion/recovery must see only stock World partitions; experimental equivalents see only experimental ones. Shared immutable assets may be reused if garbage collection checks references from every owning domain and retained backup policy. Deleting one mode's record cannot prune another mode's last image.

Same-origin modules and database names are application ownership boundaries, not a security sandbox for malicious code. Validate domain/operation identity at the data APIs; do not describe module isolation as security isolation. [S8]

Keep stable IDs within their owning namespace. Use a mode/domain qualifier where cross-domain services need disambiguation. Do not merge similarly named people or worlds, or mass-change IDs to evade one collision.

### Correcting the current two-origin deployment

Prefer retaining the established data-rich `localhost:43127` origin for the unified application unless local inspection establishes a less disruptive choice. Either way, choose ONE canonical application origin. Any alternate host supported by the launcher must not choose a different app version.

Before unified startup, export/read BOTH old origins in their own authorized contexts. JavaScript on the final origin cannot directly read the other origin's IndexedDB; use the preserved export/import or controlled migration route rather than weakening browser security. [S8]

Preserve post-split stock work, experimental work and non-World records. Compare colliding global settings/records by provenance and content. Copy non-conflicting data safely; isolate unresolved alternatives and request a specific decision only when necessary. Do not pick the highest revision across independent namespaces or overwrite one valid mirror with another blindly.

After verified import, leave originals available as recovery artifacts. Do not continue routing normal navigation into them. One-time historical data access is a migration tool, not a hidden second application in the product.

## 10. Lifecycle, DOM and stylesheet coexistence

The experimental UI owns a mount root and an associated overlay/portal root. Scope its DOM queries, event delegation, IDs and custom properties. Resolve duplicate stock IDs deliberately, including labels, ARIA references, selectors and third-party renderers.

Port the actual ScenePulse DOM/CSS behavior. Do not solve collisions by rebuilding its interface as generic Horde cards or removing thoughts, wiki, effects, history or submenus. Adapt source bindings to the mode context. Keep any ST compatibility object private to the ScenePulse adapter; do not install a competing global host runtime.

Detached thought panels, dossier/wiki overlays, relationship graphs, weather effects and global keyboard handlers need explicit ownership. Mode deactivation removes or hides its overlays and unhooks mode-only listeners/effects without leaving rain over Virtual Human. Avoid broad body/root CSS rules that restyle stock screens. Preserve full-width overlays, focus, scrolling, compact controls and reduced-motion behavior.

Define create/mount/activate/deactivate/dispose behavior. Dynamic imports are cached; leaving a view does not unload their code automatically. Dispose listeners, timers, observers and owned visual resources explicitly. [S6]

Pending operations can finish in their captured context, pause, or cancel according to the existing safe stage boundaries. Switching mode must not duplicate model calls, reset the semantic clock, or apply a result to the currently visible World. Global provider configuration affects future requests; it must not rewrite a frozen in-flight request.

The host has one ordinary VH/background lifecycle. Experimental background jobs register with explicit ownership and limits, using the host facilities where appropriate. Do not copy a second global scheduler. Equally, do not return a permanently inert placeholder for experimental memory/cognition/background work and count that as preservation.

Disabling the mode stops new experimental work safely and preserves its saved data. Backups and explicit exports remain available. Other host experiences remain functional if the experimental mode cannot mount.

## 11. Experimental opt-in and first-use warning

Use global Settings for a feature flag, conceptually:

```text
experimentalWorlds.enabled
experimentalWorlds.acknowledgementVersion
```

These are proposed preference names, not required persisted renames. New installations default to disabled. First application startup after feature introduction may show a single non-blocking invitation to enable it. Selecting its navigation item or enabling it in Settings opens the actual acknowledgment. Do not force someone using Chat or VH to accept the experiment.

Suggested user-facing copy:

> Experimental Worlds
>
> This is an alternative Worlds mode under active development. Features may not work, things may break, and behavior can change quickly. Updates may break saved worlds.
>
> Keep full backups, especially for stories and characters you care about. If something breaks, tell us what happened in the Horde Studio Discord and share your experience. Only share worlds or backups you are comfortable making public.
>
> [ ] I understand that this mode is experimental and my saved worlds may become incompatible or break.
>
> Enable Experimental Worlds | Not now

Use the existing official Discord destination. An adjacent Create full backup action can reuse the global facility. Do not imply a backup exists when no successful snapshot was created.

Enable is disabled until acknowledgment. Declining leaves all ordinary modes available and makes no World-data change. Keep the EXPERIMENTAL badge visible while enabled; do not put a legalistic warning before every turn. Ask again only on a meaningful acknowledgment-version change, not every application update.

An existing user's experimental library stays preserved and discoverable if the feature is disabled. Opt-in is not permission to erase it, publish it, start billable background calls, or skip data-loss protections. Do not use the warning as a substitute for migration checks.

## 12. Focused implementation sequence

Work in the current integration lineage in a correction worktree. Keep useful checkpoints, the upstream upgrade, preserved assets and prior tests. Do not restart the entire project or replay old feature prompts.

### Pass 0: pin and classify

Preserve the current deployment and both data origins; record the real experimental source; complete the customization inventory and a short dependency/ownership map. Mark the previous full-app/dual-origin acceptance definition superseded. Replace architecture assertions that would force the wrong design to survive.

**Exit:** every retained feature has an owner/test, global custom work is not relegated to a reference copy, and old runtime/data can be recovered.

### Pass 1: recover the unified host's global enhancements

Integrate the existing backup/restore and OpenRouter work into current host modules. Preserve other identified global UI/backend improvements and reconcile concrete upstream overlap. Use lightweight persistence descriptors so the global backup can include experimental records before the experimental UI mounts.

**Exit:** current Chat/VH/Worlds/Video use the same common settings/providers; full backup is globally available, including with the experiment disabled. Tests show the features execute, not merely that their buttons exist.

### Pass 2: extract and mount the World mode

Move the experimental World functions, scoped state and UI into cohesive modules; bind current host services; mount inside the existing shell. Remove copied non-World bootstraps, settings screens and provider stacks from the executing dependency graph. Preserve ScenePulse composition and behavior.

**Exit:** same-document navigation into and out of a real saved experimental world, with no application downgrade and no dependency on loading the old full app.

### Pass 3: complete storage, lifecycle and recovery

Route domain writes through owned repositories, handle old-origin data and mirrors, fix DOM/CSS/listener collisions, reconnect scoped background work, complete global backup/restore and opt-in behavior.

**Exit:** stock/experimental writes cannot cross; shared global changes are intentionally shared; old responses cannot corrupt switched/restored contexts; existing user records are accounted for.

### Pass 4: prove feature preservation and host sharing

Run the targeted acceptance matrix below against synthetic data and copies. Compare behavior with the preserved implementation, not only source text. Finish the essential save/restore/mode/navigation/provider paths and rerun affected existing ScenePulse tests.

**Exit:** one current application demonstrably contains both World engines, working global enhancements, and preserved experimental behavior. Known unrelated defects stay separately recorded.

### Pass 5: retire runtime workaround, package and deploy

Remove old cross-host navigation and host-based application-version dispatch from the shipped paths. Remove the full legacy app from the shipped runtime dependency set; keep it in the protected reference/rollback location. Update packaging, docs and tests to enforce the new structure.

Freshly extract and run the portable artifact. Verify no development paths or preserved server are required. Perform the guarded deployment to the maintained live installation once the stated release gates pass; do not stop at a staged ZIP. Retain rollback and test the actual served build, one origin and user-data readback after cutover.

**Exit:** one maintained repository/build, one launch flow, one live application, two World modes, all global custom improvements retained, and clear future update instructions.

## 13. Acceptance matrix: prove the boundaries that matter

A shared URL string or renamed navigation button is not enough. Use browser behavior and actual request/store observations. Record revision, fixture, operation, expected/observed result and whether providers were real or mocked.

| ID | Required proof |
| --- | --- |
| U01 | One startup document/shell. Navigate Chat -> VH -> Worlds -> Experimental Worlds -> Video -> Settings without changing origin or replacing the application document. A per-document startup token and navigation/request trace prove it. |
| U02 | Chat, VH, Video, Pip and ordinary auxiliary experiences use current host implementations regardless of the previously active World mode. No duplicate older navigation/screens in the mode package execute. |
| U03 | Experimental mode loads on demand after acknowledgment, once; disabled/declined state starts no experimental Reader/scheduler. Global services/backups still work. |
| U04 | The same current Settings/OpenRouter component opens from all applicable modes. Global settings intentionally propagate; per-role/world overrides survive. In-flight requests retain their captured settings. |
| U05 | Apply a controlled sentinel change in the shared provider adapter. Both a current host caller and an experimental caller reach it, with unchanged experimental module bytes. Inspect actual request/control/response metadata. |
| U06 | Retained global UI features are present outside Experimental Worlds. The inventory's features have behavior tests, not archival references. |
| U07 | Create synthetic stock and experimental worlds, including deliberate ID/name collisions across their namespaces. Save, reload, edit, delete and prune in both directions. The other domain's records/assets are unchanged. |
| U08 | Global full backup contains non-World data, both World domains, complete experimental history and an exact generated-image fixture. Works while experimental UI is disabled/unloaded. |
| U09 | Delete synthetic world/image, restore backup through the global UI, reload, recover content and image bytes. Transfer into a fresh isolated browser profile with no old-origin dependency. |
| U10 | Invalid/incomplete or interrupted restore does not report success or silently destroy the preimage. Pending responses/mirrors from before restore cannot overwrite restored state. |
| U11 | Existing data from both old origins is accounted for with provenance, readback and no guessed merges. Re-running migration does not overwrite later work or duplicate records. |
| U12 | Actual ScenePulse shell/cards/Thoughts/wiki/relationships/history/diffs/effects and existing experimental World editors survive. Leaving the mode cleans up its overlays, effects and shortcuts without damaging drafts. |
| U13 | Existing send -> inspect -> rewind-to-draft -> resend flow survives within the native mode. A delayed mocked completion after navigation/Take change is correctly owned. No duplicate Narrator/Reader/receipt application. |
| U14 | F16 upload/save/reload/clear; F18 specialist and N/A graduation; F19 five values including zero/decrease; F20 metadata/direction; F09 Location graduation/parent/identity pass through real UI and persistence. Use seeded cases and mocked transports where needed. |
| U15 | Experimental memory/cognition/traversal/Altered State and existing visuals remain connected to their real job/state paths. No silent inert stubs introduced to satisfy isolation tests. |
| U16 | Stock World behavior and upstream engine tests remain healthy except explicitly documented intended global host changes; experimental semantics do not activate for stock records. |
| U17 | New/returning/declining acknowledgment cases work; re-enable preserves data; the experiment flag never gates global enhancements. |
| U18 | Fresh packaged installation contains current shared modules and experimental-only code, not the old full application. It works without a reference tree, second server or developer filesystem. |
| U19 | Update rehearsal in a disposable worktree proves a compatible host/shared change reaches both consumers while experimental World behavior remains unchanged. Do not invent an unreleased 17.5 or use an `ours` merge to manufacture ancestry. |
| U20 | Live deployment actually serves the tested unified artifact and reads back both data domains. Report served revision, single origin, rollback and any remaining non-blocking baseline issues. |

Source scans are supporting checks: no legacy app script/iframe navigation, no duplicate non-World bootstraps, no unscoped full-state writes, no implicit old provider import. They do not replace the behavior tests.

A missing paid-provider configuration blocks only the live-provider claims that need it. Complete provider-independent UI/persistence/restore tests and mocked model-path tests. Preserve the existing real-provider evidence with its precise limits; run a bounded real smoke only in the user-authorized context.

Essential blockers are wrong architecture, lost global custom features, data loss/misrouting, broken boot or required mode flows, and failures introduced by extraction. Do not recursively fix every pre-existing model-quality issue. In particular, the recorded Melbourne date inconsistency is not authorization to redesign time or restart ScenePulse work unless the extraction demonstrably creates a new regression.

## 14. Pull-request and future maintenance shape

Keep upstream root paths and history recognizable. Group the correction into reviewable commits: global enhancement recovery; narrow host registration/service adapters; experimental feature modules; data migration/backup integration; lifecycle/UI scoping; opt-in; packaging/tests/docs.

Do not demand an eight-line root diff at the expense of missing features. The intended host diff includes intentional global custom improvements as well as mode registration. It should be understandable, not artificially pristine.

Rewrite `OWNERSHIP.md`, `UPSTREAM_UPDATE.md`, mode manifest and boundary tests around these invariants:

```text
one current application bootstrap and document
one shared Settings/OpenRouter/provider implementation
one global backup/restore facility with registered data partitions
stock and experimental World semantics independently owned
no copied old non-World application
```

A normal upstream update changes the host once. Existing global custom enhancements are reconciled with upstream in their own bounded files/adapters; they do not disappear. Compatible shared improvements are used by both World engines through the same services. An upstream change to stock World's model remains stock-only unless explicitly adopted. Breaking service contracts require narrow adaptation and tests, not rebuilding Experimental Worlds from a new app checkout.

Ahead/behind counts describe Git ancestry, not runtime integration. Report both the exact upstream comparison and the actual feature/ownership evidence. Do not use "0 behind" as proof that an old loaded subsystem received current host changes.

The experimental feature warning supports informed opt-in; it does not promise arbitrary future compatibility or excuse omitted functionality. Any further upstream security/reliability improvement still needs the appropriate normal maintenance review.

## 15. Definition of done and final handoff

The work is complete only when this statement is demonstrated:

> Horde Studio is one current application with its retained global custom enhancements. Experimental Worlds is an opt-in native mode made from the extracted custom World subsystem. It shares current host services and coexists with ordinary Worlds without replacing them, downgrading other experiences, losing application-wide features, or sharing World-state ownership accidentally.

The final handoff must identify current maintained/source/live revisions; the customization inventory and destinations; the mode's executing dependency graph; the shared host contract; final origin and data partitions; verified backup/restore/migration results; browser proof of no version/document switch; required ScenePulse/World regressions; fresh-package and deployed-build evidence; and named remaining baseline issues.

Do not end with another architecture proposal, two linked applications, a staged-only artifact or a green source harness. Keep the preserved app as a reference, perform the World-only extraction, restore global enhancements to the current host, and finish the integration.

## Sources

These support the diagnosis and platform constraints. Architecture sections above are the requested implementation requirements, not claims that the local application already satisfies them.

[S1] Preserved full navigation document at reviewed commit:
`https://github.com/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/blob/2b19d9106cdcf458c55cfbca85b4ca44358f6652/experiences/experimental-worlds/runtime/index.html`

[S2] Existing ownership map:
`https://github.com/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/blob/2b19d9106cdcf458c55cfbca85b4ca44358f6652/docs/experimental-worlds/OWNERSHIP.md`

[S3] Existing upstream update contract:
`https://github.com/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/blob/2b19d9106cdcf458c55cfbca85b4ca44358f6652/docs/experimental-worlds/UPSTREAM_UPDATE.md`

[S4] Earlier user-supplied `Codex_Experimental_Worlds_Split.md`, especially sections 5 and 7. It allowed a private largely intact runtime and separate full-document boundary. Those permissions are superseded by section 0 here.

[S5] Recorded acceptance and provider-date limitation:
`https://github.com/SarsaPee/hordestudio-but-every-PR-makes-it-weirder/commit/2b19d9106cdcf458c55cfbca85b4ca44358f6652`

[S6] MDN, JavaScript modules and dynamic import:
`https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules`
`https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import`

[S7] MDN, IndexedDB database transaction scope:
`https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction`
`https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB`

[S8] MDN, origin definition and storage separation:
`https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy`


