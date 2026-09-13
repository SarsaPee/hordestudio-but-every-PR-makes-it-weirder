# VH social agency audit and fixes — September 8, 2026

## Findings and changes

1. **Conflicting generation instructions.** Autonomous social posting used the full conversation system prompt (including required chat receipts) while exposing only the social-post tool. Replaced it with a focused social-only prompt, grounded current context, authored social controls and recent post texts. Final requests now include tool/output budgeting.
2. **Optional gate could suppress valid posting windows.** Missing `shouldPost` or weak confidence was treated as a veto. Only an explicit, confident negative gate result now defers posting. Optional gate failures fall back to the existing eligible posting window. Explicit Create a post now bypasses this optional advice.
3. **Photo requests silently downgraded to text.** A missing image description could produce a status instead. It now produces an actionable error and no replacement status. A photo with a valid image description does not require a caption.
4. **Gallery hid failed and pending photos.** Gallery now includes photo posts awaiting generation or carrying errors. Failed images have a Retry photo control in Gallery and Feed. Gallery also exposes the autonomous posting controls. Retry uses the existing deduplicated image-generation path.
5. **Missing ownership checks.** Social generation results are rejected when their owning timeline/state has been replaced. Detached image results cannot update another timeline's photo usage or visible post.
6. **Availability and cadence were checked too late or not at all.** Sleep/private-time and minimum-gap deferrals now happen before text generation, with a concrete next eligible time. The scheduler retains that retry time. Changing cadence anchors the repaired schedule to existing post history rather than always postponing it from the settings change.
7. **Paused agency looked like an overdue feed.** Posting controls now explicitly report global agency pause.

## Cadence and remaining limits

The existing frequency targets remain: daily is approximately 24 hours; active is approximately 10 hours, both with variation. Minimum gaps are 12 and 4 hours respectively. Photo share chooses a format; it does not guarantee successful image generation or a perfectly even sequence. Provider configuration, errors, activity constraints and confident gate deferrals can reduce observed posting frequency.

The closed-app Python worker currently creates text statuses only. It does not run the browser photo-generation pipeline. This pass did not implement background photo generation or inspect the user's actual provider logs/settings. Therefore these are confirmed code-path defects and limitations, not proof of which one caused every symptom in a particular saved VH.

Photos still depend on allowed photo settings and the configured image provider. No real social network was accessed or posted to; these changes concern the application's simulated social feed.

## Verification

- 31/31 engine suites passed, including the new `scratch/vh_social_agency_audit.js`.
- Social-specific tests cover optional gate behavior, focused request construction, missing scene rejection, captionless photos, cadence/availability deferral, explicit posting, obsolete timelines and detached photo results.
- 14/14 isolated browser scenarios passed. The new Gallery case displays an image-generation failure, clicks Retry and verifies a displayed image using mocked generation.
- JavaScript syntax and git whitespace checks passed.
- All checks were offline; no provider credits or personal saves were used.

## Next milestone

Make social sharing follow executed life events: retain eligible moments, choose whether and when to share them, and keep a durable publication job with distinct draft/image/published/failed stages. Extend that same job pipeline to the local worker for background photos. This would connect social output to the procedural life more directly than simply increasing posting frequency.

Reload the app to activate this browser-side patch. No Python host code was changed in this pass.
