// Runs before the application bundle so parse/startup failures remain visible
// to the recovery UI and automated diagnostics.
window.__hordeRuntimeErrors = [];
window.addEventListener('error', event => {
    window.__hordeRuntimeErrors.push({ message: String(event.message || 'Runtime error'), stack: String(event.error?.stack || '') });
    window.__hordeRuntimeErrors = window.__hordeRuntimeErrors.slice(-20);
});
window.addEventListener('unhandledrejection', event => {
    window.__hordeRuntimeErrors.push({ message: String(event.reason?.message || event.reason || 'Unhandled rejection'), stack: String(event.reason?.stack || '') });
    window.__hordeRuntimeErrors = window.__hordeRuntimeErrors.slice(-20);
});
