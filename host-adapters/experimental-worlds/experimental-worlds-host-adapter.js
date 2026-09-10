/*
 * The deliberately small host-facing contract for Experimental Worlds.
 * This file is excluded from the Experimental core hash: it is the only place
 * where a future Horde host version should need to adapt shared facilities.
 */
(function (global) {
    'use strict';
    let host = null;
    function requireHost() {
        if (!host) throw new Error('Experimental Worlds host adapter is not configured.');
        return host;
    }
    global.ExperimentalWorldsHost = Object.freeze({
        configure(nextHost) { host = Object.freeze({ ...nextHost }); },
        persistSharedContinuities: continuities => requireHost().persistSharedContinuities(continuities),
        persist: () => requireHost().persist(),
        navigate: (...args) => requireHost().navigate(...args),
        markMediaChanged: () => requireHost().markMediaChanged(),
        mediaDirty: () => requireHost().mediaDirty(),
        restoreMediaDirty: value => requireHost().restoreMediaDirty(value),
        worldLoadWarning: worldId => requireHost().worldLoadWarning(worldId),
        // These are deliberately granular shared-host capabilities.  The
        // Experimental core never reaches the ambient Horde application for
        // provider transport, prompts, notifications, or dialogs.
        notify: (...args) => requireHost().notify(...args),
        confirmModal: (...args) => requireHost().confirmModal(...args),
        apiBase: () => requireHost().apiBase(),
        authHeaders: () => requireHost().authHeaders(),
        attributionHeaders: () => requireHost().attributionHeaders(),
        hasApiCredentials: () => requireHost().hasApiCredentials(),
        isLocalProvider: (...args) => requireHost().isLocalProvider(...args),
        cloudProviderName: (...args) => requireHost().cloudProviderName(...args),
        normalizedProviderId: (...args) => requireHost().normalizedProviderId(...args),
        providerApiBase: (...args) => requireHost().providerApiBase(...args),
        providerAuthHeaders: (...args) => requireHost().providerAuthHeaders(...args),
        providerAttributionHeaders: (...args) => requireHost().providerAttributionHeaders(...args),
        providerHasCredentials: (...args) => requireHost().providerHasCredentials(...args),
        providerDisplayName: (...args) => requireHost().providerDisplayName(...args),
        applyOpenRouterRouting: (...args) => requireHost().applyOpenRouterRouting(...args),
        sanitizeMessagesForProvider: (...args) => requireHost().sanitizeMessagesForProvider(...args),
        humanizeApiError: (...args) => requireHost().humanizeApiError(...args),
        localGenerationIdleTimeoutMs: (...args) => requireHost().localGenerationIdleTimeoutMs(...args),
        cloudGenerationIdleTimeoutMs: (...args) => requireHost().cloudGenerationIdleTimeoutMs(...args),
        applyRegexScripts: (...args) => requireHost().applyRegexScripts(...args),
        replaceMacros: (...args) => requireHost().replaceMacros(...args),
        getAllPresets: (...args) => requireHost().getAllPresets(...args),
        isPresetPromptEnabled: (...args) => requireHost().isPresetPromptEnabled(...args),
        getOrderedPresetPrompts: (...args) => requireHost().getOrderedPresetPrompts(...args),
        getEmbedding: (...args) => requireHost().getEmbedding(...args),
        persistSharedSettings: () => requireHost().persistSharedSettings(),
        ensureSharedLibraryFresh: () => requireHost().ensureSharedLibraryFresh(),
        recordSharedLibraryAssistantTurn: () => requireHost().recordSharedLibraryAssistantTurn(),
        labsAvailable: () => requireHost().labsAvailable(),
        labsProposal: (...args) => requireHost().labsProposal(...args),
        // Multiplayer is a host integration, not an ambient runtime
        // dependency.  Experimental Worlds supplies its own World source; the
        // current Horde host may additionally supply Chat sources and a
        // campaign service.  A minimal Experimental-only host supplies no
        // shared sources and the mode continues to run normally.
        sharedPersonas: () => requireHost().sharedPersonas?.() || [],
        chatMultiplayerSources: () => requireHost().chatMultiplayerSources?.() || [],
        chatMultiplayerContext: () => requireHost().chatMultiplayerContext?.() || null,
        chatMultiplayerSession: context => requireHost().chatMultiplayerSession?.(context) || null,
        chatMultiplayerSnapshot: context => requireHost().chatMultiplayerSnapshot?.(context) || {},
        chatMultiplayerCampaignTemplate: context => requireHost().chatMultiplayerCampaignTemplate?.(context) || null,
        multiplayerCampaigns: () => requireHost().multiplayerCampaigns?.() || [],
        prepareMultiplayerCampaign: (...args) => requireHost().prepareMultiplayerCampaign?.(...args),
        prepareMultiplayerSource: (...args) => requireHost().prepareMultiplayerSource?.(...args),
        joinMultiplayerInvite: (...args) => requireHost().joinMultiplayerInvite?.(...args),
        multiplayerPromptState: (...args) => requireHost().multiplayerPromptState?.(...args) || '',
        currentMultiplayerPersona: sessionPersonaId => requireHost().currentMultiplayerPersona?.(sessionPersonaId) || null,
        // The retained Chat memory surface is likewise optional.  The
        // Experimental World memory engine never reads Chat state directly.
        chatMemoryParticipantName: charId => requireHost().chatMemoryParticipantName?.(charId) || '',
        chatMemoryContext: () => requireHost().chatMemoryContext?.() || null,
        activeSharedPersonaId: () => requireHost().activeSharedPersonaId?.() || ''
    });
})(window);
