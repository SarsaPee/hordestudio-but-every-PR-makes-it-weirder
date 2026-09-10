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
        'editingWorld', 'lastWorldStudioId', 'lastWorldStudioTab'
    ]);
    const SHARED_KEYS = new Set([
        'globalSettings', 'roleplayOSSources', 'systemPresets', 'chatContinuities',
        'characters', 'chats', 'personas', 'activePersonaId', 'activeSessionId',
        'activeCharId', 'activeRoomId', 'rooms', 'theme', 'view'
    ]);
    let binding = null;
    let experimental = Object.fromEntries([...EXPERIMENTAL_KEYS].map(key => [key,
        key === 'worlds' ? [] : key === 'worldInstances' || key === 'worldRecoverySnapshots' ? {} : null
    ]));

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
        if (EXPERIMENTAL_KEYS.has(key)) experimental[key] = value;
        else configured().writeShared(key, value);
        return true;
    }

    global.ExperimentalWorldsStateAdapter = Object.freeze({
        configure(nextBinding) {
            if (!nextBinding || typeof nextBinding.readShared !== 'function' || typeof nextBinding.writeShared !== 'function') {
                throw new Error('Experimental Worlds state adapter requires shared read and write bindings.');
            }
            binding = Object.freeze({ readShared: nextBinding.readShared, writeShared: nextBinding.writeShared });
        },
        hydrate(nextState) {
            const source = nextState && typeof nextState === 'object' ? nextState : {};
            experimental = Object.fromEntries([...EXPERIMENTAL_KEYS].map(key => [key,
                source[key] == null
                    ? (key === 'worlds' ? [] : key === 'worldInstances' || key === 'worldRecoverySnapshots' ? {} : null)
                    : structuredClone(source[key])
            ]));
        },
        snapshot() { return structuredClone(experimental); },
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
