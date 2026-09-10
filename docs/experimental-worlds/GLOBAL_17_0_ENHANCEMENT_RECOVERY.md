# Global 17.0 Enhancement Recovery

This is the active recovery list for the host-only pass.  It is derived from
the three local source trees, not release notes:

| Source | Role |
| --- | --- |
| `hordestudio live instance v2-pre17.4-20260909-1700` | authoritative custom 17.0-era implementation |
| `hordestudio-17.0.0` | clean upstream comparison point |
| `hordestudio-17.4.0` | native host being recovered |

Experimental Worlds is intentionally not registered, mounted, migrated, or
loaded during this pass.  The current host remains usable without it.

| Global behavior | Custom source evidence | Native 17.4 baseline | Recovery decision | Status |
| --- | --- | --- | --- | --- |
| Settings shell, navigation, common interaction UI | custom `index.html`, `style.css`, `app.js` | Current 17.4 Settings and application shell | Keep 17.4 as the owner; recover only the persisted global sidebar collapse behavior. | Complete — final source audit recorded below |
| OpenRouter provider routing and endpoint metadata | custom `app.js` OpenRouter routing block and `global-openrouter-routing` panel | 17.4 has provider/model selection but no routing policy or provider-endpoint metadata controls | Port the existing **global** routing policy, shared catalog, endpoint lookup, ordered fallback UI, and request adapter into the 17.4 Settings path. Do not port World/Sidecar-specific routing here. | Complete — browser-accepted real post-reload inference and endpoint refresh; shared routing now serves all host modes |
| Provider compatibility and request normalization | custom provider helpers and current Settings | 17.4 has newer multi-provider support, including HotAPI | Retain 17.4's provider matrix; the recovered routing adapter decorates only ordinary global OpenRouter completions and never replaces an explicit request provider. | Complete — user browser acceptance of post-reload Virtual Human and World inference |
| IndexedDB full backup/restore/transfer | custom `exportFullBackup` / `importFullBackup`, `HordeDB` payloads | 17.4 already adds chat attachment media to the full backup | The native host is the first opaque registered backup domain. New exports use a checksummed domain manifest; validation, stage, preimage, commit, rollback, journal cleanup, and readback are wired for the host domain. Experimental has not registered or migrated yet. | Complete — user browser acceptance of full recovery/backup behavior |
| Generic media/files and image transport | custom `fileAsDataUrl`, companion audio capture/upload, Tavern import | 17.4 has the same file/audio and Tavern-import implementations, plus newer host media handling | Keep the native 17.4 implementations. Direct local function comparison found no custom delta to carry; Experimental visual authoring is excluded. | Retained by native 17.4 |
| Maps and common location services | custom World map services | 17.4 native stock World/map services | Keep the native 17.4 services. The custom map behavior is World-domain and therefore deferred with Experimental rather than promoted to the host. | Classified |
| Shared library/recovery UX and application-wide diagnostics | custom shared-library snapshot/mirror helpers | 17.4 host equivalents | Recover as a current-42069 rolling, transferable recovery library backed by opaque domain-backup manifests. Keep retained recovery points, per-device labels, manual pull/restore and publish policies. Do not auto-pull, arbitrate authority by revision, or access legacy 43127 state; credentials remain excluded. | Recovered in current host pass |

## Guardrails

- Native 17.4 Chat, Virtual Human, Worlds, Video, Pip, Settings, providers,
  media, bridge, and packaging remain the host baseline.
- A matching feature name is not sufficient to discard custom behavior. Each
  row is decided from source and caller comparison.
- A custom behavior is not copied merely because it is old. If 17.4 supplies
  the complete behavior, the 17.4 implementation wins.
- No Experimental script, stylesheet, navigation entry, database, backup
  domain, or migration is active in this host-only pass.
- Credentials remain out of all backups and commits.
- The shipped 42069 host does not look up or contact the old 43127 origin.

## Final post-split global audit — 2026-09-11

This audit compares the authoritative pre-17.4 source history against the
native 17.4 host, after excluding the explicitly deferred Experimental World
runtime. It is intentionally feature-sized: a changed old file or commit is
not treated as a mandate to revive its implementation.

| Candidate from the old live history | Final decision | Reason |
| --- | --- | --- |
| Settings shell, global navigation preference, common controls | Retained / recovered | Native 17.4 owns the shell. The only distinct retained custom behavior was the persisted sidebar-collapse preference. |
| OpenRouter routing, provider metadata, per-role routing and model discovery | Recovered | One shared host catalog and routing layer now backs Settings, Virtual Humans, Worlds and Studio. Endpoint selection controls use model-specific refreshed availability. |
| Provider request normalization and the 45-second cloud idle boundary | Retained / intentionally fixed | 17.4 retains its broader provider matrix and the inherited 45-second cloud cutoff. The old optional 0–600-second timeout control is not carried forward. |
| Versioned shared-library sync and backup policy | Superseded | The rolling transferable recovery library is the current-42069 replacement: named recovery points, explicit publish/pull/restore and credential exclusion. The old automatic bridge mirror is intentionally not revived. |
| MagicDNS bridge-origin inference | Excluded | The host keeps an explicit bridge URL setting and fresh-origin isolation. Automatic origin rewriting is not required for the accepted recovery/remote-client workflow. |
| Global Sidecar consolidation/vector controls | Experimental-owned | These settings operate the Sidecar memory graph and its World jobs. They move only with the frozen Experimental runtime, not into the clean 17.4 host pass. |
| Persona-generation reasoning/provenance checkbox | Excluded | This was a narrowly scoped authoring option, not an independently accepted global-host requirement. It is not revived by default. |
| Generic media/files/audio/import, maps, dialogs, Video, Pip, multiplayer, bridge and packaging | Native 17.4 retained | Source comparison found no distinct global custom delta worth carrying over the native 17.4 implementation. |

Conclusion: the accepted host-global feature set is closed. Any later request
to recover an excluded item is a new, explicit feature request; it is not a
missing prerequisite to attaching Experimental Worlds.
