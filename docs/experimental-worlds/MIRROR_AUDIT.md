# Recovery-mirror lineage audit

Read-only audit on 9 September 2026. No mirror was overwritten.

| Snapshot | Origin and lineage | Worlds / histories / media | Result |
| --- | --- | --- | --- |
| Preserved legacy mirror | Backup of `Horde Studio/shared-library.json`, revision 411, browser writer, 00:37 UTC. | 5 worlds, 3 world-instance stores, 18 histories, 133 messages, 21 media assets. | Authority snapshot retained. |
| Current legacy mirror | Live `Horde Studio/shared-library.json`, revision 416, browser writer, 02:07 UTC. | Same five stable world identities and the same coverage counts as the preserved snapshot. | It advanced after preservation; revision alone is not a cutover rule. |
| Experimental namespace | `Horde Studio/experimental-worlds/shared-library.json`, revision 1, opaque device writer, 01:18 UTC. | 5 worlds, 1 world-instance store, 1 history, no messages, 13 media assets. Four world identities match the legacy snapshot; one differs, and one matching world has fewer entities/locations. | Valid distinct snapshot, not a copy failure. Do not overwrite. |
| Browser authority backup | Preserved Chrome IndexedDB and blobs for `http://localhost:43127`. | Separate origin backup contains the browser-owned experimental state and media blobs. | Remains the required readback authority before reconciliation. |

The experimental namespace timestamp falls between the preserved legacy backup
and the later live legacy mirror, and its opaque writer plus reduced history
coverage are consistent with a staging/browser snapshot rather than a complete
copy of the live mirror. That is an inference, not a reconciliation decision.
The browser backup must be reopened/read before choosing a merge or cutover
strategy. A larger revision number is not used to choose a winner.
