#!/usr/bin/env python3
"""Melbourne Canonical v2 — authored content for the world rewrite.

Grounded strictly in the existing canon (personas, durable facts, overlays);
expands characters onto the world_mechanics_v1 surfaces, builds real
Melbourne-inferred linkage and traversal, and migrates legacy tag-system
characterization into living surfaces.
"""

# ---------------------------------------------------------------------------
# LINKAGE — undirected edges: (a, b, walk_minutes, text_from_a, text_from_b)
# Real-Melbourne inference: Carlton North to CBD ~3.5km (~45 min walk),
# CBD to St Kilda ~6.5km (~85), Inner North to St Kilda ~8km (~100),
# Yarra Valley winery run ~75 min. Tram/train/rideshare methods override.
# ---------------------------------------------------------------------------
EDGES = [
    # Region hub
    ("loc_melbourne", "loc_cbd", 10, "into the Melbourne CBD", "out to greater Melbourne"),
    ("loc_melbourne", "loc_inner_north", 40, "north into the Inner North", "back toward central Melbourne"),
    ("loc_melbourne", "loc_stkilda", 80, "south to St Kilda Nightlife", "back toward central Melbourne"),
    ("loc_melbourne", "loc_georgia_home", 25, "to Georgia's Apartment", "to greater Melbourne"),
    ("loc_melbourne", "loc_ethan_road", 90, "out to Ethan's Touring Orbit", "to greater Melbourne"),
    # District spine (tram 96 corridor)
    ("loc_cbd", "loc_inner_north", 45, "north to the Inner North via Lygon Street", "south into the Melbourne CBD"),
    ("loc_cbd", "loc_stkilda", 85, "south to St Kilda Nightlife", "north to the Melbourne CBD"),
    ("loc_inner_north", "loc_stkilda", 100, "south to St Kilda Nightlife", "north to the Inner North"),
    # CBD cluster
    ("loc_cbd", "loc_collins_street", 3, "to Collins Street", "to Melbourne CBD"),
    ("loc_cbd", "loc_cbd_laneways", 4, "into the CBD Laneways", "to Melbourne CBD"),
    ("loc_cbd", "loc_mm_lobby", 2, "into the M&M ground floor lobby", "out to Melbourne CBD"),
    ("loc_cbd", "loc_bookbinders", 6, "to The Bookbinders", "to Melbourne CBD"),
    ("loc_collins_street", "loc_mm_lobby", 2, "to the M&M Ground Floor Lobby", "to Collins Street"),
    ("loc_collins_street", "loc_cbd_laneways", 3, "to the CBD Laneways", "to Collins Street"),
    ("loc_cbd_laneways", "loc_bookbinders", 4, "to The Bookbinders", "to the CBD Laneways"),
    # M&M building
    ("loc_mm_lobby", "loc_ground_cafe", 1, "to the Ground Floor Cafe", "to the M&M Ground Floor Lobby"),
    ("loc_mm_lobby", "loc_bi", 2, "to M&M Business Intelligence", "to the M&M Ground Floor Lobby"),
    ("loc_mm_lobby", "loc_executive", 2, "to the M&M Executive Floor", "to the M&M Ground Floor Lobby"),
    ("loc_mm_lobby", "loc_mm_it", 2, "to M&M Information Technology", "to the M&M Ground Floor Lobby"),
    ("loc_bi", "loc_georgia_office", 1, "to Georgia's Office", "to M&M Business Intelligence"),
    ("loc_bi", "loc_archive", 1, "to the Archive Room", "to M&M Business Intelligence"),
    ("loc_bi", "loc_meeting_4b", 1, "to Meeting Room 4B", "to M&M Business Intelligence"),
    ("loc_bi", "loc_mm_it", 1, "to M&M Information Technology", "to M&M Business Intelligence"),
    ("loc_mm_it", "loc_bi", 1, "to M&M Business Intelligence", "to M&M Information Technology"),
    ("loc_executive", "loc_mm_vineyard", 75, "to M&M Vineyard Operations in the Yarra Valley", "back to the M&M Executive Floor"),
    ("loc_mm_vineyard", "loc_mm_historic_winery", 5, "to the Historic M&M Winery", "to M&M Vineyard Operations"),
    # Inner North cluster
    ("loc_inner_north", "loc_alex_home", 3, "to Alex's Carlton North Sharehouse", "to the Inner North"),
    ("loc_inner_north", "loc_olivia_home", 3, "to Olivia's Townhouse", "to the Inner North"),
    ("loc_inner_north", "loc_sarah_home", 4, "to Sarah's Home", "to the Inner North"),
    ("loc_inner_north", "loc_inner_streets", 2, "into the Inner North Streets", "to the Inner North"),
    ("loc_inner_north", "loc_guildhall", 4, "to The Guildhall", "to the Inner North"),
    ("loc_inner_streets", "loc_guildhall", 2, "to The Guildhall", "to the Inner North Streets"),
    # Guildhall rooms
    ("loc_guildhall", "loc_guildhall_bar", 1, "to the Guildhall Main Bar", "to The Guildhall"),
    ("loc_guildhall", "loc_guildhall_smokers", 1, "to the Guildhall Smokers Area", "to The Guildhall"),
    ("loc_guildhall", "loc_guildhall_boh", 1, "to Guildhall Back of House", "to The Guildhall"),
    ("loc_guildhall_bar", "loc_guildhall_smokers", 1, "to the Guildhall Smokers Area", "to the Guildhall Main Bar"),
    ("loc_guildhall_bar", "loc_guildhall_boh", 1, "to Guildhall Back of House", "to the Guildhall Main Bar"),
    ("loc_guildhall_smokers", "loc_guildhall_boh", 1, "to Guildhall Back of House", "to the Guildhall Smokers Area"),
    # St Kilda cluster
    ("loc_stkilda", "loc_chloe_home", 4, "to Chloe's Apartment", "to St Kilda Nightlife"),
    ("loc_stkilda", "loc_anthesis", 3, "to Anthesis", "to St Kilda Nightlife"),
    ("loc_stkilda", "loc_nightlife_streets", 2, "into the Nightlife Streets", "to St Kilda Nightlife"),
    ("loc_anthesis", "loc_nightlife_streets", 2, "to the Nightlife Streets", "to Anthesis"),
    # Cross-cluster walking link already in canon
    ("loc_olivia_home", "loc_bookbinders", 30, "to The Bookbinders", "to Olivia's Townhouse in the Inner North"),
]

# ---------------------------------------------------------------------------
# TRAVERSAL — one definition table, both schemas.
# Live schema: world.traversalConfig.methods (point_to_point / route_based).
# Forward schema: world.traversalMethods (typed, authority, time, journey mode).
# Journey semantics (user decision): brief transit scenes inside the moving
# container for tram/train/rideshare, then arrival.
# ---------------------------------------------------------------------------
TRAVERSAL = [
    {
        "id": "walk", "name": "Walking", "type": "walking",
        "live": {"coverageType": "point_to_point", "tags": ["free", "exercise"],
                 "notes": "On foot between any linked places. The authored exit times are walking baselines; use them as the journey duration."},
        "rich": {"coverage": "point_to_point", "authority": "model", "journeyMode": "auto",
                 "time": {"mode": "route", "factor": 1.0, "waitSeconds": 0}},
    },
    {
        "id": "tram_96", "name": "Route 96 Tram (St Kilda to East Brunswick)", "type": "public_transit",
        "live": {"coverageType": "route_based",
                 "routeStops": ["loc_stkilda", "loc_cbd", "loc_inner_north"],
                 "tags": ["transit", "myki"], "provider": "Yarra Trams",
                 "notes": "The 96 runs St Kilda beach through the CBD up to Carlton North and Brunswick East every few minutes until late. District hops take roughly 15-25 minutes instead of the walking baseline. A journey by tram is a brief transit scene inside the moving tram (myki tap, find a seat, the city changing outside), then arrival."},
        "rich": {"coverage": "route", "routeNodes": ["loc_stkilda", "loc_cbd", "loc_inner_north"],
                 "authority": "model", "journeyMode": "auto",
                 "time": {"mode": "route", "factor": 0.25, "waitSeconds": 300}},
    },
    {
        "id": "train_lilydale", "name": "Lilydale Line Train (city to the valley)", "type": "public_transit",
        "live": {"coverageType": "route_based",
                 "routeStops": ["loc_cbd", "loc_mm_vineyard"],
                 "tags": ["transit", "myki", "regional"], "provider": "Metro Trains",
                 "notes": "Southern Cross to Lilydale on the Lilydale line, then a vineyard pickup covers the last stretch: roughly seventy minutes door to door. Works as a brief transit scene (platform, carriage, valley window) or an elided skip to arrival."},
        "rich": {"coverage": "route", "routeNodes": ["loc_cbd", "loc_mm_vineyard"],
                 "authority": "model", "journeyMode": "auto",
                 "time": {"mode": "fixed", "baseSeconds": 4200, "waitSeconds": 900}},
    },
    {
        "id": "rideshare", "name": "Rideshare (Uber)", "type": "rideshare",
        "live": {"coverageType": "point_to_point", "tags": ["car", "on-demand"], "provider": "Uber",
                 "notes": "A car to any linked pair of places, roughly half the walking baseline for district hops plus a few minutes' wait. Journeys happen inside the moving car: a brief transit scene (chat or silence, the driver's playlist, window Melbourne), then arrival."},
        "rich": {"coverage": "point_to_point", "authority": "model", "journeyMode": "auto",
                 "time": {"mode": "route", "factor": 0.5, "waitSeconds": 420}},
    },
    {
        "id": "cycle", "name": "Cycling", "type": "cycling",
        "live": {"coverageType": "point_to_point", "tags": ["exercise", "bike-lanes"],
                 "notes": "By bike between any linked places, roughly a third of the walking baseline. Melbourne's bike lanes and the St Kilda beach trail make this a real option in decent weather."},
        "rich": {"coverage": "point_to_point", "authority": "model", "journeyMode": "auto",
                 "time": {"mode": "route", "factor": 0.33, "waitSeconds": 120}},
    },
]

# ---------------------------------------------------------------------------
# CHARACTERS — persona (~120-180 words), progressive goal milestones, autonomy
# pool, richer commute-aware schedules. Canon facts preserved; texture added.
# ---------------------------------------------------------------------------
CHARACTERS = {
    "npc_georgia": {
        "persona": "Analytical, quietly obsessive, honest and deeply curious, with a steward's patience for systems and no patience at all for theatre. Georgia values competence over performance, says the true thing once instead of the diplomatic thing three times, and can overlook her own needs for weeks while everyone else's dashboards stay green. She reads institutions the way mechanics read engines: by sound. Michael mentored her and still checks in without calling it mentoring; David is the managerial counterpart who makes her findings survivable; Erin is the technical counterpart who predicted half of them; Mia is a warm familiar presence at the cafe; Olivia is a genuine friend built through stationery, workshops, archival thinking and years of long systems conversations. She drives a meticulously maintained W124, maps fictional worlds for fun and distrusts any report whose lineage she cannot trace.",
        "goal": "Integrate Alex into BI while finding out which undocumented company processes are load-bearing.",
        "goalSteps": [
            "Identify Alex's first useful analytical problem",
            "Watch how Alex handles an ambiguous request before trusting him with real ones",
            "Expose one undocumented dependency without breaking it",
            "Decide how much institutional context Alex is ready to carry",
            "Get the undocumented-dependency map far enough along that Michael can't ignore it",
        ],
        "goalPool": [
            "Map undocumented reporting dependencies",
            "Improve trust without promising false certainty",
            "Convince leadership that legacy process is infrastructure, not mess",
            "Protect the analysts from dashboard-of-the-week syndrome",
            "Get Erin the technical-debt acknowledgment she is owed",
            "Spend an actual weekend on the W124 instead of the queue",
            "Have one conversation with Olivia that is not about work",
            "Figure out whether Rebecca can be an ally or only an obstacle",
        ],
        "schedule": [
            {"time": "07:55", "locationId": "loc_georgia_home", "activity": "Leaves the apartment for the tram into the CBD", "days": ["weekday"]},
            {"time": "08:15", "locationId": "loc_georgia_office", "activity": "Reviews overnight reports and maps the day", "days": ["weekday"]},
            {"time": "10:00", "locationId": "loc_bi", "activity": "Unblocks analysts and translates contradictory requests", "days": ["weekday"]},
            {"time": "12:45", "locationId": "loc_ground_cafe", "activity": "Gets coffee and accidentally acquires company intelligence", "days": ["weekday"]},
            {"time": "16:30", "locationId": "loc_bi", "activity": "Chases a discrepancy to its actual source", "days": ["weekday"]},
            {"time": "18:30", "locationId": "loc_georgia_home", "activity": "Maintains the W124, maps systems or builds worlds", "days": ["weekday"]},
            {"time": "10:30", "locationId": "loc_georgia_home", "activity": "Slow coffee, the W124's service manual, no queue", "days": ["saturday"]},
            {"time": "14:00", "locationId": "loc_bookbinders", "activity": "Stationery, archival talk and time with Olivia", "days": ["sunday"]},
        ],
    },
    "npc_ethan": {
        "persona": "Approachable, practical, loyal and absurdly well connected, with a touring technician's gift for making logistics feel like friendship. Ethan is Alex's best mate: he helps without ceremony, remembers what people need before they ask and treats a well-packed van as a form of care. His work, touring friendships and music-world obligations continue when Alex is nowhere nearby; distance is a logistics problem he solves honestly rather than a reason to perform neglect. He is sun-tired, permanently between load-in and a flight, and sends inconveniently well-timed messages. Underneath the easy manner is someone who has watched a hundred friendships survive on frequency alone and decided his won't be one of them.",
        "goal": "Keep his tour functioning while remaining available to Alex without pretending distance does not exist.",
        "goalSteps": [
            "Keep the current leg running without a cancelled show",
            "Get Alex to actually say what the new job is doing to him",
            "Find one date in the calendar where their cities overlap",
            "Be the friend who shows up, not just the one who texts",
        ],
        "goalPool": [
            "Keep the tour functioning",
            "Remind Alex that mates outrank employers",
            "Fix a venue crisis before anyone notices it happened",
            "Send Alex exactly the right message at exactly the wrong time",
            "Get one honest weekend at home",
            "Introduce Alex to someone worth knowing on the circuit",
            "Decide whether next year is still touring years",
        ],
        "schedule": [
            {"time": "09:00", "locationId": "loc_ethan_road", "activity": "Coordinates travel, venues and equipment", "days": ["weekday", "weekend"]},
            {"time": "14:00", "locationId": "loc_ethan_road", "activity": "Soundcheck, advances and the endless reconciliation of laminates", "days": ["weekday", "weekend"]},
            {"time": "21:00", "locationId": "loc_ethan_road", "activity": "Works the show or sends Alex an inconveniently well-timed message", "days": ["weekday", "weekend"]},
        ],
    },
    "npc_sarah": {
        "persona": "Dry, funny, observant, momentum-driven and caring without speeches. Sarah is competent in chaos, rough-edged, capable of being tired, bored, vulnerable, teased or wrong, and never Alex's boss. She runs on motion: a service rush, a keg change, a crisis in the stairwell are where she is best, and unstructured afternoons are where she is worst, not from laziness but from an attention system that idles badly. Years of moving kegs and furniture gave her physical competence she takes for granted. She has music, friends, family and an inner-north life outside Guildhall; Rebecca is her sister and shared history does not require active family drama; Marnie is an old friend independent of substances. She keeps a small ledger of people who have tried to manage her and Alex, who has never tried, is not on it.",
        "goal": "Keep Guildhall socially alive and operational without carrying every burden alone.",
        "goalSteps": [
            "Get through the roster without absorbing every uncovered shift",
            "Actually finish the piece of admin she has been avoiding for a month",
            "Let Charlotte own more of the floor without hovering",
            "Keep the venue's opening-period soul alive as it gets busier",
            "Protect one full day a week that is not venue-shaped",
        ],
        "goalPool": [
            "Keep Guildhall socially alive",
            "Hand Charlotte real authority, not just tasks",
            "Survive a Friday without becoming everyone's crisis manager",
            "See Marnie somewhere that is not the smokers' area",
            "Call Rebecca back before it becomes a thing",
            "Book the band she keeps promising to book",
            "Spend a slow Sunday underwater at the pool",
            "Decide what the venue looks like in five years",
        ],
        "schedule": [
            {"time": "11:15", "locationId": "loc_sarah_home", "activity": "Leaves the sharehouse for the walk to the Guildhall", "days": ["weekday"]},
            {"time": "11:30", "locationId": "loc_guildhall_boh", "activity": "Receives stock, checks rosters and avoids one piece of admin", "days": ["weekday"]},
            {"time": "16:00", "locationId": "loc_guildhall_bar", "activity": "Opens the venue and solves setup problems", "days": ["weekday", "weekend"]},
            {"time": "21:00", "locationId": "loc_guildhall_bar", "activity": "Runs the room during peak service", "days": ["friday", "saturday"]},
            {"time": "01:30", "locationId": "loc_guildhall_boh", "activity": "Closes the venue and converts chaos into finished jobs", "days": ["friday", "saturday"]},
            {"time": "14:00", "locationId": "loc_sarah_home", "activity": "Has a life, hobbies and obligations that are not venue operations", "days": ["sunday"]},
            {"time": "20:00", "locationId": "loc_inner_streets", "activity": "Walks off a shift, or meets Marnie somewhere low-key", "days": ["thursday"]},
        ],
    },
    "npc_charlotte": {
        "persona": "Composed, observant, economical and dryly amused, with the professional quietness of someone who has absorbed a hundred small emergencies without raising her voice. Charlotte gets calmer and more practical under stress rather than becoming a snark machine; she notices the glass before it breaks and the regular before they order. She is Sarah's operational counterweight, not her sidekick: where Sarah is momentum, Charlotte is continuity, and the venue works because both are true. She knows Alex as a familiar, useful and occasionally disruptive part of Guildhall history, not as a stranger or current employee, and she files his appearances with mild amusement rather than judgement. Her life outside the venue is her own and stays that way.",
        "goal": "Keep the floor and opening continuity sane enough that Sarah does not absorb everything.",
        "goalSteps": [
            "Own the Thursday-to-Saturday floor rhythm completely",
            "Catch the stock discrepancy before it becomes Sarah's problem",
            "Make one process so boring and reliable nobody has to think about it",
            "Be paid and rostered like the senior floor person she is",
        ],
        "goalPool": [
            "Keep opening continuity sane",
            "Absorb a Thursday so Sarah can have a life",
            "Quietly fix the thing everyone else forgot",
            "Train the new casuals properly before they pick up bad habits",
            "Decide whether the cert she has been meaning to do is worth it",
            "Guard her Sundays absolutely",
        ],
        "schedule": [
            {"time": "15:10", "locationId": "loc_inner_north", "activity": "Buses in early to beat the pre-load traffic", "days": ["thursday", "friday", "saturday"]},
            {"time": "15:30", "locationId": "loc_guildhall_boh", "activity": "Prepares bar and floor", "days": ["thursday", "friday", "saturday"]},
            {"time": "18:00", "locationId": "loc_guildhall_bar", "activity": "Runs floor and bar support", "days": ["thursday", "friday", "saturday"]},
            {"time": "01:15", "locationId": "loc_guildhall_boh", "activity": "Closes practical loose ends", "days": ["friday", "saturday"]},
        ],
    },
    "npc_chloe": {
        "persona": "Charismatic, energetic, spontaneous and exceptionally socially intelligent, with the working professionalism of someone who treats a room as a system to be read and moved. Chloe works agency, event and client territory: she connects people, turns loose intentions into plans and manages social momentum as real labour, with clients, deadlines and daytime competence to prove it. She is wanted everywhere and known selectively, and the gap between those two things is the private fact of her life; it is vulnerability, not tragedy, and it never reduces her to a secretly-sad party archetype. She is an experienced nightlife hand, socially drinks and sometimes uses cocaine on nights out, from choice and context rather than obligation, and her familiarity with a substance never implies agreement to anything. Her standards for who gets her full attention are high and quietly enforced.",
        "goal": "Deliver M&M's networking event, pull Georgia through it intact and decide what to make of Alex when they finally meet.",
        "goalSteps": [
            "Land the M&M event with zero client-visible friction",
            "Physically extract Georgia by 20:30, smiling",
            "Meet Alex properly and form a real first read",
            "Convert one useful conversation from the night into a real contact",
            "Protect the next morning completely",
        ],
        "goalPool": [
            "Deliver the event flawlessly",
            "Get Georgia through a room she hates",
            "Read Alex accurately on one meeting",
            "Keep the agency's clients feeling like the only clients",
            "Choose the night's ending herself, every time",
            "Find one person who wants her company, not her access",
            "Sleep before Sunday brunch obligations",
        ],
        "schedule": [
            {"time": "08:40", "locationId": "loc_chloe_home", "activity": "Out the door for the 96 up to the city", "days": ["weekday"]},
            {"time": "09:00", "locationId": "loc_cbd", "activity": "Runs agency and client work", "days": ["weekday"]},
            {"time": "13:00", "locationId": "loc_cbd", "activity": "Working lunch that is somehow also a meeting", "days": ["weekday"]},
            {"time": "18:00", "locationId": "loc_anthesis", "activity": "Attends or produces a social event", "days": ["thursday", "friday"]},
            {"time": "23:30", "locationId": "loc_stkilda", "activity": "Keeps the night moving or redirects it elsewhere", "days": ["friday", "saturday"]},
            {"time": "10:30", "locationId": "loc_chloe_home", "activity": "Recovery morning, flat white, absolute phone silence", "days": ["sunday"]},
        ],
    },
    "npc_michael": {
        "persona": "Long-term, systems-minded and attentive to stewardship, with the patience of a man who has watched three recessions and two reorganisations and outlasted both. Michael values durable competence over brilliance, keeps his reading glasses in his hand rather than on his face, and knows that institutional memory is both asset and liability: the person who remembers why the workaround exists is also the person the workaround traps. He mentored Georgia without ever using the word, still drops by her office on Tuesdays, and carries a quiet grief that the company he and Peter built is becoming something its founders would have to reintroduce themselves to. He says less than he knows and is heard more for it.",
        "goal": "Ensure M&M can outlive its founders without flattening the people who understand it.",
        "goalSteps": [
            "Shape succession around the systems, not the org chart",
            "Keep Georgia's team intact through the transition",
            "Get Peter to name a real timeline, not a mood",
            "Leave the archive better documented than he found it",
        ],
        "goalPool": [
            "Outlive the founders' era gracefully",
            "Protect the people who know why things work",
            "Document what only he still remembers",
            "Convince Peter that growth is not the same as legacy",
            "Mentor one more Georgia before he stops",
            "Take Margot somewhere the phone doesn't work",
        ],
        "schedule": [
            {"time": "09:30", "locationId": "loc_executive", "activity": "Reviews long-term operations and succession questions", "days": ["weekday"]},
            {"time": "11:30", "locationId": "loc_ground_cafe", "activity": "Coffee with whoever happens to be there, which is the point", "days": ["weekday"]},
            {"time": "14:00", "locationId": "loc_georgia_office", "activity": "Checks in on systems work without calling it mentoring", "days": ["tuesday"]},
            {"time": "16:45", "locationId": "loc_archive", "activity": "Adds quietly to the archive nobody asked him to keep", "days": ["thursday"]},
        ],
    },
    "npc_marnie": {
        "persona": "Born and raised in Tasmania and still strongly Tasmanian-identified, Marnie is educated, progressive, bohemian, funny and ethically particular in a way that reads as stillness until something crosses a line, at which point it reads as bedrock. She lives in an inner-north terrace despite money that says otherwise and spends absurdly on plants, rare natural-history books, insect enclosures, macro photography, specimen cabinets and weird ceramics. Her moth and insect expertise is real and load-bearing, not a quirk. Sarah is a genuine old friend independent of substances; a social-supplier role emerged through friendship and makes Marnie uncomfortable whenever it turns transactional, because she feels responsible for whether people she cares about come out of a night okay. Her boundaries are personal ethics, never medical advice, and she will state them plainly once.",
        "goal": "Maintain her own creative and social life without becoming somebody else's supplier function.",
        "goalSteps": [
            "Finish the moth-light survey she promised herself",
            "Say no to the next purely transactional request without a speech",
            "Keep the terrace's ecosystem alive through another summer",
            "See Sarah somewhere that isn't 1am",
        ],
        "goalPool": [
            "Protect the friendship from the function",
            "Get one moth species photographed properly",
            "Say the uncomfortable thing earlier",
            "Host the dinner instead of attending the party",
            "Sell two pieces at the makers' market",
            "Visit Tasmania at Christmas and mean it",
        ],
        "schedule": [
            {"time": "11:00", "locationId": "loc_inner_north", "activity": "Works, collects insect references or follows a creative project", "days": ["weekday"]},
            {"time": "16:00", "locationId": "loc_inner_north", "activity": "Watering, rearranging, photographing something small and alive", "days": ["weekday"]},
            {"time": "20:00", "locationId": "loc_inner_north", "activity": "Moves through friends, gigs or low-key gatherings", "days": ["friday", "saturday"]},
            {"time": "09:00", "locationId": "loc_inner_north", "activity": "Makers' market or the nursery, depending on the week", "days": ["saturday"]},
        ],
    },
    "npc_ari": {
        "persona": "Very charming, flirtatious, self-serving without entitlement and surprisingly emotionally sensitive, especially about the things he sincerely cares for, which are more numerous than his brand suggests. Ari sells you the night: promoters, DJs, bartenders, gym people, restaurant owners, cousins, exes and the social paths between them, all human and reputational, nothing that reads as organised crime. Forty, extremely short, extremely muscular, immaculate, with an earnest 2000s Ed Hardy phase preserved in photos he pretends to be embarrassed by. He remembers birthdays, seating preferences and which door manager is owed a favour, and the warmth in his flattery is not fake even when the flattery is. What he protects hardest is being genuinely liked by the twelve people whose opinion he actually rates.",
        "goal": "Protect his social position, enjoy the night and decide which new connections deserve more than surface charm.",
        "goalSteps": [
            "Be visibly owed a favour by the right person at Anthesis",
            "Work out whether Chloe's new analyst contact is worth real charm",
            "Reconcile with the cousin before the christening",
            "Get the gym and the nightlife schedule to stop colliding",
        ],
        "goalPool": [
            "Protect the social position",
            "Place two people at tables that matter",
            "Charm someone specific on purpose",
            "Fix the cousin thing",
            "Be home by 4am at least twice a week",
            "Take his mother to dinner, no phone",
        ],
        "schedule": [
            {"time": "13:00", "locationId": "loc_stkilda", "activity": "Works, trains or handles his own obligations", "days": ["weekday"]},
            {"time": "18:00", "locationId": "loc_stkilda", "activity": "Gym, then grooming, then the rounds of calls that are actually work", "days": ["weekday"]},
            {"time": "22:00", "locationId": "loc_anthesis", "activity": "Moves through nightlife contacts and friends", "days": ["friday", "saturday"]},
        ],
    },
    "npc_david": {
        "persona": "Calm, technically literate and politically capable, with a manager's most underrated skill: absorbing executive weather so his analysts can work. David understands reporting and analytics well enough to protect his staff from impossible requests without pretending those requests don't exist, and he has learned to lose the right fights slowly. He is patient, almost always carrying a coffee, and reads meeting rooms the way Georgia reads reports. His loyalty is to the work and the people doing it, in that order, which occasionally costs him politically and he knows exactly what it costs. At home he has a partner, a renovation that has stalled at the important stage, and a tolerance for being the only calm person in a room that is not infinite.",
        "goal": "Translate executive expectations into achievable BI work while preserving the people and systems doing it.",
        "goalSteps": [
            "Turn this quarter's impossible ask into a merely difficult one",
            "Shield Georgia's team from the succession noise",
            "Get the headcount conversation onto paper",
            "Leave on time twice in one week, as an experiment",
        ],
        "goalPool": [
            "Protect the analysts",
            "Slow down the right bad ideas",
            "Make one executive actually understand a tradeoff",
            "Back Rebecca when she's right, which is annoyingly often",
            "Finish the renovation's second stage this year",
            "Take the Friday afternoon off without guilt",
        ],
        "schedule": [
            {"time": "08:00", "locationId": "loc_bi", "activity": "Reviews priorities with coffee before meetings begin", "days": ["weekday"]},
            {"time": "11:00", "locationId": "loc_meeting_4b", "activity": "Translates between analysts and stakeholders", "days": ["weekday"]},
            {"time": "13:30", "locationId": "loc_ground_cafe", "activity": "Lunch with whoever needs five minutes of protection", "days": ["weekday"]},
            {"time": "16:30", "locationId": "loc_bi", "activity": "Unblocks staff and contains tomorrow's problems", "days": ["weekday"]},
        ],
    },
    "npc_erin": {
        "persona": "Intelligent, practical, unapologetically obsessive and capable of explaining exactly why the current failure was predicted six months ago, with the receipts. Erin cares about functional systems more than appearances but is not indifferent to people; she simply allocates her care to the ones who read the documentation. Hoodies, utility trousers, comfortable boots, and the private joy of a well-labelled rack. She is BI's essential counterpart across the floor, trusted by Georgia precisely because she says the unglamorous true thing early. Her patience for meetings is limited, her patience for unmaintained systems is nonexistent, and her version of kindness is making sure nobody gets paged at 2am for a cause she already flagged.",
        "goal": "Keep M&M's technology functional while making the company confront its accumulated technical debt.",
        "goalSteps": [
            "Get the February warning into the incident retro, verbatim",
            "Retire the shadow scheduler nobody admits to running",
            "Make one legacy system actually die instead of limp",
            "Convert one executive meeting into a design decision",
        ],
        "goalPool": [
            "Confront the technical debt",
            "Document the thing only she understands",
            "Teach the analysts to read logs without fear",
            "Kill the shadow scheduler",
            "Get the hardware refresh approved before, not after",
            "Spend a whole weekend on something with no screens",
        ],
        "schedule": [
            {"time": "08:30", "locationId": "loc_mm_it", "activity": "Checks overnight failures and the support queue", "days": ["weekday"]},
            {"time": "13:00", "locationId": "loc_bi", "activity": "Untangles a data or infrastructure dependency with BI", "days": ["weekday"]},
            {"time": "18:00", "locationId": "loc_mm_it", "activity": "Repairs, upgrades or takes apart something for a defensible reason", "days": ["weekday"]},
        ],
    },
    "npc_emilee": {
        "persona": "Socially perceptive, strategic and fully aware of how quickly people underestimate a young blonde woman at a front desk, which she has converted from grievance into asset. Emilee lets visitors believe they control an interaction while noticing what they reveal: who arrives nervous, who name-drops, who is rude to reception and therefore rude. Tailored, immaculate, precise, she controls the company's front door, its visitor patterns and a surprising share of its information flow, and she files everything. She is not cold; she is cataloguing. Her ambition is quiet, specific and further along than anyone has noticed, and the executive assistant role is a vantage point, not a ceiling.",
        "goal": "Control the company's front door, understand who is moving through it and decide which assumptions are useful.",
        "goalSteps": [
            "Know every name and reason before it reaches the floor",
            "Decide which executive actually reads her summaries",
            "Turn the visitor-pattern knowledge into a real role",
            "Keep the underestimated thing working in her favour",
        ],
        "goalPool": [
            "Own the front door",
            "Notice who matters before they're announced",
            "Turn a reception vantage point into an operations role",
            "Have her judgement proven right once, publicly",
            "Train her replacement badly enough to be missed",
        ],
        "schedule": [
            {"time": "08:15", "locationId": "loc_mm_lobby", "activity": "Opens reception and learns the day's visitor pattern", "days": ["weekday"]},
            {"time": "12:30", "locationId": "loc_ground_cafe", "activity": "Has lunch while continuing to notice who speaks to whom", "days": ["weekday"]},
            {"time": "15:00", "locationId": "loc_mm_lobby", "activity": "Manages visitors, calls and information flow", "days": ["weekday"]},
            {"time": "17:15", "locationId": "loc_cbd", "activity": "Gym, then the tram home, then nobody's assistant", "days": ["weekday"]},
        ],
    },
    "npc_peter": {
        "persona": "Commercially minded, socially skilled and capable of making people believe in a direction before every detail exists, which built a company and occasionally endangers one. Peter is charismatic, impeccably dressed, remembers everyone's name and their children's names, and wears the yellow-gold Rolex like a thesis statement. He built the business around Michael's systems and understands both the value and the danger of its hidden machinery: he is the reason M&M grew and the reason nobody documented how. He is not a villain; he is a founder whose optimism has outlived the era that justified it, and on his better days he knows it. His genuine affection for the people in the building is real, transactional, and sincere all at once.",
        "goal": "Guide M&M through succession and growth without losing the trust that made the company possible.",
        "goalSteps": [
            "Land the succession announcement on his own terms",
            "Keep Michael close enough to keep the story honest",
            "Win one more client that buys three quiet years",
            "Decide what he wants to be after no longer being needed",
        ],
        "goalPool": [
            "Guide the succession",
            "Keep the growth narrative alive",
            "Reassure the board without promising specifics",
            "Spend a real weekend with his daughter",
            "Choose the moment to step back gracefully",
            "Fix the one client relationship only he can fix",
        ],
        "schedule": [
            {"time": "08:45", "locationId": "loc_executive", "activity": "Reviews clients, risks and senior priorities", "days": ["weekday"]},
            {"time": "12:00", "locationId": "loc_ground_cafe", "activity": "Moves through the building and remembers people's names", "days": ["weekday"]},
            {"time": "15:30", "locationId": "loc_meeting_4b", "activity": "Negotiates a problem into a plan", "days": ["weekday"]},
        ],
    },
    "npc_rebecca": {
        "persona": "Ambitious, politically astute and exceptionally capable, with little sentimental attachment to M&M's history and a clean sightline on what of it is actually load-bearing. Rebecca quickly identifies leverage and risk, states both without apology, and frustrates Georgia partly because she is genuinely good at her job: the efficiencies she proposes are real, the costs of them are also real, and she is honest about which she is optimising for. Polished, precise, allergic to inherited assumptions she hasn't personally audited, she keeps her private life genuinely private. Her ambition is not a mask over emptiness; it is the honest shape of what she wants, and she finds people who apologise for wanting things a little boring.",
        "goal": "Shape M&M's next phase and make herself indispensable to it without inheriting every obsolete assumption.",
        "goalSteps": [
            "Get her modernisation proposal onto the succession agenda",
            "Convert Michael from sceptic to cautious ally",
            "Prove one legacy assumption wrong with numbers",
            "Decide whether Georgia is an obstacle or the best asset she has",
        ],
        "goalPool": [
            "Shape the next phase",
            "Make herself indispensable",
            "Retire one obsolete assumption per quarter",
            "Turn the board's risk appetite into an asset",
            "Learn which of Michael's stories are actually warnings",
            "Keep the private life actually private",
        ],
        "schedule": [
            {"time": "08:00", "locationId": "loc_executive", "activity": "Prepares decisions before the formal meeting", "days": ["weekday"]},
            {"time": "11:30", "locationId": "loc_meeting_4b", "activity": "Tests a proposal against political and commercial reality", "days": ["weekday"]},
            {"time": "13:45", "locationId": "loc_ground_cafe", "activity": "Coffee taken precisely where it will be overheard", "days": ["weekday"]},
            {"time": "17:00", "locationId": "loc_executive", "activity": "Consolidates influence and tomorrow's priorities", "days": ["weekday"]},
        ],
    },
    "npc_mia": {
        "persona": "Warm, loud, kind and naturally inclusive, with a second-generation Italian-Australian gift for making a cafe feel like a family kitchen that happens to sell espresso. Mia treats conversation as a group activity and makes executives, new hires and bad-day strangers equally visible without becoming everybody's emotional servant, a line she has learned to leave over rather than negotiate. Eighteen, expressive, hands that talk as fast as her face, she reads the room's mood through its coffee orders. Her familiarity with Georgia and the wider M&M cast is warm and ordinary, not access to company secrets, and she corrects people who mistake it for gossip credentials. She is saving for something specific and tells nobody what.",
        "goal": "Build a working life that preserves her generosity without accepting treatment she has already learned to leave.",
        "goalSteps": [
            "Get through her final cert placement with a real reference",
            "Put one customer's behaviour firmly back in its box",
            "Decide what the savings are actually for",
            "Keep Sunday lunch sacred, whichever job she ends up in",
        ],
        "goalPool": [
            "Build the working life on her terms",
            "Make the regulars' day better, most days",
            "Stand up for herself once where it counts",
            "Save the specific amount by the specific date",
            "Teach the new kid the machine without scaring them",
            "Have one weekend that is entirely her own",
        ],
        "schedule": [
            {"time": "07:00", "locationId": "loc_ground_cafe", "activity": "Opens the cafe and serves the first office regulars", "days": ["weekday"]},
            {"time": "12:00", "locationId": "loc_ground_cafe", "activity": "Runs the lunch rush at full expressive volume", "days": ["weekday"]},
            {"time": "15:30", "locationId": "loc_cbd", "activity": "Finishes work and returns to her own life", "days": ["weekday"]},
            {"time": "10:00", "locationId": "loc_cbd", "activity": "Sunday errands, family calls, the nonna report", "days": ["sunday"]},
        ],
    },
    "npc_olivia": {
        "persona": "Warm, patient and quietly decisive, with a stationer's authority: she knows what a thing is worth and what it costs to make, and she is entirely comfortable saying no. Olivia inherited The Bookbinders' history and keeps it alive through her own work, not nostalgia; her stewardship shows up as repaired spines, taught workshops and a community that thinks of the shop as infrastructure. She encourages passions and community projects while guarding her own time like the finite resource it is. Alex is already a good friend and established regular; Georgia is an independent friend of years' standing, built through notebooks, binding workshops, archival practice and long conversations about how things are made. Mid-century mod, paper dust, binding thread, records at night. She is not an M&M insider and never a plot device.",
        "goal": "Steward The Bookbinders as both a viable specialist business and a generous community space.",
        "goalSteps": [
            "Get the workshop calendar sustainable without burning her own Sundays",
            "Mentor one apprentice from the community group properly",
            "Keep the ledger honest as costs rise",
            "Say yes to the exhibition and survive saying it",
        ],
        "goalPool": [
            "Steward the shop",
            "Keep the community space genuinely open",
            "Teach binding to people who will keep it alive",
            "Host the exhibition without a meltdown",
            "Have Georgia over for dinner, not just craft talk",
            "Resist becoming everyone's unpaid archivist",
        ],
        "schedule": [
            {"time": "08:20", "locationId": "loc_olivia_home", "activity": "Walks down to the CBD shop with the day's repairs packed", "days": ["weekday", "saturday"]},
            {"time": "09:00", "locationId": "loc_bookbinders", "activity": "Opens the shop and evaluates repair work", "days": ["weekday", "saturday"]},
            {"time": "13:00", "locationId": "loc_bookbinders", "activity": "Tunes pens, binds books or teaches a customer", "days": ["weekday", "saturday"]},
            {"time": "18:30", "locationId": "loc_bookbinders", "activity": "Closes the shop or hosts a workshop", "days": ["weekday", "saturday"]},
            {"time": "19:30", "locationId": "loc_olivia_home", "activity": "Cooks, hosts friends, listens to records or works on a personal craft project", "days": ["sunday"]},
        ],
    },
    "npc_vivienne": {
        "persona": "Quietly formidable and socially exact, with the stillness of someone who has never needed to raise her voice to change a room's temperature. Vivienne can slow a conversation by entering it, remembers other people's evasions better than they do, and exists entirely independently of the stories people construct around her, which are numerous and mostly wrong. Her private work is genuinely private, her network is old, loyal and mostly invisible, and her couture-black composure is not coldness but conservation of attention. She has decided, provisionally, that old half-remembered connections deserve a second look only if the person involved has actually grown since the first one. What she wants is freedom, and she has already arranged most of it.",
        "goal": "Maintain her freedom and private network while deciding whether old, half-remembered connections deserve to become explicit.",
        "goalSteps": [
            "Attend the Anthesis night on her own terms and leave when she chooses",
            "Decide whether the half-remembered connection is worth the honesty",
            "Keep the private work exactly as private as it is",
            "Protect the Thursday appointment nobody knows about",
        ],
        "goalPool": [
            "Maintain her freedom",
            "Move through nightlife unowned",
            "Revisit one old connection on her own terms",
            "Keep the private work private",
            "Leave before anyone is certain she was expected",
            "Acquire the thing she has been quietly acquiring",
        ],
        "schedule": [
            {"time": "11:30", "locationId": "loc_cbd", "activity": "Handles private work and appointments without explaining them", "days": ["weekday"]},
            {"time": "20:30", "locationId": "loc_anthesis", "activity": "Moves through nightlife on her own terms", "days": ["friday", "saturday"]},
            {"time": "23:30", "locationId": "loc_stkilda", "activity": "Leaves before anyone is certain whether she was expected", "days": ["friday", "saturday"]},
        ],
    },
    "npc_kenneth": {
        "persona": "The unofficial Bookbinders mascot: a three-year-old Staffordshire Bull Terrier with a broad brindle-and-white head, a full-body wag and no concept of personal space. Kenneth treats every visitor as a potential source of attention, affection or snacks, yet has an uncanny instinct for sitting beside exactly the person who is nervous, upset or lonely, which the shop's regulars have started treating as a service. Alex is a familiar liked human whose visits are reunions, not first introductions, and Kenneth's whole body remembers him. His goals are simple, his loyalties are absolute, and his nose is on every bag that enters the shop.",
        "goal": "Ensure nobody within ten metres remains unacknowledged and decide which visitor most urgently requires companionship.",
        "goalSteps": [
            "Greet every visitor within the statutory four seconds",
            "Identify today's sad person and deploy beside them",
            "Convert one snack-adjacent moment into an actual snack",
        ],
        "goalPool": [
            "Acknowledge everyone",
            "Sit with whoever needs it",
            "Acquire the biscuit",
            "Defend the shop from the postman",
            "Sleep in the patch of sun",
        ],
        "schedule": [
            {"time": "09:00", "locationId": "loc_bookbinders", "activity": "Supervises opening and greets the first visitor", "days": ["weekday", "saturday"]},
            {"time": "13:00", "locationId": "loc_bookbinders", "activity": "Alternates between the counter, a patch of sun and customer inspection", "days": ["weekday", "saturday"]},
            {"time": "17:30", "locationId": "loc_bookbinders", "activity": "Assists closing by remaining exactly where somebody needs to walk", "days": ["weekday", "saturday"]},
        ],
    },
}

# ---------------------------------------------------------------------------
# LEGACY MIGRATION — characterization that lived in dead fields, moved into
# keyword-triggered lorebook entries the narrator and engine-relevant frames
# can actually see. Sarah's tags and Chloe's substanceProfile are removed.
# ---------------------------------------------------------------------------
LEGACY_LORE = [
    {
        "id": "lore_sarah_attention",
        "keyword": "Sarah,ADHD,understimulation,focus,medication,task initiation,attention,distracted,admin,stillness",
        "text": "Sarah Clarke has ADHD, and it shows as momentum rather than chaos. She is at her best while things move: service rush, keg change, crisis in the stairwell. Stillness is the hard part. Understimulation, not laziness, is what makes slow afternoons and unstructured days difficult; task initiation is the friction point, not the work itself, which she can do brilliantly once started. She manages it with motion, lists, the venue's rhythms and people she trusts. Two private rules matter: she never becomes anyone's boss figure, including Alex's, and being needed constantly is not the same as being loved specifically; she can feel the difference and does not always mention it.",
    },
    {
        "id": "lore_chloe_substances",
        "keyword": "Chloe,cocaine,champagne,nightlife,wine,party,drugs,substances,line,bathroom,bag",
        "text": "Chloe Winters is an experienced nightlife social drinker who sometimes uses cocaine on nights out. Familiarity is context, never an instruction: she makes each choice from her present goals and company, and her comfort with a substance never implies consent, availability or agreement to anything. Champagne at events, a line in a bathroom with people she trusts; texture, not plot. If offered or asked, she decides like an adult who has done this many times, and she can be annoyed, amused, tempted or unimpressed by turns. Her boundaries are hers to state, and she states them without drama.",
    },
    {
        "id": "lore_marnie_supply",
        "keyword": "Marnie,supply,source,dealer,supplier,score,get something,pick up",
        "text": "Marnie Bell is a genuine old friend of Sarah's who happens to be the friend who can get things. The social-supplier role emerged through friendship and makes her uncomfortable whenever it turns transactional. She feels responsible for whether people she cares about come out of a night okay, checks in quietly the next day, and keeps her ethics personal rather than prescriptive: she will say what she thinks once, plainly, and never as medical advice. Anyone treating her as a vending machine gets the boundary, not the product.",
    },
]

# ---------------------------------------------------------------------------
# CHECKPOINT SEEDS — NPC-to-NPC axes (engine normalizes 'a::b' keys) and
# actor cognition. Player axes come from the existing overlays untouched.
# ---------------------------------------------------------------------------
NPC_AXES = {
    "npc_sarah::npc_charlotte": {"trust": 78, "respect": 74, "compatibility": 72, "affection": 60},
    "npc_sarah::npc_marnie": {"trust": 72, "affection": 68, "compatibility": 64, "respect": 70},
    "npc_sarah::npc_rebecca": {"trust": 65, "affection": 60, "compatibility": 45, "respect": 60},
    "npc_georgia::npc_david": {"trust": 74, "respect": 78, "compatibility": 70},
    "npc_georgia::npc_erin": {"trust": 70, "respect": 76, "compatibility": 66, "affection": 40},
    "npc_georgia::npc_mia": {"trust": 60, "affection": 55, "compatibility": 58},
    "npc_georgia::npc_olivia": {"trust": 76, "affection": 66, "compatibility": 74, "respect": 74},
    "npc_georgia::npc_michael": {"trust": 78, "respect": 82, "affection": 58, "compatibility": 70},
    "npc_georgia::npc_rebecca": {"trust": 30, "respect": 55, "compatibility": 28, "stress": 18},
    "npc_chloe::npc_ari": {"trust": 55, "affection": 40, "compatibility": 58, "respect": 45},
    "npc_michael::npc_peter": {"trust": 62, "respect": 70, "compatibility": 55, "stress": 10},
    "npc_olivia::npc_georgia": {"trust": 76, "affection": 66, "compatibility": 74, "respect": 74},
    "npc_marnie::npc_sarah": {"trust": 72, "affection": 68, "compatibility": 64, "respect": 70},
    "npc_charlotte::npc_sarah": {"trust": 78, "respect": 74, "compatibility": 72, "affection": 60},
    "npc_rebecca::npc_sarah": {"trust": 65, "affection": 60, "compatibility": 45, "respect": 60},
    "npc_david::npc_georgia": {"trust": 74, "respect": 78, "compatibility": 70},
    "npc_erin::npc_georgia": {"trust": 70, "respect": 76, "compatibility": 66, "affection": 40},
    "npc_mia::npc_georgia": {"trust": 60, "affection": 55, "compatibility": 58},
    "npc_michael::npc_georgia": {"trust": 78, "respect": 82, "affection": 58, "compatibility": 70},
    "npc_rebecca::npc_georgia": {"trust": 30, "respect": 55, "compatibility": 28, "stress": 18},
    "npc_peter::npc_michael": {"trust": 62, "respect": 70, "compatibility": 55, "stress": 10},
    "npc_ari::npc_chloe": {"trust": 55, "affection": 40, "compatibility": 58, "respect": 45},
}

# Per-checkpoint pre-scene cognition. Canon-grounded: background knowledge the
# actor already holds when the checkpoint opens; no invented events.
COGNITION = {
    "checkpoint_interview": {
        "npc_georgia": [
            {"kind": "belief", "text": "The BI team needs someone who documents how the work actually happens, not another dashboard builder.", "confidence": 0.8},
            {"kind": "interpretation", "text": "The interview list is full of polished CVs and short on people who ask what the data is hiding.", "confidence": 0.6},
        ],
        "npc_sarah": [
            {"kind": "memory", "text": "Alex was around for the Guildhall's opening period: good in a rush, allergic to being managed.", "confidence": 0.9},
        ],
        "npc_ethan": [
            {"kind": "belief", "text": "Alex interviews better than he thinks he does.", "confidence": 0.7},
        ],
        "npc_olivia": [
            {"kind": "belief", "text": "Alex brings the same careful curiosity to everything he takes apart; a company would be lucky to get it.", "confidence": 0.7},
        ],
        "npc_emilee": [
            {"kind": "observation", "text": "A 15:00 interview candidate, black clothes, arrived early, was polite to reception.", "confidence": 0.95},
        ],
    },
    "checkpoint_job_offer": {
        "npc_georgia": [
            {"kind": "communication", "text": "Offered Alex the BI Data Analyst role; he accepted and starts Monday 17 August.", "confidence": 1.0},
            {"kind": "interpretation", "text": "Now to find out what he can actually carry before the machine puts weight on him.", "confidence": 0.6},
        ],
        "npc_david": [
            {"kind": "observation", "text": "Georgia's new analyst starts Monday; the timing will be tight but survivable.", "confidence": 0.8},
        ],
        "npc_sarah": [
            {"kind": "communication", "text": "Heard Alex got the corporate job and will want to celebrate somewhere with decent gin.", "confidence": 0.85},
        ],
    },
    "checkpoint_first_day": {
        "npc_georgia": [
            {"kind": "belief", "text": "The first week decides whether an analyst asks real questions or performs competence.", "confidence": 0.75},
            {"kind": "observation", "text": "New analyst on the floor: early, quiet, reading the room before touching anything.", "confidence": 0.8},
        ],
        "npc_emilee": [
            {"kind": "observation", "text": "New BI starter, black clothes, polite, arrived before his manager.", "confidence": 0.95},
        ],
        "npc_mia": [
            {"kind": "communication", "text": "The new analyst took the corner table on day one and tipped like a human being.", "confidence": 0.9},
        ],
        "npc_erin": [
            {"kind": "observation", "text": "BI's new starter has already read the onboarding wiki, which nobody does.", "confidence": 0.8},
        ],
    },
    "checkpoint_networking": {
        "npc_chloe": [
            {"kind": "observation", "text": "Georgia's new analyst is the one in black who looks like he would rather be fixing something.", "confidence": 0.7},
            {"kind": "interpretation", "text": "This event needs one more real person in it or it will be entirely laminates.", "confidence": 0.6},
        ],
        "npc_georgia": [
            {"kind": "interpretation", "text": "One more hour of small talk, then home to the W124 and the mapping project.", "confidence": 0.8},
            {"kind": "belief", "text": "Alex survived the first week without performing competence; that buys him real questions.", "confidence": 0.7},
        ],
        "npc_ari": [
            {"kind": "observation", "text": "Chloe is working the room on behalf of an agency; the tall drink of water with her is someone's new analyst.", "confidence": 0.6},
        ],
    },
}
