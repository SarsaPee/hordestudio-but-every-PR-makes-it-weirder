# Engine integrity implementation

Date: 6 September 2026. Follow-up to [the critical audit](critical-engine-audit-2026-09-06.md). This records repairs to the existing engine, not a claim that the proposed overhaul is complete or that the product is ready to ship.

## Implemented behavior

### Persistence and ownership

- Canonical IndexedDB writes check a stored revision inside the same transaction as their updates. A stale tab aborts its entire write instead of overwriting the newer save. Same-tab queued writes remain valid. Immutable media assets and caches remain independent.
- Values are cloned when the write is queued. Uncloneable payloads abort atomically. Settings mirrors update after a successful write; a stale tab cannot overwrite the mirror as a fallback.
- A tab with a detected conflict stops autonomous VH processing. Its unsaved in-memory work remains available for Full Backup export; reload is required to use the newer saved state. Automatic merging is deliberately absent.
- VH inbox batches remain durably pending during response generation. Stable reply job IDs connect retries to the same response group. Successful completion consumes the batch; failed generation retains the whole batch for retry.
- Reply results must still belong to the captured companion, timeline, and message collection. Timeline changes are guarded while replies are in flight; stale results fail before committing to another timeline. Agency locks release even when the initial durable save fails.

### Time, travel, and presence

- A session clock retains accumulated absolute time when an author edits the starting time or turn duration. The new turn duration applies to subsequent turns. Legacy saves initialize the clock from their existing derived time.
- Routing minimizes authored travel minutes, then hops. Parallel exits use the cheapest edge for computed routes. Clicking a particular exit executes that exact edge and its duration.
- Pending checks block movement at the shared movement entry point and in the real exit handler. Map edge direction reflects the absence of a reverse connection.
- NPC schedule and background movement use persisted journeys with an origin, destination, route, departure time, and arrival time. Actors are explicitly in transit until due, survive reload, and appear as travelling in dossiers and scene context.
- Disconnected routes cannot teleport actors. Existing journeys advance even with schedules disabled. Explicit placement or inactive status interrupts travel; geography edits migrate references or interrupt travel with a valid fallback location where one exists.
- Population no longer steals already located or travelling named actors to fill scenes. Omission from a narrator's cast list cannot make an NPC disappear. Departure regex remains diagnostic and no longer supplies movement authority.
- Background movement cannot self-authorize teleportation. Canonical receipts reject premature arrivals and newly completed journeys without sufficient represented elapsed time. Rejected background actions restore their snapshot rather than publishing developments as completed facts.

### VH life integration

- Offline human dynamics advance in five-minute intervals using the activity at the start of each interval, rather than applying the final activity across the entire absence.
- Existing bounded catch-up remains: this is not a complete reconstruction of arbitrarily long activity history or a new attention/decision system.

## Verification

Run the syntax check and 24 headless suites with:

```sh
node scripts/check-engine.js
```

The gate includes existing simulation/stress suites and focused counterexamples for movement, clocks, presence, asynchronous reply ownership, retry behavior, and persistence. Some older suites inspect source patterns; passing them is not equivalent to browser coverage.

Two additional isolated browser suites execute real IndexedDB transactions and the actual application:

```sh
node scratch/browser_storage_transaction_audit.js
node scratch/browser_engine_smoke_audit.js
```

They require Playwright and Chromium. Optional environment variables `HORDE_PLAYWRIGHT_MODULE` and `HORDE_BROWSER_EXECUTABLE` select a local installation. The browser contexts use synthetic origins, synthetic saves, and blocked external traffic. They do not open the user's browser profile or call live model providers.

Coverage includes cross-tab write races, stale-tab protection, same-tab writes, cloning-failure rollback, application startup, pending-check exits, journey display, save/reload, directed map rendering, and background/canonical movement validation. Both browser suites passed locally against installed Chrome. GitHub workflow gates were added to release/package workflows; remote CI has not been executed as part of this work.

## Remaining overhaul

1. **One executable action contract.** Extract state transitions from the monolithic application into engine modules. Route all foreground, schedule, population, background, and media completions through validated commands and observable committed events. Current changes close specific bypasses; they do not establish complete ownership everywhere.
2. **Travel simulation.** Journeys retain a route and final arrival, but do not yet execute encounters, interruption rules, or triggers at each intermediate leg. Legacy untimed edges remain immediate. Implicit parent/child traversal is retained for compatibility and needs an explicit migration policy.
3. **Causal life simulation.** Goals need executable actions with prerequisites, resource costs, consequences, interruption, and social feedback. VH needs attention and response decisions driven by activity, relationship, urgency, and competing goals; fixed delays and cooldowns remain elsewhere. Adding timing randomness alone would not solve this.
4. **Parsing boundaries.** Remove remaining prose-based state interpretation through a versioned, validated event schema. Keep display text and authoritative events separate throughout. The departure fix is a targeted removal, not a complete parser replacement.
5. **Map and movement presentation.** Direction and travel costs now agree better, but stable layouts, spatial constraints, moving actor markers, route previews, and intermediate travel feedback still need design and implementation.
6. **Persistence architecture.** Move from global snapshots to scoped records/checkpoints and explicit recovery. Conflict detection prevents silent overwrite but does not merge concurrent work or provide a persistent conflict recovery screen. Test imports, large media, long sessions, and failures across additional asynchronous jobs.
7. **Shipping evidence.** Exercise real provider behavior, longer interactive sessions, migrations from representative backups, and broader browser/device coverage. The local synthetic checks establish specific invariants, not overall product readiness.
