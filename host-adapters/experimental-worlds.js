// This adapter is the only supported route from Experimental Worlds to the
// classic host bootstrap.  Keep the boundary small and capability-shaped.
export function createExperimentalWorldsHost(host) {
    const required = ['getSettings', 'updateSettings', 'notify', 'backupCoordinator', 'getHostRevision'];
    for (const key of required) if (typeof host?.[key] !== 'function' && key !== 'backupCoordinator') {
        throw new Error(`Horde Studio cannot start Experimental Worlds: missing host capability ${key}.`);
    }
    if (!host.backupCoordinator) throw new Error('Horde Studio cannot start Experimental Worlds: backup coordinator unavailable.');
    return Object.freeze({
        contractVersion: 1,
        getSettings: () => structuredClone(host.getSettings()),
        updateSettings: async patch => host.updateSettings(structuredClone(patch)),
        notify: (message, type) => host.notify(String(message), type),
        getHostRevision: () => host.getHostRevision(),
        backupCoordinator: host.backupCoordinator,
        async requestText(request, owner) {
            if (typeof host.requestText !== 'function') throw new Error('The current host does not expose text transport.');
            return host.requestText(structuredClone(request), structuredClone(owner));
        },
        async requestMedia(request, owner) {
            if (typeof host.requestMedia !== 'function') throw new Error('The current host does not expose media transport.');
            return host.requestMedia(structuredClone(request), structuredClone(owner));
        }
    });
}

