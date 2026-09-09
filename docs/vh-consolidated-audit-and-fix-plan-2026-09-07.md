# Virtual Humans: consolidated audit and overhaul plan

## Objective and verdict

Build one persistent simulated person whose conversation is an action within their life. Messages should influence how they feel and what they choose; activities should influence how they converse; both should produce the same history and future consequences.

The current implementation does not meet that standard. It has useful pieces—persistent timelines, attention states, relationships, emotional variables, memories, activity progress, and separate response/observer models—but they do not share a dependable decision-and-event cycle. The user-facing symptoms follow from that fragmentation: delayed replies, commentary instead of participation, emotional flatness, and abrupt unexplained disappearance into another activity.

The recent fixes improved recoverability and added executable activity foundations. They did not establish believable pacing or a unified autonomous life. Passing safety-of-execution regressions was not sufficient evidence of a convincing simulation.

This document consolidates the prior timing, conversation/prompt, and activity audits, and adds affect and activity-transition findings. It is the primary fix plan. The longer investigation remains in `docs/vh-life-simulation-audit-2026-09-07.md`.

## Evidence and boundaries

Executed production decision functions in isolated synthetic scenarios: sixteen timing cases at the actual five-second agency cadence; seven eight-hour activity-label/physiology comparisons; prompt construction with known markers; a proposed unexecuted life event; four explicit affect transactions; a sleep-boundary transition; and a delayed observer crossing a timeline switch.

These probes establish code behavior. They do not establish the cause of every symptom in the user's particular saved VH. Its configuration, actual provider responses, and observer failures have not been inspected. No live providers were called, no personal messages were read, and production behavior was not changed during these audits. Live-model dialogue evaluation remains a required milestone.

Reproducible probes:

- `scratch/vh_life_sim_audit.js`
- `scratch/vh_conversation_prompt_audit.js`
- `scratch/vh_affect_transition_audit.js`

Their JSON evidence files are under `docs/` with matching audit names and the date 2026-09-07.

## Consolidated findings

### 1. Conversation has no persistent engagement state — P1

An ordinary available-state “hey” waits 35 seconds before the model request. A follow-up one second after the VH's previous reply incurs the same delay. Actual network and generation latency come afterward. The person pays a new notification and composition cost on each turn instead of remaining in an exchange.

The busy-alone fixture waits 30 minutes 40 seconds; with two other people, 46 minutes 10 seconds. Checkpoint scheduling can overshoot the phone-break eligibility time. Under constant very low capacity, the probe never permits a response during eight hours. That last test isolates a threshold; it does not claim a live person's physiology stays unchanged for eight hours.

### 2. Meaning is missing from attention decisions — P1

“SOS” and “hey” produce identical timing in the same busy fixture. The kernel uses length/type and broad state thresholds, not conversational meaning. Any overdue promise can dramatically accelerate a reply even when unrelated to the current message. There are no dependable decisions for a short acknowledgement now, a specific answer later, clarification, or resuming an interrupted topic.

### 3. The default prompt loses the ongoing conversational purpose — P1

VH stores a conversational goal, but the default performer packet omits it. Some fields included in the packet—beliefs, private-life and player-knowledge context—are dropped by its text renderer. A detailed identity is not a substitute for the current question, offer, joke, disagreement, or shared decision.

The prompt stresses responding appropriately and avoiding unwanted patterns. It gives less explicit support for what the person wants to do in this exchange. This is a plausible contributor to reactive commentary; it requires live output comparisons to establish its effect on a particular model.

### 4. Invalidated history and budget errors undermine continuity — P1

The actual builder forwarded an invalidated companion reply; it became the final assistant message after the valid user turn. Under substantial authored context and a small selected context size, the builder retained “yeah” while dropping the earlier question. Its system text exceeded its own approximate context estimate before output reserve was considered.

This can make a coherent model continue the wrong conversation. Filter invalidated records and preserve conversational anchors before expanding personality text or changing models.

### 5. Emotion is predominantly an after-the-reply process — P1

Default separated cognition excludes primary emotional state from the immediate foreground commit. The visible response is generated first; a queued observer later proposes state changes. Its prompt says ordinary banter should usually produce zero deltas and no durable memory. That conflates two different ideas: ordinary conversation often should not create a permanent milestone, but it can still change immediate interest, warmth, amusement, tension, or activation.

A compliment can therefore receive a pleasant textual reaction without a timely causal change in the simulated person. An observer that is slow, fails, or returns zero changes leaves the state flat. The next reply may begin before the preceding appraisal commits. The response model is not reliably expressing the newly appraised emotional moment.

### 6. “Arousal” denotes two separate systems — configuration and observability gap

- `mood.arousal` is general emotional activation, including excitement or anxiety.
- `humanDynamics.sexualArousal` is a distinct adult desire-system value, updated by `sexual_arousal_change`.
- The latter is active only when the profile has `libidoEnabled` and an explicit adult age. Disabled-state normalization/sanitization holds it at zero.

The synthetic enabled-adult probe accepted valence +6, emotional activation +8, and sexual arousal +12. Supplying only the general activation delta left sexual arousal unchanged. A zero observer transaction left all three unchanged. With the adult desire system disabled, the same requested sexual delta was zeroed while the other two updates applied.

Thus the numerical update path is not universally broken. The audit must distinguish an absent/failed appraisal, an omitted field, disabled configuration, delayed processing, and a genuine no-change interpretation. The user's saved configuration has not been checked.

Sweet talk should be interpreted in context: welcomed affection can produce warmth or excitement; wanted flirtation can affect attraction and adult desire; pressure or repetition can produce discomfort, boredom, or distance. A dynamic simulation does not require every compliment to raise every meter. It requires an explainable relationship between the perceived exchange, internal response, expression, and subsequent choice.

### 7. Delayed observations can update the wrong timeline — P1

The observer checks the active timeline before asynchronous generation. After awaiting the result, it checks that the old response group remains in its retained message array, but does not re-establish that the runtime being mutated belongs to that timeline.

The orchestration probe switched from an old timeline to a new one while an observer was in flight. Resolving the old result applied its +6 valence change to the newly active runtime. This is a demonstrated ownership bug, not a model-quality hypothesis. Appraisals need immutable ownership, source-event identity, and revision validation at commit time.

### 8. Activities change without conversational transition decisions — P1

The sleep probe crossed the configured normal bedtime with an ongoing synthetic conversation. Availability changed from available to asleep; the routine ledger changed; no contact intention was created and the conversation gained no message.

Routine advancement records the changed situation. It does not model noticing an upcoming departure, deciding whether to notify the other person, finishing a conversational turn, renegotiating a commitment, or resuming contact afterward. The existing proactive path requires available status and no pending reply, so it is not a general solution for departure or deferral during an active exchange.

This can feel random despite being clock-driven. The missing element is a communicated, contextual transition—not necessarily a message at every schedule boundary. People can leave silently, fall asleep unintentionally, or have nothing to explain when nobody is talking to them. The engine should make that choice and retain its consequences.

### 9. There are competing authorities for what happened — P1

The executable activity engine validates progress and resources. The optional life-beat path can instead append a model-written summary as a certain completed life event. The probe accepted a completed trip with an invalid anchor and recorded certainty 100 without executing travel.

Descriptive schedules, temporary situations, life beats, social simulation, activity goals, and textual commitments do not yet share one transition contract. Memory can inherit fictional “facts” that bypassed the executable simulation.

### 10. Physiology still relies on display words — P2

After identical eight-hour awake intervals, “work” produced stress 37.5 while “working” produced 24; “rest” produced 17.5 while “resting” produced 24. All four had identical passive energy loss. Activity wording is being used as a physical model through regexes, with discrete activity effects layered alongside it.

Use explicit demand, recovery, social exposure, attention demand, and interruptibility. Renaming an activity must not change the person.

### 11. Goals and memory are richer as records than as causes — P2

The three executable templates preserve progress and consequences, but do not yet supply broad self-directed planning. Meal acquisition abstracts away access, travel, money, and uncertainty. Most goals are manually added. Memories are selected mainly through lexical relevance, weight, certainty, and recency; specific experiences do not directly inform the attention decision.

The engine needs needs-to-goals and experiences-to-expectations mechanisms, rather than more disconnected meters or retrospective narrative.

### 12. Closed-app execution remains incomplete — P1 for an always-on product

The Python helper does not execute the browser attention/activity kernel. Pending attention-managed replies wait for the app to reopen. Catch-up is not the same as a person whose decisions, actions, and messages continued during the absence.

## Target architecture

One versioned person state should own identity, perceived events, current and lingering affect, relationships, active conversation, needs, goals, activity progress, memory, and scheduled decisions. UI panels and text messages should be views and actions of that state.

The core causal cycle is:

1. A message, activity event, remembered concern, or scheduled obligation becomes perceptible.
2. The person appraises its meaning relative to goals, relationships, and experience.
3. Immediate affect and expectations change, remain unchanged for a reason, or become a pending delayed reaction.
4. The person selects a feasible action: speak, continue working, clarify, defer, leave, rest, or return to an intention.
5. The engine validates and commits the action/event once against the correct person, timeline, and revision.
6. The outcome changes shared state; relevant consequences become memory and future decision inputs.

The language model proposes interpretation and expression. The engine owns time, facts, prerequisites, and committed consequences. Prose cannot silently override execution.

Avoid inserting a mandatory extra serial model call for every casual reply. A coherent interpretation, proposed affect change, conversational move, and utterance can be produced in one foreground transaction against a state snapshot, validated together before publication. A later observer may enrich memory or flag anomalies; it must not be the sole source of the person's immediate emotional reaction. If an action fails, preserve actual perception and valid committed effects while retaining the appropriate pending action.

## Ordered fix plan

### Phase 1 — Correct ownership and conversational context

**Changes:** prevent cross-timeline observer writes; attach source IDs and revisions to asynchronous work; prevent replayed deltas and clock rewinds. Remove invalidated dialogue. Enforce context budgets, reserve the active exchange, and pass selected conversational goal/knowledge fields consistently through both prompt paths. Surface pending, committed, rejected, and failed appraisals in diagnostics.

**Acceptance:** switch timelines during an observation and neither unrelated runtime changes; retry an appraisal without double application; a short answer retains its question; rejected text never returns; constrained-context requests fit the supported budget or fail transparently.

### Phase 2 — Make conversation continuous and remove artificial latency

**Changes:** persist engagement, the active topic, unresolved questions/offers, shared decisions, and the person's present conversational intention. Distinguish conversation engagement from broad activity availability. Start generation when engagement is chosen. Schedule at the actual next eligibility boundary. Give optional background work a separate queue.

**Acceptance:** short follow-ups during engagement add no artificial pause beyond one scheduler tick; a busy-state boundary is not missed by a later checkpoint; background life generation cannot delay a due reply. Evaluate dialogue for participation, not mandatory questions or forced banter.

### Phase 3 — Connect perception, affect, and expression

**Changes:** separate immediate feelings from long-term relationship change and durable memories. Replace the blanket banter-zero instruction with contextual appraisal. Keep emotional activation, attraction, desire, and sexual arousal distinct. Produce a validated affect proposal and response that agree. Keep reasons for zero/rejected/delayed changes visible in diagnostics without exposing private machinery in chat.

**Acceptance:** matched affectionate, indifferent, strained, and pressured contexts produce defensible differences; welcomed affection can change immediate feeling without a relationship milestone; a relevant valid adult-arousal update persists when enabled; unrelated emotional activation does not accidentally change it. The reply, displayed state, and next decision agree. No hardcoded “compliment means +arousal” rule.

### Phase 4 — Make life transitions conversational actions

**Changes:** add upcoming transitions, interruption cost, transition reasons, and continuation intentions. During an active exchange, decide whether to finish a thought, signal an impending departure, offer to return, leave silently, or postpone the activity. Record a promise only if one was actually made. Resume for a concrete reason and account for missed follow-through.

**Acceptance:** a planned bedtime can produce a grounded winding-down turn before sleep when context warrants; an errand can pause conversation and preserve its unfinished thread; sudden sleep can still occur without pretending a goodbye was sent; returning continues or acknowledges the actual interruption. No compulsory goodbye at every boundary, no outbound spam, and no response generated only after the person is already asleep to invent a prior farewell.

### Phase 5 — Consolidate life, goals, and memory onto one event system

**Changes:** replace word-derived effects with structured activity properties. Convert life-beat suggestions into proposals, not completed history. Make needs, commitments, preferences, and particular remembered experiences propose and rank goals. Use the same events for physiology, attention, resources, relationships, and dialogue.

**Acceptance:** an interrupted goal resumes or is abandoned for a recorded reason; changing its label changes no effects; unsupported travel cannot become fact; resources and outcomes apply once; yesterday's fulfilled or broken promise changes today's expectations and choices in a traceable way.

### Phase 6 — Execute the same person while the interface is closed

**Changes:** choose and implement a shared execution contract for browser and always-on host. The host choice must fit portable distribution; do not maintain subtly different decision logic in JavaScript and Python. Add leases, idempotent work items, event replay, migrations, and recovery. Browser UI should observe/command the simulation rather than being its sole clock.

**Acceptance:** closing/reopening or restarting the host changes neither the causal sequence nor ownership; due messages and activities execute once; replay reproduces committed state; absence does not freeze the person or fabricate catch-up conversations.

## Evaluation and release criteria

Keep deterministic engine tests and multi-turn behavior evaluation separate. Both must pass. Use synthetic saved fixtures first, then opt-in live-model scenario runs with measured provider cost and timing. Compare prompt changes with the same model before changing model selection; compare models separately.

Required scenarios include active banter, a brief “yes” to an older question, making plans, sharing good/bad news, welcomed affection, unwanted pressure, conflict and repair, low-energy conversation, a planned departure, accidental sleep, returning from an errand, forgotten and fulfilled promises, a long absence, a timeline switch during appraisal, and failures/reloads at each commit boundary.

Track notice-to-request and request-to-publication latency separately; context retention; appropriate conversational moves; repetition and generic commentary; affect-to-expression consistency; reasons for no-change reactions; transition communication; fulfilled/missed intentions; fabricated facts; and duplicate/cross-timeline events. Do not claim success because every turn changes a meter or every reply contains a question.

The first implementation milestone is Phases 1–3 together: correct context, continuous conversation, and causal emotional response. Follow immediately with transition communication. Additional activity templates should not take priority over those connections.

## Definition of done

The same person should be recognizable in what they feel, what they say, what they do next, and what they remember. A message can change their day; their day can change the conversation. Every consequential connection should be reproducible from committed events, while the language remains natural and individual.
