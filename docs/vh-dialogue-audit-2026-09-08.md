# VH dialogue: repetitive banter audit

## What the supplied examples show

Both examples express interest and then retreat into a polished, defensive line. They discuss flirting as rules, data and a slippery slope, rather than answer the partner plainly. This is a pattern in the two supplied samples, not evidence that every turn or every configured model behaves identically.

## Code findings

- Missing expression settings normalize to guarded. The previous prompt described selective disclosure but did not distinguish that from sarcasm or coyness. Existing authored expression settings should not be silently changed.
- The performance prompt required ordinary replies to be brief and longer replies to be earned, even when an author selected expressive replies.
- Personality, vulnerabilities, relationship constraints, private simulation metrics and state-reporting instructions compete with conversation in the model context. They can encourage explanation of the relationship instead of participation in it. This is a plausible mechanism, not a measured causal result.
- Recent history is included, but there was no cross-turn repetition signal. Generic phrases can become demonstrations of the character's supposed voice simply by recurring.
- Full, compact and background paths need the same conversation behavior; changing one prompt leaves other routes inconsistent.

## Implemented approach

Treat the reply as an action within the exchange: answering, accepting, declining, disclosing, disagreeing, repairing, or asking something the person actually wants to know. The model chooses from the meaning of the exchange; the engine does not rotate through scripted moves.

Shared guidance now asks for substance before ornament. Plain answers and sincere warmth may stand without a defensive flourish. Selective disclosure does not require mockery or retraction. Authored humor, boundaries and disagreement remain possible. Specificity must come from established facts rather than invented anecdotes or artificial typing mistakes. The configured reply length is respected.

A pure conversation utility tracks repeated 4–8-word fragments across the last 12 eligible companion response turns. Bubbles within a response are grouped. User messages, invalidated content, pending messages and future messages are excluded. Repeated fragments are labeled as quoted history, not commands or a forbidden-word list. The prompt encourages fresh wording where fragments are stock flourishes, while preserving necessary facts, names and callbacks. There are no hardcoded forbidden phrases.

The same guidance is included in performance, full, compact and closed-browser message generation. A persisted advisory `turnAudit.dialogueQuality` records repeated fragments in a new visible reply. It does not censor, rewrite or retry that reply. No extra provider calls were added.

## Verification and limits

Offline contracts check phrase counting, multi-bubble grouping, exclusions, non-mutation, diagnostics and prompt-path coverage. Existing engine and host transaction checks cover integration. These checks do not measure naturalness, semantic repetition, emotional appropriateness or persona distinctness.

The repetition detector is lexical. It will not recognize every paraphrase of the same defensive joke. Conversational-act interpretation is still performed by the configured model, not a separately validated semantic classifier. Models can ignore guidance, and a very restrictive authored persona can still produce restrictive dialogue. Existing messages are kept intact.

## Next evaluation step

Use a small consented transcript set containing ordinary questions, affection, disagreements, logistics, awkward moments and interruptions. Compare blinded old/new replies for answering the actual message, grounded specificity, unnecessary defensive endings, recurrence and distinct character voice. Include a deliberately sarcastic persona to verify that naturalness guidance does not erase personality. This needs actual model outputs; it was not run because verification remains offline.

If those evaluations expose recurring failures, add targeted examples tied to each author's own voice and repair the responsible context path. Avoid a second model that rewrites every reply into a generic casual style or a universal blacklist that hides the underlying problem.
