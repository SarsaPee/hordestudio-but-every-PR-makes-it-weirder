# Conversational motives connected to life actions

## Implemented

The shared conversation engine derives possible motives from perceived input and existing simulation state: answering the latest perceived message, conserving low energy, unmet social need, current work, due pending promises, cooldown/private availability, and an unexpired impression of engagement. Every candidate carries its source. No unseen event, emotion, or personal secret is fabricated to populate the list.

Full, compact and performance prompts receive a private decision brief. The configured model chooses what matters in the actual exchange using authored personality. Motives are possibilities rather than a fixed rotation. Expression guidance asks the model to communicate the purpose without narrating state. This remains within the existing provider call; no separate continuously running agent was added.

An optional `conversation.choice` receipt identifies a listed motive, a short exact quote from the latest perceived user message, and `none` or `make_time`. The engine validates the source and motive. `make_time` is only eligible during an actual active, interruptible solo activity, with sufficient energy, outside sleep, private availability and cooldown. It uses the existing activity reservation kernel, preserving completed progress and recording a pause event. The reservation length varies with message length within the kernel's 15–120 second limit. This is a simulation heuristic, not a model of human reading speed.

Up to 12 validated choice receipts persist in conversation state. Recent receipts enter later context as remembered actions. Replaying the same message cannot execute its choice again while its receipt is retained; foreground/observer and host transactions additionally retain their existing ownership/revision protections. Actions do not directly reward relationship meters or satisfy promises. Existing commitment and activity planners remain responsible for future preparation and completion.

The implementation is connected to the foreground commit, state observer and shared Node background worker. It preserves the separation between possible motives, chosen conversational behavior, actual action receipts and completed life events.

## Verification

Offline checks cover different motive contexts for the same input, actual task pausing, preserved progress, promise non-completion, JSON save/reload, duplicate prevention, and refusal during sleep, private time, protected schedules, cooldown, unread input and fabricated evidence. Prompt wiring is checked for full/compact and foreground/observer paths. Host transaction checks continue to pass.

## Scope and limits

This adds grounded choice and a concrete action consequence; it does not establish human-level emergence. Candidate eligibility uses deterministic heuristics and existing state. Personality-sensitive selection and phrasing still depend on the configured model. No extra model call evaluates intent, and semantic agreement between the visible response and the optional receipt is instructed rather than independently proven. The engine can reject an infeasible choice without rewriting the already generated reply.

The newly executable choice is a short pause of solo work. Other consequences continue through existing promises, goals, reactions and conversation state. Learned personality parameters, autonomous multi-person dialogue, long-range motive planning and quantitative naturalness evaluation are not added by this change.

Reload the app and reopen the local launcher for the background worker to use the new module. No paid model tests were run.
