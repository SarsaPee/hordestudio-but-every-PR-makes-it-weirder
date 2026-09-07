# Build ScenePulse in Worlds V2
## Source-mapped implementation directive: port the product, then connect the host

Prepared 8 September 2026. This is the controlling implementation handoff for the ScenePulse port. It is not a report that the implementation is complete.

**Read the opening directive before changing code. The previous implementation order is explicitly superseded.**

---

## 0. The job, without ambiguity

**Build ScenePulse. Use its real implementation. Make Horde Studio support it.**

This is a functional and visual port of ScenePulse into the experimental Worlds V2 experience. It is not a new presentation of Horde's old status records. It is not permission to reproduce ScenePulse's section names in generic cards. It is not a backend-hardening project that may eventually produce a sidebar.

The source product's scene model, information density, character interiority, visual composition, controls and interaction quality are the baseline. Horde's existing sidebar, shallow scene projection, Person presentation and awkward integration points are replaceable. Change them where necessary to support that baseline.

The first reviewable milestone must be a recognisable, populated, interactive ScenePulse panel running inside Horde's development build, using source demo data if necessary to separate UI-port work from broken live data. The next milestone must replace that demo input with a real model response to an authored Horde turn. Then connect and finish persistence, character records, memory, relationships, corrections, history and other host integrations without thinning the product back down.

**Do not spend the first several hours making the old sidebar safer. Replace it.**

The user's working loop is:

> Send a turn → read the response → inspect ScenePulse → revise the implementation or instructions → rewind to draft → send the same input again → compare.

Make that loop work early. A source fixture is a development reference, not a completed integration. A real API response without the source experience is also not a completed integration. Both are required.

The right-hand column remains the normal home of the main panel. Preserve the main narration column and top-level play controls. ScenePulse's own focused views, thought panel and overlays may use appropriate space. Do not reduce them to unusable miniatures merely because an obsolete Horde container was narrow.

### What takes precedence

| Previous interpretation | Controlling instruction now |
|---|---|
| Enhance the current Horde sidebar | Replace the Worlds V2 sidebar with ScenePulse's product surface. |
| Recreate something ScenePulse-inspired | Directly port/adapt source markup, CSS, renderers and behaviour. |
| Keep Horde's presentation and state shape wherever possible | Change Horde's presentation and data plumbing wherever necessary to preserve ScenePulse's useful information. |
| Finish an exhaustive backend refactor before the panel can exist | Prove the source panel first with source data; establish a real vertical slice next; fix actual integration blockers narrowly. |
| Every field needs a warning about its epistemic status | Normal labels and normal fictional content. Detailed interpretation/source information belongs behind an info action or in Backstage. |
| Preserve legacy Inline behavior at every new seam | Legacy parity is not a constraint on this experimental Worlds V2 implementation. Do not spend this task designing compatibility. |
| Everything must be pasted into one enormous app.js | One application runtime is required, not one source file. Integrated modules and normal stylesheets are permitted. |
| The host already has relationships/thoughts/locations | Trace whether it actually delivers the source feature. A field or dispatcher existing is not equivalence. |
| Remove a broken button to make the page look finished | Repair its action or explicitly report it incomplete. Removing source functionality is not a fix. |

These changes do not authorize deleting the user's worlds, resetting worktrees, leaking credentials, fabricating successful tests, or replaying a committed operation twice. Preserve data and unrelated work. Those are practical boundaries, not a reason to postpone building ScenePulse.

---

## 1. Research basis and limits

The source reviewed for this handoff is `xenofei/SillyTavern-ScenePulse`, pinned to:

```text
2888d0d748033c5b16eac410f5396af055142483
VERSION: 6.27.20
```

The commit and source files were read through the GitHub connector. The README, architecture map, schema, built-in prompt, effective prompt assembler and slots, panel/section/thought renderers, parts of the dashboard renderer, shared processing pipeline, timeline, relationship web and graph, custom-panel code, themes, constants/demo data and styles were inspected. Source links and inspected ranges appear at the end. [S01–S24]

This is not a claim to have executed ScenePulse, independently inspected the latest local Horde worktree, or read every implementation line in every source module. Some feature detail is documented by the README; code was used to resolve important discrepancies. The implementing agent must inspect the complete local files it ports and extend the manifest for any additional source feature encountered.

The earlier Astra Horde audits remain useful defect reports, not proof that every reported defect still exists after ongoing edits. Reproduce a relevant defect before changing its path. Do not blindly apply old line numbers.

The visible conversation and supplied handoffs establish the product decisions here. Retrieved earlier Marinara notes explain why a generic SillyTavern compatibility/recompiler project is not the goal. They do not establish that a prior ScenePulse port worked.

### Concrete source findings that change the execution strategy

1. **A populated source fixture already exists.** `TOUR_EXAMPLE_DATA` in `src/constants.js` includes a café scene with Elena, Marcus and Yuki, clothing, thoughts, goals, relationships, quests, weather and story ideas. Use it to make the actual renderer visible immediately. Do not write an inferior new data model just to create demo cards. [S03]
2. **The effective prompt is assembled.** `assemblePrompt()` combines named slots with panel-derived field instructions; an active full-prompt override can replace that path. Inspect the actual outgoing prompt and schema, not only `BUILTIN_PROMPT`. [S04, S05]
3. **Thoughts are generated interior monologue.** `innerThought` is not a third-person scene recap. The source explicitly requests first-person, voice-specific thoughts, immediate needs and personal goals. [S02, S06]
4. **Refresh controls perform real work.** `mkSection()` calls `generateTracker(messageIndex, sectionKey)`. The toolbar calls full regeneration. The Thoughts button currently calls full tracker generation even though it presents a thoughts action. Preserve the working affordance and verify the actual scope; do not claim a narrower call than the implementation makes. [S07–S09]
5. **The source already separates storage from current-scene display.** The thought renderer calls `filterForView()` because stored characters include people who have left. An absent registry roll call is not source fidelity. [S10]
6. **The source deliberately removed redundant presence display.** `update-panel.js` comments that the `charactersPresent` scene row was removed because the Characters section already conveys it. Three confirmations that Sarah is present repeat a problem the source already solved. [S11]
7. **The README is not the whole implementation.** It describes a circular relationship web, while current `relationship-web.js` has a seeded force-directed view, a Classic view and optional NPC-to-NPC graph data. Inspect the code behind advertised features. [S12, S13]
8. **The CSS is an ordered component system.** `style.css` imports component styles in a deliberate order. Copying two files and assigning `sp-*` classes to unrelated markup is not the port. [S14, S15]

---

## 2. Product contract: what the user must receive

The everyday experience should be ScenePulse's dense, legible representation of the fiction:

- separate time, date, weather, temperature and location treatment;
- scene topic, mood, tension, interaction, sound and summary;
- relevant people with portraits, identity, role, appearance, current outfit, physical posture, proximity, possessions, needs and goals;
- actual character thoughts, including a usable focused Inner Thoughts panel;
- meaningful relationship meters, changes, milestones, phase and history;
- a character wiki/dossier experience covering encountered people, including scene-only characters;
- quests, immediate tasks where supported, and the player's overarching purpose;
- story ideas and real controls to use or edit those ideas;
- history navigation and useful differences between moments;
- weather effects, time tint, scene transitions, themes and panel customization;
- update, refresh, stop, retry, edit and navigation controls that actually work.

It must improve roleplay, not only display the output of bookkeeping.

**Acceptance question:** after an evidence-rich turn, can the user hide the transcript and still understand who matters, what they are doing, what they want, what is on their minds, how people relate, where/when the scene is, and what changed?

A sparse scene may be sparse. A rich scene may not be reduced to a time stamp, summary paragraph and presence list because those were easiest to wire.

### The first visible result

In development, mount the actual source panel and render `TOUR_EXAMPLE_DATA` with its source-style sections, thoughts and meters. Identify it once as a **Demo scene**. Keep it out of the user's saved world and memory.

The demo must demonstrate actual composition and interactions: expandable cards, section controls, thought-panel controls, menus, relationship inspection, history navigation against explicit test snapshots and theme changes. A button whose host action is not yet connected can report that honestly during this development milestone. It cannot count as complete.

Do not report this fixture as a real Reader result. Do not stop here. Its purpose is to stop unrelated host bugs from preventing the source product from being ported at all.

---

## 3. Import strategy: preserve the implementation, replace the host bindings

### 3.1 Start from source, not the failed approximation

Pin the supplied local ScenePulse source. Compare its revision with the inspected public revision above; record differences instead of silently replacing a newer local copy.

Vendor or copy the required source files with their original filenames and provenance. Preserve useful function boundaries and component hierarchy. Replace host dependencies at their call sites or through a small explicit integration module. Do not create a general extension emulator, semantic recompiler, plugin marketplace or new service framework.

Normal imported modules under the Horde application are acceptable. A stylesheet is not another runtime. A component module is not another application. Pasting thousands of lines into `app.js` is not a requirement of single-runtime integration.

A suitable implementation may keep the app-level entry point in `app.js` while importing a source-derived feature directory. Use existing build/loading conventions. Verify every imported script, CSS file, icon and locale is actually served by the local launcher; an HTML include alone does not prove that.

### 3.2 Gut the old Worlds V2 sidebar

Retire the old renderer, duplicate event handlers, accidental cast fallback and conflicting presentation styles from the V2 route. Do not instantiate both interfaces and cover one with `display:none`. Do not let errors silently render the old sidebar instead.

Reusing an existing pure data accessor or editor launch action is fine. Preserving a defective visual hierarchy because it already exists is not.

Legacy mode may remain elsewhere if already isolated. Do not undertake compatibility engineering for it in this task, and do not destructively remove unrelated features merely to make a deletion count look impressive.

### 3.3 A small host boundary is enough

The source needs concrete capabilities, not a recreation of `SillyTavern.getContext()`:

| Source need | Horde replacement |
|---|---|
| Current chat/message context | Exact selected Turn/Take text, handoff and relevant preceding evidence. |
| Generate tracker | Existing configured Reader/provider call, with source-derived effective prompt/schema. |
| Current and historical snapshots | Horde-owned ScenePulse/Reader snapshot records in the existing world/timeline storage. |
| Settings/profile read and save | Existing world/global settings, preserving ScenePulse profile semantics and one Reader enabled flag. |
| Character identity and portraits | Horde entity/candidate IDs, authored Person data, saved portraits and explicit portrait overrides. |
| Scroll to source message | Existing transcript/Turn navigation, including loading older messages if needed. |
| User edit, quest change, merge or promotion | Specific source-pinned action through World GM/native authoring tools. |
| Stop/regenerate | Actual abort/retry/refresh control, with latest-result guards. |
| Overlay mount, measurements, focus | Horde-owned roots and normal component lifecycle. |
| Save/export/history | Existing persistence/export system with source data preserved. |

These are names of responsibilities, not a mandate to create ten classes or services. Use the smallest direct implementation that works.

### 3.4 Preserve the native richness at the boundary

Do not discard a ScenePulse field because the old Horde envelope has no matching property. Extend the integrated scene record or retain the source-shaped payload within the existing Reader record, with stable Horde IDs and metadata alongside it. Provide views to existing consumers.

A source-compatible render projection is a view, not a second database. A complete source-derived scene snapshot stored under the existing accepted turn is not a competing world registry. What is forbidden is two independent writers trying to decide the same persistent truth, not rich feature-owned data.

---

## 4. Feature-by-feature port ledger

This is the minimum source-feature coverage ledger. Add rows for additional functionality discovered in the pinned source. Do not silently mark anything omitted because it was not in an earlier Horde plan.

For every row, track: source files and revision; transferred source code/style; changed host bindings; model field or data source; active button/event handlers; visible evidence; real-data test; status and any exact remaining blocker.

Statuses are **not started / ported / wired / demonstrated / blocked**. `ported` is not `demonstrated`.

### 4.1 Main scene experience

| ID | Source feature and implementation | Required result in Worlds V2 |
|---|---|---|
| F01 | Panel shell, brand/subtitle, grouped toolbar, compact controls: `panel.js`, `panel.css` | Use actual source composition and button hierarchy in the right-hand column. Preserve breathing room and source typography. Do not substitute generic tabs as the whole product. |
| F02 | Section hierarchy: `mkSection()`, `sections.css` | Preserve headers, chevrons, icons, badges, disclosure, section refresh, contained scrolling and state persistence. Main scene/cast start open; secondary sections follow the user's first-open preference. |
| F03 | Dashboard environment cards: `update-panel.js`, `dashboard.css` | Separate date/day/year, time, location, weather and temperature cards/treatments. Keep clock/calendar/weather artwork and visual detail. The summary cannot replace these dimensions. |
| F04 | Scene Details renderer | Preserve Summary, Tension, Topic, Mood, Interaction, Elapsed, Sounds and witness presentation, including changed-field indicators and collapsed summaries. No redundant full presence list in every section. |
| F05 | Relevant character cards: `.sp-char-card`, `characters.css`, portrait helpers | Portrait/name/role and current scene state, not registry rows. Use source card structure with appearance, clothing, posture, proximity, belongings, needs and goals. |
| F06 | Role/archetype and character color identity: `constants.js`, `color.js`, character renderer | Preserve distinguishable roles, role badges and coherent per-character colors. Bind color identity to stable Horde identity where names change. Present relationship role separately from physical presence. |
| F07 | Current-scene filtering: `filterForView()` and thought renderer | Show active and meaningfully nearby/audible/remote participants. Store off-scene history without listing irrelevant absent people on the home panel. All Known Characters remains one click away. |
| F08 | Source visible-state detail | Hair, face, outfit condition, posture/physical condition, proximity, notable details and carried objects remain separately accessible. Do not squash them into one tiny description. |
| F09 | Scene-only people and local places | New bartender, corridor or coat can appear richly before registry promotion. ScenePulse-style profiles/wiki are useful immediately; Horde matching/promotion follows afterward. |

### 4.2 Thoughts, character life and dossiers

| ID | Source feature and implementation | Required result in Worlds V2 |
|---|---|---|
| F10 | `innerThought` instructions in schema/prompt/effective assembler | Fresh first-person, voice-specific internal reaction for each active conscious NPC on each authored beat. Not an emotion tag list, quoted-only extraction, or third-person recap. |
| F11 | Immediate need and short-/long-term goals | Preserve characters as people with their own concerns and trajectories. A need is not automatically the player's quest; a concern can persist without artificial novelty. |
| F12 | Focused Inner Thoughts panel: `thoughts.js`, `thoughts.css` | Port portraits, name/color treatment and full monologue presentation; drag, resize, ghost, snap and auto-fit where the host layout permits. Close remains responsive while processing. |
| F13 | Thoughts regenerate control | Wire real generation/refinement. Preserve the source affordance, inspect actual scope, and do not rerun the Narrator. Hiding the panel must not switch off live thought generation. |
| F14 | Character Wiki: `character-wiki.js`, `character-history.js`, wiki CSS | Source-style encounter browser with search, filters, sort, avatars, notes, first/last seen, appearance count, last-known location and detailed profiles. This is the dossier experience, not a separate empty Horde replacement. |
| F15 | Wiki/current/history relationship | Leaving a scene removes a person from current cards, not their dossier. Historical thoughts and observations remain browsable. Promotion connects the same identity rather than duplicating the character. |
| F16 | Portrait upload/override and preview | Preserve source avatar/portrait behaviors using Horde media storage. Selecting/clearing a portrait must not change identity or outfit. Do not confuse portrait display support with deferred image-reference-generation features. |
| F17 | Character merge/name reveal | Keep the source's useful name/alias continuity and merge affordance. Route identity changes through stable IDs and reviewed matching rather than rewriting every stored snapshot by name. |
| F18 | Optional specialist character fields | Keep relevant configurable source fields, including fertility status/notes where appropriate to an adult story, without forcing them on every person or inventing a new simulation. N/A and hidden-by-profile are valid. |

### 4.3 Relationships, quests and creative direction

| ID | Source feature and implementation | Required result in Worlds V2 |
|---|---|---|
| F19 | Five source relationship dimensions and labels | Preserve affection, desire, trust, stress and compatibility as available source-defined dimensions. Use existing equivalent Horde axes where truly equivalent; otherwise support the modeled source dimensions rather than deleting the meters. |
| F20 | Relationship type, phase, time known/together and milestone | Preserve their distinct compact roles. Do not replace the whole relationship card with a generic posture sentence. |
| F21 | Meter presentation: `relationships.css`, renderer | Preserve animated bars, previous-value marker, meaningful per-meter delta icons, color treatment and short labels. A real zero must remain zero. |
| F22 | Mini sparklines and expanded history graph: `sparklines.js` | Real accepted samples, gaps for missing samples, source graph styling, legend/focus, tooltips, message previews, data-point navigation and statistics. Empty history must not be filled with invented past values. |
| F23 | Relationship web: `relationship-web.js` | Port the actual seeded force-directed presentation and Classic view, portraits, edge glyphs, hover/inspection and directional/reciprocal treatment. Use focused workspace presentation with enough room; expanded inspection is allowed. |
| F24 | Optional NPC-to-NPC graph analysis: `relationship-graph.js` | Preserve opt-in batch inference, cached results and stale/regenerate controls, plus organization/group highlighting where supported. Horde's existing edges can supply data, but do not remove source analysis functionality simply because a relationship table exists. |
| F25 | Quest Journal and North Star | Preserve source hierarchy, urgency, detailed objectives and the distinction between player's purpose, primary arcs, optional arcs and NPC goals. Verify Active Tasks against the actual source/profile rather than inventing a missing top-level array from README wording alone. |
| F26 | Quest lifecycle and actions | NEW/UPDATED/RESOLVED styling, complete, restore/undo, remove, add and edit work. A user action must reach a specific semantic operation; no inert checkmark or generic GM greeting. |
| F27 | Story Ideas / plot branches | Preserve the five source direction categories and useful titles/hooks. Show creative possibilities, not events already happened. Keep paste-to-draft and deliberate use/planning actions; no automatic player choice or covert insertion into history. |
| F28 | Stagnation awareness | Inspect and retain the source's stagnation diagnostics and relevant refresh/recovery affordances. Use them to reveal stale tracking, not to manufacture character developments just to change the meters. |

### 4.4 History, settings, extensibility and finishing detail

| ID | Source feature and implementation | Required result in Worlds V2 |
|---|---|---|
| F29 | Timeline scrubber and Browse All: `timeline.js` | Real historical selection, latest indicator, linked source turn, pagination and message highlight. Source samples visible nodes without deleting underlying snapshots. Preserve that distinction. |
| F30 | Payload/diff inspector: `diff-viewer.js` | Preserve Changes Only, Full Diff, Side by Side, Delta Payload and Previous/Current modes, context collapsing and copy. Make this available on demand, not the everyday prose interface. |
| F31 | Full/section/Thoughts regeneration and per-message update controls | Real handlers, stop/cancel/restart, loading cleanup, returned-state update and errors. Port the actual workflow rather than replacing it with a timed spinner. |
| F32 | Loading/error/recovery: `loading.js`, `message.js`, regeneration guard | Keep visible scene behind appropriate loading treatment. Preserve good narration. Retry a failed scene update without a Narrator call. Make failures understandable and recoverable inside the panel. |
| F33 | Panel Manager and field visibility | Preserve source panel organization and field customization. Distinguish closing/hiding UI from deliberately disabling a tracked field in configuration. The latter can affect the generated schema; the former must not silently stop cognition. |
| F34 | Custom panels: `settings-ui/custom-panels.js` | Preserve add/duplicate/rename/delete, field ordering including drag where present, and text/number/meter/list/enum types, options, inversion and LLM hints. A custom field must travel through prompt, result, storage and UI. |
| F35 | Prompt/schema profiles and editor | Preserve complete profile bundles, per-world override, create/rename/duplicate/delete/import/export, schema and slot editing, and effective prompt inspection. Switching incompatible schemas forces a full read rather than merging an incompatible delta. |
| F36 | Model templates/presets and optional discovery | Carry applicable bundled templates, matching/search/family/sort and sampler guidance. Route through Horde provider controls. Optional OpenRouter discovery stays opt-in/read-only; no silent provider or account changes. |
| F37 | Themes and font scale | Preserve the five implemented themes: Default, Midnight, Fantasy, Cyberpunk and Minimal, with live changes. Preserve font sizing controls and token relationships. Source comments are not evidence of an extra sixth theme. |
| F38 | Weather effects | Port real rain, snow, hail, storm, fog, wind, sandstorm, aurora and ash behaviors available in the implementation, including combined effects where supported. Known fictional weather drives them; turning them off tears them down. |
| F39 | Time tint and scene transitions | Port time-of-day ambience and location-change presentation. Use Horde's existing fictional clock and 12-hour display. Do not generate clock changes from wall-clock time or decorative effects. |
| F40 | Mobile/tablet, compact, focus and accessibility | Port responsive presentation and controls. Replace ST geometry assumptions. Preserve access to thoughts on small screens via a suitable view even where the source disables the floating panel. Respect reduce-effects/reduced-motion and usable text/touch targets. |
| F41 | Token/time analytics | Preserve source per-snapshot/per-session usage, timings, sources and delta savings presentation, backed by real calls. Detailed analytics are optional views, not home-screen filler. |
| F42 | Crash/debug/performance tooling | Reuse useful inspector presentation and controls with Horde traces. Preserve Activity, response and error inspection, search/copy/export and useful reporting. Do not install an unbounded competing logger or send private content automatically. |
| F43 | Setup guide and guided tour | Preserve useful onboarding and the source example tour. Replace ST installation/profile instructions with Horde equivalents. Tour data never enters the user's real story. |
| F44 | Commands and macros | Carry meaningful status/regen/refresh/toggle/profile/export/debug/help actions and scene-value macros through Horde's existing command/template facilities. Host-specific ST registration is replaced, not the useful action. |
| F45 | Configuration/data export and localization | Preserve reusable profiles/custom panels and relevant scene/dossier exports. Reuse localization resources where compatible. Import is non-destructive; localization must reach generated human text where configured, not corrupt machine keys. |
| F46 | Help/version/update affordances | Keep useful source identity/help/version and attribution. Do not import the ST extension self-updater into Horde or let it overwrite adapted files. Use Horde's update/help path instead. |

### No accidental feature cuts

A source feature can be host-replaced when the *same useful action* lives in Horde: for example ST message navigation becomes Horde turn navigation. It can be changed where an explicitly accepted requirement overrides it: for example close Thoughts without stopping generation, or 12-hour display.

It cannot be declared unnecessary because there is no backend field, a renderer already exists, it is not prominent in the README, or someone called it polish. If a genuine incompatibility remains, list the exact affected source feature, current behavior, replacement decision and what is unverified. Do not quietly remove it.

---

## 5. Field-by-field information contract

Use ScenePulse's actual schema and effective field builders as the starting vocabulary. Do not rebuild the product around a weaker `summary + presence + proposals` envelope.

The tables below map source fields to the expected user experience. They are not instructions to expose form inputs for every key. The source renderers already demonstrate how to present them.

### 5.1 Scene fields

| Source field | Meaning and visible destination |
|---|---|
| `time` | Fictional time; clock/time card using existing Horde formatting. |
| `date` | Fictional calendar date and day; separate date treatment. |
| `elapsed` | Meaningful duration since the last beat, with context. |
| `temporalIntent` | Continue, flashback, time skip or parallel scene meaning; internal temporal handling and useful transition context. |
| `location` | Immediate place and parent context; retain richer Horde hierarchy behind the readable source presentation. |
| `weather` | Known fictional weather, driving weather card/effects. |
| `temperature` | Number/unit and readable conditions when established; not a fabricated numeric default. |
| `soundEnvironment` | What is audible now; keep separate from a generic scene summary. |
| `witnesses` | Observers as defined by the active schema/profile. Inspect source differences between built-in and dynamic definitions; resolve through Horde's actual perception model. |
| `sceneTopic` | Short description of the ongoing subject/action. |
| `sceneMood` | Emotional atmosphere. |
| `sceneInteraction` | How participants are engaging. |
| `sceneTension` | Calm/low/moderate/high/critical source scale; a qualitative visualization is valid. |
| `sceneSummary` | A short scene recap, supplementing rather than replacing every other dimension. |
| `charactersPresent` | Source current-roster signal, mapped to stable Horde IDs and richer presence/channel details. Not a list of everyone in the registry. |
| `northStar` | The controlled character's established overarching purpose; never invented as a player commitment simply to fill a field. |
| `mainQuests`, `sideQuests` | Player-facing ongoing objectives, with source `name`, `urgency`, `detail`. |
| `plotBranches` | Creative story ideas with source `type`, `name`, `hook`; suggestions, not past events. |
| `relationships` | Source relationship readings and available directed Horde records. |
| `characters` | Rich encountered NPC records, with view filtering separate from storage. |

### 5.2 Character fields

| Source field | What must survive |
|---|---|
| `name` | Current known identity or consistent descriptive placeholder; stable host ID remains separate. |
| `aliases` | Placeholder/name progression without duplicate people or destructive history rewriting. |
| `archetype` | Source role vocabulary such as friend, ally, rival, mentor, authority, antagonist, family, lover, lust, pet, background. Preserve distinction from presence. |
| `role` | Who the person is in this story/world, not a list of emotions. |
| `innerThought` | First-person interior monologue in that person's voice, visible now. |
| `immediateNeed` | What they need in the present scene. |
| `shortTermGoal` | What they want over coming hours/days. |
| `longTermGoal` | Their own trajectory where established or explicitly developed as character authoring, not the player's quest list. |
| `hair` | Current described hair appearance. |
| `face` | Facial appearance, expression/makeup where represented by source. |
| `outfit` | Layered clothing and current condition, preserved as useful readable text. |
| `posture` | Physical stance and present condition, including exhaustion/injury/intoxication when known. |
| `proximity` | Useful relative distance/position, with actual current channel/access. |
| `notableDetails` | Distinguishing visible traits, mannerisms and authored details. |
| `inventory` | Carried/reachable objects, not a second list of clothes. |
| `fertStatus`, `fertNotes` | Optional context-appropriate fields, not mandatory speculation. |

Horde may enrich this with actual memories, perception, attention, apparent understanding, immediate concerns and stable identity. Those additions must support the source profile, not replace it with jargon-heavy diagnostics.

### 5.3 Relationship fields

| Source fields | Contract |
|---|---|
| `name` | Resolve the relevant person; use stable IDs for identity/history. |
| `relType`, `relPhase` | Compact social relationship type and current phase, not interchangeable with emotion or presence. |
| `timeTogether` | Time known/together according to source semantics and available story evidence. |
| `milestone` | A meaningful recent relationship/personal development, with supporting history. |
| `affection`, `affectionLabel` | Affection measure and readable short label. |
| `trust`, `trustLabel` | Trust measure and label. |
| `desire`, `desireLabel` | Context-appropriate adult attraction reading where enabled; absence of attraction stays absence. |
| `stress`, `stressLabel` | Relationship/interaction stress; source sign/color treatment differs from positive dimensions. |
| `compatibility`, `compatibilityLabel` | Modeled compatibility and label. |

**Do not abolish all meters in the name of avoiding invented numbers.** ScenePulse's model-generated estimates are part of the requested experience. Record a real output as a model estimate with its scale/source; display it naturally. What is forbidden is the renderer making up 35%, copying today's score into missing past snapshots, coercing unknown to zero, or treating any estimate as externally measured truth.

If Horde lacks an equivalent metric, support the source-defined dimension in Worlds V2. If two dimensions have different meanings, keep them separate. Current posture and a durable relationship record may coexist without forcing one to overwrite the other.

NPC-to-NPC inferred graph edges similarly remain useful interpreted relations. They are not allowed to fabricate reciprocal agreement or historical events. Preserve the source analysis action as a deliberate, cached operation where needed.

### 5.4 The character wiki is the dossier surface

The Person record provides authored identity and defaults. The live ScenePulse character card provides the person in this moment. The wiki/dossier accumulates encounters, thoughts, visible changes, relationships, notes and history.

Do not make every scene-only bartender become a permanent authored Person before any of that can work. A useful scene profile can exist with a stable temporary identity. Later Match/Add to Cast/Create Outfit connects that same history through Horde's normal authoring tools.

Location and outfit follow the same principle. A described corridor or red coat can be useful now. Promotion is a later action, not an admission ticket to the UI.

---

## 6. Thoughts: import the feature, not a disclaimer about the feature

### Required normal presentation

Use **Inner Thoughts** or **Thoughts** as the title. Show portrait/name and the thought. Preserve source monologue typography and card treatment.

Do not render this as ordinary header copy:

> CHARACTER READINGS: What each person may be making of this. Private, evidence-scoped Reader interpretation, not objective canon.

That sentence explains implementation policy instead of delivering roleplay. Remove it.

Detailed explanations can live behind an info icon, spoiler preference or Backstage. A single natural description such as “A glimpse into their thoughts” in help is enough. Do not replace a paragraph with six tiny technical badges on every card.

### Generation must remain generative

The Reader is allowed to infer a plausible internal reaction from the scene and character. The precise sentence need not have appeared in the narration. Otherwise this cannot reproduce ScenePulse.

A working bartender can think about finishing service. A distrustful person can privately question an explanation. Characters can have wants and concerns independent of the player.

Keep only the necessary boundaries:

- Do not contradict established character facts without an explicit creative revision.
- Do not invent a past event and package it as retrieved memory.
- Do not give a remote character sight of an event they could not perceive.
- Do not write the controlled player's unexpressed thoughts, consent, decisions or actions by default.
- Do not turn someone else's thought into objective evidence of what happened.

These are model/data rules. They are not copy for the normal panel.

### Cadence

Every active conscious NPC gets a current thought assessment each authored beat. Do not wait for an Episode batch. Assess relevant remote/nearby people through what they could actually hear/see/read.

A fresh assessment need not manufacture a new concern. A concern can persist. Do not relabel a cached old thought as newly generated; equally do not demand artificial novelty or a new autobiography on every turn.

Publish the live interpretation with the accepted scene update. The existing cognition/memory system can digest it afterward. A background consolidation failure must not erase the live thought or make the panel wait indefinitely.

Panel visibility and generation policy are different controls. Closing Thoughts hides the panel, not the character's mental life.

---

## 7. Port the actual CSS, DOM and interaction chain

### 7.1 Preserve structural dependencies

The source component structure matters. For example, `mkSection()` creates:

```text
.sp-section
  .sp-section-header
    .sp-section-chevron
    .sp-section-icon
    .sp-section-title
    .sp-section-badge
    .sp-section-spacer
    .sp-section-refresh
  .sp-section-body
    .sp-section-content
```

Use the actual source structure and matching CSS. Do not put source class names onto a different grid and expect equivalent composition.

Likewise use the actual thought structure: header controls, body, `.sp-tp-card`, portrait/name row and `.sp-tp-monologue`. Keep full monologue text by default, as the current source does. Optional truncation/fit is a user control, not a covert cost-saving rewrite of content. [S07, S09, S10]

### 7.2 Preserve the stylesheet entry order

The inspected source `style.css` imports these files in this order. Start by carrying the component bundle with its dependencies; only remove or replace an entry after identifying its actual ownership. [S14]

```text
css/variables.css
css/panel.css
css/sections.css
css/dashboard.css
css/loading.css
css/quests.css
css/story-ideas.css
css/relationships.css
css/characters.css
css/character-wiki.css
css/relationship-web.css
css/thoughts.css
css/message-button.css
css/settings.css
css/focus-mode.css
css/debug.css
css/weather-overlay.css
css/time-tint.css
css/scene-transition.css
css/timeline.css
css/responsive.css
css/mobile.css
css/tablet.css
css/setup-guide.css
css/guided-tour.css
css/custom-panels.css
css/dialogs.css
css/accessibility.css
css/analytics.css
css/crash-log.css
css/perf-overlay.css
css/prompt-editor.css
css/preset-browser.css
```

The source's final `.mes_text[data-sp-has-tracker]` hiding rule is a SillyTavern streaming safeguard, not product styling. Do not copy it into Horde's transcript. Replace host-specific positioning and root selectors narrowly.

Scope the source tokens so they do not damage unrelated Horde screens. Also scope source-owned overlay roots correctly; putting every rule under the sidebar while mounting overlays under `body` can leave dialogs unstyled. Preserve source variables and their relationships rather than mapping every surface back to old HUD colors.

Match the source before deliberate theme customization. Preserve the actual five theme definitions. Source effects and distinctive card art are part of the job, not a last-minute “polish” bucket that never happens.

### 7.3 All interactions require a complete route

For each interactive element, record and test:

> Source element → event handler → input/context → actual host operation → result → visible update/error → persistence/history when relevant.

Inspect the complete renderer's `addEventListener` calls, delegated selectors, keyboard handlers, drag/resize handlers and imported overlay actions. This is the line-by-line interaction audit. A README bullet alone cannot prove that a button was wired.

Do not use a timer to simulate refresh. Do not remove the refresh button after discovering that its host callback is missing. Do not turn every button into the same unseeded World GM modal.

### Minimum action ledger

| Action | Required behavior |
|---|---|
| Main regenerate/refresh | Actual scene-model call; correct current authored source; last good content remains visible; result updates or actionable failure. |
| Section refresh | Actual requested section scope or honestly identified full read; retain untouched sections; no fake local animation. |
| Regenerate thoughts | Real refreshed thoughts from the selected scene without a Narrator call. |
| Stop | Abort the matching work; stop status/loading; retain last usable result. |
| Regenerate while busy | Explicit cancel/restart or queue behavior; prevent stale return from overwriting the new result. |
| Collapse/expand | Changes presentation only, remembers user state. |
| Compact/font/theme/effects | Immediate visible change; correct persistence; no unintended tracking change. |
| Show empty fields | Deliberate display control, not fabricated output. |
| Edit mode/value correction | Correct field is selected and carried to specific World GM refinement; normal values stay readable, not permanent text boxes. |
| Character expand/open wiki | Actual person profile/history; selected ID preserved. |
| Upload/clear portrait | Real media operation scoped to the correct character. |
| Match/merge/add to cast | Actual selected candidate and target with evidence; no blank generic conversation or unchecked name merge. |
| Outfit select/create/match | Actual wearer and outfit context; do not change what a character wears merely by browsing an image. |
| Quest add/complete/restore/remove | Specific objective operation and visible result; do not silently replace it with a free-form question. |
| Story idea paste/use | Paste preserves the draft, or explicit World GM planning handles the chosen idea; no covert send. |
| Meter/sparkline click | Opens the intended history with real samples and source-turn navigation. |
| Relationship web open/refresh/filter/classic | Actual graph and relevant scope; optional analysis/cache status works. |
| History node/Browse All/return latest | Selects correct snapshot and updates the entire panel; does not change the active story. |
| Diff mode/copy/export | Actual selected source data, not today's values behind a historical title. |
| Profile switch/import/export | Full profile semantics work; incompatible delta bases reset explicitly. |
| Custom panel/field edit | Schema/prompt/result/render path all change coherently. |
| Retry failed scene update | Reprocesses only necessary downstream work, preserving good narration. |
| Rewind to draft | Restores the actual earlier draft and state through Horde's existing controls. |
| World GM/Backstage | Correct selected context; normal draft preserved on open/close. |

---

## 8. Product language: no backend exhaust in the interface

Use ScenePulse's normal section names and concise human labels wherever possible:

```text
ScenePulse
Scene Details
Characters
Inner Thoughts
Relationships
Quest Journal
Story Ideas
Character Wiki
History
Settings
Refresh
Try Again
Last updated
Last seen
Unknown
```

The world is **Melbourne**, not an automatically generated “Melbourne Canonical” title. Preserve a user-authored name, but do not add storage terminology to it.

Do not put “canonical,” “committed continuity,” “durable character record,” “evidence-scoped interpretation,” “settlement,” “schema version,” or “Reader authority” in ordinary section names, subtitles or repeated badges.

Do not merely replace “canonical” with “accepted authoritative derived state.” That is the same problem with extra syllables.

When information is old, say **Last seen** or **From an earlier turn**. When an update failed, say **Couldn't update the scene. Your response is safe. Try again.** When viewing history, say **History** and offer **Return to current**. A scene-only person can have a subtle **New person** or **Scene-only** treatment where it affects available actions.

Internal types and traces stay precise. Backstage can expose every hash, claim class and receipt. The user did not ask to read database policy while looking at a character's thoughts.

Acceptance includes a rendered-copy search and visual review. Inspect text in headings, tooltips, badges, cards, empty states, errors and modals. Do not rewrite the fictional narrator's ordinary use of words; this rule applies to application copy.

---

## 9. The real model call: keep the source's useful work

### 9.1 Inspect what is actually sent

Start from the pinned active ScenePulse profile/schema and assembled prompt. Trace whether the path uses a full-prompt override, named slots, dynamically enabled fields, delta instructions and model template adjustments.

The seven source slot IDs are:

```text
role
criticalRules
language
fields
nameAwareness
questValidation
deltaMode
```

`fields` is built from enabled panels and field toggles, not an ordinary editable static paragraph. The full prompt override takes precedence in the source. Preserve and inspect that behavior rather than copying whichever exported constant is easiest to find. [S04, S05]

Capture one effective outgoing prompt and schema for the rich default profile. Confirm it actually requests thoughts, needs, goals, appearance/outfits, proximity, inventory, relationship dimensions, quests, ideas and environment. Confirm the model actually returns them before claiming the integration is rich.

### 9.2 Supply Horde context without shrinking the output contract

Use the existing provider gateway. Supply selected authored narration, the handoff, relevant prior snapshot, authored character/person/location information, controlled identity and relevant existing memory. Replace source template values through the current host context.

Use source-compatible output where practical, with separate host identity/source metadata. Do not route it through a restrictive old normalizer that drops every key the previous presence tracker did not know.

Rich source output must survive all the way to the renderer and stored scene. Trace a thought, an outfit, a temperature and a relationship label from actual response → stored record → UI → subsequent appropriate context.

### 9.3 Minimal deliberate adaptations, not a rewrite into timid extraction

Adapt source assumptions that truly conflict with the new host:

- The source's blanket “fill everything; guesses beat empty values” must not invent objective history or precise measurements. But do not remove its permission to generate plausible NPC interiority and creative story suggestions.
- No hidden five-NPC ceiling in an actually richer scene. Budget for the relevant cast; recover incomplete coverage explicitly.
- Include the controlled character's visible state where useful, without inventing private player choices.
- Stable Horde IDs replace name-only identity authority. Names and aliases still display naturally.
- Existing Horde time handles time progression. Source temporal detection may identify a problem; it may not silently rewrite the story clock.
- Closing a panel does not disable tracking. Explicit field/profile tracking controls may do so and must say so.
- Keep source relationship measures as modeled scene information where enabled. Do not force them into incompatible host fields or discard them.

These changes belong in short integration rules and data bindings. Do not bury the source instructions under thousands of words of prohibitions until the only safe response is “Sarah is present.”

### 9.4 Output length is an actual capacity problem

The source constants include an older 4,096-token preset. That is not proof that the richer Horde profile fits. Size the response budget for the enabled fields and relevant cast using actual observed output.

Treat `finish_reason: length`, incomplete tool arguments and missing required character coverage as incomplete output. Preserve raw response for diagnosis. Retry with an appropriate budget or explicit bounded continuation where the route supports it; do not accept `{}` or half a roster as a healthy full update.

Do not impose an extra Reader call per NPC. The normal Reader can return the current cast in one output. Existing downstream cognition jobs are separate from this live display loop.

---

## 10. Iteration must match how the user works

### 10.1 Primary loop: send, inspect, rewind to draft, resend

Use an isolated copy/test timeline of a representative world, not destructive experiments on the user's only ongoing story. Keep a backup/export and identify the build actually served.

1. Save the original player draft and existing pre-turn state through Horde's real controls.
2. Send the draft through the actual configured Narrator/Reader/Sidecar route.
3. Read the Narrator response and inspect the populated ScenePulse result. Capture screenshot, effective prompt/result and observed issues.
4. Make one coherent implementation or instruction change addressing those issues.
5. Use **Rewind to draft**, not hand-edited storage deletion or a guessed reset.
6. Verify the original text is restored and the just-abandoned scene update is no longer active. Prior valid history remains.
7. Send that same player input again under the same fixture/pre-state and compare.
8. Repeat until the source feature is visibly and functionally present.

Same input does not guarantee identical model output. Compare feature coverage, identity, plausibility, style and behavior, not identical sentences. For exact renderer regression use the frozen response/demo fixture; for prompt/generation quality use real calls. Keep those two tests distinct.

Do not merely press Refresh after modifying code and assume the running page loaded it. Verify loaded build identity and network assets without destroying the user's current browser state.

### 10.2 Secondary loop: keep good narration, retry the scene update

If narration is good and the Reader or Sidecar update failed, use the source-style **Try Again / Retry Scene Update** control.

- Reader failed: reuse exact existing narration/handoff and rerun Reader, then necessary reconciliation.
- Reader succeeded, reconciliation failed before commit: reuse valid Reader output and retry the remaining stage.
- World changes already applied, scene publication failed: finish publication; do not apply those world changes again.
- Current interpretation is already complete: Refresh is a new interpretation/refinement, not a second application of the same turn.

This button never calls the Narrator or creates a new roleplay Take. It does not advance the clock again. It is distinct from the user's explicit rewind-and-resend loop.

### 10.3 Keep investigation from swallowing the port

A syntax error that prevents the page loading is a real blocker: fix it immediately. A request that would damage saved state must be blocked. Do not confuse those with a reason to rebuild every downstream subsystem first.

For other errors, identify the failing boundary, capture it once, add a focused regression and patch the narrow dependency. If a broader host problem remains, keep the port inspectable with the frozen source/demo response while isolating that problem. Continue transferring source features that do not depend on it. Return to the live vertical slice promptly.

Repeatedly investigating the same error without a new hypothesis, new evidence or a narrower test is not progress. Do not answer every product complaint by discovering another backend cleanup project.

No mock is allowed to masquerade as a live success. No unresolved data-integrity risk is waved through to production. The point is to separate the work, not to lie about it.

---

## 11. Wire the host to the product

### Character/person/dossier

Use Horde Person data as authored starting material. Let source character profiles and wiki represent evolving scene knowledge and encounters. Extend host structures where needed to carry the rich data. Names, aliases, appearances, roles, last-known locations, clothing, thoughts, needs, goals and history must not disappear at the adapter.

### Location

Keep the immediate place, parent, local spatial detail and environment useful before promotion. Expose the dossier/location action with the selected place and actual evidence. Do not require registry creation simply to display a local corridor.

### Outfits and visuals

Source outfit text is a legitimate current clothing description. Match or save it through the character's outfit system when requested. Do not mutate the wardrobe library just by rendering a card or selecting a photo.

Feed visible outfit/appearance/posture/place into the existing visual-document entry point through explicit selected-subject bindings. Do not rebuild the image editor in this task. Do not infer a visual feature from private thoughts alone.

### Thoughts and memory

A live thought exists immediately with the accepted scene read. Record it once as that person's scene interpretation and source for the existing cognition graph. Consolidation can retain, refine or reject it later. It must not wait for an Episode threshold to appear.

Scene-only characters are valid subjects. Promotion maps the same identity later; it must not discard or duplicate their previous thoughts.

Character-scoped memory inputs remain scoped. The author's ability to inspect Thoughts is not the player's ability to know them. Keep that distinction in actual prompt sections/data, not by putting a disclaimer over an otherwise omniscient facts dump.

### Relationships

Use the source meter/phase/milestone/history experience. Add the needed stored estimates/axes if the current host cannot represent them. Distinguish long-term state from this turn's reading internally and in detail inspection. Do not remove the source dimensions to protect an impoverished old schema.

### Quests, goals and ideas

Keep the source hierarchy and interactive controls. Map a user action to the appropriate existing record or authoring proposal. Source story ideas remain a creative menu, not automatic next-turn facts. Existing World GM is the conversational path for adopting or modifying one.

### World GM

The selected card/action opens a dedicated private conversation with the exact person, field, source moment and intended action. “Keep this person,” “That is the same outfit,” and “They could not hear that” are different requests. Supply enough context automatically.

Do not require conversational intervention for opening a card, changing theme, browsing history or hiding Thoughts. Presentation controls should remain immediate. Semantic corrections use World GM. Preserve the normal player draft when the modal opens/closes.

### History and export

Source snapshot browsing is read-only. Opening an old moment must show that moment's clothes, thoughts, relationships and environment, not today's records behind an old date. Accepted older history is not “superseded” merely because it is not current.

Use the existing branch/rewind controls for changing story reality. Backfill is explicit. Preserve source data and useful exports through Horde storage rather than adding a second extension-owned database.

---

## 12. Minimal protections that remain necessary

Keep this section in engineering work and Backstage, not normal UI text. It must not become the whole implementation.

1. **Protect the user's data.** Work from current diffs, preserve unrelated image-generation work, do not reset world exports, and keep test fixtures out of the real world.
2. **One selected authored source.** Each scene-model result belongs to a definite Turn/Take/revision. An old in-flight result cannot overwrite a new selection after rewind, refresh or target switch.
3. **One application write path.** Reader output can be rich, creative and inspectable without directly performing arbitrary world mutations. Use the existing accepted turn/authoring mechanisms.
4. **No duplicate turn effects.** Retry must not add the same item, movement, clock delta or memory work twice. Reuse existing source identity/receipt protection; repair a demonstrated hole narrowly.
5. **No false success.** Distinguish model failure, partial/truncated output, world-update failure and scene-publication failure. A caught exception is not proof the job finished.
6. **A read does not secretly write.** Opening a panel, building a display model or reading a historical snapshot cannot normalize/mutate the user's world as a side effect.
7. **Late work checks its source.** Rewind/reroll invalidates the abandoned turn's active contributions and pending job publications without erasing earlier accepted history.
8. **Do not fake data for visual completeness.** A demo is labelled a demo. Real scores come from actual outputs/defined values, not renderer defaults. Unknown history remains a gap.
9. **No secret or credential leakage.** Diagnostics capture useful requests without authentication material. Report/export actions are explicit.

The prior Astra audit identifies candidate-helper scope errors, success-on-settlement-failure, destructive delta defaults, wrong supersession, truncated retry sources, direct candidate mutation and copied fork jobs. Verify and fix those where they block this implementation. Do not rewrite already-working mechanisms merely because their names appear in that report.

If an unresolved shared-world problem makes a live write unsafe, keep the port in the isolated development/test route and report that specific blocker. A beautiful unsafe release is not completion; an invisible safe subsystem is not completion either.

---

## 13. Delivery order and proof gates

These are checkpoints toward the full port, not permission to abandon the rest as “later.”

### Gate A: source product exists in the host

- Preserve current work and establish the actual source revision.
- Mount the source-derived panel, styles, thoughts and overlays in Worlds V2.
- Remove the old V2 sidebar renderer from that route.
- Render `TOUR_EXAMPLE_DATA` in an explicit development scene.
- Demonstrate dashboard artwork, dense character profiles, thoughts, relationship meters, quests and story ideas, not empty section shells.
- Click real source UI interactions that do not require live world mutation; list host actions still awaiting wiring.
- Capture same-data visual comparison with source markup/styles at comparable width.

**Exit:** it visibly is ScenePulse. It is not yet claimed to be fully integrated.

### Gate B: one real authored turn powers it

- Connect the actual effective source-derived prompt/schema to Horde's configured Reader call.
- Supply real narration, handoff and relevant authored context.
- Receive and inspect a complete result with nonempty rich character information.
- Carry that result into the same renderer, not a different simplified “production” renderer.
- Wire main refresh/stop/failure controls and the user's rewind-to-draft loop.
- Perform a second send of the restored draft and compare.

**Exit:** real model output produces the recognizable source experience. No demo information survives in that scene.

### Gate C: every source interaction has a host destination

Complete the action ledger, character wiki, relationships/history/web, quests, ideas, profile manager, custom panels, themes, effects, analytics and exports. Move incompatible Horde functions or extend their inputs. Do not replace missing actions with vague toasts or remove them.

**Exit:** each feature has a demonstrated route from button to result. Missing wiring is named, not concealed.

### Gate D: integration survives ordinary use

Exercise persistence, notes/portraits, current scene vs wiki, thoughts before Episode consolidation, genuine delta changes, source-linked history, retries, re-enable, rewind and late-result rejection. Verify a subsequent actual Narrator request receives the useful permitted scene information.

**Exit:** the port improves the ongoing roleplay rather than only rendering one good screenshot.

### Gate E: full product review

Run the source-to-port ledger, interaction tests, copy audit, responsive/effects checks and remaining data-safety regressions. Complete licensing/source notices and document exact source adaptations. Record the build and actual provider tests separately from fixtures.

**Exit:** the user can use ScenePulse as the Worlds V2 experience, and the report does not hide missing features behind “backend complete.”

### Working discipline

Keep the controlling brief on disk and reread the next relevant section after compaction. Maintain a short feature/action ledger with current status. Do not rewrite this entire plan during implementation.

Only one writer should own a given worktree/file group at a time. The separate image-generation implementation is not this task. If changes overlap, coordinate through scoped commits or an isolated worktree rather than silently overwriting each other.

The clean/weirder branch is not necessarily byte-identical to live. Port scoped changes with explicit ownership, not whole-file replacement. Do not spend the initial product demonstration synchronizing unrelated branch differences.

---

## 14. Acceptance script: exercise the product the way the user does

### T01. Source fidelity with controlled data

Load the source café demo as development data. Compare date/time/weather/temperature/location, source section proportions, card typography, monologues, relationship meter details, quest tiers, ideas, menus and overlays. Check the actual source asset/style requests.

A generic-card layout with matching labels fails. An all-empty source shell fails. A screenshot with dead interactions does not prove a working port.

### T02. Real scene, real call

Use a test scene with three active NPCs, a nearby audible person and a remote participant. Include known time/date/weather/sound, a meaningful prop, clothing detail, different private concerns and one disagreement about events. Inspect effective prompt/schema and finish reason. All supported dimensions must survive storage and display.

### T03. Thoughts immediately

Before any Episode threshold, show current, voice-specific thoughts and needs for the active NPCs. They must be more than recaps. Close/reopen Thoughts while processing; it remains operable and generation policy does not change. Regenerate through the actual button without a Narrator call.

### T04. Exact user iteration

Send the saved input, inspect, change a relevant instruction/implementation, rewind to draft, verify the same input and prior scene restored, resend. Confirm only the selected new attempt drives current cards/thoughts/history. Compare meaningful coverage and behavior, not identical prose.

### T05. Retry a good Narrator turn

Fail Reader transport and separately truncate Reader output. Keep Narrator text. Click Try Again. Confirm real downstream requests, no Narrator regeneration, no duplicate world change, complete refreshed panel and actionable failure if it still fails.

### T06. Failure after world update

Inject a scene-publication failure after a successful world update. Retry must finish missing display/persistence work without repeating time, movement or inventory changes. Rewind-to-draft is a separate deliberate story operation.

### T07. Relevance, not census

Add many absent registry people. Home still shows only relevant current participants. A person nearby and audible has one card with useful position/channel information. All Known Characters opens the full searchable wiki. Leaving the room does not delete the dossier.

### T08. Character/wardrobe/place richness

An unnamed bartender, a local corridor and a partially described red coat receive useful source-style details. Opening them does not require registry promotion. Match, Keep Scene-Only and Add/Create actions open the correct source-pinned operation. Unknown trousers are not automatically fabricated.

### T09. Relationships as a real feature

Inspect all enabled source measures, short labels, phase, time known and milestones. Verify zeroes, absent values, previous marker and direction. Click mini graph, switch legend, hover sample, navigate to source. Open force-directed web and Classic view; inspect and refresh optional analysis with real cache status. Do not manufacture historical samples.

### T10. Quest and story interaction

Expand North Star/main/side tiers. Add/complete/restore/remove through the specific host workflow. Use a story idea by pasting to draft without sending; choose another through World GM planning. No idea becomes a recorded past event simply because it was displayed.

### T11. History and differences

Scrub different accepted moments; all dimensions change together. Click Browse All and a source-turn link. Try all source diff modes and copy. Return to current. Historical browsing does not overwrite current character/outfit state or launch current-turn retry against an old snapshot.

### T12. Settings actually change behavior

Switch among all five implemented themes; alter font/compact mode; close sections and reload. Use Panel Manager and a custom enum/list/meter/text/number field. Verify the intentional tracking configuration changes effective schema/output, while simple visibility changes do not silently disable thoughts.

### T13. Effects are part of the port

Use explicit test weather for rain, snow, fog, storm and remaining supported categories; test combined effects where supported. Change fictional time for tint and location for transition. Switch effects off and verify existing nodes/animation work are removed. Test reduced motion. Effects do not invent weather or block controls.

### T14. Profiles, exports and diagnostics

Create/duplicate/import/export/switch profiles and custom panels. A schema change does not merge against an incompatible old delta. Inspect actual call/response, token/time data and failed calls. Export selected data without keys or auth headers. Source help/debug entry points lead somewhere useful.

### T15. Rewind while work is in flight

Rewind or change timeline before a Reader/cognition result returns. Confirm old results cannot publish into the new scene. Accepted earlier history stays available. Retrying and double-clicking do not duplicate work.

### T16. Downstream roleplay improvement

Run the next authored beat. Inspect the actual Narrator request and relevant character memory input. Rich permitted scene context and appropriate thoughts/concerns reach their consumers. Other characters' private information is not flattened into universal knowledge.

### T17. Copy, focus and real navigation

Search the rendered interface for the rejected backend labels. Click every toolbar/menu/card/control. Use keyboard, Escape, narrow/wide panels and mobile layout. Preserve focus, draft text and scroll through updates. No generic alert or placeholder toast counts as an implemented action.

### T18. Final parity accounting

For every F01–F46 row and every additional source feature discovered, record source, adapted destination, host binding, observed evidence and status. Report exact incomplete items honestly. Do not declare the feature complete if mandatory thoughts, regeneration, wiki, graph, history, customization or source composition remain absent.

---

## 15. Completion report, not another architecture proposal

Return:

1. A screenshot/short recording of the source-derived populated panel, including the dashboard and actual character thoughts.
2. Source files/classes/functions retained and the narrow host replacements made.
3. A completed feature and action ledger, including any additional source features discovered.
4. Evidence from a real model call and the user's send → inspect → rewind to draft → resend loop.
5. Evidence that Try Again works without sacrificing the Narrator response.
6. A working wiki, relationships/history, thought controls, themes/effects and real semantic edit destinations.
7. Actual build/commit, source revision, test timeline and unverified provider paths.
8. Remaining blockers stated specifically, without describing a hollow panel as a completed integration.

Do not make the completion report a wall of “canonical committed durable” congratulations. The proof is the product.

### Final instruction to the implementing agent

**The existing Horde sidebar loses. ScenePulse is the baseline.**

Import its useful implementation and behavior, not just its vocabulary. Keep the source's cards, thoughts, relationship richness, wiki, quests, ideas, menus, effects, customization and recovery experience. Move Horde's functions and representations until they can supply and retain that experience.

Build the recognizable source panel first. Feed it source data to verify fidelity, then a real API response to verify the integration. Use the user's rewind-to-draft loop to iterate. Resolve actual blockers, but do not disappear into another general backend refactor while the requested product remains absent.

There is no need to rediscover what ScenePulse should look like. There is a working implementation to port.

**Build ScenePulse. Then make Horde do the work behind it.**

---

## Appendix A. Source index and inspection scope

All repository links below are pinned to the inspected commit. A range describes the part read during this research, not a claim that the rest of the file is irrelevant. The implementing agent must read the full file it changes.

- **S01:** [README](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/README.md). Feature inventory, settings, workflows, documented limitations. README module/version counts are not authoritative over code.
- **S02:** [Built-in output schema](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/builtins/schema.js). Full source inspected; scene, character, relationship, quest and idea fields.
- **S03:** [Constants and TOUR_EXAMPLE_DATA](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/constants.js). Lines 1–210 inspected, including actual defaults, panels, older model preset and populated café fixture.
- **S04:** [Effective prompt assembler](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/prompts/assembler.js). Opening through line 190 inspected; field builders, full override precedence and assembly entry.
- **S05:** [Prompt slots](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/prompts/slots.js). Lines 1–145 inspected; IDs, editability, defaults and name-awareness instructions.
- **S06:** [Built-in prompt](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/builtins/prompt.js). Returned source inspected through the detailed thought/character guidance; this is not assumed to be the active effective prompt.
- **S07:** [Section builder and real refresh handler](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/section.js). Full source inspected.
- **S08:** [Panel shell, toolbar and controls](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/panel.js). Source windows 1–230 and 220–400 inspected; long returned markup was partially truncated by the connector.
- **S09:** [Thought panel shell/actions](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/thoughts.js). Lines 1–180: controls, real regeneration, close, drag and resize.
- **S10:** [Thought filtering and monologue renderer](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/thoughts.js#L205-L299). Lines 205–299 and 300 onward inspected: current-view filtering, default full text, optional fit/positioning.
- **S11:** [Dashboard/scene/quest renderer](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/update-panel.js). Source windows 1–180, 300–490 and 600–770 inspected, with some long SVG/markup responses truncated. Includes direct source comments on redundant presence display and scene/quest behaviors.
- **S12:** [Actual relationship web implementation](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/relationship-web.js). Lines 1–145 inspected: force-directed/Classic design, imports, seeding and layout.
- **S13:** [NPC relationship graph analysis and cache](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/relationship-graph.js). Lines 1–150 inspected: opt-in batch model, cache, directed edges, organizations and fingerprints.
- **S14:** [Stylesheet entry and import order](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/style.css). Full source inspected, including the host-specific transcript-hiding rule that must not be imported into Horde.
- **S15:** [Panel CSS](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/css/panel.css). Full source inspected: shell, toolbar, variables, dropdowns, states and animations.
- **S16:** [Shared source extraction pipeline](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/generation/pipeline.js). Full source inspected: merge, normalization, warning-only validation, source temporal rewrite, snapshot/UI publication and metadata.
- **S17:** [Timeline](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/timeline.js). Lines 1–145 inspected: sampled visible nodes, selected/latest identity, live historical selection and source scrolling.
- **S18:** [Sparklines and message navigation](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/sparklines.js). Lines 1–125 inspected for host-sensitive navigation/highlighting; graph UI capabilities also documented in README and must be checked in the full file during porting.
- **S19:** [Weather implementation](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/ui/weather.js). Lines 1–120 inspected: types, multi-effect selection, teardown, host mounting and particles.
- **S20:** [Themes](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/themes.js). Full source inspected: five actual theme entries, variable application and overlay scope.
- **S21:** [Custom panels](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/src/settings-ui/custom-panels.js). Lines 1–130 inspected: field render types, settings integration, live prompt/schema refresh, scope and card actions.
- **S22:** [Architecture map](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/ARCHITECTURE.md). Full source inspected: modules, profile authority, wiki permanence, source generation flags, overlay lifecycle and style ownership.
- **S23:** [Pinned commit](https://github.com/xenofei/SillyTavern-ScenePulse/commit/2888d0d748033c5b16eac410f5396af055142483). Version 6.27.20 and Together-mode prompt-role fix. This source bug is another reason to test the actual outgoing request.
- **S24:** [License](https://github.com/xenofei/SillyTavern-ScenePulse/blob/2888d0d748033c5b16eac410f5396af055142483/LICENSE) and [repository](https://github.com/xenofei/SillyTavern-ScenePulse). GitHub metadata and source documentation identify GPL-3.0. Preserve applicable notices and verify distribution obligations against the actual Horde branch before distributing copied code. A notice alone is not proof of compatibility. This does not require a clean-room UI rewrite by default.

### Additional source files to inspect fully while executing the ledger

The source README/tree/imports identify these feature paths. Their complete behavior was not line-audited in this research and must not be claimed implemented without inspection:

```text
src/ui/character-wiki.js
src/ui/character-history.js
src/ui/portraits.js
src/ui/diff-viewer.js
src/ui/loading.js
src/ui/message.js
src/ui/time-tint.js
src/ui/scene-transition.js
src/ui/mobile.js
src/ui/analytics.js
src/ui/debug-inspector.js
src/ui/dialog-base.js
src/profiles.js
src/settings.js
src/schema.js
src/normalize.js
src/color.js
src/stagnation.js
src/story-ideas.js
src/slash-commands.js
src/macros.js
src/i18n.js
src/generation/engine.js
src/generation/regen-guard.js
src/generation/delta-merge.js
src/generation/validation.js
src/generation/function-tool.js
src/presets/built-in.js
src/settings-ui/create-settings.js
src/settings-ui/bind-ui.js
src/settings-ui/setup-guide.js
src/settings-ui/guided-tour.js
```

Inspect dynamically imported subviews and linked styles, not only these filenames. Carry third-party notices for vendored dependencies as well as ScenePulse itself. Do not ship ST-only self-update/interception/storage code simply because it appears in the original entry point.

## Appendix B. Handoff provenance from the Horde conversation

The source-based port above is combined with the user's latest explicit decisions, which override conflicting earlier handoffs:

- ScenePulse is the complete product baseline, not an inspiration board.
- The experimental Worlds V2 host may change; old sidebar and legacy Inline parity are not preservation targets.
- Right-column replacement remains the normal main layout.
- Real character thoughts, needs, goals, relationship richness, wiki, weather/time treatment, transitions and source information density are core scope.
- Normal UI says Thoughts/Characters/Relationships, not repeated backend authority terminology.
- World GM is the private contextual correction surface; Backstage is the technical evidence surface.
- The user iterates by actual API turns and rewind to draft, not only refresh-spinners and static tests.
- Good narration can be retained while downstream scene processing is retried.
- Character/outfit/location data feeds the visual system, but that parallel visual-editor correction is not to be rebuilt during this port.
- Earlier source audits identify actual integration risks to verify; their foundation-first work ordering is superseded by this product-first delivery order.

The distinction is deliberate: **preserve the data; stop preserving the bad product.**
