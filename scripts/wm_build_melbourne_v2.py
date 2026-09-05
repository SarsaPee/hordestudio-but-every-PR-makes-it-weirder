#!/usr/bin/env python3
"""Melbourne Canonical v2 builder.

Consumes /tmp/wm_rewrite_data.py (authored content) plus the canonical live
export and assembles the rebuilt native world_mechanics_v1 document:
  - fully reciprocal structured exits with real walking baselines
  - dual-schema traversal (live traversalConfig.methods + forward traversalMethods)
  - expanded characters (persona / goalSteps / goalPool / schedules, legacy
    tag fields migrated to lore and removed)
  - mega pack baked into the lorebook (ST import conversion, byte-compatible
    with app.js importStWorldInfoPack)
  - four checkpoint overlays restored and extended with NPC axes + cognition
"""
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from wm_rewrite_data import EDGES, TRAVERSAL, CHARACTERS, LEGACY_LORE, NPC_AXES, COGNITION

PROJECT = "/Users/davidmigdale/Documents/Horde Studio Project"
BASE = os.path.join(PROJECT, "hordestudio live instance v2", "Melbourne_—_Canonical.horde_world")
OVERLAYS = os.path.join(PROJECT, "hordestudio live instance v2", "scripts", "wm_checkpoint_overlays.json") if os.path.exists(os.path.join(PROJECT, "hordestudio live instance v2", "scripts", "wm_checkpoint_overlays.json")) else "/tmp/wm_checkpoint_overlays.json"
PACK = os.path.join(PROJECT, "BunnyRX Melbourne Mega Pack - Foldered Modular v2.json")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/Melbourne_v2_build.horde_world"

RELATIONSHIP_AXES = {"trust", "affection", "desire", "stress", "compatibility", "respect"}

doc = json.load(open(BASE))
overlays = json.load(open(OVERLAYS))

locations = {loc["id"]: loc for loc in doc["locations"]}
entities = {ent["id"]: ent for ent in doc["entities"]}
problems = []


def fail(msg):
    problems.append(msg)


# ---------------------------------------------------------------------------
# 1. Junk entity: empty-name item created by the original import; referenced
#    nowhere else in the document. Drop it.
# ---------------------------------------------------------------------------
doc["entities"] = [e for e in doc["entities"] if e["id"] != "ent_1788593847967"]
entities.pop("ent_1788593847967", None)

# ---------------------------------------------------------------------------
# 2. Exits — rebuild from EDGES, fully reciprocal, structured objects.
#    Live-native shape plus a `to` (target name) field for the narrator packet.
# ---------------------------------------------------------------------------
for a, b, minutes, text_a, text_b in EDGES:
    if a not in locations:
        fail(f"edge references unknown location {a}")
        continue
    if b not in locations:
        fail(f"edge references unknown location {b}")
        continue

covered = set()
for a, b, minutes, text_a, text_b in EDGES:
    covered.add(a)
    covered.add(b)

for loc_id in locations:
    if loc_id not in covered:
        fail(f"location {loc_id} ({locations[loc_id]['name']}) has no authored edge")

for loc in doc["locations"]:
    loc["exits"] = []

for a, b, minutes, text_a, text_b in EDGES:
    for src, dst, text in ((a, b, text_a), (b, a, text_b)):
        locations[src]["exits"].append({
            "text": text,
            "to": locations[dst]["name"],
            "targetLocationId": dst,
            "mode": "walk",
            "travelTime": int(minutes),
            "routeName": "",
            "cost": "",
            "isOneWay": False,
        })

# Reciprocity round-trip: every exit must resolve and have a reverse exit.
for loc in doc["locations"]:
    for exit_obj in loc["exits"]:
        target = exit_obj["targetLocationId"]
        if target not in locations:
            fail(f"{loc['id']} exit targets unknown {target}")
            continue
        reverse = [e for e in locations[target]["exits"] if e["targetLocationId"] == loc["id"]]
        if not reverse:
            fail(f"one-way link: {loc['id']} -> {target} has no reverse")

# ---------------------------------------------------------------------------
# 3. Traversal — dual schema.
# ---------------------------------------------------------------------------
live_methods = []
rich_methods = []
for spec in TRAVERSAL:
    live = spec["live"]
    rich = spec["rich"]
    method_id = f"traversal_{spec['id']}"
    live_methods.append({
        "id": method_id,
        "name": spec["name"],
        "enabled": True,
        "coverageType": live["coverageType"],
        "exclusions": [],
        "routeStops": live.get("routeStops", []),
        "tags": live.get("tags", []),
        "provider": live.get("provider", ""),
        "notes": live["notes"][:1200],
    })
    rich_methods.append({
        "id": method_id,
        "name": spec["name"],
        "type": spec["type"],
        "coverage": rich["coverage"],
        **({"routeNodes": rich["routeNodes"]} if "routeNodes" in rich else {}),
        "authority": rich["authority"],
        "journeyMode": rich["journeyMode"],
        "time": rich["time"],
    })
    for stop in live.get("routeStops", []) + rich.get("routeNodes", []):
        if stop not in locations:
            fail(f"traversal {method_id} references unknown stop {stop}")

doc["traversalConfig"] = {"schemaVersion": 1, "methods": live_methods}
doc["traversalMethods"] = rich_methods

# ---------------------------------------------------------------------------
# 4. Characters — personas, goals, schedules; strip legacy tag fields.
# ---------------------------------------------------------------------------
for ent_id, spec in CHARACTERS.items():
    if ent_id not in entities:
        fail(f"character {ent_id} not found in document")
        continue
    ent = entities[ent_id]
    ent["persona"] = spec["persona"]
    ent["goal"] = spec["goal"]
    ent["goalSteps"] = spec["goalSteps"]
    ent["goalPool"] = spec["goalPool"]
    ent["goalAutonomy"] = "high"
    for block in spec["schedule"]:
        if block["locationId"] not in locations:
            fail(f"{ent_id} schedule block references unknown location {block['locationId']}")
    ent["schedule"] = spec["schedule"]

# Legacy field migration: Sarah's tag-system markers and Chloe's
# substanceProfile become lore (LEGACY_LORE) — the fields themselves go.
if "tags" in entities.get("npc_sarah", {}):
    entities["npc_sarah"]["tags"] = []
if "substanceProfile" in entities.get("npc_chloe", {}):
    del entities["npc_chloe"]["substanceProfile"]

# ---------------------------------------------------------------------------
# 5. Lorebook — base entries + legacy migration lore + mega pack conversion.
#    Conversion replicates app.js importStWorldInfoPack exactly.
# ---------------------------------------------------------------------------
lore = list(doc["lorebook"])
lore_ids = {entry["id"] for entry in lore}

for entry in LEGACY_LORE:
    if entry["id"] in lore_ids:
        fail(f"lore id collision: {entry['id']}")
        continue
    lore.append({"id": entry["id"], "keyword": entry["keyword"], "text": entry["text"]})
    lore_ids.add(entry["id"])


def sanitize_id(value):
    return re.sub(r"[^a-zA-Z0-9_-]", "_", value)


def convert_st_pack(world_lore, existing_ids, raw_data):
    """Python twin of importStWorldInfoPack in app.js."""
    if not isinstance(raw_data, dict):
        return [], 0, "not a JSON object"
    raw_entries = raw_data.get("entries")
    if isinstance(raw_entries, dict):
        raw_entries = list(raw_entries.values())
    if not isinstance(raw_entries, list):
        return [], 0, 'no "entries" field — not a SillyTavern world-info pack'
    pack_name = re.sub(r"[^a-z0-9_-]+", "_", str(raw_data.get("name") or "pack"), flags=re.IGNORECASE)
    pack_name = re.sub(r"^_+|_+$", "", pack_name)[:40] or "pack"
    added, skipped = [], 0
    for index, raw in enumerate(raw_entries):
        if not isinstance(raw, dict):
            skipped += 1
            continue
        text = str(raw.get("content") or "").strip()
        if not text or raw.get("disable") is True:
            skipped += 1
            continue
        if len(world_lore) + len(added) >= 2000:
            skipped += 1
            continue
        keys = raw.get("key")
        keys = keys if isinstance(keys, list) else [keys]
        keys = [str(k or "").strip() for k in keys if str(k or "").strip()]
        keyword = ",".join(keys)[:2000]
        if not keyword:
            comment_words = re.split(r"\s+", re.sub(r"[^A-Za-z0-9 ]+", " ", str(raw.get("comment") or "")))
            keyword = ",".join([w for w in comment_words if w][:5])[:2000]
        uid = raw.get("uid")
        entry_id = sanitize_id(f"st_{pack_name}_{uid if isinstance(uid, (int, float)) else index}")
        while entry_id in existing_ids:
            entry_id += "_"
        existing_ids.add(entry_id)
        entry = {"id": entry_id, "keyword": keyword, "text": text}
        if raw.get("constant") is True:
            entry["constant"] = True
        probability = raw.get("probability")
        if isinstance(probability, (int, float)) and 0 <= probability <= 100:
            entry["probability"] = probability
        added.append(entry)
    return added, skipped, None


pack_data = json.load(open(PACK))
added, skipped, pack_error = convert_st_pack(lore, lore_ids, pack_data)
if pack_error:
    fail(f"mega pack conversion error: {pack_error}")
lore.extend(added)
doc["lorebook"] = lore

# ---------------------------------------------------------------------------
# 6. Checkpoint overlays — restore + extend.
#    relationships: existing player axes (kept verbatim) + NPC_AXES (both
#    authored directions) + the Chloe/Georgia working acquaintance the
#    networking checkpoint is built on. actorCognition: per-checkpoint.
# ---------------------------------------------------------------------------
# Chloe produces the M&M event and pulls Georgia through it intact: a
# professional working acquaintance, background state at every checkpoint.
NPC_AXES = dict(NPC_AXES)
NPC_AXES["npc_chloe::npc_georgia"] = {"trust": 45, "respect": 52, "compatibility": 42}
NPC_AXES["npc_georgia::npc_chloe"] = {"trust": 42, "respect": 48, "compatibility": 38}

for key, axes in NPC_AXES.items():
    left, _, right = key.partition("::")
    if left not in entities or right not in entities:
        fail(f"NPC axis {key} references unknown entity")
        continue
    for axis in axes:
        if axis not in RELATIONSHIP_AXES:
            fail(f"NPC axis {key} uses unknown axis {axis}")

lives = {life["id"]: life for life in doc["startingLives"]}
for cp_id, cognition in COGNITION.items():
    if cp_id not in lives:
        fail(f"cognition authored for unknown checkpoint {cp_id}")
        continue
    if cp_id not in overlays:
        fail(f"no base overlay for {cp_id}")
        continue
    base_overlay = json.loads(json.dumps(overlays[cp_id]))
    relationships = dict(base_overlay.get("relationships") or {})
    for key, axes in NPC_AXES.items():
        relationships[key] = dict(axes)
    for actor_id, records in cognition.items():
        if actor_id not in entities:
            fail(f"cognition for {cp_id} references unknown actor {actor_id}")
    base_overlay["relationships"] = relationships
    base_overlay["actorCognition"] = cognition
    if base_overlay.get("startLocationId") not in locations:
        fail(f"overlay {cp_id} start location unknown")
    lives[cp_id]["checkpointOverlay"] = base_overlay

for life in doc["startingLives"]:
    if "checkpointOverlay" not in life:
        fail(f"starting life {life['id']} has no checkpoint overlay after build")

# ---------------------------------------------------------------------------
# 7. Native profile (already world_mechanics_v1 in the base export — assert).
# ---------------------------------------------------------------------------
if doc.get("mechanicsProfile") != "world_mechanics_v1":
    doc["mechanicsProfile"] = "world_mechanics_v1"

# ---------------------------------------------------------------------------
# Report + write.
# ---------------------------------------------------------------------------
print(f"locations: {len(doc['locations'])}, exits: {sum(len(l['exits']) for l in doc['locations'])}")
print(f"traversal methods: {len(live_methods)} (live) / {len(rich_methods)} (forward)")
print(f"entities: {len(doc['entities'])} (authored: {len(CHARACTERS)})")
print(f"lorebook: {len(lore)} total = 14 base + {len(LEGACY_LORE)} legacy + {len(added)} pack added, {skipped} skipped")
overlay_counts = {life["id"]: len(lives[life["id"]]["checkpointOverlay"]["relationships"]) for life in doc["startingLives"]}
print(f"overlay relationship keys per checkpoint: {overlay_counts}")
cog_counts = {cp: sum(len(v) for v in COGNITION[cp].values()) for cp in COGNITION}
print(f"cognition records per checkpoint: {cog_counts}")

if problems:
    print("\nPROBLEMS:")
    for p in problems:
        print("  -", p)
    sys.exit(1)

with open(OUT, "w") as fh:
    json.dump(doc, fh, ensure_ascii=False, indent=2)
print(f"\nwrote {OUT} ({len(json.dumps(doc))} bytes compact)")
