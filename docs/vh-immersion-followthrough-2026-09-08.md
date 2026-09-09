# Connected life and chat identity follow-through

## Implemented behavior

- Disrupted journeys and unreachable appointments create bounded recovery records. When free, the character chooses recovery or a planning activity through the existing executable activity engine. The next authored opportunity at that place is recorded when available. A missed appointment never becomes fulfilled simply because the character made a new plan.
- Transport ranks affordable, accessible routes with configurable habit, cost, fatigue and weather preferences. These preferences influence the existing journey engine, rather than a second movement system.
- Arrivals that end a paused conversation, recovery decisions relevant to that conversation, and received gifts create durable conversational follow-ups. Both foreground and host prompts see these. A structured receipt names the follow-up and quotes the visible reply before marking it addressed. Unaddressed proactive attempts are delayed, and old follow-ups expire. Existing availability, initiative, connection and unanswered-message gates remain in force.
- Physical gifts progress through shipping, delivered, collected and opened/received. Collection and opening require being at home and available; inventory ownership starts after opening. Cash and digital gifts remain immediate transfers. Excessive offers can be declined based on current relationship comfort and configurable pressure sensitivity. No gift creates romantic entitlement.
- Supporting people can have authored continuing tasks and effort targets. Their progress persists, fatigue can cause an actual rest interval, and encounters expose grounded task progress only when the characters meet. Rest also affects contact availability.
- Connection decisions consider current trust, comfort, resentment and stress against the authored minimum comfort and openness setting. Permissions remain explicit.
- Absences longer than the detailed 72-hour window now reconcile overdue promises, completed travel and delivered parcels before resuming detailed simulation. A persistent reconciliation summary distinguishes this interval from actually simulated episodes; no invented encounters, wages or completed tasks are backfilled.

Controls live in VH Studio → Active Life, including Transport, Gift permissions, Supporting people, Communication setting, and Adaptation & follow-through.

## Per-chat profile and memory repair

A saved chat now pins its selected persona. Changing the global profile no longer changes that chat. “No profile for this chat” is also an explicit selection. Unsaved character previews may still use the global profile as their initial default.

The chat header includes **Profile & remembered details for this chat**. Its editable description is stored as a timeline-local override; saving does not modify the shared persona or another VH's chat. Overrides persist separately for each selected persona.

Basic first-person name, origin, residence, occupation and employer statements have a conservative, deterministic memory fallback. Only read, non-invalidated messages qualify. These facts persist by persona and retain message provenance; a later direct correction replaces the earlier value for that field. Ambiguous, conditional, quoted or compound statements are left to the existing semantic observer rather than guessed. Stated facts from that observer are now also included in compact context, where they could previously be omitted. They remain distinct from inferred motives and public profile claims.

Historical user messages and player-model entries receive their prior persona attribution when changing profiles. Basic remembered facts appear in full/compact and background guidance and do not decay daily. This can recover clear statements still in stored history; it cannot reconstruct deleted messages.

## Verification and limits

Offline checks cover physical collection before ownership, grounded follow-up receipts, weather/fatigue transport ranking, executable recovery activities, long-absence reconciliation, supporting-task progress, connection decisions, persona isolation, later fact corrections and quote rejection. Browser checks cover local profile edits without modifying the shared profile, London surviving reload and a day boundary, gift opening, and the existing chat/travel flows. Host checks cover the same fact and follow-up persistence path.

39 engine suites, 19 browser scenarios, 7 host transaction checks and 37 bridge checks passed. No provider credits were used.

This is bounded procedural behavior. Supporting characters are not independent language-model agents; recovery uses authored opportunities rather than inventing meetings or a new city itinerary. Evidence quotes establish provenance but semantic relevance still depends on the conversational model. Real-model naturalness and style remain unverified because verification was explicitly offline-only.
