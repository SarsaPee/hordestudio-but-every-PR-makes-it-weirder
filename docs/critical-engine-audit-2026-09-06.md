# Horde Studio: critical engine audit

Date: 6 September 2026. Scope: the working tree at audit time, including its existing uncommitted fixes. Primary focus: Worlds and Virtual Humans (VH). This is the original audit and overhaul proposal. Subsequent repairs and remaining gaps are tracked in [the implementation record](engine-integrity-implementation-2026-09-06.md); source line references below describe the pre-repair code.

## Verdict

I would not ship this as a dependable persistent world or life-simulation engine yet. There is substantial useful work here, but the engine's fundamental invariants are still negotiable: where someone exists, how time advances, what constitutes a completed action, and which timeline owns an asynchronous result.

The problem is deeper than unreliable model output. **Different subsystems implement different realities.** The canonical receipt layer is a promising foundation, but schedules, population, background agents, UI handlers, narration recovery, and persistence still bypass or reinterpret it. VH has richer characterization, yet much of its autonomy is scheduled output and numerical drift rather than executable decisions constrained by a shared world.

Adding more prompting, regex exceptions, personality sliders, and recovery passes will increase the number of interactions to debug. The next phase should establish one engine contract, then migrate existing features onto it.

## Evidence and limits

- Ran 19 existing targeted suites: all passed. They include executable simulation checks, stress tests, and source-pattern assertions; these are not equivalent forms of evidence.
- Added and ran [nine diagnostic counterexamples](</Users/razashah/Horde Studio 7.8 (with local)/scratch/critical_engine_counterexamples.js>). All reproduced the current problematic behavior. These deliberately assert today's behavior; they are evidence fixtures, not acceptance tests for the replacement engine.
- Inspected the main simulation, movement, map, receipt, persistence, VH reply/life processing, and release paths. `app.js` currently contains 50,329 lines.
- No live provider calls, existing browser-save modifications, or end-to-end browser playthroughs were performed. Cross-timeline races and multi-tab overwrites below are source-traced risks, not claims of observed corruption in the user's saved data. Broader security, every provider, multiplayer, and Video Adventures are outside this audit's deep coverage.

## Shipping blockers and major defects

### 1. VH consumes the reply before it has produced one — P1, reproduced

In [the due-reply path](</Users/razashah/Horde Studio 7.8 (with local)/app.js:49369>), the inbox batch gets `awaitingReply = false`, and `saveState()` commits that state before `sendCompanionMessage()` completes. A handled network error restores a retry flag, but closing/crashing the process cannot run that catch block. Message normalization preserves the false flag, and ordinary due-message selection requires it to be true.

The counterexample exercises the real agency function with mocked storage/provider boundaries and captures the durable pre-request snapshot: the user's message is already consumed, with no corresponding response.

**Required change:** persist a reply job with states such as queued, claimed, generating, ready, delivered, and failed. Claim with an expiring lease; finalize the response and consumption together. Reopening must recover unfinished jobs. Use an idempotency key for the response group.

### 2. VH asynchronous results can cross timeline boundaries — P1, source-traced

[Timeline switching](</Users/razashah/Horde Studio 7.8 (with local)/app.js:47654>) can activate another timeline during a request. Activation loads that timeline's runtime onto the same mutable companion object. [Sending a reply](</Users/razashah/Horde Studio 7.8 (with local)/app.js:40899>) retains the old messages array, awaits the provider, applies changes to that shared companion, then [persists into the currently active timeline](</Users/razashah/Horde Studio 7.8 (with local)/app.js:41234>).

This permits an A-request/B-runtime split: the response can append to A while runtime changes and observer targeting use B. The background observer has its own checks, but the foreground path obtains its observer timeline after the network wait; that does not bind the original transaction.

**Required change:** every job captures `{humanId, timelineId, revision}` at initiation. Reducers target the identified timeline directly. A late result must be rejected, rebased explicitly, or committed to its original valid timeline. Temporarily blocking timeline switches can reduce exposure while this is rebuilt.

### 3. NPCs do not share the player's movement system — P1, reproduced and traced

[Player movement](</Users/razashah/Horde Studio 7.8 (with local)/app.js:27183>) resolves a path. [Schedules](</Users/razashah/Horde Studio 7.8 (with local)/app.js:29954>) directly assign `entState.location`. [Legacy/background NPC actions](</Users/razashah/Horde Studio 7.8 (with local)/app.js:26769>) also assign it directly after fuzzy destination resolution. Scene population can relocate existing named people into the player's scene.

The schedule counterexample keeps Ada in place while pinned, then moves her to disconnected Work as soon as the pin expires. No route exists. The six-turn pin is a temporary precedence rule, not an intention to stay, travel, escort, or finish a conversation. This is a direct explanation for people apparently disappearing when the timetable regains control.

**Required change:** all movement sources submit the same travel command. An actor is at a location or in an explicit journey with route, progress, destination, and interruption state. Schedules propose appointments; they cannot teleport actors. Occupancy changes only through committed movement events.

### 4. Exit clicks bypass the pending-check gate — P1, source-traced

The [exit click handler](</Users/razashah/Horde Studio 7.8 (with local)/app.js:21840>) moves the player, populates the destination, evaluates quests, appends a system message, and starts a save before calling `executeWorldTurn("look")`. The pending-check restriction lives inside [that later turn function](</Users/razashah/Horde Studio 7.8 (with local)/app.js:23308>).

Consequently, a pending check can reject the narration after the click has already changed and saved location. Typed actions encounter the check gate earlier. These two input methods do not implement the same command semantics.

**Required change:** buttons and text resolve to commands submitted through one precondition/commit path. An exit click must identify the selected edge, not perform mutations itself.

### 5. “Leave” recovery can reverse the sentence's meaning — P1, reproduced

[Departure detection](</Users/razashah/Horde Studio 7.8 (with local)/app.js:25672>) reports `Ada refuses to leave the room.` as Ada departing. Its bounded span between name and movement verb does not establish agency, negation, intention, or completion.

This scanner is not merely cosmetic: [receipt recovery](</Users/razashah/Horde Studio 7.8 (with local)/app.js:9843>) can apply its result if the ending cast omits Ada. The cast list and prose come from the same generation, so their agreement is not independent validation. With multiple exits and no resolved destination, the recovery sets location to null. There is no journey or destination process attached to that disappearance.

**Required change:** prose scanning may flag contradictions but must not manufacture completed movement. Keep precise actor/action/status records authoritative. Distinguish the player's lack of knowledge about someone's position from the simulation itself losing their position.

### 6. Persistence is atomic at the database level, but ownership is still broad — P1 risk / P2 scalability

[IndexedDB batch writes](</Users/razashah/Horde Studio 7.8 (with local)/app.js:64>) correctly use one transaction; [save coalescing](</Users/razashah/Horde Studio 7.8 (with local)/app.js:2684>) is also useful. Those fixes should be retained.

However, [every general save](</Users/razashah/Horde Studio 7.8 (with local)/app.js:2589>) rewrites application-wide collections, all World instances, all companion timelines, and current companion runtime mirrors. The serialization guard is local to one page. I found no cross-tab writer ownership or revision comparison around these writes. Two open app instances can hold divergent state and overwrite each other's collections; atomic writes do not prevent last-writer data loss.

Recovery snapshots preserve missing world definitions, not a versioned history of damaged timelines. Per-response [pre/post snapshots](</Users/razashah/Horde Studio 7.8 (with local)/app.js:22714>) copy almost the entire session, including growing knowledge/ledger collections. They avoid recursive history capture, but repeat substantial accumulated state across responses, then rewrite it on unrelated saves. VH similarly copies runtime, including media-bearing collections, into turn snapshots.

**Required change:** timeline-scoped storage, explicit writer ownership, revision-checked commits, versioned migrations, periodic checkpoints plus event deltas, and independently addressed media. Test storage failure, tab contention, and interrupted saves; make failed durability visible as transaction status.

## Worlds: why it does not yet behave like a game world

### 7. The clock rewrites history when author settings change — P1, reproduced

[World time](</Users/razashah/Horde Studio 7.8 (with local)/app.js:27047>) is derived from `(turnCount - 1) * world.timeStep + bonusTimeMinutes + startTime`. Changing timeStep from 5 to 10 at turn 101 advances the existing timeline by 500 minutes without an action. Editing the start time similarly changes its absolute clock.

The wider simulation mixes turn-based goal gains, six-turn pins, minute-based scheduled events, and explicit time skips. A long wait can catch up events while agendas and relationships advance only once. Equivalent elapsed time therefore need not produce equivalent life progression.

**Required change:** persist absolute simulation time. Give each command a duration and process events through its time interval. Author settings affect future actions or new timelines unless the user explicitly requests a migration.

### 8. Pathfinding solves fewest hops, not plausible travel — P2, reproduced

[The BFS](</Users/razashah/Horde Studio 7.8 (with local)/app.js:13572>) chooses a direct 120-minute route over a two-edge, two-minute route. It ignores travel weights. Furthermore, parent/child containment automatically creates bidirectional access even if neither location defines an exit. “Inside a building” becomes “accessible from the building.” That leaves no reliable foundation for locked rooms, permission gates, or entrances.

[Movement execution](</Users/razashah/Horde Studio 7.8 (with local)/app.js:27183>) assigns the final destination and sums leg time. Intermediate nodes are returned as metadata, not entered as simulation stages. It does not itself trigger intermediate encounters, exits, hazards, or interrupted travel. Fare and route labels are presentation data in this path rather than enforced travel costs.

**Required change:** separate containment from traversal. Use directed edge IDs with duration, conditions, mode, capacity if needed, and enter/leave effects. Choose routes according to explicit policy (time, cost, permitted mode), then execute legs through the simulation scheduler. Reserve instant travel for an explicit fast-travel rule.

### 9. The map constructs another interpretation of geography — P2, reproduced

[Map graph construction](</Users/razashah/Horde Studio 7.8 (with local)/app.js:16072>) marks an edge one-way only when an explicit flag exists and no reverse edge exists. A plain A→B exit without B→A renders as an undirected connection even though reverse travel fails. The counterexample proves that discrepancy.

The map also infers parentage from names and neighboring rooms, while travel uses authored parent/region references. Layout reorders regions according to current player location, and graph construction assigns missing IDs during rendering. A visual query should not mutate definitions or quietly interpret a different hierarchy.

**Required change:** compile one validated graph for navigation and rendering. Infer legacy structure once during an explicit import/migration, report uncertainty, and store the result. Keep coordinates stable as the player moves. If links are visually bundled or hidden, disclose their actual direction and traversal semantics in inspection/route views.

### 10. Off-screen goals largely advance as counters — P2, architectural

In [the living-world tick](</Users/razashah/Horde Studio 7.8 (with local)/app.js:29359>), random deterministic gains advance goal progress. Textual goal steps become news as thresholds are reached. Many such beats have no executable requirements or effects: reporting that an NPC bought supplies does not, through that goal-step path, transfer supplies or currency.

The same system skips agenda progression for NPCs in the player's location and skips automatic relationships in that room. Being observed changes which simulation rules apply. It can make a person less autonomous precisely when the player interacts with them.

**Required change:** goals select executable actions with requirements, costs, effects, and failure reasons. A shared room changes what the player observes, not whether actors have goals. Narrative should describe the resulting purchase, journey, conversation, or failure.

### 11. Rejected state can still be presented as successful fiction — P2, source-traced

The canonical turn path now rejects many unsafe proposals, which is good. But [post-generation contradiction checks](</Users/razashah/Horde Studio 7.8 (with local)/app.js:25272>) append audit warnings and then store/display the same narrative. This prevents some state corruption while preserving the exact user-facing mismatch: prose says one thing, HUD another.

**Required change:** generate or reconcile presentation against committed events before publishing. A failed movement should produce an account of the failed attempt; it should not be narrated as arrival with a metadata warning. Presentation cleanup and user regex scripts must not redefine simulation facts.

## Virtual Humans: why richer characterization still feels mechanical

### 12. Reply timing has variation, but little situational reasoning — P2, reproduced

The delays are **not literally a single fixed timer**. [Response planning](</Users/razashah/Horde Studio 7.8 (with local)/app.js:37385>) uses seeded randomness, availability buckets, cooldown, and measured cadence. But it decides willingness and due time before interpreting message content; the function uses message identity, not its meaning. Holding identity and randomness constant, a casual weather text and an urgent fire message receive exactly the same plan.

One roll influences several timing/refusal decisions, correlating outcomes unnecessarily. Willing replies have read time overwritten to equal reply due time, collapsing “noticed,” “read,” and “decided to answer” into one stage. The due path does not make a fresh life-based decision about whether a previously scheduled response is still appropriate.

**Required change:** simulate attention and competing actions. A message is an event whose perceived meaning changes priority. Separately model noticing, reading, forming an intention, interruption, composing, and delivery. Re-evaluate pending intentions when work ends, another message arrives, urgency changes, or a promise becomes due. Sample variation within those causal decisions; adding random delay alone will not create emergence.

### 13. Offline catch-up applies the final activity to the whole elapsed interval — P1, reproduced

[Human dynamics](</Users/razashah/Horde Studio 7.8 (with local)/app.js:36889>) obtains life state at `nowMs` and applies its energy/stress/social rates to all elapsed hours, capped at 72. It does not integrate the activities actually occupied during that interval.

In the counterexample, identical starting energy and a sleep-to-awake schedule produce **97.8 energy with hourly advancement and 32.4 with one catch-up**. Reopening after sleep can therefore behave as if the whole night was spent awake. The same issue affects other activity-dependent rates.

**Required change:** split catch-up at schedule/event boundaries and apply the same transition rules used online. Require equivalence between incremental advancement and advancing the whole interval, apart from deliberately specified bounded approximation.

### 14. Life events and social contacts do not yet form a fully causal society — P2, architectural

[Life advancement](</Users/razashah/Horde Studio 7.8 (with local)/app.js:49008>) derives situations from routines and records their transitions. Wildcards use a daily occurrence roll, a deck, category-based mood changes, and initiative hooks. [Social advancement](</Users/razashah/Horde Studio 7.8 (with local)/app.js:48771>) schedules contact intervals and updates relationship records.

These are useful simulation ingredients, but they do not establish a common execution model for travel, mutual availability, obligations, scarce resources, or a second person's independently competing plans. The result can be a convincing account of a life rather than a life whose events constrain one another.

**Required change:** a small number of persistent goals, habits, commitments, needs, and relationships should compete for feasible actions. A friend declining a meeting should affect the plan; missing work should produce a consequence; a promise should reserve time and be fulfilled, renegotiated, or broken. Mood should respond to those events, not substitute for them.

## Redundancy, clashes, and code structure

| Area | Current clash | Direction |
|---|---|---|
| World truth | Receipts, direct mutations, scene population, narrative recovery, legacy actions | One command/event reducer; adapters cannot bypass it |
| Geography | String exits, object exits, fuzzy names, canonical IDs, dynamic exits, inferred map hierarchy | Compile legacy forms into one versioned graph |
| Time | Derived turn clock, bonus minutes, pin turns, wall-clock VH timers | Explicit simulation clock and scheduled events |
| VH state | Companion object, timeline runtime, legacy thread mirror, asynchronous observers | Timeline-owned runtime; query views instead of copied authorities |
| Memory/history | Turn events, receipts, chronicle, archives, observations, snapshots | Keep distinct purposes, but derive summaries from traceable events and avoid repeated full copies |
| Engine/UI | Rendering normalizes state; movement displays toasts; click handlers perform commits | Pure queries, explicit commands, presentation subscribers |
| Tests | Source-extracted functions plus stubs and regex assertions | Importable engine modules, real persistence tests, adversarial integration scenarios |

The 50k-line file is a consequence and an amplifier of these ownership problems. Merely splitting it into files will not repair them. Avoid a generic entity-component-system rewrite unless it serves concrete needs; the first useful abstraction is an explicit command, event, clock, and ownership boundary.

Existing comments sometimes describe rules more strongly than code enforces. Examples include claiming prose scanners never authorize state despite receipt recovery, or saying locations remain global beside session-scoped geography. Treat comments and passing source-pattern assertions as hypotheses to verify, not proof of the runtime contract.

The checked release workflows package and publish, and the portable builder verifies bundled human assets; they do not run this gameplay audit battery as a release gate. There is no substitute here for tests that run the same modules and transitions used by the application.

## Proposed overhaul

### Keep and extract

Preserve authored Worlds/human profiles and media, timeline concepts, actor-scoped receipts, stable seeded world rolls, reference validators, meaningful regression fixtures, provider adapters, and the UI's useful authoring features. Keep IndexedDB batch atomicity and the background World Agent's stale-result guards as patterns to improve upon.

### Establish these boundaries first

1. **Definitions:** versioned authored places, edges, people, rules, and profiles. An active save records which definition revision it uses; editing is an explicit migration decision.
2. **Timeline state:** absolute time, actor positions/journeys, inventories, relationships, commitments, scheduled events, knowledge, and RNG state. No active-selection lookups inside reducers.
3. **Commands:** move, interact, wait, speak, transact, schedule, interrupt. UI, schedules, and model proposals all use the same preconditions.
4. **Events:** validated changes with IDs, causes, timestamps, and actors. Commit state, events, and durable jobs together. Distinguish private simulation facts from observed facts and beliefs.
5. **Agent decisions:** use utility-based action selection with persistent intentions and interruption rules. The model can interpret language or propose plans; it does not directly set canonical positions.
6. **Presentation:** map, HUD, narrative, chat bubbles, and animation consume the same committed state. Contradictory prose is repaired before publication.

Worlds and VH should share this substrate where useful, while keeping separate pacing policies: player-paced World simulation and wall-clock VH simulation. They do not need identical prompts or interfaces.

### Order of work

**Phase 1 — protect existing saves.** Implement durable reply jobs, timeline-bound async commits, writer/revision protection, unified exit preconditions, and fault-injection tests. Record schema versions and ship verified export/restore paths before migrating storage.

**Phase 2 — rebuild space and time.** Compile the canonical graph; persist absolute time; implement actor journeys and occupancy; make schedules submit actions; integrate enter/leave events and interval catch-up. Remove teleporting population logic for existing named actors.

**Phase 3 — create one convincing slice.** Use one neighborhood, several connected interiors, and roughly a dozen persistent people. Exercise commuting, appointments, interruptions, missed promises, a blocked entrance, and a delayed message. Demonstrate days of consistent play before expanding scope.

**Phase 4 — replace counter-driven autonomy.** Add feasible action selection, needs, commitments, causal transactions, and grounded communication decisions. Retain model generation for interpretation, planning proposals, and expression.

**Phase 5 — make it inspectable and releasable.** Show why each actor moved, stayed, ignored a message, changed plans, or failed. Build timeline/event inspection, deterministic replay, migration tests, and browser acceptance gates into releases. Retire legacy mutation paths as each replacement proves equivalent or deliberately changes behavior.

## Minimum shipping gates

- Every active person has one valid location or an explicit journey; absence from the player's knowledge never deletes simulation position.
- A successful traversal uses a permitted edge and emits the same arrival/departure effects regardless of input source.
- Map direction, route reachability, costs, HUD, and narrative agree.
- Blocked actions do not move actors, pay rewards, or publish completed outcomes.
- Online advancement and offline catch-up produce equivalent state for the same elapsed interval and events.
- Saving/reloading, rerolling, switching timelines, and editing definitions preserve ownership and documented continuity.
- Closing during every stage of reply generation either yields one delivered response or one recoverable job; no silently consumed inbox item.
- Late model/observer/media results cannot mutate another timeline or undo newer state.
- Two tabs cannot overwrite each other's progress without detection and resolution.
- A multi-day, small-world scenario generates meaningful effects through executable actions, with reasons visible to a debugger.

## Verification appendix

Existing passing suites: `world_turn_transaction_audit`, `world_graph_consistency_audit`, `world_intent_reliability_audit`, `movement_hierarchy_audit`, `narrated_presence_audit`, `movement_ledger_stress_test`, `world_map_stress_test`, `living_world_audit`, `living_world_stress_test`, `persistence_hotfix_audit`, `world_schema_migration_audit`, `companion_audit`, `companion_creation_lifecycle_audit`, `always_on_vh_audit`, `immersion_engine_audit`, `world_systems_audit`, `world_role_consequence_audit`, `timeline_life_seed_audit`, and `sandbox_world_audit`.

Diagnostic fixtures use actual extracted application functions with explicitly mocked environment boundaries. Nine observations: map direction mismatch; unweighted route choice; implicit containment access; pin-expiry teleportation; negated departure misclassification; retroactive clock change; non-equivalent VH catch-up; content-insensitive reply scheduling; durable premature reply consumption.

The important outcome is not the number of green tests. It is that the next engine can explain and reproduce its own state without depending on the narrator to repair reality afterward.
