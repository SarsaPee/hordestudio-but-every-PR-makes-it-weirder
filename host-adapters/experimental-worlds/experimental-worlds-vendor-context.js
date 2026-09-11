/*
 * Stable, module-scoped facades for the generated ScenePulse source mirror.
 *
 * The preserved ScenePulse source was authored as native ESM but expects a
 * SillyTavern-shaped browser environment.  Importing those modules directly
 * would make their `document`, `window`, `SillyTavern` and timer lookups land
 * on Horde Studio's real globals.  The generated mirror imports these stable
 * facades instead.  The active Experimental mode swaps only this private
 * binding; it never installs or snapshots browser globals.
 */

let activeBinding = null;
let bindingToken = 0;

function requireBinding() {
    if (!activeBinding) throw new Error('ScenePulse source runtime is not attached to an active Experimental World.');
    return activeBinding;
}

function liveObject(select) {
    return new Proxy(Object.create(null), {
        get(_target, key) {
            const source = select(requireBinding());
            const value = source?.[key];
            return typeof value === 'function' ? value.bind(source) : value;
        },
        set(_target, key, value) {
            const source = select(requireBinding());
            if (!source) return false;
            source[key] = value;
            return true;
        },
        has(_target, key) {
            const source = select(requireBinding());
            return !!source && key in source;
        },
        ownKeys() {
            return Reflect.ownKeys(select(requireBinding()) || {});
        },
        getOwnPropertyDescriptor(_target, key) {
            const source = select(requireBinding());
            const descriptor = source ? Reflect.getOwnPropertyDescriptor(source, key) : null;
            return descriptor || { configurable: true, enumerable: false, writable: true, value: undefined };
        }
    });
}

const windowFacade = liveObject(binding => binding.window);
const documentFacade = liveObject(binding => binding.document);
const storageFacade = liveObject(binding => binding.localStorage);
const navigatorFacade = liveObject(binding => binding.navigator);
const sillyTavernFacade = liveObject(binding => binding.window?.SillyTavern || {});
const toastrFacade = liveObject(binding => binding.window?.toastr || {});

function delegated(name) {
    return (...args) => {
        const fn = requireBinding()[name];
        if (typeof fn !== 'function') throw new TypeError(`Experimental ScenePulse environment does not provide ${name}.`);
        return fn(...args);
    };
}

function delegatedConstructor(name) {
    return function ExperimentalOwnedConstructor(...args) {
        const Constructor = requireBinding()[name];
        if (typeof Constructor !== 'function') throw new TypeError(`Experimental ScenePulse environment does not provide ${name}.`);
        return new Constructor(...args);
    };
}

function ExperimentalOwnedURL(value, base) {
    const Constructor = requireBinding().URLConstructor;
    if (typeof Constructor !== 'function') throw new TypeError('Experimental ScenePulse environment does not provide URL.');
    return new Constructor(value, base);
}

ExperimentalOwnedURL.createObjectURL = delegated('createObjectURL');
ExperimentalOwnedURL.revokeObjectURL = delegated('revokeObjectURL');

export const experimentalWorldsVendorGlobals = Object.freeze({
    window: windowFacade,
    document: documentFacade,
    localStorage: storageFacade,
    navigator: navigatorFacade,
    SillyTavern: sillyTavernFacade,
    toastr: toastrFacade,
    fetch: delegated('fetch'),
    setTimeout: delegated('setTimeout'),
    clearTimeout: delegated('clearTimeout'),
    setInterval: delegated('setInterval'),
    clearInterval: delegated('clearInterval'),
    requestAnimationFrame: delegated('requestAnimationFrame'),
    cancelAnimationFrame: delegated('cancelAnimationFrame'),
    queueMicrotask: delegated('queueMicrotask'),
    MutationObserver: delegatedConstructor('MutationObserver'),
    ResizeObserver: delegatedConstructor('ResizeObserver'),
    IntersectionObserver: delegatedConstructor('IntersectionObserver'),
    URL: ExperimentalOwnedURL
});

export function bindExperimentalWorldsVendorContext(binding) {
    if (!binding || typeof binding !== 'object') {
        throw new TypeError('Experimental ScenePulse vendor context requires a scoped environment.');
    }
    const token = ++bindingToken;
    activeBinding = binding;
    return () => {
        if (token === bindingToken) activeBinding = null;
    };
}

