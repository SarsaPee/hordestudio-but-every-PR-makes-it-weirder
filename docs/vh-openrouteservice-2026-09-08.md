# openrouteservice integration — September 8, 2026

## Setup

1. Reopen the updated Horde launcher and reload the webpage.
2. Create a free API key at https://account.heigit.org/ (usage limits apply).
3. Open Settings → Connections → Maps & places, paste it into the openrouteservice key field and save. Saving selects openrouteservice as the active provider.
4. In Active Life → Edit active life, search for recurring places and select their coordinates, or enter longitude and latitude manually. Existing Google Place IDs alone cannot identify places to openrouteservice.
5. Preview directional travel legs. Enable “Use selected provider at departure” for automatic journey estimates in the browser and background simulation. Otherwise authored travel durations continue to work offline.

Walking, cycling, driving and rideshare estimates are supported. Transit uses authored durations unless Google is explicitly selected. There is no automatic cross-provider fallback. A failed departure lookup retains the authored journey duration and records the failure.

Keys live in the launcher's owner-only credential store, never in browser state or character exports. `OPENROUTESERVICE_API_KEY` is an environment fallback. Removing a saved key does not remove an environment key. Saving settings checks local configuration only; it does not validate the key against the provider.

## Implementation

The bridge uses the current HeiGIT endpoints: `api.heigit.org/pelias/v1/search` and `api.heigit.org/openrouteservice/v2/directions/{profile}/json`, with the API key in the Authorization header. The former `api.openrouteservice.org` host is deprecated. Search results carry attribution and selected coordinates persist as `[longitude, latitude]`. Route geometry is not requested or persisted. Coordinates are validated before requests, and upstream errors do not echo secrets.

Provider selection applies consistently to search, preview and departure-time routing. The shared world engine accepts either coordinate pairs or Google Place IDs, and preserves route attribution in journey events. Unsupported transit and missing credentials fail explicitly.

## Offline verification

- 38 engine suites and 19 browser scenarios passed.
- 11 Maps adapter tests passed, covering authentication, endpoint selection, coordinate order, supported modes, invalid inputs, error redaction and no implicit Google fallback.
- 6 host transaction checks and 37 existing bridge tests passed.
- The focused world audit verifies coordinate-only routing, provider attribution and valid zero coordinates.

Provider responses were mocked. No live API key, quota or real-world route was tested.

Official migration notice: https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912

## Linked travel estimates follow-up

Recurring places now have a transport selector, calculated minutes, an explicit manual override and an Update travel times button. Selecting coordinates or changing transport recalculates home journeys in both directions and links between consecutive same-day scheduled places. Existing non-home routes are also refreshed. Route estimates populate the duration field and saved travel legs, so the shared engine plans departure using the estimate before the trip begins. The route builder automatically recalculates when its origin, destination or mode changes; Save travel leg retains the result. Save life changes persists the draft.

Failed lookups retain the previous duration or fallback and display the error. Responses for superseded locations are discarded. Manual overrides bypass departure-time live routing. Each direction is requested separately, and no whole-city or all-pairs routing is performed. The engine still chooses only affordable transport that the character has access to. For existing mapped profiles, click Update travel times once to replace old estimates.

Offline browser checks cover automatic field updates, changing transport, reverse-route persistence and manual override persistence. A simulation regression verifies a 35-minute provider estimate schedules departure at 08:35 for a 09:10 appointment, and that live routing respects explicit overrides.
