// Global backup coordination is deliberately separate from either World engine.
// The host owns the backup button; registered partitions supply their own
// validated data and media.  This module contains no UI or provider state.
const clone = value => value == null ? value : structuredClone(value);

function digest(value) {
    const source = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export class GlobalBackupCoordinator {
    constructor() {
        this.partitions = new Map();
        this.restoreGeneration = 0;
    }

    registerPartition(descriptor) {
        const required = ['id', 'exportData', 'validate', 'stageRestore', 'applyRestore'];
        if (!descriptor || required.some(key => typeof descriptor[key] !== 'function' && key !== 'id')) {
            throw new Error('Experimental Worlds backup partition is incomplete.');
        }
        if (!/^[a-z][a-z0-9-]{2,80}$/.test(descriptor.id)) throw new Error('Invalid backup partition id.');
        this.partitions.set(descriptor.id, descriptor);
        return () => this.partitions.delete(descriptor.id);
    }

    async attach(payload) {
        const partitions = {};
        for (const [id, partition] of this.partitions) {
            const data = await partition.exportData();
            partitions[id] = { schemaVersion: partition.schemaVersion || 1, checksum: digest(data), data };
        }
        payload.experimentalPartitions = partitions;
        payload._manifest = {
            schemaVersion: 2,
            exportedAt: payload._exportedAt,
            credentialsIncluded: false,
            hostChecksum: digest({ ...payload, experimentalPartitions: undefined, _manifest: undefined }),
            partitions: Object.fromEntries(Object.entries(partitions).map(([id, value]) => [id, {
                schemaVersion: value.schemaVersion, checksum: value.checksum
            }]))
        };
        return payload;
    }

    async stageRestore(payload) {
        const selected = payload?.experimentalPartitions || {};
        const staged = [];
        for (const [id, partition] of this.partitions) {
            const envelope = selected[id];
            if (!envelope) continue; // v1 backups legitimately predate this domain.
            if (digest(envelope.data) !== envelope.checksum) throw new Error(`Backup checksum failed for ${id}.`);
            await partition.validate(envelope.data);
            staged.push({ id, partition, data: clone(envelope.data) });
        }
        return staged;
    }

    async applyStagedRestore(staged) {
        const generation = ++this.restoreGeneration;
        const applied = [];
        try {
            for (const item of staged) {
                const preimage = await item.partition.exportData();
                await item.partition.stageRestore({ generation, preimage, incoming: item.data });
                await item.partition.applyRestore(item.data, { generation });
                applied.push({ ...item, preimage });
            }
            for (const item of applied) await item.partition.completeRestore?.({ generation });
        } catch (error) {
            await Promise.allSettled(applied.reverse().map(item => item.partition.rollbackRestore?.(item.preimage, { generation })));
            throw error;
        }
        return generation;
    }
}

window.HordeGlobalBackupCoordinator = new GlobalBackupCoordinator();

