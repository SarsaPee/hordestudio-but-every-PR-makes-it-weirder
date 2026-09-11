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
        // These shapes are private to the preserved runtime. The host sees one
        // `experimentalWorlds` mode and must never receive its internal route
        // names or ScenePulse presentation theme.
        'view', 'theme'
    ]);
    const SHARED_KEYS = new Set([
        'globalSettings', 'roleplayOSSources', 'systemPresets', 'chatContinuities'
    ]);
    const OBJECT_KEYS = new Set(['worldInstances', 'worldRecoverySnapshots', 'worldMediaAssets', 'workspace']);
    let binding = null;

    function defaultValue(key) {
        if (key === 'worlds') return [];
        if (OBJECT_KEYS.has(key)) return {};
        if (key === 'view') return 'worlds';
        if (key === 'theme') return 'default';
        return null;
    }

    function normalizedExperimentalState(nextState) {
        const source = nextState && typeof nextState === 'object' ? nextState : {};
        const next = Object.fromEntries([...EXPERIMENTAL_KEYS].map(key => [key,
            source[key] == null ? defaultValue(key) : structuredClone(source[key])
        ]));
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
            experimental = normalizedExperimentalState(nextState);
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
