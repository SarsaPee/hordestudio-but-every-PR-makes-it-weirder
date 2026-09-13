import {
    createExperimentalWorldsCoreRuntime,
    EXPERIMENTAL_WORLDS_CORE_SOURCES
} from '../../experiences/experimental-worlds/experimental-worlds-core.generated.mjs?v=20260913-scenepulse-staged-loader-5';
import { bindExperimentalWorldsVendorContext } from './experimental-worlds-vendor-context.js';

const SHELL_URL = new URL('../../experiences/experimental-worlds/experimental-worlds-shell.html', import.meta.url);
const INTERNAL_ROUTES = new Set(['library', 'studio', 'play']);
const ROOT_STYLE_PROPERTIES = Object.freeze(['--world-status-w', '--world-scenepulse-sidebar-w']);
const STORAGE_PREFIX = 'hordeExperimentalWorlds:';

export const EXPERIMENTAL_WORLDS_MODE_CAPABILITIES = Object.freeze({
    mode: 'experimentalWorlds',
    routes: Object.freeze([...INTERNAL_ROUTES]),
    moduleIsolated: true,
    scopedDocument: true,
    separatePersistence: true,
    sourceCount: EXPERIMENTAL_WORLDS_CORE_SOURCES.length
});

function abortError(message = 'Experimental Worlds activation is no longer current.') {
    return new DOMException(message, 'AbortError');
}

function normalizeRoute(route) {
    const value = String(route || 'library');
    return INTERNAL_ROUTES.has(value) ? value : 'library';
}

function combineSignals(signals) {
    const available = signals.filter(signal => signal && typeof signal.addEventListener === 'function');
    if (!available.length) return undefined;
    if (available.length === 1) return available[0];
    if (typeof AbortSignal.any === 'function') return AbortSignal.any(available);
    const controller = new AbortController();
    const abort = () => controller.abort();
    available.forEach(signal => {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    });
    return controller.signal;
}

function listenerOptionsWithSignal(options, signal) {
    if (!signal) return options;
    if (typeof options === 'boolean') return { capture: options, signal };
    return { ...(options || {}), signal: combineSignals([options?.signal, signal]) };
}

function createLifecycleLedger(realWindow, realDocument) {
    let controller = null;
    let epoch = 0;
    const timeouts = new Set();
    const intervals = new Set();
    const animationFrames = new Set();
    const objectUrls = new Set();
    const observers = new Set();
    const patchedElements = new WeakSet();
    const rootStylePreimage = new Map();

    function begin(nextEpoch) {
        abort();
        epoch = nextEpoch;
        controller = new AbortController();
        ROOT_STYLE_PROPERTIES.forEach(property => {
            rootStylePreimage.set(property, realDocument.documentElement.style.getPropertyValue(property));
        });
        return controller.signal;
    }

    function isCurrent(candidate) {
        return candidate === epoch && !!controller && !controller.signal.aborted;
    }

    function assertCurrent(candidate) {
        if (!isCurrent(candidate)) throw abortError();
    }

    function signal() {
        return controller?.signal;
    }

    function setOwnedTimeout(callback, delay, ...args) {
        const ownedEpoch = epoch;
        const handle = realWindow.setTimeout(() => {
            timeouts.delete(handle);
            if (isCurrent(ownedEpoch)) callback(...args);
        }, delay);
        timeouts.add(handle);
        return handle;
    }

    function clearOwnedTimeout(handle) {
        timeouts.delete(handle);
        return realWindow.clearTimeout(handle);
    }

    function setOwnedInterval(callback, delay, ...args) {
        const ownedEpoch = epoch;
        const handle = realWindow.setInterval(() => {
            if (isCurrent(ownedEpoch)) callback(...args);
        }, delay);
        intervals.add(handle);
        return handle;
    }

    function clearOwnedInterval(handle) {
        intervals.delete(handle);
        return realWindow.clearInterval(handle);
    }

    function requestOwnedAnimationFrame(callback) {
        const ownedEpoch = epoch;
        const handle = realWindow.requestAnimationFrame(timestamp => {
            animationFrames.delete(handle);
            if (isCurrent(ownedEpoch)) callback(timestamp);
        });
        animationFrames.add(handle);
        return handle;
    }

    function cancelOwnedAnimationFrame(handle) {
        animationFrames.delete(handle);
        return realWindow.cancelAnimationFrame(handle);
    }

    function queueOwnedMicrotask(callback) {
        const ownedEpoch = epoch;
        realWindow.queueMicrotask(() => {
            if (isCurrent(ownedEpoch)) callback();
        });
    }

    function createOwnedObjectURL(value) {
        const url = realWindow.URL.createObjectURL(value);
        objectUrls.add(url);
        return url;
    }

    function revokeOwnedObjectURL(url) {
        objectUrls.delete(url);
        return realWindow.URL.revokeObjectURL(url);
    }

    function ownedObserver(Constructor) {
        return function ExperimentalOwnedObserver(callback) {
            const ownedEpoch = epoch;
            const observer = new Constructor((...args) => {
                if (isCurrent(ownedEpoch)) callback(...args);
            });
            const nativeDisconnect = observer.disconnect.bind(observer);
            observer.disconnect = () => {
                observers.delete(observer);
                nativeDisconnect();
            };
            observers.add(observer);
            return observer;
        };
    }

    function patchElement(element) {
        if (!element || patchedElements.has(element) || typeof element.addEventListener !== 'function') return element;
        const nativeAdd = element.addEventListener;
        Object.defineProperty(element, 'addEventListener', {
            configurable: true,
            value(type, listener, options) {
                return nativeAdd.call(element, type, listener, listenerOptionsWithSignal(options, signal()));
            }
        });
        patchedElements.add(element);
        return element;
    }

    function abort() {
        controller?.abort();
        controller = null;
        timeouts.forEach(handle => realWindow.clearTimeout(handle));
        timeouts.clear();
        intervals.forEach(handle => realWindow.clearInterval(handle));
        intervals.clear();
        animationFrames.forEach(handle => realWindow.cancelAnimationFrame(handle));
        animationFrames.clear();
        observers.forEach(observer => observer.disconnect());
        observers.clear();
        objectUrls.forEach(url => realWindow.URL.revokeObjectURL(url));
        objectUrls.clear();
        rootStylePreimage.forEach((value, property) => {
            if (value) realDocument.documentElement.style.setProperty(property, value);
            else realDocument.documentElement.style.removeProperty(property);
        });
        rootStylePreimage.clear();
    }

    return Object.freeze({
        begin,
        abort,
        isCurrent,
        assertCurrent,
        signal,
        setTimeout: setOwnedTimeout,
        clearTimeout: clearOwnedTimeout,
        setInterval: setOwnedInterval,
        clearInterval: clearOwnedInterval,
        requestAnimationFrame: requestOwnedAnimationFrame,
        cancelAnimationFrame: cancelOwnedAnimationFrame,
        queueMicrotask: queueOwnedMicrotask,
        createObjectURL: createOwnedObjectURL,
        revokeObjectURL: revokeOwnedObjectURL,
        MutationObserver: ownedObserver(realWindow.MutationObserver),
        ResizeObserver: ownedObserver(realWindow.ResizeObserver),
        IntersectionObserver: ownedObserver(realWindow.IntersectionObserver),
        patchElement,
        diagnostics: () => ({
            epoch,
            active: !!controller && !controller.signal.aborted,
            timeouts: timeouts.size,
            intervals: intervals.size,
            animationFrames: animationFrames.size,
            objectUrls: objectUrls.size,
            observers: observers.size
        })
    });
}

function ownedCollection(elements, ledger) {
    const values = [...elements].map(element => ledger.patchElement(element));
    Object.defineProperty(values, 'item', { value: index => values[index] || null });
    return values;
}

function createScopedDocument(realDocument, root, portalRoot, ledger) {
    const owns = element => !!element && (element === root || element === portalRoot || root.contains(element) || portalRoot.contains(element));
    const queryOne = selector => ledger.patchElement(root.querySelector(selector) || portalRoot.querySelector(selector));
    const queryAll = selector => ownedCollection(new Set([
        ...root.querySelectorAll(selector),
        ...portalRoot.querySelectorAll(selector)
    ]), ledger);
    const documentListeners = new Map();

    const facade = {
        get body() { return portalRoot; },
        get head() { return portalRoot; },
        get documentElement() { return root; },
        get activeElement() { return owns(realDocument.activeElement) ? realDocument.activeElement : null; },
        createElement(tag, options) { return ledger.patchElement(realDocument.createElement(tag, options)); },
        createElementNS(namespace, tag, options) { return ledger.patchElement(realDocument.createElementNS(namespace, tag, options)); },
        createDocumentFragment: (...args) => realDocument.createDocumentFragment(...args),
        createRange: (...args) => realDocument.createRange(...args),
        createTreeWalker: (...args) => realDocument.createTreeWalker(...args),
        execCommand: (...args) => realDocument.execCommand?.(...args) || false,
        getAnimations: (...args) => (realDocument.getAnimations?.(...args) || [])
            .filter(animation => owns(animation?.effect?.target)),
        getElementById(id) {
            const element = realDocument.getElementById(String(id || ''));
            return owns(element) ? ledger.patchElement(element) : null;
        },
        querySelector: queryOne,
        querySelectorAll: queryAll,
        addEventListener(type, listener, options) {
            if (typeof listener !== 'function' && typeof listener?.handleEvent !== 'function') return;
            const entries = [root, portalRoot].map(target => {
                const nextOptions = listenerOptionsWithSignal(options, ledger.signal());
                target.addEventListener(type, listener, nextOptions);
                return { target, type, listener, options: nextOptions };
            });
            const byType = documentListeners.get(type) || new Map();
            byType.set(listener, entries);
            documentListeners.set(type, byType);
        },
        removeEventListener(type, listener) {
            const entries = documentListeners.get(type)?.get(listener) || [];
            entries.forEach(entry => entry.target.removeEventListener(entry.type, entry.listener, entry.options));
            documentListeners.get(type)?.delete(listener);
        }
    };
    return Object.freeze(facade);
}

function createScopedWindow(realWindow, ledger, ownedFetch, services) {
    const listeners = new Map();
    const readablePlatformKeys = new Set([
        'devicePixelRatio', 'innerHeight', 'innerWidth', 'screen', 'location', 'Blob',
        'getSelection', 'matchMedia', 'crypto', 'performance'
    ]);
    return new Proxy(Object.create(null), {
        get(_target, key) {
            if (key === 'addEventListener') return (type, listener, options) => {
                const nextOptions = listenerOptionsWithSignal(options, ledger.signal());
                realWindow.addEventListener(type, listener, nextOptions);
                const entries = [{ target: realWindow, type, listener, options: nextOptions }];
                const byType = listeners.get(type) || new Map();
                byType.set(listener, entries);
                listeners.set(type, byType);
            };
            if (key === 'removeEventListener') return (type, listener) => {
                const entries = listeners.get(type)?.get(listener) || [];
                entries.forEach(entry => entry.target.removeEventListener(entry.type, entry.listener, entry.options));
                listeners.get(type)?.delete(listener);
            };
            if (key === 'setTimeout') return ledger.setTimeout;
            if (key === 'clearTimeout') return ledger.clearTimeout;
            if (key === 'setInterval') return ledger.setInterval;
            if (key === 'clearInterval') return ledger.clearInterval;
            if (key === 'requestAnimationFrame') return ledger.requestAnimationFrame;
            if (key === 'cancelAnimationFrame') return ledger.cancelAnimationFrame;
            if (key === 'queueMicrotask') return ledger.queueMicrotask;
            if (key === 'fetch') return ownedFetch;
            if (key === 'open') return services.openExternal || (() => null);
            if (!readablePlatformKeys.has(key)) return undefined;
            const value = realWindow[key];
            return typeof value === 'function' ? value.bind(realWindow) : value;
        }
    });
}

function createPrivateStorage(storage) {
    return Object.freeze({
        get length() {
            let count = 0;
            for (let index = 0; index < storage.length; index += 1) {
                if (String(storage.key(index) || '').startsWith(STORAGE_PREFIX)) count += 1;
            }
            return count;
        },
        key(index) {
            const keys = [];
            for (let cursor = 0; cursor < storage.length; cursor += 1) {
                const key = String(storage.key(cursor) || '');
                if (key.startsWith(STORAGE_PREFIX)) keys.push(key.slice(STORAGE_PREFIX.length));
            }
            return keys[index] || null;
        },
        getItem: key => storage.getItem(STORAGE_PREFIX + String(key)),
        setItem: (key, value) => storage.setItem(STORAGE_PREFIX + String(key), String(value)),
        removeItem: key => storage.removeItem(STORAGE_PREFIX + String(key)),
        clear() {
            const keys = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = String(storage.key(index) || '');
                if (key.startsWith(STORAGE_PREFIX)) keys.push(key);
            }
            keys.forEach(key => storage.removeItem(key));
        }
    });
}

async function readShell(services, signal) {
    const response = await services.fetch(SHELL_URL, { signal, cache: 'no-store', credentials: 'same-origin' });
    if (!response?.ok) throw new Error(`Experimental Worlds shell could not load (${response?.status || 'no response'}).`);
    return response.text();
}

function mountShell(html, root, portalRoot, realDocument, ledger) {
    const template = realDocument.createElement('template');
    template.innerHTML = html;
    const main = realDocument.createDocumentFragment();
    const portals = realDocument.createDocumentFragment();
    [...template.content.children].forEach(element => {
        const destination = element.matches('section.experimental-worlds-view') ? main : portals;
        destination.appendChild(ledger.patchElement(element));
    });
    root.replaceChildren(main);
    portalRoot.replaceChildren(portals);
    root.dataset.owner = 'experimental-worlds';
    portalRoot.dataset.owner = 'experimental-worlds';
}

function createOwnershipReader(state) {
    return () => {
        const snapshot = state.core?.snapshot?.() || {};
        const instance = snapshot.worldInstances?.[snapshot.activeWorldId] || null;
        const timeline = instance?.sessions?.find(session => session.id === instance.activeSessionId) || null;
        return {
            epoch: state.epoch,
            worldId: snapshot.activeWorldId || null,
            timelineId: instance?.activeSessionId || null,
            revision: timeline?.revision ?? timeline?.sidecar?.revision ?? null,
            take: timeline?.take ?? timeline?.sidecar?.take ?? null,
            attempt: timeline?.attempt ?? timeline?.sidecar?.attempt ?? null,
            restoreGeneration: Number(state.services.restoreGeneration?.() ?? state.restoreGeneration ?? 0)
        };
    };
}

function sameOwnership(left, right) {
    return left.epoch === right.epoch
        && left.worldId === right.worldId
        && left.timelineId === right.timelineId
        && left.revision === right.revision
        && left.take === right.take
        && left.attempt === right.attempt
        && left.restoreGeneration === right.restoreGeneration;
}

export function createExperimentalWorldsMode({ root, portalRoot, services, repository }) {
    if (!(root instanceof Element) || !(portalRoot instanceof Element)) {
        throw new TypeError('Experimental Worlds mode requires owned root and portal elements.');
    }
    if (!services || typeof services.fetch !== 'function') {
        throw new TypeError('Experimental Worlds mode requires an injected fetch service.');
    }
    if (!repository || typeof repository.snapshot !== 'function') {
        throw new TypeError('Experimental Worlds mode requires its persistence repository.');
    }

    const realWindow = root.ownerDocument.defaultView;
    const realDocument = root.ownerDocument;
    const ledger = createLifecycleLedger(realWindow, realDocument);
    const state = {
        epoch: 0,
        core: null,
        active: false,
        mounted: false,
        disposed: false,
        pendingMount: null,
        releaseVendorContext: null,
        route: 'library',
        workspace: null,
        restoreGeneration: Number(services.restoreGeneration?.() || 0),
        services
    };
    const readOwnership = createOwnershipReader(state);

    function beginActivation() {
        state.epoch += 1;
        ledger.begin(state.epoch);
        return state.epoch;
    }

    function assertUsable() {
        if (state.disposed) throw new Error('Experimental Worlds mode has been disposed.');
    }

    function makeEnvironment(epoch) {
        const scopedDocument = createScopedDocument(realDocument, root, portalRoot, ledger);
        const ownedFetch = async (input, init = {}) => {
            ledger.assertCurrent(epoch);
            const owner = readOwnership();
            const assertOwner = () => {
                ledger.assertCurrent(epoch);
                if (!sameOwnership(owner, readOwnership())) {
                    throw abortError('Experimental Worlds request owner changed before completion.');
                }
            };
            const signal = combineSignals([init.signal, ledger.signal()]);
            const response = await services.fetch(input, { ...init, signal });
            assertOwner();
            const wrapResponse = target => new Proxy(target, {
                get(target, key) {
                    const value = Reflect.get(target, key, target);
                    if (['arrayBuffer', 'blob', 'formData', 'json', 'text'].includes(key) && typeof value === 'function') {
                        return async (...args) => {
                            const result = await value.apply(target, args);
                            assertOwner();
                            return result;
                        };
                    }
                    if (key === 'clone' && typeof value === 'function') {
                        return () => wrapResponse(value.call(target));
                    }
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
            return wrapResponse(response);
        };
        const scopedWindow = createScopedWindow(realWindow, ledger, ownedFetch, services);
        return {
            window: scopedWindow,
            document: scopedDocument,
            fetch: ownedFetch,
            setTimeout: ledger.setTimeout,
            clearTimeout: ledger.clearTimeout,
            setInterval: ledger.setInterval,
            clearInterval: ledger.clearInterval,
            requestAnimationFrame: ledger.requestAnimationFrame,
            cancelAnimationFrame: ledger.cancelAnimationFrame,
            queueMicrotask: ledger.queueMicrotask,
            URL: Object.freeze({
                createObjectURL: ledger.createObjectURL,
                revokeObjectURL: ledger.revokeObjectURL
            }),
            URLConstructor: realWindow.URL,
            MutationObserver: ledger.MutationObserver,
            ResizeObserver: ledger.ResizeObserver,
            IntersectionObserver: ledger.IntersectionObserver,
            localStorage: createPrivateStorage(realWindow.localStorage),
            navigator: realWindow.navigator,
            confirm: services.confirm || (() => false),
            prompt: services.prompt || (() => null),
            bindVendorContext(binding) {
                state.releaseVendorContext?.();
                const release = bindExperimentalWorldsVendorContext(binding);
                const releaseOwned = () => {
                    release();
                    if (state.releaseVendorContext === releaseOwned) state.releaseVendorContext = null;
                };
                state.releaseVendorContext = releaseOwned;
                return state.releaseVendorContext;
            },
            services,
            repository,
            restoreGeneration: () => Number(services.restoreGeneration?.() ?? state.restoreGeneration ?? 0),
            onWorkspaceChange(workspace) {
                state.workspace = structuredClone(workspace);
                state.route = normalizeRoute(workspace?.route);
                services.onWorkspaceChange?.(structuredClone(workspace));
            },
            abortOwnedOperations: () => ledger.abort()
        };
    }

    async function mount() {
        assertUsable();
        if (state.mounted) return;
        if (state.pendingMount) return state.pendingMount;
        const epoch = ledger.signal()?.aborted === false ? state.epoch : beginActivation();
        const pending = (async () => {
            const [html, snapshot] = await Promise.all([
                readShell(services, ledger.signal()),
                repository.snapshot()
            ]);
            ledger.assertCurrent(epoch);
            mountShell(html, root, portalRoot, realDocument, ledger);
            const environment = makeEnvironment(epoch);
            const core = createExperimentalWorldsCoreRuntime(environment);
            state.core = core;
            state.restoreGeneration = Number(services.restoreGeneration?.() ?? snapshot.restoreGeneration ?? 0);
            await core.initialize(snapshot);
            ledger.assertCurrent(epoch);
            state.workspace = structuredClone(snapshot.workspace || state.workspace || { route: 'library' });
            state.mounted = true;
            root.hidden = true;
            portalRoot.hidden = true;
            root.classList.add('hidden');
            portalRoot.classList.add('hidden');
        })();
        state.pendingMount = pending;
        try {
            await pending;
        } catch (error) {
            if (state.epoch === epoch) {
                state.releaseVendorContext?.();
                state.releaseVendorContext = null;
                state.core = null;
                state.mounted = false;
                root.replaceChildren();
                portalRoot.replaceChildren();
            }
            throw error;
        } finally {
            if (state.pendingMount === pending) state.pendingMount = null;
        }
    }

    async function activate(route = state.workspace?.route || state.route || 'library') {
        assertUsable();
        if (state.active && state.mounted) {
            state.route = normalizeRoute(route);
            state.core.activate(state.route);
            return;
        }
        if (!ledger.signal() || ledger.signal().aborted) beginActivation();
        const epoch = state.epoch;
        await mount();
        ledger.assertCurrent(epoch);
        root.hidden = false;
        portalRoot.hidden = false;
        root.classList.remove('hidden');
        portalRoot.classList.remove('hidden');
        state.active = true;
        const workspace = state.workspace || { route: normalizeRoute(route) };
        workspace.route = normalizeRoute(route || workspace.route);
        await state.core.restoreWorkspace(workspace);
        ledger.assertCurrent(epoch);
        state.route = normalizeRoute(state.core.captureWorkspace()?.route);
    }

    function captureWorkspace() {
        return structuredClone(state.core?.captureWorkspace?.() || state.workspace || { route: state.route });
    }

    async function restoreWorkspace(workspace = {}) {
        assertUsable();
        state.workspace = structuredClone(workspace && typeof workspace === 'object' ? workspace : {});
        state.route = normalizeRoute(state.workspace.route);
        if (state.active && state.core) {
            await state.core.restoreWorkspace(state.workspace);
            state.workspace = captureWorkspace();
        }
    }

    function abortOwnedOperations() {
        state.epoch += 1;
        state.core?.abortOwnedOperations?.();
        ledger.abort();
    }

    async function deactivate({ persist = true } = {}) {
        if (!state.mounted && !state.pendingMount) return;
        const workspace = captureWorkspace();
        state.workspace = workspace;
        if (persist) {
            try {
                await state.core?.persist?.('workspace-deactivate');
            } catch (error) {
                services.diagnostics?.().runtimeErrors?.push?.({
                    source: 'experimental-worlds-deactivate',
                    message: error?.message || String(error)
                });
            }
        }
        state.core?.deactivate?.();
        state.releaseVendorContext?.();
        state.releaseVendorContext = null;
        abortOwnedOperations();
        state.active = false;
        state.mounted = false;
        state.pendingMount = null;
        state.core = null;
        root.replaceChildren();
        portalRoot.replaceChildren();
        root.hidden = true;
        portalRoot.hidden = true;
        root.classList.add('hidden');
        portalRoot.classList.add('hidden');
        services.onWorkspaceChange?.(structuredClone(workspace));
    }

    async function dispose() {
        if (state.disposed) return;
        await deactivate();
        state.disposed = true;
    }

    return Object.freeze({
        mount,
        activate,
        deactivate,
        dispose,
        captureWorkspace,
        restoreWorkspace,
        abortOwnedOperations
    });
}
