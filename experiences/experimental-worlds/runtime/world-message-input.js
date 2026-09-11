/* Pinned World-composer sizing behaviour; independent of the host Chat input. */
function resizeExperimentalWorldMessageInput(input = document.getElementById('ew-world-user-input')) {
    if (!input) return;
    const defaultHeight = Number(input.dataset.defaultHeight)
        || Math.max(1, Math.ceil(parseFloat(getComputedStyle(input).minHeight) || input.clientHeight || 22));
    input.dataset.defaultHeight = String(defaultHeight);
    const maximumHeight = defaultHeight * 5;
    input.style.height = 'auto';
    const automaticHeight = Math.min(input.scrollHeight, maximumHeight);
    const manualHeight = Number(input.dataset.manualHeight) || 0;
    const height = Math.max(automaticHeight, manualHeight);
    input.style.height = `${Math.max(defaultHeight, height)}px`;
    input.style.overflowY = input.scrollHeight > height ? 'auto' : 'hidden';
}

function resetExperimentalWorldMessageInput(input = document.getElementById('ew-world-user-input')) {
    if (!input) return;
    input.value = '';
    delete input.dataset.manualHeight;
    input.style.height = '';
    input.style.overflowY = '';
}

function setExperimentalWorldMessageInputManualHeight(input, requestedHeight) {
    if (!input) return;
    const defaultHeight = Number(input.dataset.defaultHeight)
        || Math.max(1, Math.ceil(parseFloat(getComputedStyle(input).minHeight) || input.clientHeight || 22));
    input.dataset.defaultHeight = String(defaultHeight);
    const maximumHeight = Math.max(defaultHeight * 5, Math.floor(window.innerHeight * 0.7));
    const height = Math.max(defaultHeight, Math.min(maximumHeight, Math.round(requestedHeight)));
    input.dataset.manualHeight = String(height);
    input.style.height = `${height}px`;
    input.style.overflowY = input.scrollHeight > height ? 'auto' : 'hidden';
}

function installExperimentalWorldMessageResizeHandle(input, handle) {
    if (!input || !handle) return;
    let drag = null;
    const stop = event => {
        if (!drag) return;
        if (event?.pointerId !== undefined) handle.releasePointerCapture?.(event.pointerId);
        drag = null;
    };
    handle.addEventListener('pointerdown', event => {
        event.preventDefault();
        const height = input.getBoundingClientRect().height || Number(input.dataset.defaultHeight) || 22;
        drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: height };
        handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        setExperimentalWorldMessageInputManualHeight(input, drag.startHeight + drag.startY - event.clientY);
    });
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const current = input.getBoundingClientRect().height || Number(input.dataset.defaultHeight) || 22;
        setExperimentalWorldMessageInputManualHeight(input, current + (event.key === 'ArrowUp' ? 16 : -16));
    });
}
