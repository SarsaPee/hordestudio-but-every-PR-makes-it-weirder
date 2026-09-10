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
| Settings shell, navigation, common interaction UI | custom `index.html`, `style.css`, `app.js` | Current 17.4 Settings and application shell | Keep 17.4 as the owner; carry only identified custom behavior that is absent after direct comparison. | In progress |
| OpenRouter provider routing and endpoint metadata | custom `app.js` OpenRouter routing block and `global-openrouter-routing` panel | 17.4 has provider/model selection but no routing policy or provider-endpoint metadata controls | Port the existing **global** routing policy, catalog, endpoint lookup, ordered fallback UI, and request adapter into the 17.4 Settings path. Do not port World/Sidecar-specific routing here. | Next implementation unit |
| Provider compatibility and request normalization | custom provider helpers and current Settings | 17.4 has newer multi-provider support, including HotAPI | Retain 17.4's provider matrix; merge only custom OpenRouter routing and any missing generic normalization after call-site comparison. | In progress |
| IndexedDB full backup/restore/transfer | custom `exportFullBackup` / `importFullBackup`, `HordeDB` payloads | 17.4 already adds chat attachment media to the full backup | The native host is now registered as the first opaque backup domain. New exports use a checksummed domain manifest; validation, stage, preimage, commit, rollback, journal cleanup, and readback are wired for the host domain. Experimental has not registered or migrated yet. | In progress — host proof next |
| Generic media/files and image transport | custom global image/media helpers | 17.4 current media and provider services | Compare concrete helpers and retain only behavior absent from 17.4; Experimental visual authoring is excluded. | Pending inventory |
| Maps and common location services | custom Settings and bridge helpers | 17.4 bridge/settings map services | Compare concrete provider setup and map-file behavior; preserve the stronger host behavior without carrying any World-domain renderer. | Pending inventory |
| Shared library/recovery UX and application-wide diagnostics | custom workspace/recovery helpers | 17.4 host equivalents | Reconcile only if the custom behavior is genuinely global and has a current 17.4 insertion point. | Pending inventory |

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
