/*
 * Recovered global OpenRouter routing from the authoritative 17.0-era host.
 * This is deliberately host-only: it owns the shared Settings policy and
 * request decoration, never a World/ScenePulse/Sidecar schema.
 */

// --- OpenRouter provider routing -------------------------------------------
// Keep this adapter deliberately small. Every OpenRouter text request passes
// through it, while other providers receive the original request object by
// identity so their payloads are not changed by this feature.
const OPENROUTER_ROUTING_SORTS = Object.freeze(['throughput', 'latency', 'price']);
const DEFAULT_OPENROUTER_ROUTING = Object.freeze({
    order: Object.freeze([]),
    allowFallbacks: true,
    fallbackSort: 'throughput'
});

function isValidOpenRouterProviderSlug(value) {
    return typeof value === 'string'
        && value.length <= 160
        && /^[a-z0-9][a-z0-9._/-]*$/i.test(value);
}

function normalizeOpenRouterRouting(raw, { allowNull = false } = {}) {
    if ((raw === null || raw === undefined) && allowNull) return null;
    const source = isPlainObject(raw) ? raw : {};
    const seen = new Set();
    const order = (Array.isArray(source.order) ? source.order : [])
        .map(value => String(value || '').trim())
        .filter(value => {
            const key = value.toLowerCase();
            if (!isValidOpenRouterProviderSlug(value) || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 50);
    const requestedSort = String(source.fallbackSort || source.sort || '').trim().toLowerCase();
    const fallbackSort = OPENROUTER_ROUTING_SORTS.includes(requestedSort)
        ? requestedSort : DEFAULT_OPENROUTER_ROUTING.fallbackSort;
    let allowFallbacks = source.allowFallbacks;
    if (allowFallbacks === undefined) allowFallbacks = source.allow_fallbacks;
    allowFallbacks = allowFallbacks === undefined ? true : allowFallbacks === true;
    // With no preferred providers there is nothing to route to when fallbacks
    // are disabled. Heal that impossible legacy state rather than making every
    // generation fail.
    if (!order.length) allowFallbacks = true;
    // The model this pin was chosen for. A provider allowlist is only valid for
    // that model; see relaxRoutingForForeignModel().
    const model = String(source.model || '').trim().slice(0, 200);
    return { order, allowFallbacks, fallbackSort, ...(model ? { model } : {}) };
}

const OPENROUTER_ROUTE_CHAINS = Object.freeze({
    // Narrative turn: the latency-sensitive streaming call. World pin, else global.
    default: ['world', 'global'],
    // Background world agent: its own pin, else world, else global (unchanged).
    worldAgent: ['worldAgent', 'world', 'global'],
    // The foreground Sidecar reconciliation may use a different model, but
    // otherwise follows the world's routing preference.
    sidecar: ['sidecar', 'world', 'global'],
    // Utility routes run their own models. They resolve their own stored
    // routing and otherwise route on availability — never the world's pin.
    consolidation: ['consolidation', 'availability'],
    // Receipt repair usually re-runs the narrative model, so the world's pin is
    // still the right *preference*; it is a background scope, so fallbacks are
    // force-enabled and a foreign structured model relaxes the pin anyway.
    receiptRepair: ['receiptRepair', 'world', 'global'],
    // Virtual Human conversation traffic may pin a route for that person
    // without changing the shared Settings policy.
    companion: ['companion', 'global'],
    companionObserver: ['companionObserver', 'global'],
    companionLifeBuilder: ['companionLifeBuilder', 'global'],
    utility: ['availability']
});

// Availability routing: no hard provider allowlist, fallbacks on. Whatever
// serves the requested model may serve it.
function availabilityOpenRouterRouting() {
    return normalizeOpenRouterRouting({ order: [], allowFallbacks: true, fallbackSort: 'throughput' });
}

function storedOpenRouterRoutingForLink(link, owner) {
    if (link === 'availability') return availabilityOpenRouterRouting();
    if (link === 'global') return normalizeOpenRouterRouting(state.globalSettings?.openRouterRouting);
    if (link === 'consolidation') {
        return normalizeOpenRouterRouting(state.globalSettings?.consolidationRouting, { allowNull: true });
    }
    if (link === 'receiptRepair') {
        return normalizeOpenRouterRouting(owner?.receiptRepairRouting, { allowNull: true });
    }
    if (link === 'companion') {
        return normalizeOpenRouterRouting(owner?.openRouterRouting, { allowNull: true });
    }
    if (link === 'companionObserver') {
        return normalizeOpenRouterRouting(owner?.observerOpenRouterRouting, { allowNull: true });
    }
    if (link === 'companionLifeBuilder') {
        return normalizeOpenRouterRouting(owner?.lifeBuilderOpenRouterRouting, { allowNull: true });
    }
    if (link === 'worldAgent') {
        return normalizeOpenRouterRouting(owner?.worldAgent?.openRouterRouting, { allowNull: true });
    }
    if (link === 'sidecar') {
        return normalizeOpenRouterRouting(owner?.sidecarConfig?.tracker?.openRouterRouting, { allowNull: true });
    }
    if (link === 'world') {
        return normalizeOpenRouterRouting(owner?.openRouterRouting, { allowNull: true });
    }
    return null;
}

function effectiveOpenRouterRouting(owner = null, scope = 'default') {
    const globalRouting = normalizeOpenRouterRouting(state.globalSettings?.openRouterRouting);
    const chain = OPENROUTER_ROUTE_CHAINS[scope] || OPENROUTER_ROUTE_CHAINS.default;
    for (const link of chain) {
        // Owner-scoped links are unavailable on ownerless calls; skip to the
        // next link rather than collapsing straight to global.
        if (!owner && ['world', 'worldAgent', 'sidecar', 'receiptRepair', 'companion', 'companionObserver', 'companionLifeBuilder'].includes(link)) continue;
        const resolved = storedOpenRouterRoutingForLink(link, owner);
        if (resolved) return resolved;
    }
    return globalRouting;
}

// Background routes must never hard-fail on provider availability. A pinned
// order stays a *preference* for them, but disabling fallbacks on a background
// model is always a misconfiguration — it is how consolidation, the world agent
// and receipt repair silently died with "No endpoints found".
const OPENROUTER_BACKGROUND_SCOPES = Object.freeze(['worldAgent', 'consolidation', 'receiptRepair', 'utility']);

// A pin chosen for one model is meaningless (and often invalid) for a
// different one. Foreign-model calls keep the preferred order but relax
// fallbacks on, rather than hard-failing on an endpoint that was never
// going to serve the requested model anyway.
function relaxRoutingForForeignModel(routing, requestedModel) {
    const pinnedFor = String(routing?.model || '').trim();
    const target = String(requestedModel || '').trim();
    if (!pinnedFor || !target || pinnedFor === target) return routing;
    if (routing.allowFallbacks) return routing;
    return { ...routing, allowFallbacks: true };
}

function openRouterProviderPreferences(owner = null, scope = 'default', requestedModel = '') {
    let routing = relaxRoutingForForeignModel(
        effectiveOpenRouterRouting(owner, scope), requestedModel);
    if (OPENROUTER_BACKGROUND_SCOPES.includes(scope) && !routing.allowFallbacks) {
        routing = { ...routing, allowFallbacks: true };
    }
    const preferences = {
        allow_fallbacks: routing.allowFallbacks
    };
    if (routing.order.length) preferences.order = [...routing.order];
    if (routing.allowFallbacks) preferences.sort = routing.fallbackSort;
    return preferences;
}

function applyOpenRouterRouting(body, owner = null, {
    scope = 'default',
    providerId = state.globalSettings?.apiProvider
} = {}) {
    if (normalizedProviderId(providerId) !== 'openrouter') return body;
    const existing = isPlainObject(body?.provider) ? body.provider : {};
    const routing = openRouterProviderPreferences(owner, scope, body?.model);
    return {
        ...body,
        provider: { ...existing, ...routing }
    };
}

function companionTextProviderId(companion) {
    return normalizedProviderId(companion?.textProvider);
}

let openRouterProviderCatalog = [];
let openRouterProviderCatalogFetchedAt = 0;
const openRouterEndpointCatalogs = new Map();
const openRouterRoutingDrafts = new Map();

function openRouterRoutingPanelDefinition(scope) {
    const definitions = {
        global: {
            hostId: 'global-openrouter-routing',
            modelId: 'global-default-model',
            inheritLabel: '',
            owner: () => null,
            stored: () => state.globalSettings.openRouterRouting
        },
        companion: {
            hostId: 'cs-openrouter-routing',
            modelId: 'cs-text-model',
            inheritLabel: 'Inherit global routing',
            owner: () => getCompanion(state.editingCompanionId),
            stored: () => getCompanion(state.editingCompanionId)?.openRouterRouting
        },
        companionObserver: {
            hostId: 'cs-observer-openrouter-routing',
            modelId: 'cs-observer-model',
            inheritLabel: 'Inherit global routing',
            compact: true,
            owner: () => getCompanion(state.editingCompanionId),
            stored: () => getCompanion(state.editingCompanionId)?.observerOpenRouterRouting
        },
        companionLifeBuilder: {
            hostId: 'cs-life-builder-openrouter-routing',
            modelId: 'cs-life-builder-model',
            inheritLabel: 'Inherit global routing',
            compact: true,
            owner: () => getCompanion(state.editingCompanionId),
            stored: () => getCompanion(state.editingCompanionId)?.lifeBuilderOpenRouterRouting
        },
        character: {
            hostId: 'character-openrouter-routing',
            modelId: 'studio-model',
            inheritLabel: 'Inherit global routing',
            owner: () => state.editingChar,
            stored: () => state.editingChar?.openRouterRouting
        },
        room: {
            hostId: 'room-openrouter-routing',
            modelId: 'room-model',
            inheritLabel: 'Inherit global routing',
            owner: () => state.editingRoom,
            stored: () => state.editingRoom?.openRouterRouting
        },
        world: {
            hostId: 'world-openrouter-routing',
            modelId: 'w-studio-model',
            inheritLabel: 'Inherit global routing',
            owner: () => state.editingWorld,
            stored: () => state.editingWorld?.openRouterRouting
        },
        worldAgent: {
            hostId: 'world-agent-openrouter-routing',
            modelId: 'w-agent-model',
            inheritLabel: 'Inherit World routing',
            owner: () => state.editingWorld,
            stored: () => state.editingWorld?.worldAgent?.openRouterRouting
        },
        sidecar: {
            hostId: 'world-sidecar-openrouter-routing',
            modelId: 'w-sidecar-model',
            inheritLabel: 'Inherit World routing',
            owner: () => state.editingWorld,
            stored: () => state.editingWorld?.sidecarConfig?.tracker?.openRouterRouting
        }
    };
    return definitions[scope] || null;
}

function openRouterRoutingParent(scope) {
    const globalRouting = normalizeOpenRouterRouting(state.globalSettings.openRouterRouting);
    if (!['worldAgent', 'sidecar'].includes(scope)) return globalRouting;
    const worldDraft = openRouterRoutingDrafts.get('world');
    if (worldDraft) {
        return worldDraft.inherit
            ? globalRouting
            : normalizeOpenRouterRouting(worldDraft.routing);
    }
    return normalizeOpenRouterRouting(state.editingWorld?.openRouterRouting, { allowNull: true }) || globalRouting;
}

function openRouterRoutingModel(scope) {
    const definition = openRouterRoutingPanelDefinition(scope);
    const selected = String(document.getElementById(definition?.modelId)?.value || '').trim();
    if (selected) return selected;
    if (scope === 'companion') {
        const companion = definition?.owner?.();
        return String(companion?.model || state.globalSettings.defaultModel || '').trim();
    }
    if (scope === 'companionObserver') {
        const companion = definition?.owner?.();
        return String(companion?.observerModel || companion?.lifeBuilderModel || companion?.model || state.globalSettings.defaultModel || '').trim();
    }
    if (scope === 'companionLifeBuilder') {
        const companion = definition?.owner?.();
        return String(companion?.lifeBuilderModel || companion?.model || state.globalSettings.defaultModel || '').trim();
    }
    if (scope === 'worldAgent') {
        return String(document.getElementById('w-studio-model')?.value
            || state.editingWorld?.model || state.globalSettings.defaultModel || '').trim();
    }
    if (scope === 'sidecar') {
        const inherit = document.getElementById('w-sidecar-inherit-narrator')?.checked !== false;
        return String(inherit ? (document.getElementById('w-studio-model')?.value || state.editingWorld?.model)
            : (document.getElementById('w-sidecar-model')?.value || state.editingWorld?.model)
            || state.globalSettings.defaultModel || '').trim();
    }
    return String(state.globalSettings.defaultModel || '').trim();
}

function openRouterRoutingVisible(scope) {
    // Sidecar inherits the entire Narrator request contract, including routing.
    // Do not render a second routing schema while that inheritance is selected.
    if (scope === 'sidecar' && document.getElementById('w-sidecar-inherit-narrator')?.checked !== false) {
        return false;
    }
    const selected = scope === 'global'
        ? document.getElementById('global-api-provider')?.value
        : ['companion', 'companionObserver', 'companionLifeBuilder'].includes(scope)
            ? companionTextProviderId(openRouterRoutingPanelDefinition(scope)?.owner?.())
        : scope === 'sidecar'
            ? (document.getElementById('w-sidecar-provider')?.value || state.globalSettings.apiProvider)
            : state.globalSettings.apiProvider;
    return normalizedProviderId(selected) === 'openrouter';
}

function initializeOpenRouterRoutingPanel(scope, { force = true } = {}) {
    const definition = openRouterRoutingPanelDefinition(scope);
    if (!definition || !document.getElementById(definition.hostId)) return;
    if (!force && openRouterRoutingDrafts.has(scope)) {
        renderOpenRouterRoutingPanel(scope);
        return;
    }
    const stored = normalizeOpenRouterRouting(definition.stored(), { allowNull: scope !== 'global' });
    const inherit = scope !== 'global' && stored === null;
    openRouterRoutingDrafts.set(scope, {
        inherit,
        routing: normalizeOpenRouterRouting(stored || openRouterRoutingParent(scope)),
        search: '',
        endpointModel: '',
        endpoints: [],
        endpointsLoaded: false,
        loading: false,
        status: '',
        statusKind: '',
        tests: new Map()
    });
    renderOpenRouterRoutingPanel(scope);
}

function readOpenRouterRoutingPanel(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    if (!draft) {
        const definition = openRouterRoutingPanelDefinition(scope);
        return normalizeOpenRouterRouting(definition?.stored(), { allowNull: scope !== 'global' });
    }
    if (scope !== 'global' && draft.inherit) return null;
    // Stamp the model this pin was chosen against so it is never applied to an
    // unrelated model later (see relaxRoutingForForeignModel).
    return normalizeOpenRouterRouting({
        ...draft.routing,
        model: openRouterRoutingModel(scope)
    });
}

// The Virtual Human editor keeps its draft live in the current companion just
// like its other studio controls. It is persisted only when the user saves the
// human, never by writing through to the shared Settings route.
function persistOpenRouterRoutingDraft(scope) {
    const fieldByScope = {
        companion: 'openRouterRouting',
        companionObserver: 'observerOpenRouterRouting',
        companionLifeBuilder: 'lifeBuilderOpenRouterRouting'
    };
    const field = fieldByScope[scope];
    if (!field) return;
    const owner = openRouterRoutingPanelDefinition(scope)?.owner?.();
    if (owner) owner[field] = readOpenRouterRoutingPanel(scope);
}

function markOpenRouterRoutingModelChanged(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    if (!draft) return;
    draft.endpoints = [];
    draft.endpointsLoaded = false;
    draft.tests.clear();
    draft.status = 'Model changed. Refresh Providers to update endpoint metadata.';
    draft.statusKind = 'warn';
    persistOpenRouterRoutingDraft(scope);
    renderOpenRouterRoutingPanel(scope);
}

function openRouterRoutingDraftValue(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    if (!draft) return normalizeOpenRouterRouting(openRouterRoutingParent(scope));
    return draft.inherit ? normalizeOpenRouterRouting(openRouterRoutingParent(scope)) : draft.routing;
}

function openRouterUiKey() {
    return String(document.getElementById('global-api-key')?.value || state.apiKey || '').trim();
}

function openRouterUiHeaders() {
    const key = openRouterUiKey();
    return {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...attributionHeaders()
    };
}

async function fetchOpenRouterProviderCatalog({ force = false } = {}) {
    if (!force && openRouterProviderCatalog.length && Date.now() - openRouterProviderCatalogFetchedAt < 15 * 60 * 1000) {
        return openRouterProviderCatalog;
    }
    const response = await fetch(OPENROUTER_PROVIDER_API, { headers: openRouterUiHeaders() });
    if (!response.ok) throw new Error(`provider catalog failed (${response.status})`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    openRouterProviderCatalog = rows.map(row => ({
        slug: String(row?.slug || '').trim(),
        name: String(row?.name || row?.slug || '').trim()
    })).filter(row => isValidOpenRouterProviderSlug(row.slug));
    openRouterProviderCatalogFetchedAt = Date.now();
    return openRouterProviderCatalog;
}

async function fetchOpenRouterModelEndpoints(model, { force = false } = {}) {
    const cleanModel = String(model || '').trim();
    if (!cleanModel.includes('/')) throw new Error('choose an OpenRouter model before refreshing endpoint metadata');
    const cached = openRouterEndpointCatalogs.get(cleanModel);
    if (!force && cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) return cached.endpoints;
    const splitAt = cleanModel.indexOf('/');
    const author = cleanModel.slice(0, splitAt);
    const slug = cleanModel.slice(splitAt + 1);
    const url = `${OPENROUTER_ENDPOINT_API}/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`;
    const response = await fetch(url, { headers: openRouterUiHeaders() });
    if (!response.ok) throw new Error(`model endpoints failed (${response.status})`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.data?.endpoints) ? payload.data.endpoints : [];
    const endpoints = rows.map(row => ({
        slug: String(row?.tag || '').trim(),
        name: String(row?.provider_name || row?.name || row?.tag || '').trim(),
        pricing: isPlainObject(row?.pricing) ? row.pricing : {},
        latency: Number(row?.latency_last_30m?.p50),
        throughput: Number(row?.throughput_last_30m?.p50),
        uptime: Number(row?.uptime_last_30m),
        status: row?.status
    })).filter(row => isValidOpenRouterProviderSlug(row.slug));
    openRouterEndpointCatalogs.set(cleanModel, { endpoints, fetchedAt: Date.now() });
    return endpoints;
}

function openRouterEndpointForSlug(slug, endpoints) {
    const exact = endpoints.find(endpoint => endpoint.slug.toLowerCase() === slug.toLowerCase());
    if (exact) return exact;
    const variants = endpoints.filter(endpoint => endpoint.slug.toLowerCase().startsWith(`${slug.toLowerCase()}/`));
    return variants[0] || null;
}

function openRouterProvidersForDraft(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    const route = openRouterRoutingDraftValue(scope);
    const map = new Map();
    openRouterProviderCatalog.forEach(provider => map.set(provider.slug.toLowerCase(), {
        ...provider, available: draft?.endpointsLoaded ? false : null, endpoint: null
    }));
    (draft?.endpoints || []).forEach(endpoint => {
        const key = endpoint.slug.toLowerCase();
        const catalog = map.get(key);
        map.set(key, {
            slug: endpoint.slug,
            name: catalog?.name || endpoint.name || endpoint.slug,
            available: true,
            endpoint
        });
    });
    // OpenRouter base slugs target their endpoint variants. Preserve the exact
    // catalog slug while attaching metrics from a matching variant.
    if (draft?.endpointsLoaded) {
        map.forEach((provider, key) => {
            if (provider.available) return;
            const endpoint = openRouterEndpointForSlug(provider.slug, draft.endpoints);
            if (endpoint) map.set(key, { ...provider, available: true, endpoint });
        });
    }
    route.order.forEach(slug => {
        const key = slug.toLowerCase();
        if (!map.has(key)) map.set(key, {
            slug, name: slug, available: draft?.endpointsLoaded ? false : null, endpoint: null
        });
    });
    const providers = [...map.values()];
    const metric = provider => {
        const endpoint = provider.endpoint;
        if (route.fallbackSort === 'throughput') return Number.isFinite(endpoint?.throughput) ? -endpoint.throughput : Infinity;
        if (route.fallbackSort === 'latency') return Number.isFinite(endpoint?.latency) ? endpoint.latency : Infinity;
        const input = Number(endpoint?.pricing?.prompt);
        const output = Number(endpoint?.pricing?.completion);
        return Number.isFinite(input) || Number.isFinite(output)
            ? (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0) : Infinity;
    };
    const availabilityRank = value => value === true ? 0 : value === null ? 1 : 2;
    providers.sort((a, b) => availabilityRank(a.available) - availabilityRank(b.available)
        || metric(a) - metric(b) || a.name.localeCompare(b.name));
    return providers;
}

function formatOpenRouterPrice(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `$${(number * 1_000_000).toFixed(number * 1_000_000 < 0.01 ? 4 : 2)}/M` : 'n/a';
}

function openRouterProviderMetrics(provider) {
    const endpoint = provider?.endpoint;
    if (!endpoint) return 'metadata unavailable';
    const latency = Number.isFinite(endpoint.latency) ? `${endpoint.latency.toFixed(2)}s latency` : 'latency n/a';
    const throughput = Number.isFinite(endpoint.throughput) ? `${Math.round(endpoint.throughput)} t/s` : 'throughput n/a';
    return `in ${formatOpenRouterPrice(endpoint.pricing?.prompt)} · out ${formatOpenRouterPrice(endpoint.pricing?.completion)} · ${latency} · ${throughput}`;
}

function openRouterProviderAvailability(provider, test) {
    if (test?.ok === true) return '<span class="or-provider-live ok">live test passed</span>';
    if (test?.ok === false) return `<span class="or-provider-live fail">live test failed${test.error ? ` · ${escapeHTML(test.error)}` : ''}</span>`;
    if (provider?.available === true) return '<span class="or-provider-advisory ok">listed for this model</span>';
    if (provider?.available === false) return '<span class="or-provider-advisory warn">not listed for this model · still selectable</span>';
    return '<span class="or-provider-advisory">availability unknown</span>';
}

function renderOpenRouterProviderSearchResults(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    const results = document.querySelector(`#${openRouterRoutingPanelDefinition(scope)?.hostId} [data-or-results]`);
    if (!draft || !results) return;
    const query = draft.search.trim().toLowerCase();
    const selected = new Set(openRouterRoutingDraftValue(scope).order.map(slug => slug.toLowerCase()));
    const providers = openRouterProvidersForDraft(scope)
        .filter(provider => !selected.has(provider.slug.toLowerCase()))
        .filter(provider => !query || provider.slug.toLowerCase().includes(query) || provider.name.toLowerCase().includes(query))
        .slice(0, 40);
    if (!providers.length) {
        const exact = draft.search.trim();
        results.innerHTML = exact && isValidOpenRouterProviderSlug(exact)
            ? `<button type="button" class="or-provider-option" data-or-add="${escapeHTML(exact)}"><strong>Add exact slug: ${escapeHTML(exact)}</strong><small>Unverified provider slugs remain usable.</small></button>`
            : '<div class="or-provider-empty">No matches. Refresh metadata, or type an exact OpenRouter slug and press Enter.</div>';
        return;
    }
    results.innerHTML = providers.map(provider => {
        const test = draft.tests.get(provider.slug.toLowerCase());
        return `<button type="button" class="or-provider-option" data-or-add="${escapeHTML(provider.slug)}">
            <span><strong>${escapeHTML(provider.name)}</strong><code>${escapeHTML(provider.slug)}</code></span>
            <small>${escapeHTML(openRouterProviderMetrics(provider))} · ${test?.ok === true ? 'test passed' : provider.available === false ? 'not listed for model' : provider.available === true ? 'available' : 'unknown'}</small>
        </button>`;
    }).join('');
    results.querySelectorAll('[data-or-add]').forEach(button => {
        button.onclick = () => addOpenRouterProvider(scope, button.dataset.orAdd);
    });
}

function addOpenRouterProvider(scope, slug) {
    const draft = openRouterRoutingDrafts.get(scope);
    const clean = String(slug || '').trim();
    if (!draft || !isValidOpenRouterProviderSlug(clean)) return;
    if (draft.inherit) {
        draft.inherit = false;
        draft.routing = normalizeOpenRouterRouting(openRouterRoutingParent(scope));
    }
    if (!draft.routing.order.some(value => value.toLowerCase() === clean.toLowerCase())) {
        draft.routing.order.push(clean);
    }
    draft.search = '';
    persistOpenRouterRoutingDraft(scope);
    renderOpenRouterRoutingPanel(scope);
}

function moveOpenRouterProvider(scope, sourceSlug, targetSlug) {
    const draft = openRouterRoutingDrafts.get(scope);
    if (!draft || draft.inherit || sourceSlug === targetSlug) return;
    const order = [...draft.routing.order];
    const from = order.indexOf(sourceSlug);
    const to = order.indexOf(targetSlug);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    draft.routing.order = order;
    persistOpenRouterRoutingDraft(scope);
    renderOpenRouterRoutingPanel(scope);
}

function renderOpenRouterRoutingPanel(scope) {
    const definition = openRouterRoutingPanelDefinition(scope);
    const host = document.getElementById(definition?.hostId);
    const draft = openRouterRoutingDrafts.get(scope);
    if (!host || !draft) return;
    host.classList.toggle('hidden', !openRouterRoutingVisible(scope));
    if (!openRouterRoutingVisible(scope)) return;
    const route = openRouterRoutingDraftValue(scope);
    const providers = openRouterProvidersForDraft(scope);
    const bySlug = new Map(providers.map(provider => [provider.slug.toLowerCase(), provider]));
    const disabled = draft.inherit ? 'disabled' : '';
    host.innerHTML = `<section class="openrouter-routing-panel" data-or-scope="${scope}">
        <div class="or-routing-head">
            <div><span class="or-routing-kicker">OPENROUTER</span><h3>Provider Routing</h3></div>
            <span class="or-routing-model">${escapeHTML(openRouterRoutingModel(scope) || 'No model selected')}</span>
        </div>
        <p class="form-hint">Preferred providers are tried in this order. If they fail, OpenRouter ranks the remaining endpoints by the fallback strategy below.</p>
        ${definition.compact ? `<div class="or-routing-quick"><label><span>Preferred endpoint</span><select class="form-select" data-or-quick-provider>
            <option value="">Inherit global routing</option>
            ${providers.filter(provider => provider.available !== false).map(provider => `<option value="${escapeHTML(provider.slug)}" ${route.order[0] === provider.slug ? 'selected' : ''}>${escapeHTML(provider.name)} · ${escapeHTML(provider.slug)}</option>`).join('')}
        </select></label><button type="button" class="btn btn-ghost" data-or-refresh ${draft.loading ? 'disabled' : ''}>${draft.loading ? 'Refreshing…' : '↻ Refresh providers'}</button></div>` : ''}
        ${definition.inheritLabel ? `<label class="or-inherit-toggle"><input type="checkbox" data-or-inherit ${draft.inherit ? 'checked' : ''}> ${escapeHTML(definition.inheritLabel)}</label>` : ''}
        ${definition.compact ? '<details class="or-routing-details"><summary>Provider routing</summary>' : ''}
        <div class="or-routing-body ${draft.inherit ? 'is-inherited' : ''}">
            <label class="form-label">Preferred provider order</label>
            <div class="or-selected-providers" data-or-selected>
                ${route.order.length ? route.order.map((slug, index) => {
                    const provider = bySlug.get(slug.toLowerCase()) || { slug, name: slug, available: null };
                    const test = draft.tests.get(slug.toLowerCase());
                    return `<div class="or-selected-provider ${test?.ok === true ? 'test-ok' : test?.ok === false ? 'test-fail' : ''}" draggable="${!draft.inherit}" data-or-slug="${escapeHTML(slug)}">
                        <span class="or-drag-handle" aria-hidden="true">⠿</span>
                        <span class="or-provider-order">${index + 1}</span>
                        <span class="or-provider-copy"><strong>${escapeHTML(provider.name)}</strong><code>${escapeHTML(slug)}</code><small>${escapeHTML(openRouterProviderMetrics(provider))}</small>${openRouterProviderAvailability(provider, test)}</span>
                        <button type="button" class="or-remove-provider" data-or-remove="${escapeHTML(slug)}" ${disabled} aria-label="Remove ${escapeHTML(slug)}">×</button>
                    </div>`;
                }).join('') : '<div class="or-provider-empty">No preferred providers. OpenRouter will use the fallback sorting strategy directly.</div>'}
            </div>
            <div class="or-provider-search-wrap">
                <input type="search" class="form-input" data-or-search value="${escapeHTML(draft.search)}" placeholder="Search providers or enter an exact slug" ${disabled} autocomplete="off">
                <div class="or-provider-results" data-or-results></div>
            </div>
            <div class="or-routing-controls">
                <label class="or-fallback-toggle"><input type="checkbox" data-or-fallback ${route.allowFallbacks ? 'checked' : ''} ${disabled || (!route.order.length ? 'disabled' : '')}> Allow unrestricted provider fallbacks</label>
                <label><span>Rank fallbacks by</span><select class="form-select" data-or-sort ${disabled || (!route.allowFallbacks ? 'disabled' : '')}>
                    <option value="throughput" ${route.fallbackSort === 'throughput' ? 'selected' : ''}>Highest throughput</option>
                    <option value="latency" ${route.fallbackSort === 'latency' ? 'selected' : ''}>Lowest latency</option>
                    <option value="price" ${route.fallbackSort === 'price' ? 'selected' : ''}>Lowest price</option>
                </select></label>
            </div>
            <div class="or-routing-actions">
                ${definition.compact ? '' : `<button type="button" class="btn btn-ghost" data-or-refresh ${draft.loading ? 'disabled' : ''}>${draft.loading ? 'Refreshing…' : '↻ Refresh Providers'}</button>`}
                <button type="button" class="btn btn-ghost" data-or-test ${draft.loading || !route.order.length ? 'disabled' : ''}>${draft.loading ? 'Please wait…' : '⚡ Test Selected Providers'}</button>
            </div>
            <div class="or-routing-status ${escapeHTML(draft.statusKind)}" aria-live="polite">${escapeHTML(draft.status || 'Metadata is advisory. A live test result overrides catalog warnings for this session.')}</div>
        </div>
        ${definition.compact ? '</details>' : ''}
    </section>`;

    const inherit = host.querySelector('[data-or-inherit]');
    if (inherit) inherit.onchange = () => {
        draft.inherit = inherit.checked;
        if (!draft.inherit) draft.routing = normalizeOpenRouterRouting(openRouterRoutingParent(scope));
        draft.tests.clear();
        persistOpenRouterRoutingDraft(scope);
        renderOpenRouterRoutingPanel(scope);
    };
    const quickProvider = host.querySelector('[data-or-quick-provider]');
    if (quickProvider) quickProvider.onchange = () => {
        const selected = String(quickProvider.value || '').trim();
        if (!selected) {
            draft.inherit = true;
        } else {
            draft.inherit = false;
            draft.routing = normalizeOpenRouterRouting({
                ...draft.routing,
                order: [selected, ...draft.routing.order.filter(slug => slug !== selected)]
            });
        }
        draft.tests.clear();
        persistOpenRouterRoutingDraft(scope);
        renderOpenRouterRoutingPanel(scope);
    };
    const fallback = host.querySelector('[data-or-fallback]');
    if (fallback) fallback.onchange = () => {
        draft.routing.allowFallbacks = fallback.checked;
        persistOpenRouterRoutingDraft(scope);
        renderOpenRouterRoutingPanel(scope);
    };
    const sort = host.querySelector('[data-or-sort]');
    if (sort) sort.onchange = () => {
        draft.routing.fallbackSort = OPENROUTER_ROUTING_SORTS.includes(sort.value) ? sort.value : 'throughput';
        persistOpenRouterRoutingDraft(scope);
        renderOpenRouterRoutingPanel(scope);
    };
    const search = host.querySelector('[data-or-search]');
    if (search) {
        search.oninput = () => {
            draft.search = search.value;
            renderOpenRouterProviderSearchResults(scope);
        };
        search.onkeydown = event => {
            if (event.key === 'Enter' && isValidOpenRouterProviderSlug(search.value.trim())) {
                event.preventDefault();
                addOpenRouterProvider(scope, search.value.trim());
            }
        };
    }
    host.querySelectorAll('[data-or-remove]').forEach(button => {
        button.onclick = () => {
            draft.routing.order = draft.routing.order.filter(slug => slug !== button.dataset.orRemove);
            if (!draft.routing.order.length) draft.routing.allowFallbacks = true;
            persistOpenRouterRoutingDraft(scope);
            renderOpenRouterRoutingPanel(scope);
        };
    });
    let dragged = '';
    host.querySelectorAll('[data-or-slug]').forEach(row => {
        row.ondragstart = event => {
            dragged = row.dataset.orSlug;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', dragged);
            row.classList.add('is-dragging');
        };
        row.ondragend = () => row.classList.remove('is-dragging');
        row.ondragover = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
        row.ondrop = event => {
            event.preventDefault();
            moveOpenRouterProvider(scope, dragged || event.dataTransfer.getData('text/plain'), row.dataset.orSlug);
        };
    });
    const refresh = host.querySelector('[data-or-refresh]');
    if (refresh) refresh.onclick = () => refreshOpenRouterRoutingPanel(scope);
    const test = host.querySelector('[data-or-test]');
    if (test) test.onclick = () => testOpenRouterRoutingProviders(scope);
    renderOpenRouterProviderSearchResults(scope);
}

async function refreshOpenRouterRoutingPanel(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    if (!draft || draft.loading) return;
    draft.loading = true;
    draft.status = 'Refreshing provider catalog and model endpoints…';
    draft.statusKind = '';
    renderOpenRouterRoutingPanel(scope);
    const model = openRouterRoutingModel(scope);
    const [catalogResult, endpointResult] = await Promise.allSettled([
        fetchOpenRouterProviderCatalog({ force: true }),
        fetchOpenRouterModelEndpoints(model, { force: true })
    ]);
    draft.loading = false;
    if (endpointResult.status === 'fulfilled') {
        draft.endpoints = endpointResult.value;
        draft.endpointsLoaded = true;
        draft.endpointModel = model;
    } else {
        draft.endpoints = [];
        draft.endpointsLoaded = false;
        draft.endpointModel = '';
    }
    const successes = [catalogResult, endpointResult].filter(result => result.status === 'fulfilled').length;
    if (successes === 2) {
        draft.status = `Provider data refreshed · ${openRouterProviderCatalog.length} catalog entries · ${draft.endpoints.length} endpoints for this model.`;
        draft.statusKind = 'ok';
    } else if (successes === 1) {
        const failure = [catalogResult, endpointResult].find(result => result.status === 'rejected')?.reason;
        draft.status = `Partial refresh: ${failure?.message || 'one metadata source was unavailable'}. Saved provider slugs remain usable.`;
        draft.statusKind = 'warn';
    } else {
        const failure = catalogResult.reason || endpointResult.reason;
        draft.status = `Refresh failed: ${failure?.message || 'OpenRouter metadata unavailable'}. Saved provider slugs remain usable.`;
        draft.statusKind = 'fail';
    }
    renderOpenRouterRoutingPanel(scope);
}

async function testOpenRouterRoutingProviders(scope) {
    const draft = openRouterRoutingDrafts.get(scope);
    const route = openRouterRoutingDraftValue(scope);
    const model = openRouterRoutingModel(scope);
    const key = openRouterUiKey();
    if (!draft || draft.loading || !route.order.length) return;
    if (!key) {
        draft.status = 'Enter an OpenRouter API key in Settings → Connections before testing providers.';
        draft.statusKind = 'fail';
        return renderOpenRouterRoutingPanel(scope);
    }
    if (!model) {
        draft.status = 'Choose a model before testing providers.';
        draft.statusKind = 'fail';
        return renderOpenRouterRoutingPanel(scope);
    }
    draft.loading = true;
    draft.tests.clear();
    renderOpenRouterRoutingPanel(scope);
    for (let index = 0; index < route.order.length; index++) {
        const slug = route.order[index];
        draft.status = `Testing ${slug} (${index + 1}/${route.order.length})…`;
        renderOpenRouterRoutingPanel(scope);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45_000);
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                signal: controller.signal,
                headers: { ...openRouterUiHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: 'Reply with OK.' }],
                    max_tokens: 1,
                    stream: false,
                    provider: { order: [slug], allow_fallbacks: false }
                })
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            }
            draft.tests.set(slug.toLowerCase(), { ok: true });
        } catch (error) {
            draft.tests.set(slug.toLowerCase(), {
                ok: false,
                error: error?.name === 'AbortError' ? 'timed out' : String(error?.message || error).slice(0, 160)
            });
        } finally {
            clearTimeout(timeout);
        }
    }
    draft.loading = false;
    const passed = [...draft.tests.values()].filter(result => result.ok).length;
    draft.status = `Provider tests complete · ${passed}/${route.order.length} succeeded. Tests used one output token each.`;
    draft.statusKind = passed === route.order.length ? 'ok' : passed ? 'warn' : 'fail';
    renderOpenRouterRoutingPanel(scope);
}

function renderAllOpenRouterRoutingPanels() {
    openRouterRoutingDrafts.forEach((draft, scope) => renderOpenRouterRoutingPanel(scope));
}

function setupOpenRouterRouting() {
    const provider = document.getElementById('global-api-provider');
    if (provider) provider.addEventListener('change', renderAllOpenRouterRoutingPanels);
    ['global', 'character', 'room', 'world', 'worldAgent', 'companion', 'companionObserver', 'companionLifeBuilder'].forEach(scope => {
        const definition = openRouterRoutingPanelDefinition(scope);
        const modelInput = document.getElementById(definition?.modelId);
        if (modelInput) modelInput.addEventListener('change', () => {
            markOpenRouterRoutingModelChanged(scope);
        });
    });
}

function installOpenRouterRoutingFetchHook() {
    if (window.__hordeOpenRouterRoutingFetchHookInstalled) return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = undefined) => {
        const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        if (method === 'POST'
            && /^https:\/\/openrouter\.ai\/api\/v1\/chat\/completions(?:[/?#]|$)/i.test(String(requestUrl || ''))
            && typeof init?.body === 'string') {
            try {
                const body = JSON.parse(init.body);
                // Explicit provider payloads are caller-owned (for example the
                // one-token Settings provider probe). Ordinary host requests
                // inherit the saved global policy.
                if (!isPlainObject(body.provider)) {
                    init = { ...init, body: JSON.stringify(applyOpenRouterRouting(body)) };
                }
            } catch (_) {
                // Preserve opaque/request-streaming bodies exactly as supplied.
            }
        }
        return nativeFetch(input, init);
    };
    window.__hordeOpenRouterRoutingFetchHookInstalled = true;
}

function openGlobalOpenRouterRoutingPanel() {
    try {
        initializeOpenRouterRoutingPanel('global');
    } catch (error) {
        console.error('Could not render OpenRouter provider routing:', error);
        const host = document.getElementById('global-openrouter-routing');
        if (host) {
            host.classList.remove('hidden');
            host.textContent = `Provider routing could not start: ${error.message || error}`;
        }
    }
}

window.HordeOpenRouterRouting = Object.freeze({
    setup: setupOpenRouterRouting,
    openGlobalPanel: openGlobalOpenRouterRoutingPanel,
    initialize: initializeOpenRouterRoutingPanel,
    read: readOpenRouterRoutingPanel,
    modelChanged: markOpenRouterRoutingModelChanged,
    readGlobal: () => readOpenRouterRoutingPanel('global') || normalizeOpenRouterRouting(null),
    apply: applyOpenRouterRouting,
    normalize: normalizeOpenRouterRouting,
    install: installOpenRouterRoutingFetchHook
});

installOpenRouterRoutingFetchHook();
