# VH life-simulation audit

The combined findings, including affect/arousal and life-to-text transitions, and the ordered overhaul plan are now consolidated in `docs/vh-consolidated-audit-and-fix-plan-2026-09-07.md`. This document retains the detailed timing and prompt investigations.

## Verdict

VH has better continuity and safer state transitions than before, but its interaction policy still produces a mechanical experience. In particular, the current attention implementation overcorrects toward delay. It often represents a person with time gates and numerical vetoes rather than someone participating in a conversation.

The recent repairs made interrupted work and pending messages more recoverable. They did not establish convincing conversational pacing. Our passing regression suites did not measure that experience, and this audit exposes the gap.

## Evidence and limits

Ran sixteen timing scenarios using the production response planner and attention functions at the actual five-second agency cadence. Controlled availability and numerical state were held fixed unless the scenario explicitly changed them. Also ran seven eight-hour physiology comparisons, an executable meal sequence, and an injected invalid life-beat proposal against the actual life-beat handler.

Timing results measure the interval from sending a message until the engine permits the provider request. They exclude storage latency, model generation, network latency, optional Labs work, and rendering. They are synthetic policy measurements, not measurements from the user's saved human or estimates of human population norms. Fixed low-capacity scenarios isolate a policy boundary; they do not prove a real profile would retain that capacity indefinitely.

No live providers were called and no personal conversations were inspected. This audit can assess response orchestration and prompt inputs, but cannot honestly score the naturalness of generated dialogue without a controlled live-model transcript evaluation.

Reproduce with `node scratch/vh_life_sim_audit.js`. Detailed results are in `docs/vh-life-sim-audit-results-2026-09-07.json`. The script is an audit probe, not a release gate that blesses the current behavior. Production application code was not changed during this audit.

## Measured pacing

| Controlled circumstance | Seen | Provider request permitted |
| --- | ---: | ---: |
| Available, ordinary state, “hey” | 10 s | 35 s |
| Available, ordinary state, “yes” | 10 s | 35 s |
| Available, high energy | 5 s | 25 s |
| Available, 900-character message | 10 s | 55 s |
| Available, photo | 10 s | 60 s |
| Follow-up one second after their previous reply | 10 s | 35 s |
| Busy alone, eight-hour block | 2 m 15 s | 30 m 40 s |
| Busy with two other people | 3 m 45 s | 46 m 10 s |
| Busy, “SOS” | 2 m 15 s | 30 m 40 s |
| Busy, much higher warmth | 2 m 15 s | 30 m 40 s |
| Same busy person with an unrelated overdue promise | 2 m 15 s | 2 m 40 s |
| Twenty-minute restorative break | 2 m 15 s | 20 m 25 s |
| Meeting ends after five minutes | 2 m 15 s | 5 m 25 s |
| Constant very low capacity | 25 s | No request during eight-hour probe |

## Findings

### P1 — There is no engaged-conversation state

`companionAttentionContext` and `decideCompanionAttention` do not use a recent companion response to establish that the phone is already open and the person is already engaged. The history probe gets exactly the same 35-second pre-generation delay as first contact. Every turn can feel like reconnecting with the person from scratch.

An engagement state should persist through a conversational exchange and end because attention actually moves away. A follow-up during that exchange should not repeatedly pay notification-discovery and phone-opening costs.

### P1 — Artificial composition time is added before actual composition

The planner waits for notice, then a character-count-derived composition interval, then allows `sendCompanionMessage` to start the provider request. The request buffers its complete JSON response before applying the reply. The 35 seconds for a short available-state message is therefore a minimum artificial delay in the probe, not the displayed end-to-end latency.

Generation should begin once the decision to engage is made. Any presentation timing should account for elapsed generation time rather than adding another full thinking period first. Preserve cancellation/ownership checks before publishing a result when circumstances change.

### P1 — Reconsideration checkpoints can overshoot their own break policy

In the ordinary busy-alone fixture, capacity is 65 and a phone-break opportunity begins after 17 minutes of noticed waiting. The deferred state reevaluates every rounded 14 minutes, so it misses that crossing and waits until roughly 28 minutes after noticing. The total reaches 30 minutes 40 seconds. This delay is a scheduling artifact, not a modeled decision.

The next evaluation should include the actual earliest eligibility boundary. More fundamentally, ordinary divided attention, a fixed appointment, driving, privacy, and quiet rest need different interruptibility properties; a single busy category is insufficient.

### P1 — Message meaning does not participate in the reply decision

The kernel sees message length and type. It cannot distinguish “SOS” from “hey”; the equal-length probe produces exactly identical timing. It also lacks decisions such as acknowledging, requesting clarification, sending a short answer now, or intentionally returning to one particular topic later.

Appraisal should occur after permitted perception, retain uncertainty, and produce structured conversational obligations. The engine should select a feasible response action using that appraisal. Keyword urgency alone would repeat the same parsing fragility found elsewhere.

### P1 — The life engine still accepts invented completed history

`processCompanionLabsLifeBeat` passes allowed anchors/places/people to a proposal model but does not validate the returned summaries against executable actions. The audit supplied a nonexistent anchor and a summary claiming a completed trip to an unauthored place. The real handler appended it to life events and recorded it with certainty 100.

That bypass competes with the new activity engine's committed outcomes. A model-written suggestion must remain a suggestion until its prerequisites and execution establish what happened. Otherwise memories and dialogue can confidently reflect events the simulation never ran.

### P1 — Optional life generation precedes inbox processing

`processCompanionAgency` awaits `processCompanionLabsLifeBeat` before evaluating that companion's inbox. When the optional life-beat capability is enabled and due, background story work sits in the reply path. The companion loop also awaits work sequentially. This is a source-confirmed latency risk, not a measured provider delay in this audit.

Background work should not hold up due foreground conversation. A background task may publish a validated event later without blocking message perception and response scheduling.

### P2 — Relationship relevance is flattened into thresholds and unrelated promises

Warmth affects willingness, but increasing it substantially produced no timing change in the busy fixture. Adding any overdue promise, regardless of its relation to the message, reduced the same delay from 30:40 to 2:40. Existing promises are useful state, but the engine needs relevance and an intended action, not a blanket permission to interrupt.

Trust, established contact habits, the current conversation, and specific unresolved experiences should inform decisions. Not every positive relationship must respond quickly, and not every overdue obligation should make every message urgent.

### P2 — Activity wording still controls physiology

The physiology engine classifies activities with word-boundary regexes. Starting from energy 80 and stress 20, the same eight-hour awake interval produced:

| Label | Final stress | Final energy |
| --- | ---: | ---: |
| work | 37.5 | 62.4 |
| working | 24 | 62.4 |
| working on an essay | 24 | 62.4 |
| studying | 24 | 62.4 |
| rest | 17.5 | 62.4 |
| resting | 24 | 62.4 |
| at home | 17.5 | 62.4 |

Renaming an activity should not change its physical effects. Passive awake energy also drains at the same rate across these labels; discrete activity outcomes are a separate system layered onto it. Use explicit demand, recovery, social exposure, and interruption properties, with one consistent integration order.

### P2 — Executable goals remain a small authored task system

The new engine correctly preserves progress, prerequisites, resource charges, and completion. Those are valuable foundations. But its three templates, mostly manual initiation, fixed durations/outcomes, and broad availability gate do not yet create a self-directed day.

The meal probe always obtains ingredients and finishes the meal under free conditions. There is no travel, shopping access, money, preference, uncertainty, or competing social event. This abstraction is already disclosed in the UI; it should not be mistaken for a complete life simulation. Automatic recovery is currently the principal need-driven goal proposal.

### P2 — Prompt grounding improves expression but does not create behavior

The performance prompt has identity, style, relationship, recent events, memory retrieval, activities, and attention reasons. It also relies on instructions to sound individual, avoid generic warmth, and be brief. These can improve expression, but the model receives decisions that are already constrained by the weak timing policy. Expressive prompts cannot repair a thirty-minute response gate.

Memory retrieval is mainly lexical overlap, weight, certainty, and recency. The attention decision itself does not recall specific episodes. The engine therefore has more remembered material than executable reasons for changing its behavior. A live-model evaluation is still needed to measure repeated questions, generic empathy, mismatched tone, stale context, and fabricated explanations.

### P2 — Closed-app continuity remains incomplete

The Python always-on helper does not run the attention/activity engine. Attention-managed pending conversations are excluded from its message generation. Reopening catches up some state, but that differs materially from a person whose actions and replies continue while the interface is closed.

## What is working

- Pending replies and timeline ownership are much safer than the original implementation.
- Notice and response are distinct persisted states.
- A changed situation can release or interrupt attention.
- Activity progress and resource spending survive interruption and reload.
- Committed activity outcomes can enter life history and memory once.
- Existing diagnostics and source-isolated tests make failures reproducible.

These are engine capabilities. They are not sufficient evidence that VH feels alive.

## Recommended repair order and acceptance criteria

1. **Conversational continuity and latency.** Introduce an engaged-conversation state. Start generation when engagement is chosen. For a short follow-up during engagement, target no additional artificial delay beyond one scheduler tick; this is a proposed product target, not a scientific claim about human response times. Track send, notice, decision, request start, first output, and publication separately.
2. **Correct scheduling boundaries.** Wake at the next relevant condition, not a checkpoint that can skip it. Test soft activity, fixed commitment, private time, and sleep independently. Do not solve all contexts by universally shortening timers.
3. **Structured reply actions and appraisal.** Support answer, brief acknowledgement, clarification, defer with a reason, decline, and reconsider. Different meanings must produce different decisions in controlled contexts, with uncertainty preserved.
4. **One activity/event authority.** Make activity properties authoritative for physiology and attention. Convert proposed life beats into executable intentions or clearly uncertain observations. Changing a display label must not change state evolution, and an unexecuted trip must not become certain history.
5. **Self-directed goals and memory consequences.** Choose activities from needs, obligations, preferences, and specific past experiences. The same event should consistently change available time, resources, relationship expectations, future choices, and dialogue.
6. **Shared background execution and live evaluation.** Run the same semantics while the UI is closed. Evaluate multi-turn dialogues with the configured model using a controlled scenario set, including active banter, bad timing, conflict repair, and next-day follow-through.

The immediate priority is to stop charging the user an artificial waiting penalty on every conversational turn. More life features should follow a pacing and causality model that is demonstrably coherent.

## Extension: conversation behavior, model orchestration, and prompt construction

The user reports that replies feel like commentary on their message rather than participation in a conversation. This is a distinct issue from latency. A faster paraphrase would still have the same problem.

Inspected the default separated response path, context packet construction, packet-to-text rendering, history selection, observer commits, and generation configuration. Ran the actual prompt builders with a synthetic character, a continuing conversation, stored intentions, and explicit marker fields. Reproduce with `node scratch/vh_conversation_prompt_audit.js`. Outputs are in `docs/vh-conversation-prompt-audit-results-2026-09-07.json`; `docs/vh-conversation-prompt-fixture-2026-09-07.json` contains the synthetic baseline request messages.

No live model responses were generated. The omissions and context defects below are demonstrated. Their contribution to the reported commentary style is a design diagnosis, not a measured causal effect on a particular provider or model.

### P1 — The stored conversational goal does not reach the default performer

`applyCompanionAgencyCommit` stores a conversation goal such as practical coordination, reassurance, repair, changing the subject, or ending the conversation. The full prompt references the previous goal. The default `buildCompanionPerformancePrompt` uses a different packet that omits that goal entirely.

The probe stored “agree where to meet tonight.” Its marker was absent from the emitted system prompt. This does not mean the model cannot infer a goal from chat history; it means the explicit goal state is not connected to the default response generator.

The separated observer runs after the visible response. Its later goal attribution cannot guide the response already sent, and the omission prevents that state from directly guiding the next default response. Retrospective explanation is being treated as more complete agency than it actually supplies.

### P1 — Prompt assembly drops meaningful fields

The packet includes beliefs, private life, relationship authenticity, and player-knowledge context, but its text renderer does not carry all of them into the default performer prompt. The probe verified that a belief present in the packet, an authored private-life marker, and a player-knowledge marker were absent from the emitted prompt.

These should not all be indiscriminately dumped into every turn. The defect is that selection is accidental and inconsistent between paths, rather than an explicit decision about relevance and what the person knows. The dedicated first-turn `startingScenarioThisTurn` option is also ignored by the performance builder. Actual first-turn state may still reach the model indirectly through recorded life events; the test demonstrates loss of the dedicated instruction, not guaranteed total loss of opening context.

### P1 — Invalidated dialogue is still sent as conversation history

`buildCompanionMessages` filters unread player messages but does not exclude invalidated records. An invalidated companion response containing a unique marker survived in the final request. In the probe it became the last message and gave the request an assistant-ending history after the user's actual turn.

This can resurrect rejected/rerolled dialogue, make the model believe it already responded, and reinforce precisely the style the user rejected. It is a concrete context bug, not a sampling issue.

### P1 — The description budget can evict the conversation being continued

The builder constructs the full system text before allocating room to recent conversation. History is selected by an approximate character budget and truncated from the older end. There is no explicit retention of the question, proposal, or unfinished exchange to which a short reply belongs.

With a substantial but plausible authored description, a selected context size of 2,048, and 23 history messages, the probe retained only eight history messages and lost the initiating question while retaining the final “yeah.” Its system text alone was 7,916 characters, larger than the builder's own 7,168-character context estimate, before a 3,500-character output reserve. The forced minimum of 1,000 history characters does not resolve the over-budget system prompt. These are the application's approximate character units, not measured provider token counts.

The ordinary baseline prompt was only 2,024 system characters; this is not a claim that every default prompt is too large. It demonstrates a failure under authored context pressure. Without the conversational anchor, generic acknowledgment becomes a predictable fallback.

### P2 — The foreground contract emphasizes reaction, but provides little conversational direction

The performer is told to respond to the exact message, prefer specific reactions, remain brief, avoid generic warmth, and not ask a question every turn. Those restrictions are useful, but they do not define what the person is doing in the current exchange: answering an outstanding question, accepting a plan, negotiating a detail, sharing something relevant, disagreeing, carrying a joke, or closing the topic.

The current prompt has a detailed person description and state summary, but no explicit representation of the active exchange, unresolved question/offer, shared decision, or the person's immediate conversational intention. Much of that must be rediscovered from raw history each turn. A model can still converse well from history alone; the architecture does not make that continuity dependable.

This is a plausible contributor to “commentary mode.” It would be a mistake to assert that a particular line such as “respond to the exact message” proves the cause. A prompt comparison with actual generated outputs is required.

### P2 — Shortening text and splitting bubbles are not conversation modeling

The default visible token allowance, provider output reserve, and post-generation bubble splitter are format controls. They do not decide whether a reply actually advances the exchange. Splitting a paragraph of commentary into three bubbles leaves three bubbles of commentary.

The provider budget also retains a reserve intended partly for private state receipts even when the default performer excludes those state tools. This is a budget-policy mismatch worth revisiting, not proof that the model will consume the allowance or that lowering it alone will improve the conversation.

Do not replace commentary with mandatory banter, a question in every turn, forced typos, emotional filler, or a rigid “acknowledge + disclose + ask” template. Those would introduce another recognizable formula. A plain acknowledgment can be exactly right when it completes the exchange.

### What participation should mean

For an illustrative, fully fictional exchange:

> VH: “Do you want to try the little cafe near mine?”
> Player: “yeah”

A commentary-style continuation might be: “That sounds like a nice idea. It could be a good chance to unwind.” A participating continuation, assuming availability is established, could be: “Six? Outside if it's not raining.”

These are authored examples, not sampled model outputs. The distinction is that the second turn works on the existing plan. It does not merely evaluate the player's acceptance. Depending on the character and context, participation could instead mean changing the time, confessing they forgot the cafe closes early, making a grounded joke, or simply confirming an already complete arrangement.

### Proposed conversation contract

Before constructing the request, retain a compact account of:

- The active topic or joint activity and the specific question, offer, or decision still open.
- What the player just did conversationally, with uncertainty for ambiguous replies.
- What the person currently wants from this exchange, including reasons to avoid or end it.
- Facts, commitments, and shared references needed for this next turn.
- Which memories or feelings matter now, rather than the whole dossier.
- Their current engagement and feasible response action.

Build the prompt around the intact recent exchange and this concise contract, then add relevant character context within an enforced budget. Use one contract across default and alternate generation paths. Do not require an additional serial model call merely to plan every casual response; that would worsen the latency problem. The response model can choose a fitting conversational move in the same generation, with the engine supplying established state and validating consequential claims.

### Required evaluation before declaring this fixed

Use the same scenario histories to compare the current prompt against a revised builder, then compare model/configuration choices separately. Keep those experiments distinct so a prompt defect is not mistaken for a weak model. The currently configured model and actual user dialogue were not inspected here.

Include multi-turn tests for short answers to earlier questions, making plans, continuing a joke, disagreeing, sharing bad news, an explicit request for advice, a story being told in pieces, a correction/reroll, an awkward silence, and an ordinary topic ending. Track:

- Whether the reply answers or acts on the open exchange.
- Whether it contributes an appropriate next move rather than restating the message.
- Whether the person has reciprocal interests and initiative without hijacking the topic.
- Whether questions, praise, reassurance, and emotion labels become repetitive.
- Whether shared facts, uncertainty, and established character voice survive across turns.
- Whether rejected text, private facts, or invented activities leak into the conversation.
- Whether minimal acknowledgments and natural endings remain possible.

**Revised first milestone:** fix invalidated-history filtering and enforce the prompt budget, connect the conversational goal and current exchange to the default performer, and remove the repeated attention delay during engagement. Evaluate conversational continuity and pacing together before expanding the life feature set further.
