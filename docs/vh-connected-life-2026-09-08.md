# Connected VH life systems — September 8, 2026

This implementation adds the first functioning version of each system in the agreed roadmap. It is a bounded simulation with explicit configuration and causal event records, not a claim of human-level autonomy or validated image fidelity.

## Where to use it

- **Active Life → Connected life systems:** transport, gift permissions, item wardrobe, supporting routines and app framing. Controls save on change.
- **Active Life → Edit active life → Recurring places:** directional routes, transport mode and simulated cost. Multiple transport alternatives can connect the same places.
- **Active Life → Recurring place references:** upload/generate room references. Existing legacy references migrate to recurring places without discarding their images. Legacy overflow is retained for recovery.
- **Chat → Life & gifts:** simulated cash, mailed items, digital gifts, and gift-photo uploads. Dating/private profile modes show a connection request instead until accepted.
- **Chat style → Personal vocabulary & cadence:** vocabulary, fillers, punctuation, capitalization, emoji, affection/conflict style and phone-check multiplier. Existing voice examples and reply-length controls remain.

Defaults preserve existing behavior: presets remain the wardrobe default; persistent journeys and gift offers are opt-in; direct messaging remains open. No real payments or shipping are connected. openrouteservice has not been added.

## Shared engine and state

`vh-world-engine.js` is a pure shared module used by the browser and Node host through the simulation core. Author configuration and visual assets belong to `lifeProfile.world` / `lifeProfile.places`. Per-timeline connection decisions, gifts, wallet balances, inventory ownership, outfits, laundry, journeys, events and supporting-person state belong to `lifeRuntime.world`.

The engine emits durable events consumed by the existing continuity/life-event path and included in conversational context. It does not make text or image model calls. A conversation can grant/withdraw mail or cash permission through an evidence-grounded tool field; quoting an old/unread message cannot grant permission. Authored initial permissions are overridden by an explicit runtime permission decision.

### Gifts and economy

Gift offers require enabled gifting, connection access, applicable permission, trust and value limits. Disliked item tags can cause rejection. Accepted gifts debit the simulated player wallet; arrival adds cash to the character wallet or an asset ID to inventory. Mailed delivery is delayed; digital/cash delivery resolves on the next simulation step. Gift receipt is idempotent and can modestly reduce stress when it matches an authored preference. It never mechanically buys affection, permission or obligation.

Catalogue item photos are separate from inventory ownership: a pending or rejected gift cannot be worn. A gift can be classified and tagged in the closet editor. Limits: 150 catalogue assets, 100 gift records; attempts past capacity are rejected rather than silently discarding history.

### Closet

Preset and item modes coexist. Items have categories, multiple context/style tags, warmth, incompatible item IDs and reference photos. Selection checks ownership, cleanliness and a complete dress or top/bottom outfit, then scores context, personal preferences, weather and stress-related comfort. Layering and garment references are attached to the resulting outfit. An upcoming scheduled destination influences dressing before leaving home.

Removed garments become dirty; unchanged pieces stay worn. Laundry starts at home during available time once configured dirty time is reached, then restores items when the load finishes. Try-on previews are explicit user actions and require availability, ownership and a complete outfit. Providers must support the number of reference images; unsupported multi-reference requests fail rather than dropping clothing/place images.

Local vision tagging is optional and uses a user-named vision model on a localhost OpenAI-compatible server. It does not download a model or use a cloud fallback. Its structured suggestions are editable. Actual image/vision quality remains provider/model dependent.

### Journeys

Persistent trips retain origin, destination, mode, cost, departure, arrival and target commitment. Route selection respects car/bicycle/transit/rideshare access and wallet affordability. Journeys survive reload and crossing midnight. Delays postpone arrival; studio interruption adds a pause. Driving/cycling close texting availability; other travel stays busy. Arrival costs energy and lateness adds configurable stress. Missing an affordable route records a missed commitment and retains the actual place.

Optional Google routing is off by default. When enabled, one fresh route request at departure updates the current journey in browser or background mode; failures retain the authored estimate and record that fallback. Stale journey/timeline responses are rejected. Raw routes and reusable Google response caches are not retained. This is not continuous GPS navigation, detailed transit legs or a full urban traffic simulation. Cancellation/rerouting midway is not exposed yet; pausing is supported.

### Supporting lives and app framing

Supporting people have authored place/time windows with procedural fatigue, recovery and stress. Overlap with the main character produces a deduplicated encounter and updates contact timing. No conversations, dramatic incidents or private secrets are fabricated. These are lightweight simulated lives, not independent language-model agents with careers and household economies.

Dating/private-social modes require an accepted connection request. Review timing varies around an authored duration, and the authored openness setting controls acceptance. Foreground messages, calls and background replies respect the gate; private feeds remain hidden. This is a configurable relationship entry flow, not a clone of a commercial social platform.

### Texting

Stable voice controls join existing examples and dynamic context. Cadence scales phone-check timing inside the existing attention system; it does not introduce a second independent reply timer. Simulation events supply grounded topics and motives, not a quota to narrate every state change.

## Verification

Offline engine tests cover permission/revocation, delayed/digital/cash gifts, duplicate prevention, ownership, outfit compatibility, laundry, transit access, interruption, lateness, live-route identity and idempotency, encounters, two-day replay with per-minute reload, reference migration and media-free host snapshots. Browser scenarios exercise the actual controls and persistence. Host tests cover the same route application and closed-profile gates with mocked provider I/O.

No paid generation, live Google requests or local vision inference were used for verification. Real provider visual fidelity and conversational naturalness still require opt-in qualitative evaluation with the user's chosen models.

Final checks: 38/38 engine suites, 19 browser scenarios, 6 host transaction checks, 5 Maps adapter checks and 37 bridge checks passed offline. The new browser scenario includes garment upload, mocked local vision tagging and protection against stale schedule drafts overwriting newer assets/settings.

## OpenRouter garment vision option

Closet & inventory now has a Vision provider selector (Local / OpenRouter). Model IDs are saved separately per provider in the VH's configuration. OpenRouter uses the existing key from Settings and a fixed OpenRouter endpoint; the local key is never forwarded there. Local mode still requires a loopback endpoint and never falls back to the cloud.

Choose OpenRouter, click Load OpenRouter vision models, then type in Vision model to choose an image-input/text-output model, or enter its ID manually. Suggest garment tags sends only that uploaded item image and the classification instruction. Remote requests may use provider credits. Invalid or truncated output leaves the item unchanged; suggested tags remain editable. The image-generation provider is independent.

Verified with synthetic request/response and browser tests: model filtering, separate saved model choices, correct key selection, image forwarding and persistence. No live provider inference was used.
