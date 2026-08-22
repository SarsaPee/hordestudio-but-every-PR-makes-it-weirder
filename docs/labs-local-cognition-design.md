# Horde Labs: Local Cognition Fabric

Status: implemented foundation with ongoing task calibration
Scope: Chat Library, Worlds, and Virtual Humans
Principle: existing play remains the default; local cognition is optional, private, bounded, and reversible.

## 1. Product thesis

Horde Labs should not be a fourth game mode or another model dropdown. It should be an optional cognitive fabric underneath all three existing experiences.

A tiny model is not a credible replacement for the main narrator, world DM, or Virtual Human conversation model. It can, however, perform small repeated cognition jobs surprisingly well when Horde Studio supplies:

- a tiny bounded input;
- a narrow vocabulary of canonical IDs;
- a strict JSON schema;
- examples for exactly one task;
- deterministic validation after generation;
- an immediate no-model fallback.

The local model proposes. Horde Studio decides. The main model speaks.

## 2. Non-negotiable invariants

1. **Off means identical behavior.** With Labs disabled, requests, prompts, state transitions, timing, cost, exports, and UI remain equivalent to the current engine.
2. **The tiny model never writes canonical state.** It emits candidates. Existing reducers validate and commit them.
3. **No continuous minute-by-minute inference.** Time is caught up from timestamps and schedule boundaries. The model wakes only for meaningful events.
4. **No mandatory second foreground call.** Local work runs concurrently with deterministic context assembly, after a turn in the background, or only when an ambiguity gate opens.
5. **Failure is invisible.** Timeout, malformed JSON, model unload, unsupported schema, or closed local server immediately falls back to the current engine.
6. **Private means private.** Internal thoughts and off-screen cognition never appear in transcripts, exports intended for sharing, or the main model prompt unless promoted into a validated context fact.
7. **Every accepted proposal is explainable.** The debug receipt stores task, input fingerprint, candidate, confidence, validator decision, and reason.
8. **Budgets are hard limits.** Per-turn, per-minute, per-hour, token, and wall-clock budgets are enforced locally.

## 3. The architecture

```text
Player / clock / world event
            │
            ▼
Deterministic event envelope
  actor IDs · location IDs · timestamps · allowed transitions
            │
      ┌─────┴────────────┐
      │                  │
      ▼                  ▼
Current engine       Local Cognition Fabric (optional)
always available     tiny task + strict schema
      │                  │
      │             Candidate proposal
      │                  │
      └─────► Validator / policy gate ◄─────┘
                         │
                 accepted hints only
                         │
          canonical reducer / context compiler
                         │
                  main conversational model
```

### Components

#### A. Cognition Runtime Adapter

One interface supports three execution families:

- **Connected runtime:** Ollama, LM Studio, llama.cpp, KoboldCpp, or another loopback OpenAI-compatible server.
- **TinyBrain 2 (recommended):** Cactus Needle 2, a roughly 14 MB WASM structured tool router downloaded once and cached in browser storage. It selects tools and extracts arguments; it does not write prose.
- **TinyBrain 1 (legacy):** the older SmolLM2 WebGPU/WASM compatibility runtime for free-form local generation.

The adapter exposes `health`, `models`, `capabilities`, `warm`, `completeStructured`, `cancel`, and `unload`. Horde Studio detects schema support but always validates the returned object itself.

#### B. Cognition Scheduler

Priority queue with coalescing and cancellation:

- foreground ambiguity: maximum priority, short deadline;
- turn postflight: medium priority, replaceable by a newer turn;
- elapsed-life catch-up: low priority, coalesced per person;
- background memory work: idle-only;
- creator batch jobs: explicit and cancellable.

Only one tiny-model generation runs by default. Nothing competes with the main local narration model unless the user explicitly permits shared-runtime concurrency.

#### C. Task Registry

Every task declares:

- supported model tier;
- maximum input and output tokens;
- JSON schema;
- deterministic fallback;
- validator;
- timeout;
- cache key and expiry;
- whether it may block the turn;
- which data classifications it may read.

There is no generic “think about this” endpoint.

#### D. Proposal Validator

Validation is more than valid JSON:

- IDs must exist in the supplied candidate set;
- actors cannot be silently substituted;
- destinations require a valid route;
- `intended`, `attempted`, `in_progress`, and `completed` remain distinct;
- scores are clamped and delta-limited;
- knowledge requires witness, communication, or evidence provenance;
- timestamps cannot run backward;
- a model cannot create facts when the task only permits classification;
- confidence never overrides an invalid transition.

#### E. Shadow Ledger

Labs stores a small rotating diagnostic ledger, separate from story state. In Shadow mode, proposals are scored against what the existing engine did but never applied. This lets users calibrate a model before trusting it.

## 4. Capability tiers

Model size is not the user-facing promise; measured task capability is.

### Micro — approximately 270M–400M

Appropriate jobs:

- classify intent and completion state;
- identify likely speaker from a bounded cast;
- tag a memory with people/topics/emotion;
- score salience, urgency, novelty, and contradiction;
- select one candidate from a supplied list;
- compress a short event into one factual sentence;
- label a message as question, request, boundary test, affection, conflict, or logistics.

Not appropriate:

- inventing world canon;
- multi-step tool planning;
- resolving ambiguous scenes with dozens of entities;
- writing convincing final dialogue;
- independently simulating a town.

### Small — approximately 500M–800M

Adds:

- actor-scoped event extraction from a short narrative;
- compact relationship subtext;
- one-step goal proposals;
- bounded off-screen life beats;
- continuity criticism against a supplied pre/post frame;
- short memory consolidation with provenance.

### Extended — 1B+, still optional

May handle larger receipts and more nuanced candidates, but Labs must never require it. Every shipped task has a Micro-safe version or deterministic fallback.

## 5. Universal cognition tasks

### Event Lens

Input: the latest player message, bounded recent exchange, current scene frame, and allowed IDs.
Output: actor, speech acts, physical intents, completion level, time cues, named objects, explicit outfit changes, and ambiguity flags.

This is the shared answer to brittle regex without deleting regex. Regex remains the fast first pass. The model handles only uncertain spans.

### Memory Gate

Input: one completed exchange plus existing memory fingerprints.
Output: `discard`, `recent_only`, or `durable`, salience dimensions, subject IDs, witness IDs, and a factual candidate sentence.

The validator rejects unsupported facts and duplicates. Embeddings still retrieve; the tiny model decides what deserves storage and whose memory it belongs to.

### Continuity Sentinel

Input: canonical pre-frame, proposed receipt, and a short narrative excerpt.
Output: contradictions only—wrong actor, impossible location, knowledge leak, time conflict, outfit conflict, missing arrival/departure, or receipt/prose disagreement.

It never rewrites prose and never repairs by invention. It can trigger the existing deterministic rescue or main-model receipt repair only when necessary.

### Social Signal

Input: one message and relationship baseline.
Output: bounded appraisal values such as warmth, pressure, vulnerability, reciprocity, hostility, intimacy, avoidance, and boundary respect.

These are evidence signals, not direct relationship deltas. Mode-specific reducers translate them according to personality and history.

## 6. Mode integrations

### Chat Library

1. **Speaker attribution:** map quoted dialogue and actions to a bounded room cast; leave uncertain lines as narration rather than guessing.
2. **Perspective-aware memory:** identify witnesses and prevent room-wide hivemind memory.
3. **Lore activation:** semantic candidate ranking augments keyword matching; it does not bypass lore probability or visibility rules.
4. **Conversation texture:** private per-character social signals help select relevant memories and author notes without altering the final prose.
5. **History compression:** event facts with provenance replace generic summaries during idle consolidation.

The main chat model remains the only character voice.

### Worlds

1. **Preflight intent envelope:** distinguish “walk toward,” “enter,” “look into,” “tell Alex to go,” and “Alex walks away.”
2. **Receipt sentinel:** audit `commit_world_turn` against actor, route, presence, time, outfit, item, and completion invariants.
3. **Ambiguity-only rescue:** use the tiny model only where deterministic parsing and the main receipt disagree.
4. **NPC micro-agendas:** at schedule/goal boundaries, propose one next action from legal options. World reducers apply feasibility, travel, resources, and cooldowns.
5. **Off-screen society catch-up:** summarize elapsed windows into bounded candidate events; never simulate every minute or every citizen.
6. **Knowledge graph updates:** propose who learned what and by which channel. Provenance is mandatory.

This can reduce expensive structured repair calls because many receipt problems become local classifications. It must not add a tiny-model call to every ordinary successful turn unless the user selects Audit Every Turn.

### Virtual Humans

1. **Private life stream:** a sparse chain of validated micro-beats attached to schedule transitions, wildcard events, messages, commitments, and app resume.
2. **Appraisal:** interpret what a message means to this particular person before the main reply—without generating their reply.
3. **Unanswered-message awareness:** update private attention state when they notice, defer, reconsider, or consciously avoid a message.
4. **Initiative candidate:** propose why they might reach out; existing agency, availability, unanswered-state, and credit permissions decide whether they do.
5. **Media inclination:** classify whether a photo/voice note would feel natural, awkward, unsafe, expensive, or physically implausible. The main model still decides and tool permissions remain authoritative.
6. **Memory formation:** distinguish a passing remark from a durable fact, wound, promise, preference, shared joke, or relationship milestone.

#### Life stream design

The life stream is not generated minute by minute. It is an event-sourced private journal:

- schedule block began/ended;
- location changed;
- commitment became due;
- wildcard fired;
- meaningful message arrived/read;
- player silence crossed a stage;
- app resumed after a long gap;
- weather materially changed an existing plan.

For a 12-hour absence, the deterministic engine first computes the known schedule. One tiny call may fill at most 1–3 plausible micro-beats between anchors. Each beat references an anchor, has a confidence and expiry, and cannot contradict canon. Most days require zero calls.

## 7. Modes of trust

Each experience can choose independently:

- **Off:** current engine only.
- **Shadow:** local model runs within idle budgets; nothing affects play. Labs reports agreement, latency, and invalid-output rates.
- **Assist (recommended):** validated hints improve context, memory, attribution, and ambiguity handling. Canonical reducers remain authoritative.
- **Audit:** local sentinel checks every eligible main-model receipt. Useful for Worlds, but slower on weak hardware.

There is deliberately no “Autonomous” trust level for sub-1B models.

## 8. Visual and interaction design

### Navigation

Do not add a fourth top-level mode. Add **Labs** under Settings/Customize with a flask icon and `Experimental` badge. It configures shared infrastructure rather than containing content.

### Labs home

One calm status page:

1. **Local Cognition** hero card: Off / Ready / Sleeping / Busy / Needs attention.
2. **Choose how it runs:** Connect local server or Embedded Tiny Brain.
3. **Device check:** private local benchmark with plain-language result.
4. **Capability card:** Micro, Small, or Extended; supported tasks shown as chips.
5. **Experience controls:** Chat, Worlds, Virtual Humans—each Off, Shadow, Assist, or Audit where applicable.
6. **Budget:** Eco, Balanced, Responsive, or Custom.
7. **Privacy:** exactly what stays local and what can enter the main-model prompt.
8. **Diagnostics:** last 20 tasks, accepted/rejected count, median latency, zero story spoilers by default.

### In-context controls

Each mode gets one small `Local Cognition` row in its existing System/Immersion surface. It shows inherited global state and permits a per-world, per-chat, or per-timeline override. No permanent new toolbar clutter.

During play, Labs is nearly invisible:

- a subtle brain pulse only while local work is active;
- no typing indicator for private cognition;
- no raw internal monologue;
- no modal interruptions;
- failures appear only in Diagnostics unless they disable the runtime entirely.

### First-run journey

1. User enables Labs.
2. Horde Studio discovers loopback servers without sending any data externally.
3. If none is found, offer Embedded Tiny Brain with model size, expected download, storage, and delete controls.
4. Run five short capability probes, not a synthetic tokens-per-second vanity test.
5. Recommend Shadow mode first.
6. After enough samples, show: “96% valid · 91% agreement · median 180 ms. Safe to enable Assist for Virtual Humans.”

## 9. Runtime and model recommendations

Initial certified profiles should be task-tested rather than marketed as generally intelligent:

- **Gemma 3 270M IT:** toaster tier; classification, tagging, candidate selection, very short compression.
- **SmolLM2 360M Instruct:** broadly portable baseline for rewriting and summarization-style microtasks.
- **LFM2 350M:** strong edge candidate, especially for CPU-oriented connected runtimes and narrow extraction.
- **Qwen3 0.6B:** recommended quality tier for multilingual intent, bounded extraction, and richer appraisal with thinking disabled.
- **LFM2 700M:** optional upper small tier when the device benchmark supports it.

Horde Studio should ship profiles and probes, not weights. Embedded weights download separately into browser cache and are removable from Labs.

## 10. Performance budgets

Default Balanced policy:

- maximum prompt: 512 tokens for Micro, 900 for Small;
- maximum output: 96 tokens for classifiers, 180 for event extraction;
- foreground deadline: 350 ms soft / 900 ms hard;
- background deadline: 4 seconds;
- maximum two local calls per player turn, normally zero or one;
- maximum 12 background calls per hour across all Virtual Humans;
- resume catch-up: one coalesced call per human, not per missed event;
- task cache keyed by canonical frame hash and input hash;
- automatically sleep/unload after configurable idle time;
- pause background work while a local main model is generating.

Eco reduces calls and disables generative life beats. Responsive may audit every world receipt. Device benchmark can lower the policy but never silently raise it.

## 11. Data model

Global configuration stores runtime, model profile, capability results, budgets, and privacy. Content stores only mode and optional overrides. Timeline-local cognition state stays with the timeline.

Private cognition records are segregated:

```json
{
  "id": "cog_...",
  "mode": "virtual_human",
  "subjectId": "vh_...",
  "task": "message_appraisal",
  "anchorIds": ["msg_..."],
  "createdAt": 0,
  "expiresAt": 0,
  "candidate": {},
  "accepted": false,
  "validator": { "version": 1, "reason": "" },
  "private": true
}
```

Shareable character/world exports omit private cognition, runtime diagnostics, cached prompts, and benchmark results. Full backups may include accepted private state only behind an explicit checkbox.

## 12. Example schemas

### Event Lens

```json
{
  "actors": [{ "id": "string", "speech": false }],
  "events": [{
    "actorId": "string",
    "kind": "move|outfit|item|speech|social|time|none",
    "targetId": "string",
    "phase": "intended|attempted|in_progress|completed",
    "evidence": "short exact excerpt",
    "confidence": 0.0
  }],
  "ambiguous": false
}
```

### Virtual Human appraisal

```json
{
  "signals": {
    "warmth": 0,
    "pressure": 0,
    "vulnerability": 0,
    "boundaryRespect": 0,
    "urgency": 0
  },
  "memoryClass": "discard|recent_only|durable",
  "initiativeHook": "",
  "evidence": "short exact excerpt",
  "confidence": 0.0
}
```

Schemas remain intentionally shallow. Tiny models perform worse when asked to fill a giant universal receipt.

## 13. Implementation phases

### Code boundaries

Labs should not add another several thousand lines to `app.js`. Keep it as separately loaded, build-free modules:

- `labs-core.js` — configuration, scheduler, budgets, cache, receipts;
- `labs-runtimes.js` — OpenAI-compatible and embedded-worker adapters;
- `labs-tasks.js` — versioned schemas, prompts, fallbacks, validators;
- `labs-integrations.js` — narrow hooks for Chat, Worlds, and Virtual Humans;
- `labs-ui.js` — setup, device check, diagnostics, and per-mode controls;
- `labs-worker.js` — embedded inference isolated from the UI thread;
- `scratch/labs_cognition_audit.js` — frozen evaluation corpus and regression gates.

Each mode calls a stable interface such as `HordeLabs.propose(task, envelope, policy)`. It never imports a runtime or model directly.

### Phase 0 — Evaluation harness

- Build 300–500 frozen cases from existing audits and real regressions.
- Score JSON validity, classification accuracy, actor integrity, false commits, latency, and memory.
- Certify tasks per model/runtime combination.

Exit criterion: no model is recommended by parameter count alone.

### Phase 1 — Runtime and Shadow mode

- Runtime adapters, capability probing, scheduler, task registry, validators, budgets, diagnostics.
- Event Lens, Memory Gate, and Social Signal run in Shadow mode.
- No gameplay mutation.

Exit criterion: disabling Labs produces byte-equivalent request construction for sampled existing flows.

### Phase 2 — Virtual Human Assist

- Message appraisal, memory gate, sparse life stream, unanswered-message attention, initiative candidates.
- Per-timeline controls and private-state export policy.

Exit criterion: deterministic tests prove no extra autonomous send, photo, voice note, relationship mutation, or canon fact can occur without existing gates.

### Phase 3 — Worlds Assist

- Ambiguity-gated Event Lens, receipt sentinel, knowledge provenance, outfit/movement integrity.
- Measure reduction in cloud repair calls.

Exit criterion: zero actor-teleport regressions across the movement corpus and lower average foreground cloud calls.

### Phase 4 — Chat Assist

- Speaker attribution, perspective-aware memory, lore candidate ranking, factual consolidation.

Exit criterion: attribution improves on the dialogue corpus without increasing false speaker assignment.

### Phase 5 — Embedded Tiny Brain

- Worker runtime, model download/cache/delete, device profiler, suspend/resume, storage reporting.
- Connected local servers remain supported and preferred when already available.

Exit criterion: first-run cancellation, offline relaunch, low-memory failure, model deletion, and fallback all work without corrupting play.

## 14. Acceptance criteria

- Labs Off passes the entire current regression suite unchanged.
- Every task has a deterministic fallback and hard timeout.
- Malformed output never reaches a reducer.
- A proposed ID outside the candidate list is always rejected.
- Shadow and Assist can be changed per experience without restarting.
- The UI names the active runtime and model without conflating it with text/image/TTS providers.
- No background cognition occurs after the user disables it.
- No local task is sent to a cloud provider.
- Local-model prompts and private thoughts never appear in ordinary exports.
- On weak devices, the scheduler degrades to fewer tasks rather than freezing the interface.
- Worlds measure repair-call reduction; Virtual Humans measure believable awareness without message spam; Chat measures attribution and memory precision.

## 15. The critical conclusion

“A person thinking every minute” sounds alive but would create repetitive noise, wasted power, runaway state, and false memories. Believability comes from causal continuity at meaningful moments, not from maximizing inference count.

The breakthrough is a sparse, private, event-sourced cognition layer that makes the existing deterministic simulation more perceptive. A tiny model becomes valuable because Horde Studio supplies the world, choices, constraints, memory, clocks, and consequences it cannot reliably invent for itself.
