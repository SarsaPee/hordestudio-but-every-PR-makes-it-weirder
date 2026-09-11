/* Lightweight Experimental Worlds registration and persistence lifecycle.
 *
 * This adapter is intentionally safe to load during ordinary Horde Studio
 * bootstrap. It opens the independent data authority, registers its opaque
 * backup domain, and exposes discoverability metadata without loading World
 * gameplay, ScenePulse, CSS, or DOM surfaces. */
(function installExperimentalWorldsPersistenceBootstrap(global) {
    'use strict';

    const DOMAIN_ID = 'experimental-worlds';
    const SCHEMA_VERSION = 1;
    const ACKNOWLEDGEMENT_VERSION = 1;
    const DESCRIPTOR = Object.freeze({
        id: DOMAIN_ID,
        label: 'Experimental Worlds',
        badge: 'EXPERIMENTAL',
        defaultEnabled: false,
        acknowledgementVersion: ACKNOWLEDGEMENT_VERSION,
        route: 'experimentalWorlds'
    });

    const clone = value => value == null ? value : structuredClone(value);
    let readFeatureState = () => ({});
    let lifecycle = Object.freeze({});
    let startPromise = null;
    let started = false;
    let unregisterDomain = null;
    let pendingStage = null;
    let lastSerializedMetadata = null;
    let persistTail = Promise.resolve();
    let quiescedTransactionId = null;
    let quiesceToken = null;

    function repository() {
        const value = global.ExperimentalWorldsRepository;
        if (!value) throw new Error('Experimental Worlds repository must load before its persistence bootstrap.');
        if (value.DB_NAME !== 'HordeStudioExperimentalWorldsDB') {
            throw new Error('Experimental Worlds persistence refused an unexpected database authority.');
        }
        return value;
    }

    function coordinator() {
        const value = global.HordeBackupDomains;
        if (!value || typeof value.register !== 'function') {
            throw new Error('The host backup-domain coordinator must load before Experimental Worlds persistence.');
        }
        return value;
    }

    function configure(options = {}) {
        if (!options || typeof options !== 'object') throw new Error('Experimental Worlds bootstrap options must be an object.');
        if (options.readFeatureState !== undefined) {
            if (typeof options.readFeatureState !== 'function') throw new Error('readFeatureState must be a function.');
            readFeatureState = options.readFeatureState;
        }
        if (options.lifecycle !== undefined) {
            if (!options.lifecycle || typeof options.lifecycle !== 'object') throw new Error('Experimental Worlds lifecycle must be an object.');
            for (const name of ['flush', 'quiesce', 'resume', 'captureSnapshot', 'applySnapshot']) {
                if (options.lifecycle[name] !== undefined && typeof options.lifecycle[name] !== 'function') {
                    throw new Error(`Experimental Worlds lifecycle ${name} must be a function.`);
                }
            }
            lifecycle = Object.freeze({ ...lifecycle, ...options.lifecycle });
        }
        return api;
    }

    function normalizedFeatureState() {
        let value = {};
        try { value = readFeatureState() || {}; }
        catch (error) { console.warn('Experimental Worlds feature state could not be read:', error); }
        const acknowledgement = Number(value.acknowledgementVersion) || 0;
        return Object.freeze({
            enabled: value.enabled === true,
            acknowledgementVersion: acknowledgement,
            acknowledged: acknowledgement >= ACKNOWLEDGEMENT_VERSION
        });
    }

    function runtimeStateFromStored(stored) {
        const data = repository().snapshotData(stored);
        const worlds = data.worlds.map(world => {
            const next = clone(world);
            const media = world?.id && Array.isArray(data.worldMediaAssets[world.id])
                ? data.worldMediaAssets[world.id] : null;
            if (media) next.mediaAssets = clone(media);
            return next;
        });
        return {
            ...data,
            worlds,
            generation: Number(stored?.generation) || 0,
            restoreGeneration: Number(stored?.restoreGeneration) || 0
        };
    }

    function storedStateFromRuntime(runtime, prior, workspaceOverride = null) {
        const live = runtime && typeof runtime === 'object' ? runtime : {};
        const previous = repository().snapshotData(prior);
        const media = clone(previous.worldMediaAssets);
        const worlds = Array.isArray(live.worlds) ? live.worlds.map(world => {
            const next = clone(world);
            if (world?.id && Array.isArray(next.mediaAssets)) media[world.id] = clone(next.mediaAssets);
            if (Array.isArray(next.mediaAssets)) next.mediaAssets = [];
            return next;
        }) : [];
        // Keep media for retained recovery snapshots. Ordinary deletion is not
        // permission to garbage-collect the last recoverable copy of an asset.
        // Workspace is owned and versioned by the mode. Preserve it opaquely;
        // the persistence seam must not narrow or reinterpret its route,
        // timeline, revision, Take, Attempt, or future fields.
        const workspace = workspaceOverride && typeof workspaceOverride === 'object'
            ? clone(workspaceOverride)
            : live.workspace && typeof live.workspace === 'object'
                ? clone(live.workspace)
                : clone(previous.workspace);
        return repository().validateSnapshot({
            worlds,
            worldInstances: clone(live.worldInstances || {}),
            activeWorldId: live.activeWorldId || null,
            worldRecoverySnapshots: clone(live.worldRecoverySnapshots || {}),
            worldMediaAssets: media,
            workspace,
            theme: typeof live.theme === 'string' ? live.theme : previous.theme
        }, 'runtime snapshot');
    }

    async function syncRuntimeFromRepository(snapshotValue = null) {
        const stored = snapshotValue || await repository().snapshot();
        const generation = Number(stored.restoreGeneration ?? await repository().restoreGeneration()) || 0;
        global.ExperimentalWorldsRestoreGeneration = generation;
        if (typeof lifecycle.applySnapshot === 'function') {
            await lifecycle.applySnapshot(runtimeStateFromStored(stored), {
                restoreGeneration: generation
            });
        }
        return stored;
    }

    async function ensureStarted() {
        if (!startPromise) throw new Error('Experimental Worlds persistence has not started.');
        return startPromise;
    }

    function assertQuiesced(transaction) {
        const id = String(transaction?.id || '');
        if (!id || quiescedTransactionId !== id) {
            throw new Error('Experimental Worlds restore attempted to mutate data outside its quiesced transaction.');
        }
    }

    async function serialize() {
        await ensureStarted();
        if (quiescedTransactionId) throw new Error('Experimental Worlds cannot export while a restore is active.');
        const restore = await repository().restoreStatus();
        if (restore.journal) {
            throw new Error('Experimental Worlds backup is blocked until the host resolves an interrupted restore decision.');
        }
        if (typeof lifecycle.flush === 'function') await lifecycle.flush({ reason: 'backup-export' });
        await persistTail;
        const stored = await repository().snapshot();
        const payload = repository().snapshotData(stored);
        lastSerializedMetadata = Object.freeze({
            generation: Number(stored.generation) || 0,
            restoreGeneration: Number(stored.restoreGeneration) || 0,
            worldCount: payload.worlds.length,
            instanceCount: Object.keys(payload.worldInstances).length,
            recoveryCount: Object.keys(payload.worldRecoverySnapshots).length,
            mediaWorldCount: Object.keys(payload.worldMediaAssets).length,
            hasWorkspace: Object.keys(payload.workspace).length > 0
        });
        return payload;
    }

    async function quiesce(transaction) {
        await ensureStarted();
        const id = String(transaction?.id || '');
        if (!id) throw new Error('Experimental Worlds quiesce requires a restore transaction.');
        if (quiescedTransactionId) throw new Error('Experimental Worlds is already quiesced by another restore.');
        let gateClosed = false;
        try {
            // Give the attached mode a chance to publish its pending workspace
            // debounce while normal writes are still accepted. Once that flush
            // and the shared write tail finish, close the gate before aborting
            // any remaining owned work.
            if (typeof lifecycle.flush === 'function') {
                await lifecycle.flush({ reason: 'restore-quiesce', transaction });
            }
            await persistTail;
            quiescedTransactionId = id;
            gateClosed = true;
            quiesceToken = typeof lifecycle.quiesce === 'function'
                ? await lifecycle.quiesce(transaction) : null;
        } catch (error) {
            try {
                if (gateClosed && typeof lifecycle.resume === 'function') {
                    await lifecycle.resume(transaction, quiesceToken);
                }
            } finally {
                quiesceToken = null;
                if (gateClosed) quiescedTransactionId = null;
            }
            throw error;
        }
    }

    async function resume(transaction) {
        const id = String(transaction?.id || '');
        if (!quiescedTransactionId) return;
        if (id && quiescedTransactionId !== id) {
            throw new Error('Experimental Worlds refused to resume another restore transaction.');
        }
        const token = quiesceToken;
        try {
            if (typeof lifecycle.resume === 'function') await lifecycle.resume(transaction, token);
        } finally {
            quiesceToken = null;
            quiescedTransactionId = null;
        }
    }

    const domain = Object.freeze({
        id: DOMAIN_ID,
        schemaVersion: SCHEMA_VERSION,
        serialize,
        describe: async () => ({ ...(lastSerializedMetadata || {}) }),
        validate: async payload => repository().validateSnapshot(payload, 'backup payload'),
        quiesce,
        async stage(payload, transaction) {
            assertQuiesced(transaction);
            pendingStage = await repository().stageRestore(payload, transaction);
            return clone(pendingStage);
        },
        async capturePreimage(transaction) {
            assertQuiesced(transaction);
            return repository().exportSnapshot();
        },
        async journal(phase, transaction, preimage) {
            assertQuiesced(transaction);
            await repository().noteRestorePhase(phase, transaction, preimage, pendingStage);
            if (phase === 'complete' || phase === 'rolled-back') pendingStage = null;
        },
        async commit(staged, transaction) {
            assertQuiesced(transaction);
            const result = await repository().applyStagedRestore(staged, transaction);
            await syncRuntimeFromRepository(result.snapshot);
        },
        async rollback(preimage, transaction) {
            assertQuiesced(transaction);
            const result = await repository().rollbackRestore(preimage, transaction);
            await syncRuntimeFromRepository(result.snapshot);
        },
        async readback(payload, transaction) {
            assertQuiesced(transaction);
            await repository().verifiedSnapshot(payload, 'backup restore');
        },
        async discardStage(staged, transaction) {
            assertQuiesced(transaction);
            await repository().discardStagedRestore(staged);
            if (!pendingStage || pendingStage.id === staged?.id) pendingStage = null;
        },
        async recover(transaction, decision) {
            await ensureStarted();
            const result = await repository().recoverRestoreDecision(transaction, decision);
            await syncRuntimeFromRepository(result.snapshot || null);
            pendingStage = null;
            return result;
        },
        resume
    });

    function registerDomain() {
        if (unregisterDomain) return false;
        const backupDomains = coordinator();
        if (backupDomains.registered().includes(DOMAIN_ID)) {
            throw new Error('The Experimental Worlds backup domain was registered by another owner.');
        }
        unregisterDomain = backupDomains.register(domain);
        return true;
    }

    async function start(options = {}) {
        configure(options);
        if (started) return discover();
        if (!startPromise) {
            startPromise = (async () => {
                repository();
                registerDomain();
                await repository().init();
                // Only an unjournalled stage is safe to discard locally. A
                // journalled cross-domain restore waits for the coordinator's
                // durable commit/rollback decision via domain.recover().
                const orphan = await repository().discardOrphanRestoreStage();
                const pending = await repository().restoreStatus();
                const recovery = {
                    recovered: orphan.discarded,
                    action: orphan.discarded ? 'discarded-orphan-stage' : null,
                    pendingDecision: Boolean(pending.journal),
                    transactionId: pending.journal?.transactionId || null
                };
                const stored = await syncRuntimeFromRepository();
                started = true;
                return { recovery, stored };
            })();
            startPromise.catch(() => { startPromise = null; });
        }
        await startPromise;
        return discover();
    }

    async function persist(reason = 'experimental-save', options = {}) {
        await ensureStarted();
        const acceptedRestoreGeneration = Number(global.ExperimentalWorldsRestoreGeneration) || 0;
        const operation = persistTail.then(async () => {
            if (quiescedTransactionId) throw new Error('Experimental Worlds persistence is quiesced for backup restore.');
            if ((Number(global.ExperimentalWorldsRestoreGeneration) || 0) !== acceptedRestoreGeneration) {
                throw new Error('Experimental Worlds rejected a stale write that crossed a restore.');
            }
            const prior = await repository().snapshot();
            const runtime = options.snapshot || (typeof lifecycle.captureSnapshot === 'function'
                ? await lifecycle.captureSnapshot({ reason }) : null);
            if (!runtime) {
                throw new Error('Experimental Worlds persistence needs an attached snapshot source or an explicit snapshot.');
            }
            const stored = storedStateFromRuntime(runtime, prior, options.workspace);
            const result = await repository().writeSnapshot(stored, reason);
            global.HordeRollingRecovery?.notePersisted?.();
            return result;
        });
        persistTail = operation.catch(() => {});
        return operation;
    }

    async function persistWorkspace(workspace, reason = 'workspace-change') {
        await ensureStarted();
        const acceptedRestoreGeneration = Number(global.ExperimentalWorldsRestoreGeneration) || 0;
        const operation = persistTail.then(async () => {
            if (quiescedTransactionId) throw new Error('Experimental Worlds persistence is quiesced for backup restore.');
            if ((Number(global.ExperimentalWorldsRestoreGeneration) || 0) !== acceptedRestoreGeneration) {
                throw new Error('Experimental Worlds rejected a stale workspace write that crossed a restore.');
            }
            const prior = await repository().snapshot();
            const stored = repository().validateSnapshot({
                ...prior,
                workspace: clone(workspace)
            }, 'workspace update');
            const result = await repository().writeSnapshot(stored, reason);
            global.HordeRollingRecovery?.notePersisted?.();
            return result;
        });
        persistTail = operation.catch(() => {});
        return operation;
    }

    async function snapshot() {
        await ensureStarted();
        return repository().snapshot();
    }

    async function runtimeSnapshot() {
        return runtimeStateFromStored(await snapshot());
    }

    async function discover() {
        await ensureStarted();
        const stored = await repository().snapshot();
        const restore = await repository().restoreStatus();
        return Object.freeze({
            ...DESCRIPTOR,
            ...normalizedFeatureState(),
            available: true,
            hasData: stored.worlds.length > 0,
            worldCount: stored.worlds.length,
            activeWorldId: stored.activeWorldId,
            workspace: clone(stored.workspace),
            generation: Number(stored.generation) || 0,
            restoreGeneration: Number(stored.restoreGeneration) || 0,
            recoveryPending: Boolean(restore.journal)
        });
    }

    function captureRestoreGeneration() {
        return Number(global.ExperimentalWorldsRestoreGeneration) || 0;
    }

    function isRestoreGenerationCurrent(value) {
        return Number(value) === captureRestoreGeneration();
    }

    // The lazily loaded mode receives this small facade instead of the raw
    // repository. Every runtime write then participates in quiescence,
    // generation fencing, media separation, and rolling-recovery dirtiness.
    const runtimeRepository = Object.freeze({
        snapshot: runtimeSnapshot,
        writeSnapshot: (value, reason = 'experimental-runtime') => persist(reason, { snapshot: value }),
        save: (value, reason = 'experimental-runtime') => persist(reason, { snapshot: value })
    });

    const api = Object.freeze({
        DOMAIN_ID, SCHEMA_VERSION, ACKNOWLEDGEMENT_VERSION, descriptor: DESCRIPTOR,
        configure, start, registerDomain, persist, persistWorkspace, snapshot, runtimeSnapshot,
        runtimeRepository, discover,
        captureRestoreGeneration, isRestoreGenerationCurrent,
        domainDefinition: domain
    });

    global.ExperimentalWorldsPersistenceBootstrap = api;
})(window);
