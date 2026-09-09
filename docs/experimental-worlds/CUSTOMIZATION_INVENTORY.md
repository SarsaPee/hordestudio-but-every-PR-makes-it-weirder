# Customization inventory — one-app correction

This is an executable ownership ledger, not a claim of byte-identical stock.
The preserved runtime is an oracle until each Experimental Worlds row has a
native counterpart and browser proof.

| feature | actual source/callers | current user-visible behavior | owner/destination | upstream overlap | data affected | preservation test | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Current shell, Chat, VH, Video and stock Worlds | root `app.js`, `index.html`, v17.4 base | current 17.4 experiences | upstream host | direct | host records/media | same-document navigation U01/U02 | retained |
| Global settings and OpenRouter/provider routing | root provider helpers and Settings UI | one configured provider/model policy | shared host service | upstream with local improvements | `globalSettings`, session credentials | common Settings + request trace U04/U05 | retained host path; custom diff audit pending |
| Full backup/restore and transfer | root backup UI plus `shared/global-backup-coordinator.js` | one export/import entry point | shared host coordinator | extended | all host data, experimental partition, referenced media | delete/restore/fresh-profile U08-U10 | native partition added; browser proof pending |
| Stock Worlds repository | root `state.worlds`, `HordeStudioHostDB` | ordinary upstream Worlds | host-only domain | direct | stock worlds/sessions/media | collision/prune isolation U07 | isolated by database name |
| Experimental World/session/timeline records | preserved runtime plus `experiences/experimental-worlds/persistence` | alternate World domain | Experimental Worlds | none | worlds, instances, media, legacy alternatives | import/readback and cross-domain deletion U07/U11 | repository and controlled same-origin importer added |
| ScenePulse, Sidecar, Reader, graduation, memory, travel, mechanics and visuals | preserved runtime `app.js`, `scenepulse/`, `world-mechanics.js` | custom World experience | Experimental Worlds modules | domain-specific | experimental world histories and media | U12-U15 browser matrix | extraction pending; reference retained |
| Generic media/maps/files | root helpers and bridge | common asset/provider utilities | host unless World semantics are explicit | mixed | host assets/settings | asset isolation + host smoke U06/U07 | caller audit pending |
| Custom global UI/sidebar/dialog work | preserved source vs root UI | shared shell affordances | host shared UI | mixed | settings only | disabled-mode host UI smoke U06 | caller audit pending |
| Legacy mirrors/origin snapshots | old `localhost`/`127.0.0.1` exports and bridge files | recovery artifacts only | migration/backup tooling | none | historical state/media | provenance report + idempotent import U11 | no automatic authority selection |

## Non-negotiable boundary

`experiences/experimental-worlds/runtime/` is reference-only and is excluded
from portable builds. It may not be imported by the native entry point, served
as an alternate document, or used as a provider/settings/backup dependency.
