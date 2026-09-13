# VH procedural day and attention: first milestone

## Implemented

The existing Life Architect now has a structured activity-options contract. It can author reusable local tasks, leisure, recovery, meals and remote contacts. The shared procedural kernel assembles a bounded daily set and executes it without a provider call on each tick. No additional continuously running LLM life agent was introduced.

A daily opportunity has a stable identity, weekday/time window, importance, minimum energy, resource prerequisites, motivation and (for contact) an existing supporting-person reference. The planner selects up to three opportunities per day, with bounded seed-based variation in ranking and duration. Those choices and durations persist rather than rerolling each tick or reload.

Activities compete with needs and preparation for pending chat promises. Deadline urgency, hunger, low energy, social need and inertia influence execution. Fixed unavailable routines interrupt them. Progress and paid resource costs survive interruptions. Missing resources or unknown participant availability block work; closed opportunity windows can be missed. Plans are not completion evidence.

New or rescheduled pending promises can change the day's priorities. Preparation finishing does not mark the original promise fulfilled. Cancellation abandons pending preparation. Editing or removing an opportunity invalidates its unfinished old plan while preserving its history; new definitions can be planned without replaying unchanged completed work.

Supporting people can have authored contact-availability windows. Remote-contact goals require those windows and respect contact-frequency spacing. An executed contact records one interaction and reduces unmet social need. For people managed by these executable contact options, the older timed-contact generator is skipped to prevent a competing second source of events. No dialogue, agreement, travel or specific emotional outcome is invented for that contact.

Existing initialized lives without an authored opportunity library get modest local focus/leisure possibilities. Planner initialization starts from the current observed time; it does not fabricate a new planner history before installation. Richer personalized options can be edited locally or authored by the Life Architect on a future user-initiated generation.

## Attention and chat

Attention already tracked notification/read states, capacity, relationship pressure, busy periods and recent engagement. It now also accepts optional engagement grounded in a prior read-message quote through the conversation reaction receipt. This interest fades over fifteen minutes and remains separate from affection, agreement and permission.

Recent engagement or sufficiently strong grounded interest can make room for a reply during a solo activity. The activity is paused and retains its progress. A bounded attention reservation varies with message length, media and interest; the same inbox batch cannot repeatedly extend it. The executor does not advance the activity during that reservation. Sleep, unavailable routines and conflict cooldowns remain constraints. The mechanism does not semantically interpret unread messages or remove provider latency.

Foreground chat and the local host run the same attention/activity modules. Activity state and its remaining time enter the conversation context; preparation remains distinct from the actual promised action.

## Controls

Open **VH Studio → Active Life → Edit active life**:

- **Daily opportunities:** add/edit activity type, label, time window, weekdays, importance, minimum energy, reason and contact participant.
- **Contact availability:** add/edit/remove windows for supporting people.

The existing **Activities & goals** simulation panel shows selected goals, progress and blocking/interruption reasons; it now also allows a manual leisure goal. The Life Architect prompt exposes the richer authoring contract. Manual editing and procedural execution require no model calls.

## Offline verification

- `node scripts/check-engine.js`: 30 engine suites, including the new procedural-day audit.
- A twelve-hour production-kernel scenario compares an ordinary day with one changed by a chat promise, verifies missing supplies and NPC availability, and repeats with reload every seventeen simulated minutes.
- Additional checks cover cancelled/rescheduled promises, changed opportunity definitions, interest-driven reply reservations, sleep/cooldown constraints and browser/host execution parity.
- `scratch/browser_engine_smoke_audit.js`: 13 browser scenarios; real controls create an opportunity and a supporting-person availability window, save and reload successfully.
- Both Python host audits pass using the real shared worker and mocked generation. No paid provider calls or personal save modifications were made.
- JavaScript syntax and git whitespace checks pass.

## Scope and remaining work

This is the first procedural-day milestone, not a complete emergent society. Activity recipes remain bounded and authored; supporting people have availability and contact history rather than complete independent planning agents. Travel routes, detailed money simulation, arbitrary generated action graphs, learning preferences from outcomes and richer negotiated group plans remain future work. Ordinary meal supplies remain the pre-existing abstraction; explicit option costs are respected, but this pass did not create a full inventory-management UI.

Actual language quality and live Life Architect generation were not evaluated because the user requested offline checks only. A model may omit the optional engagement receipt; the existing attention rules remain the fallback.

Restart the local launcher and reload the app to load the updated shared modules and prompt contract.
