/*
 * Deliberate state boundary for the mechanically relocated Experimental
 * Worlds core. The core owns its World/session workspace in this adapter and
 * receives only a short allow-list of genuinely shared host records. The host
 * may import an initial snapshot, but it is not the live state authority.
 */
(function registerExperimentalWorldsStateAdapter(global) {
    'use strict';

    const EXPERIMENTAL_KEYS = new Set([
        'worlds', 'worldInstances', 'activeWorldId', 'worldRecoverySnapshots',
        'worldMediaAssets', 'workspace',
        'editingWorld', 'lastWorldStudioId', 'lastWorldStudioTab',
        // Module-owned global Roleplay OS source registry (imported FF source
        // presets). Deliberately NOT a shared host record: an import copies
        // the preset into this module's own database exactly once and travels
        // with Experimental Worlds snapshots and backups.
        'roleplayOSSources',
        // Saved provider model catalogs, in the Virtual Human record layout
        // ({version, fetchedAt, models}). This is the module's own instance:
        // it never reads or writes the host's globalSettings catalog.
        'savedModelCatalogs',
        // These shapes are private to the preserved runtime. The host sees one
        // `experimentalWorlds` mode and must never receive its internal route
        // names or ScenePulse presentation theme.
        'view', 'theme'
    ]);
    const SHARED_KEYS = new Set([
        'globalSettings', 'systemPresets', 'chatContinuities'
    ]);
    const OBJECT_KEYS = new Set(['worldInstances', 'worldRecoverySnapshots', 'worldMediaAssets', 'workspace', 'savedModelCatalogs']);
    let binding = null;

    function defaultValue(key) {
        if (key === 'worlds' || key === 'roleplayOSSources') return [];
        if (OBJECT_KEYS.has(key)) return {};
        if (key === 'view') return 'worlds';
        if (key === 'theme') return 'default';
        return null;
    }

    function normalizedExperimentalState(nextState, { seedLegacySources = false } = {}) {
        const source = nextState && typeof nextState === 'object' ? nextState : {};
        const next = Object.fromEntries([...EXPERIMENTAL_KEYS].map(key => [key,
            source[key] == null ? defaultValue(key) : structuredClone(source[key])
        ]));
        // One-time legacy seed: older builds routed the Roleplay OS source
        // registry through host shared state. If this module's own copy is
        // empty, adopt whatever the host had installed. The host record is
        // never written back and future imports stay module-owned.
        if (seedLegacySources && Array.isArray(next.roleplayOSSources) && !next.roleplayOSSources.length && binding) {
            try {
                const legacy = binding.readShared('roleplayOSSources');
                if (Array.isArray(legacy) && legacy.length) next.roleplayOSSources = structuredClone(legacy);
            } catch (_) { /* host binding unavailable or refused; start empty. */ }
        }
        return next;
    }

    let experimental = normalizedExperimentalState({});

    function configured() {
        if (!binding) throw new Error('Experimental Worlds state adapter has not been configured.');
        return binding;
    }

    function readable(key) {
        if (!EXPERIMENTAL_KEYS.has(key) && !SHARED_KEYS.has(key)) {
            throw new Error(`Experimental Worlds requested undeclared host state: ${String(key)}`);
        }
        return EXPERIMENTAL_KEYS.has(key) ? experimental[key] : configured().readShared(key);
    }

    function writable(key, value) {
        if (!EXPERIMENTAL_KEYS.has(key) && !SHARED_KEYS.has(key)) {
            throw new Error(`Experimental Worlds attempted to write undeclared host state: ${String(key)}`);
        }
        if (EXPERIMENTAL_KEYS.has(key)) {
            if (key === 'workspace') {
                const workspace = value && typeof value === 'object' ? value : {};
                experimental.workspace = workspace;
            } else {
                experimental[key] = value;
            }
        } else configured().writeShared(key, value);
        return true;
    }

    global.ExperimentalWorldsStateAdapter = Object.freeze({
        configure(nextBinding) {
            if (!nextBinding || typeof nextBinding.readShared !== 'function' || typeof nextBinding.writeShared !== 'function') {
                throw new Error('Experimental Worlds state adapter requires shared read and write bindings.');
            }
            binding = Object.freeze({
                readShared: nextBinding.readShared,
                writeShared: nextBinding.writeShared
            });
        },
        hydrate(nextState) {
            experimental = normalizedExperimentalState(nextState, { seedLegacySources: true });
        },
        snapshot() { return structuredClone(experimental); },
        workspace() { return structuredClone(experimental.workspace); },
        setWorkspace(nextWorkspace) { writable('workspace', structuredClone(nextWorkspace || {})); },
        isConfigured: () => Boolean(binding),
        experimentalKeys: () => [...EXPERIMENTAL_KEYS],
        sharedKeys: () => [...SHARED_KEYS]
    });

    // Classic extracted scripts resolve this property as a global binding.
    // Nested World/session mutations continue to mutate the selected
    // Experimental record, while assignment itself remains checked above.
    global.ExperimentalWorldsState = new Proxy({}, {
        get: (_target, key) => typeof key === 'string' ? readable(key) : undefined,
        set: (_target, key, value) => writable(key, value),
        has: (_target, key) => typeof key === 'string' && (EXPERIMENTAL_KEYS.has(key) || SHARED_KEYS.has(key))
    });
})(globalThis);
