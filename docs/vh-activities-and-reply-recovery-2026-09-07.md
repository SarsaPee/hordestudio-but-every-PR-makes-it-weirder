# VH activities and reply recovery

## Repaired regressions

The attention policy previously required a due promise before interrupting any busy activity. Consecutive broad busy routines could therefore postpone ordinary conversation indefinitely. Busy periods now permit contextual phone breaks after sustained waiting, with the threshold influenced by available capacity and company. Sleep, private activities, and explicit conflict boundaries remain distinct. When capacity is limited, a brief response can be considered instead of requiring enough energy for a long one. Existing deferred messages are reevaluated through the same path; they do not need to be resent.

The meter fill used an undefined CSS `--accent` variable. Explicit colours now provide visible fills. Signed relationship values show magnitude, with a different colour for negative values; zero is empty rather than half full. Meter accessibility attributes carry the actual value and range.

The default separated dialogue prompt now receives recorded attention reasons and unfinished executable goals. Previously attention history was present only in the alternate full prompt.

## Executable activities

`vh-activity-engine.js` is a standalone deterministic module with no DOM, provider, or implicit wall-clock dependency. It is loaded by the browser, exercised directly in Node, and included in both launcher static routes and portable packaging.

The VH simulation overlay now has an **Activities** tab. It supports:

- Recovery: twenty minutes of rest, followed by an energy increase and stress reduction.
- Meal preparation: obtain ingredients, consume those ingredients while cooking, then consume the prepared meal. Each step takes time; resources and effects are applied once.
- Focus: spend thirty minutes on a named personal task. This records time spent, not guaranteed success at an arbitrary real-world objective.

Goals retain priority, creation time, optional deadline, current step, elapsed work, resource charges, state, and reason. They can be planned, active, paused, blocked, completed, or abandoned. Priority, aging, deadlines, and low-energy recovery needs influence selection. A goal cannot consume time before it exists. Missing resources block work rather than appearing magically. Interruptions retain progress and do not charge the same inputs twice.

The app advances work in fixed one-minute intervals under historical authored/temporary availability constraints, with a 72-hour catch-up bound. Sleep, private activities, and busy obligations pause personal goals. An active personal activity contributes to current situation and therefore attention. Initialized lives can propose a recovery goal when energy is very low; other current templates are added through the Activities UI.

Step outcomes affect energy, stress, and abstract supplies. Completion creates one life event and one remembered episode. Dialogue sees unfinished goals and committed outcomes separately. Timeline normalization, snapshots, and IndexedDB persistence preserve progress and resources.

## Verification

- All 26 headless suites passed, including activity prerequisites, interruption/reload, resource idempotency, priority, abandonment, and time-partition equivalence.
- The isolated browser suite passed the existing stalled-inbox case through the real agency loop to one mocked reply request. No live model provider was called.
- Browser checks verified positive meter fill, zero fill, and real rendered colour; the resulting screenshot was inspected.
- The Activities UI was exercised end to end: add goal, progress, interruption, real save/reload, resumption, energy consequence, and a single committed memory.
- Launcher Python syntax, the new static asset route, portable inclusion, shell syntax, and whitespace checks passed.

Run `node scripts/check-engine.js` and, with Playwright/Chromium installed, `node scratch/browser_engine_smoke_audit.js`.

## Boundaries

This is an initial executable activity system. Meal shopping abstracts time and effort; cash, detailed inventory, physical routes, and encounters are not yet modeled. Focus completion means the allocated work period finished. The system does not infer successful completion of any arbitrary task from prose.

The Python always-on helper still does not execute the browser attention/activity kernel. Pending attention-managed replies and activity advancement resume in the open application. The browser-independent module creates a reusable boundary, but sharing execution with that helper remains separate work.

There is no new autonomous model-driven goal authoring in this pass. Semantic message appraisal, richer goal decomposition, remembered-event-based decision-making, and broader behavior calibration remain outstanding.

Restart the launcher and reload the app to pick up its new asset route and updated scripts. Existing saved conversations and pending messages are retained; no reset is required.
