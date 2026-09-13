# VH photo prompts and starter image import

## Findings and fixes

1. The prompt always preferred the written appearance over an attached identity reference. It now uses the reference as the identity source and omits the authored face/body description when that image is present. Without an identity reference, it retains the written appearance.
2. Age was omitted. The configured adult age is now explicit. Missing age stays unspecified rather than being invented.
3. The header described a virtual human sending an image. It now describes a personal photograph. Camera reasoning/debug prose is removed, wardrobe IDs are expanded into authored clothing items, and the scene-writing tool asks for transient scene details rather than repeated identity traits.
4. Starter photos were forced through present-day continuity. Historical starter photos now use the authored scene for clothing, place and lighting rather than today's schedule/weather.
5. The social photo resolver checked ownership only in `socialPosts`. Starter posts belong to `startingSocialPosts`, so completed images were discarded and pending flags never cleared. Ownership now uses the correct collection, with stale/deleted-post protection preserved. Each successful image is saved; failures are shown on the affected starter card. The batch reports its imported count and handles thrown persistence errors instead of leaving the progress text unchanged.

## Saved place references

Photos & Voice now contains Saved place references. Up to 12 named places can each have a description and uploaded or generated image. Generation produces an empty-place reference with no identity image attached. References are saved with the profile and included in portable media export.

A scene containing exactly one saved place name automatically selects that place image. Case and punctuation are normalized; multiple matches select none. This is explicit name matching, not inferred knowledge of every room in a house. Use distinct names such as Bedroom, Bathroom, and Home exterior.

The place image follows the identity image in a supported multi-reference request. The prompt distinguishes identity from architecture/furniture. MCP array-reference routes, OpenRouter reference arrays and NanoGPT's multi-image route can carry both. Single-reference routes and unsupported local workflows produce an explicit error rather than dropping a reference. Visual consistency remains dependent on the selected image model.

## Verification

33/33 engine suites and 17 browser scenarios passed. Tests cover reference-aware identity and age, readable wardrobe descriptions, historical continuity, place matching, all seven starter-photo imports, error completion and real IndexedDB reload. Room-reference generation was mocked and its persisted result verified. No live generation, user-save edit, or recovery of previously orphaned provider images was performed.

Reload the app for these frontend changes. The earlier Magnific bridge update must already be running for its reference-upload and result-polling flow.
