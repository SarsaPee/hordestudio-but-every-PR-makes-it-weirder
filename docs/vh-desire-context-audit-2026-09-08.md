# Desire context audit

The existing engine separates baseline desire, momentary arousal, attraction, restraint and cooldown. Energy and stress affect the baseline target; transient activation decays. Trust does not generate desire. Existing tests cover those distinctions and disabled settings.

This pass fixes two contextual errors:
- Location names and broad words such as partner/date no longer establish an intimate activity. Privacy uses the saved home/room metadata and actual availability. Busy, sleeping and travelling states cannot become private opportunities from their names.
- The initiative flag now checks bandwidth, company, travel and emotional cooldown as well as its existing internal-state conditions. Desire can remain present without being acted upon.

The prompt describes these values as private feelings rather than consent, attachment or an instruction to escalate. No existing relationship scores or user conversations were reset.

Verification: 41 engine suites and 213 companion checks passed offline. New regressions cover misleading location names, sleep, work and travel. No live conversational evaluation was performed.

Remaining limitations: activity interpretation still uses a narrow text heuristic; daily spontaneous fluctuations remain seeded procedural approximations. The model still interprets visible tone and willingness, so these changes are consistency fixes, not a claim of human-equivalent physiology or guaranteed natural replies.
