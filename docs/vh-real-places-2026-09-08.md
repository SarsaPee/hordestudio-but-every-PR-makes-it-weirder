# Real places and travel — September 8, 2026

For current provider setup, including the free-key alternative, see [openrouteservice integration](vh-openrouteservice-2026-09-08.md). The material below documents the original Google-only slice.

The initial spatial slice below has been extended by [Connected life systems](vh-connected-life-2026-09-08.md): persistent journeys, optional departure-time Google routing, transport resources, and place reference migration.

Active Life → Edit active life → Recurring places now supports explicit Google Places search, selected Place IDs, route previews and authored directional travel legs. Save life changes persists selections and legs. Google result names/addresses and route previews are transient; authored names and simulation durations remain separate. Existing profiles default to no legs.

## Configuration

Open Settings → Connections → Maps & places and save a Google Maps API key. Enable Places API (New) and Routes API in that Google project. Reopen the updated launcher once to load the settings endpoint; subsequent key saves take effect immediately. The key is stored in the launcher’s owner-only credential file, not character exports or browser settings. `GOOGLE_MAPS_API_KEY` in `.env` or the launcher environment remains a fallback. Removing a saved key does not remove that fallback. Check setup reads local configuration only and does not verify billing or call Google. Requests occur only on Search/Preview clicks. No live or paid API calls were used for verification.

Search uses POST places:searchText with five results and an explicit field mask. Routing uses POST directions/v2:computeRoutes with origin/destination Place IDs and WALK, DRIVE, BICYCLE or TRANSIT. Fixed upstream URLs, bounded inputs and loopback-only bridge endpoints prevent arbitrary URL proxying. Missing keys, rejected requests and missing routes produce visible errors.

Official contracts:
- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/routes/compute_route_directions
- https://developers.google.com/maps/documentation/places/web-service/policies

## Simulation scope

An explicit leg reserves time between adjacent, non-overlapping same-day schedule blocks. Departure is the later of the previous commitment's end and the time needed to reach the next commitment. During the journey, the shared kernel exposes busy availability, origin/destination context, arrival time and late minutes, with no invented companions. Browser and host share that kernel. Duration is authored, not automatically copied from Google. Directed legs do not imply symmetric return travel.

This is the first spatial slice, not the complete spatial world described in planning. It does not yet implement automatic live route refresh, GPS movement, transport ownership/cost, cross-midnight journeys, arbitrary trip interruption, cascading missed commitments, persistent lateness penalties, or relocation of photo references. Those require a durable journey lifecycle rather than extending schedule lookup further. Google coordinates and geometry are not persisted; provider Place IDs identify actual geography for route requests.

## Verification

- Spatial kernel: directional legs, no premature arrival, lateness, arrival boundary, reload determinism, invalid IDs, old-profile defaults.
- Maps adapter: synthetic search/route responses, missing-key behavior, invalid endpoints and upstream rejection.
- Browser: search selection, route preview, authored leg and Place ID survive save/reload.

Results: 37/37 engine suites, 17 browser scenarios, 4 Maps adapter checks, 37 existing bridge checks, and 4 host transaction checks passed offline. A focused spatial follow-up also verifies that a delayed journey cannot overlap the next journey.
