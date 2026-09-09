# Photo and social continuity overhaul

## Photo pipeline

Each new chat photo records its capture-time place, outfit, garment IDs, room, conditions, personality and photo direction. Generation is serialized per character so a follow-up can reference the completed previous photo. Duplicate pending jobs cannot submit the same photo twice.

Within the configurable continuity window (default 90 minutes), a completed photo from the same place, room, outfit and day/night context becomes an additional reference. Its exact garment construction, room and photographic treatment take precedence over conflicting follow-up scene suggestions. A real outfit or location change starts a new sequence. Historical starter images retain their historical handling. Older chat photos without capture metadata are not guessed into a sequence.

Reference priority is identity, previous photo, matching room, then closet items. Existing provider adapters receive this common reference list. Models still differ in how faithfully they reproduce garments and rooms; offline checks verify inputs and persistence, not generated visual fidelity.

In **Active Life → place references**, assign bedroom/bathroom/etc., aliases and the containing recurring place. Upload or generate an actual reference image: geotags alone do not provide one. A specific room match takes priority over a generic home image. Removing a reference preserves the place and routing data, prevents legacy migration from restoring it, and invalidates pending upload/generation on that control.

In **Images → Photo Style**, personal photo direction adds authored expression, posture, framing and photographic habits. The character's personality also reaches the photo prompt. The continuity window is configurable, including zero to disable chaining.

## Interaction and supporting people

The composer’s gift button opens a centered dialog with item preview, delivery method, simulated value, upload and permission status. Cash has a separate mode without irrelevant item fields. Existing acceptance and delivery rules remain authoritative; these are simulated transfers.

**Active Life → Supporting-person LLM activity** optionally generates small batches using the configured VH text provider and optional model override. It is disabled by default. Calls occur at a configurable interval while Horde is open and agency runs. Only authored supporting people and public posts are supplied, not private player conversations. Validated message/comment proposals queue for later delivery, subject to availability and travel. Comments preserve their actual author and are delivered once. This does not add a separate always-on background LLM planner.

**Communication setting → who starts** supports a character-first scenario and delay. Connection/privacy gates, availability and initiative settings still apply. Browser and background host recognize the empty-thread opening, consume it once after a visible reply and do not invent an earlier user message.

## Verification

Offline engine, focused photo/planner, browser, host and bridge regression checks use synthetic profiles and mocked provider responses. No paid generation or real conversation-quality evaluation was performed. Reload the webpage for frontend changes; restart the launcher/bridge to load host changes.

## Gift and reference UI refinement

The gift dialog now uses Gift / Digital / Send money tabs, a selectable image catalogue, an upload empty state, recipient permissions, available balance and recent delivery status. Money mode hides item selection and upload. The form is responsive for narrow screens. Connected-life settings now have distinct expandable section cards.

Reference cards display the saved location name rather than another editable name. Removing a card hides it across reloads without deleting the recurring location, routes or room metadata. The location selector can relink that same saved ID; it no longer creates unrelated blank locations. Add and rename actual places through the recurring-place editor. The base identity image remains included alongside the previous photo and room reference; a regression explicitly checks all three together.
