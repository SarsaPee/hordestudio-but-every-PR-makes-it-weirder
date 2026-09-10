const WORLD_VISUAL_ASPECTS = new Set(['1:1', '3:4', '2:3', '4:3', '16:9', '9:16']);
const WORLD_VISUAL_RESOLUTIONS = new Set([768, 1200, 1600, 2048]);
let worldVisualEditorState = null;
let worldVisualEditorBound = false;

function normalizedWorldVisualAspect(value, fallback) {
    return WORLD_VISUAL_ASPECTS.has(String(value || '')) ? String(value) : fallback;
}

function normalizedWorldVisualResolution(value, fallback) {
    const numeric = Number(value);
    return WORLD_VISUAL_RESOLUTIONS.has(numeric) ? numeric : fallback;
}

function worldVisualDimensions(aspectRatio, maxDimension) {
    const [rawWidth, rawHeight] = String(aspectRatio || '1:1').split(':').map(Number);
    const ratioWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
    const ratioHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
    const longest = normalizedWorldVisualResolution(maxDimension, 1200);
    if (ratioWidth >= ratioHeight) {
        return { width: longest, height: Math.max(1, Math.round(longest * ratioHeight / ratioWidth)) };
    }
    return { width: Math.max(1, Math.round(longest * ratioWidth / ratioHeight)), height: longest };
}

function loadEmbeddedImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth && image.naturalHeight
            ? resolve(image) : reject(new Error('The image has no readable dimensions.'));
        image.onerror = () => reject(new Error('The selected image could not be decoded.'));
        image.src = source;
    });
}

async function cropWorldVisual(source, aspectRatio, maxDimension, focusX, focusY, zoom, quality = 0.86) {
    const image = await loadEmbeddedImage(source);
    const output = worldVisualDimensions(aspectRatio, maxDimension);
    const baseScale = Math.max(output.width / image.naturalWidth, output.height / image.naturalHeight);
    const scale = baseScale * Math.max(0.5, Math.min(3, Number(zoom) || 1));
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const x = (output.width - renderedWidth) * Math.max(0, Math.min(1, Number(focusX) / 100));
    const y = (output.height - renderedHeight) * Math.max(0, Math.min(1, Number(focusY) / 100));
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not create an image canvas.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, x, y, renderedWidth, renderedHeight);
    return canvas.toDataURL('image/jpeg', quality);
}

async function frameWorldVisualForFill(source, aspectRatio, maxDimension, focusX = 50, focusY = 50, zoom = 1) {
    // Unlike cropWorldVisual(), this preserves every source pixel. The
    // transparent space is deliberate evidence for an image-to-image model:
    // it is the portion of the requested frame which needs outpainting.
    const image = await loadEmbeddedImage(source);
    const output = worldVisualDimensions(aspectRatio, maxDimension);
    const scale = Math.min(output.width / image.naturalWidth, output.height / image.naturalHeight)
        * Math.max(0.5, Math.min(3, Number(zoom) || 1));
    const renderedWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const renderedHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const x = Math.round((output.width - renderedWidth) * Math.max(0, Math.min(1, Number(focusX) / 100)));
    const y = Math.round((output.height - renderedHeight) * Math.max(0, Math.min(1, Number(focusY) / 100)));
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare an outpainting frame.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight,
        x, y, renderedWidth, renderedHeight);
    return canvas.toDataURL('image/png');
}

function worldVisualCropFillPrompt(editor, aspectRatio, correction = '') {
    const subject = editor.kind === 'npc' ? 'character portrait' : 'location visual';
    const extra = String(correction || '').trim();
    return [
        `Outpaint the supplied ${subject} into a complete ${aspectRatio} final frame.`,
        'Keep every already-visible person, face, clothing, tattoo, object and environment detail intact. The transparent or empty margins represent missing image data only: extend the existing environment naturally into them.',
        'Do not crop, zoom into, replace, duplicate or redesign the visible source. Preserve its identity, composition, lighting and visual style while completing only the missing edges.',
        extra ? `Additional authorised adjustment: ${extra}` : ''
    ].filter(Boolean).join('\n\n');
}

function worldVisualEditorAssetId(editor = worldVisualEditorState) {
    if (!editor) return '';
    return editor.kind === 'npc'
        ? editor.target.visuals?.portraitAssetId || ''
        : editor.target.visuals?.backgroundAssetId || '';
}

function worldVisualHistoryForEditor(editor = worldVisualEditorState) {
    if (!editor?.world || !editor?.target) return [];
    const history = worldVisualHistory(editor?.world, editor?.target, editor?.kind);
    if (!editor || editor.kind !== 'npc' || !editor.variantFilter || editor.variantFilter === 'all') return history;
    return history.filter(assetId => {
        const outfit = worldOutfitForAsset(editor.target, assetId);
        return editor.variantFilter === 'unassigned' ? !outfit : outfit?.id === editor.variantFilter;
    });
}

function applyWorldVisualVariantFilter() {
    const editor = worldVisualEditorState;
    if (!editor || editor.kind !== 'npc') return;
    const history = worldVisualHistoryForEditor(editor);
    const current = worldVisualEditorAssetId(editor);
    if (!history.includes(current)) {
        editor.target.visuals.portraitAssetId = history.at(-1) || '';
        editor.target.visuals.portraitDisplayAssetId = '';
    }
    updateWorldVisualCropPreview();
}

// NPC portraits render in a fixed 1:1 profile frame everywhere in the app.
// The generated source keeps its provider aspect ratio; the profile image is
// a derived, deliberately framed crop of that source, never a silent trim.
const WORLD_NPC_PORTRAIT_DISPLAY_ASPECT = '1:1';

function worldNpcPortraitDisplayAssetId(entity) {
    return String(entity?.visuals?.portraitDisplayAssetId || '').slice(0, 160);
}

function worldNpcPortraitSource(world, entity) {
    const displayId = worldNpcPortraitDisplayAssetId(entity);
    if (displayId) {
        const display = worldMediaSource(world, displayId);
        if (display) return display;
    }
    return worldMediaSource(world, entity?.visuals?.portraitAssetId);
}

async function deriveWorldNpcPortraitDisplay(world, entity, focusX = 50, focusY = 50, zoom = 1) {
    const sourceId = String(entity?.visuals?.portraitAssetId || '');
    const source = worldMediaSource(world, sourceId);
    if (!source) return '';
    const resolution = normalizedWorldVisualResolution(entity?.visuals?.portraitResolution, 1200);
    const cropped = await cropWorldVisual(source, WORLD_NPC_PORTRAIT_DISPLAY_ASPECT, resolution,
        focusX, focusY, zoom, 0.84);
    const assetId = addWorldMediaAsset(world, cropped, 'npc_portrait',
        `${entity?.name || 'NPC'} (profile frame)`,
        { prompt: `Derived ${WORLD_NPC_PORTRAIT_DISPLAY_ASPECT} profile frame of source asset ${sourceId}.`, entityId: entity?.id, sourceAssetId: sourceId });
    entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
    entity.visuals.portraitDisplayAssetId = assetId;
    return assetId;
}

function worldVisualHistoryKeys(kind) {
    return kind === 'npc'
        ? { current: 'portraitAssetId', history: 'portraitAssetHistory' }
        : { current: 'backgroundAssetId', history: 'backgroundAssetHistory' };
}

function worldVisualHistory(world, target, kind) {
    target.visuals = isPlainObject(target.visuals) ? target.visuals : {};
    const keys = worldVisualHistoryKeys(kind);
    const valid = new Set((world?.mediaAssets || []).map(asset => asset.id));
    const history = [];
    (Array.isArray(target.visuals[keys.history]) ? target.visuals[keys.history] : []).forEach(id => {
        if (valid.has(id) && !history.includes(id)) history.push(id);
    });
    const current = String(target.visuals[keys.current] || '');
    if (valid.has(current) && !history.includes(current)) history.push(current);
    target.visuals[keys.history] = history;
    target.visuals[keys.current] = valid.has(current) ? current : (history.at(-1) || '');
    return history;
}

function registerWorldVisualVariant(world, target, kind, assetId) {
    const keys = worldVisualHistoryKeys(kind);
    const history = worldVisualHistory(world, target, kind);
    if (assetId && !history.includes(assetId)) history.push(assetId);
    target.visuals[keys.history] = history;
    target.visuals[keys.current] = assetId || '';
    if (kind === 'npc' && assetId) target.visuals.portraitDisplayAssetId = '';
    if (kind === 'npc' && assetId) {
        const asset = worldMediaAsset(world, assetId);
        const outfit = worldOutfitForAsset(target, assetId)
            || attachWorldVisualToOutfit(target, assetId, asset?.outfitId || '');
        if (asset && outfit) {
            asset.entityId = target.id;
            asset.outfitId = outfit.id;
        }
    }
    return assetId;
}

function clearWorldVisualVariants(target, kind) {
    target.visuals = isPlainObject(target.visuals) ? target.visuals : {};
    const keys = worldVisualHistoryKeys(kind);
    target.visuals[keys.current] = '';
    target.visuals[keys.history] = [];
    if (kind === 'npc') target.visuals.portraitDisplayAssetId = '';
}

function selectWorldVisualVariant(editor, offset) {
    const history = worldVisualHistoryForEditor(editor);
    if (!history.length) return;
    const keys = worldVisualHistoryKeys(editor.kind);
    const current = Math.max(0, history.indexOf(editor.target.visuals[keys.current]));
    const next = Math.max(0, Math.min(history.length - 1, current + offset));
    editor.target.visuals[keys.current] = history[next];
    document.getElementById('world-visual-crop-x').value = '50';
    document.getElementById('world-visual-crop-y').value = '50';
    document.getElementById('world-visual-crop-zoom').value = '100';
    updateWorldVisualCropPreview();
    if (editor.kind === 'npc') {
        // Switching variants switches the source; the 1:1 profile frame is
        // re-derived from the newly selected source so a record never shows
        // one variant's crop over another variant's pixels.
        deriveWorldNpcPortraitDisplay(editor.world, editor.target)
            .then(() => renderWorldEntities())
            .catch(() => {});
    }
}

function renderWorldVisualOutfitGallery() {
    const editor = worldVisualEditorState;
    const gallery = document.getElementById('world-visual-outfit-gallery');
    if (!gallery) return;
    if (!editor || editor.kind !== 'npc') {
        gallery.hidden = true;
        gallery.innerHTML = '';
        return;
    }
    const groups = worldOutfits(editor.target).map(outfit => ({ outfit, assets: (outfit.imageAssetIds || []).filter(id => worldMediaSource(editor.world, id)) }));
    const allAssigned = new Set(groups.flatMap(group => group.assets));
    const unassigned = worldVisualHistory(editor.world, editor.target, 'npc').filter(id => !allAssigned.has(id));
    if (unassigned.length) groups.push({ outfit: { id: 'unassigned', name: 'Unassigned images' }, assets: unassigned });
    const populated = groups.filter(group => group.assets.length);
    gallery.hidden = !populated.length;
    gallery.innerHTML = populated.map(group => `<section class="world-visual-outfit-gallery-group"><div class="world-visual-outfit-gallery-title">${escapeHTML(group.outfit.name)} <span>${group.assets.length}</span></div><div class="world-visual-outfit-gallery-grid">${group.assets.map(assetId => {
        const source = worldMediaSource(editor.world, assetId);
        return `<button type="button" class="world-visual-outfit-gallery-thumb ${assetId === worldVisualEditorAssetId(editor) ? 'is-selected' : ''}" data-asset-id="${escapeHTML(assetId)}" data-outfit-id="${escapeHTML(group.outfit.id)}" title="Use ${escapeHTML(group.outfit.name)} image"><span style="background-image:url('${cssUrl(source)}')"></span></button>`;
    }).join('')}</div></section>`).join('');
    gallery.querySelectorAll('.world-visual-outfit-gallery-thumb').forEach(button => button.onclick = () => {
        const outfitId = button.dataset.outfitId;
        if (outfitId && outfitId !== 'unassigned') selectWorldOutfit(editor.world, editor.target, outfitId, { preferImage: false });
        editor.target.visuals.portraitAssetId = button.dataset.assetId;
        editor.target.visuals.portraitDisplayAssetId = '';
        updateWorldVisualCropPreview();
    });
}

function renderWorldVisualActiveOutfit() {
    const editor = worldVisualEditorState;
    const surface = document.getElementById('world-visual-active-outfit');
    if (!surface) return;
    const isNpc = !!editor && editor.kind === 'npc';
    surface.hidden = !isNpc;
    if (!isNpc) return;
    const list = document.getElementById('world-visual-active-outfit-list');
    if (!list) return;
    const outfits = worldOutfits(editor.target);
    const outfitHasAlternatives = description => /\b(?:or|either|alternatively|can wear|moves between)\b/i.test(String(description || ''));
    const selectedId = String(editor.target.visuals?.currentOutfitId || '');
    list.innerHTML = outfits.length ? outfits.map(outfit => {
        const imageIds = (outfit.imageAssetIds || []).filter(id => worldMediaSource(editor.world, id));
        const imageId = imageIds.includes(String(editor.target.visuals?.portraitAssetId || ''))
            ? String(editor.target.visuals.portraitAssetId)
            : (imageIds[imageIds.length - 1] || '');
        const image = imageId ? worldMediaSource(editor.world, imageId) : '';
        const active = outfit.id === selectedId;
        const selectedIndex = Math.max(0, imageIds.indexOf(String(editor.target.visuals?.portraitAssetId || '')));
        const imagePicker = imageIds.length
            ? `<span class="world-inline-outfit-image-picker"><button type="button" class="world-inline-outfit-image-prev" aria-label="Previous ${escapeHTML(outfit.name)} image">‹</button><span class="world-inline-outfit-image-count">${selectedIndex + 1} / ${imageIds.length}</span><button type="button" class="world-inline-outfit-image-next" aria-label="Next ${escapeHTML(outfit.name)} image">›</button></span>`
            : `<span class="world-inline-outfit-image-picker is-empty"><button type="button" class="world-inline-outfit-image-prev" aria-label="Previous image" disabled>‹</button><span class="world-inline-outfit-image-count">0 / 0</span><button type="button" class="world-inline-outfit-image-next" aria-label="Next image" disabled>›</button></span>`;
        const warning = outfitHasAlternatives(outfit.description)
            ? '<span class="form-hint world-outfit-warning">This outfit contains alternatives; FIBO may combine them.</span>' : '';
        return `<div class="world-inline-outfit-editor ${active ? 'is-active' : ''}" data-outfit-id="${escapeHTML(outfit.id)}"><div class="world-inline-outfit-image-column"><button type="button" class="world-inline-outfit-thumb world-inline-outfit-image-open" title="Select ${escapeHTML(outfit.name)}" ${image ? `style="background-image:url('${cssUrl(image)}')"` : ''}>${image ? '' : '＋'}</button>${imagePicker}</div><div class="world-inline-outfit-copy"><input class="world-inline-outfit-name-input" value="${escapeHTML(outfit.name)}" aria-label="Outfit name" placeholder="Outfit name…"><textarea class="world-inline-outfit-description-input" rows="2" aria-label="Outfit description" placeholder="What they are wearing…">${escapeHTML(outfit.description)}</textarea>${warning}<div class="world-inline-outfit-meta"><span class="world-inline-outfit-actions"><button type="button" class="world-inline-outfit-select ${active ? 'is-current' : ''}">${active ? 'Current outfit' : 'Wear this outfit'}</button><button type="button" class="world-visual-outfit-generate">Generate</button><button type="button" class="world-visual-outfit-delete">Delete</button></span></div></div></div>`;
    }).join('') : '<span class="form-hint">No outfits yet. Use New outfit to author the first one.</span>';
    list.querySelectorAll('.world-inline-outfit-editor').forEach(card => {
        const outfit = outfits.find(entry => entry.id === card.dataset.outfitId);
        if (!outfit) return;
        card.onclick = event => {
            if (event.target.closest('input, textarea, button')) return;
            selectWorldOutfit(editor.world, editor.target, outfit.id, { preferImage: false });
            renderWorldVisualActiveOutfit();
            updateWorldVisualCropPreview();
            scrollWorldOutfitCardIntoView(document.getElementById('world-visual-active-outfit-list'), outfit.id);
        };
        const selectOutfit = () => {
            selectWorldOutfit(editor.world, editor.target, outfit.id, { preferImage: false });
            renderWorldVisualActiveOutfit();
            updateWorldVisualCropPreview();
            scrollWorldOutfitCardIntoView(document.getElementById('world-visual-active-outfit-list'), outfit.id);
        };
        card.querySelector('.world-inline-outfit-image-open').onclick = selectOutfit;
        card.querySelector('.world-inline-outfit-select').onclick = selectOutfit;
        const chooseOutfitImage = direction => {
            const imageIds = (outfit.imageAssetIds || []).filter(id => worldMediaSource(editor.world, id));
            if (!imageIds.length) return;
            const currentIndex = imageIds.indexOf(String(editor.target.visuals?.portraitAssetId || ''));
            const nextIndex = (Math.max(0, currentIndex) + direction + imageIds.length) % imageIds.length;
            selectWorldOutfit(editor.world, editor.target, outfit.id, { preferImage: false });
            editor.target.visuals.portraitAssetId = imageIds[nextIndex];
            editor.target.visuals.portraitDisplayAssetId = '';
            renderWorldVisualActiveOutfit();
            updateWorldVisualCropPreview();
            scrollWorldOutfitCardIntoView(document.getElementById('world-visual-active-outfit-list'), outfit.id);
        };
        card.querySelector('.world-inline-outfit-image-prev').onclick = event => { event.stopPropagation(); chooseOutfitImage(-1); };
        card.querySelector('.world-inline-outfit-image-next').onclick = event => { event.stopPropagation(); chooseOutfitImage(1); };
        card.querySelector('.world-inline-outfit-name-input').onchange = event => {
            outfit.name = String(event.target.value || '').trim().slice(0, 80) || 'Untitled outfit';
            editor.target.visuals.outfits = worldOutfits(editor.target).map(entry => entry.id === outfit.id ? outfit : entry);
            updateWorldTokenCount();
        };
        card.querySelector('.world-inline-outfit-description-input').onchange = event => {
            outfit.description = String(event.target.value || '').trim().slice(0, 1200);
            editor.target.visuals.outfits = worldOutfits(editor.target).map(entry => entry.id === outfit.id ? outfit : entry);
            if (editor.target.visuals.currentOutfitId === outfit.id) editor.target.currentOutfit = outfit.description;
            updateWorldTokenCount();
        };
        card.querySelector('.world-visual-outfit-generate').onclick = async event => {
            event.stopPropagation();
            selectWorldOutfit(editor.world, editor.target, outfit.id, { preferImage: false });
            const button = event.currentTarget;
            const original = button.textContent;
            button.disabled = true;
            button.textContent = 'Generating…';
            try {
                saveWorldVisualEditorFields();
                const assetId = await generateWorldNpcPortrait(editor.world, editor.target, {
                    outfitId: outfit.id,
                    maxDimension: normalizedWorldVisualResolution(editor.target.visuals?.portraitResolution, 1200),
                    operation: 'generate'
                });
                registerWorldVisualVariant(editor.world, editor.target, 'npc', assetId);
                attachWorldVisualToOutfit(editor.target, assetId, outfit.id);
                const asset = worldMediaAsset(editor.world, assetId);
                if (asset) {
                    asset.entityId = editor.target.id;
                    asset.outfitId = outfit.id;
                    asset.outfitSnapshot = safeJsonClone(outfit);
                }
                await deriveWorldNpcPortraitDisplay(editor.world, editor.target);
                pruneWorldMediaAssets(editor.world);
                refreshWorldVisualEditorAfterAsset();
                showToast(`Generated ${outfit.name}.`, 'success');
            } catch (error) {
                showToast(`Outfit generation failed: ${error.message}`, 'error');
            } finally {
                button.disabled = false;
                button.textContent = original;
                renderWorldVisualActiveOutfit();
            }
        };
        bindWorldOutfitDelete(card.querySelector('.world-visual-outfit-delete'), () => {
            editor.target.visuals.outfits = worldOutfits(editor.target).filter(entry => entry.id !== outfit.id);
            if (editor.target.visuals.currentOutfitId === outfit.id) {
                editor.target.visuals.currentOutfitId = editor.target.visuals.outfits[0]?.id || '';
                editor.target.currentOutfit = editor.target.visuals.outfits[0]?.description || '';
            }
            renderWorldVisualActiveOutfit();
        });
    });
    const apply = document.getElementById('world-visual-apply-outfit');
    if (apply) apply.disabled = !outfits.some(outfit => outfit.id === selectedId);
}

// Keep revised visual prose readable without forcing a huge fixed textarea.
// Revision/AI responses can be much longer than the initial `rows` value, so
// grow the field to its content up to a bounded height, then let the field
// scroll internally. The explicit height is reset before measuring so this is
// safe to call after programmatic value changes.
function autoSizeWorldVisualTextarea(input) {
    if (!input || input.tagName !== 'TEXTAREA') return;
    const minHeight = Math.max(48, parseFloat(getComputedStyle(input).minHeight) || 0);
    const maxHeight = 320;
    input.style.height = 'auto';
    const contentHeight = Math.max(minHeight, input.scrollHeight);
    input.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}

function autoSizeWorldVisualTextareas() {
    ['world-visual-primary', 'world-visual-prompt', 'world-visual-correction']
        .forEach(id => autoSizeWorldVisualTextarea(document.getElementById(id)));
}

async function applyWorldOutfitAndGenerate(event) {
    const editor = worldVisualEditorState;
    if (!editor || editor.kind !== 'npc') return;
    const button = event.currentTarget;
    const selectedId = String(editor.target.visuals?.currentOutfitId || '');
    const outfit = selectWorldOutfit(editor.world, editor.target, selectedId, { preferImage: false });
    if (!outfit) return showToast('Select an outfit before applying it.', 'error');
    renderWorldVisualActiveOutfit();
    const source = worldMediaSource(editor.world, worldVisualEditorAssetId(editor));
    const instruction = `Replace the current outfit with the complete authored outfit “${outfit.name}”: ${outfit.description || '(the outfit has not been described yet; use the authored title only)'}. Preserve the person, identity, pose, framing, lighting, composition and every unrelated detail.`;
    button.disabled = true;
    try {
        const correctionInput = document.getElementById('world-visual-correction');
        correctionInput.value = instruction;
        autoSizeWorldVisualTextarea(correctionInput);
        const refined = await refineWorldVisualPromptWithAI({ currentTarget: button }, instruction, { allowNoFieldChanges: true });
        if (!refined) return;
        // A source can be revised in place; a blank editor still receives the
        // same refinement call, then establishes its first image through the
        // new-image pipeline.
        await runWorldVisualGeneration(!!source, event);
        if (!source) document.getElementById('world-visual-correction').value = '';
    } finally {
        button.disabled = false;
        renderWorldVisualActiveOutfit();
    }
}

function updateWorldVisualCropPreview() {
    const editor = worldVisualEditorState;
    const stage = document.getElementById('world-visual-crop-stage');
    const image = document.getElementById('world-visual-crop-image');
    const empty = document.getElementById('world-visual-crop-empty');
    if (!editor || !stage || !image) return;
    // The crop stage previews the frame the record will actually display:
    // NPC portraits render as fixed 1:1 profile images, so their editable
    // frame is square even when the source was generated at another ratio.
    // Location backgrounds render as responsive cover art, so their frame
    // follows the selected generation aspect.
    const generationAspect = normalizedWorldVisualAspect(document.getElementById('world-visual-aspect')?.value,
        editor.kind === 'npc' ? '3:4' : '16:9');
    const aspect = editor.kind === 'npc' ? WORLD_NPC_PORTRAIT_DISPLAY_ASPECT : generationAspect;
    const [width, height] = aspect.split(':').map(Number);
    stage.style.aspectRatio = `${width} / ${height}`;
    const resolution = normalizedWorldVisualResolution(document.getElementById('world-visual-resolution')?.value,
        editor.kind === 'npc' ? 1200 : 1600);
    const output = worldVisualDimensions(aspect, resolution);
    const guide = document.getElementById('world-visual-crop-guide');
    if (guide) guide.dataset.label = `${aspect} ${editor.kind === 'npc' ? 'profile' : 'final'} frame · ${output.width} × ${output.height}px`;
    const source = worldMediaSource(editor.world, worldVisualEditorAssetId(editor));
    const history = worldVisualHistoryForEditor(editor);
    const selectedIndex = history.indexOf(worldVisualEditorAssetId(editor));
    const counter = document.getElementById('world-visual-variant-count');
    if (counter) counter.textContent = history.length ? `Image ${selectedIndex + 1} of ${history.length}` : 'No images';
    renderWorldVisualActiveOutfit();
    renderWorldVisualOutfitGallery();
    document.getElementById('world-visual-previous').disabled = selectedIndex <= 0;
    document.getElementById('world-visual-next').disabled = selectedIndex < 0 || selectedIndex >= history.length - 1;
    document.getElementById('world-visual-export').disabled = !source;
    document.getElementById('world-visual-revise').disabled = !source;
    if (guide) guide.hidden = !source;
    image.hidden = !source;
    empty.hidden = !!source;
    document.getElementById('world-visual-apply-crop').disabled = !source;
    document.getElementById('world-visual-crop-fill').disabled = !source;
    if (!source) return;
    if (image.src !== source) image.src = source;
    const draw = () => {
        const stageWidth = stage.clientWidth;
        const stageHeight = stage.clientHeight;
        if (!stageWidth || !stageHeight || !image.naturalWidth || !image.naturalHeight) return;
        const zoom = Number(document.getElementById('world-visual-crop-zoom').value) / 100;
        const focusX = Number(document.getElementById('world-visual-crop-x').value) / 100;
        const focusY = Number(document.getElementById('world-visual-crop-y').value) / 100;
        const scale = Math.max(stageWidth / image.naturalWidth, stageHeight / image.naturalHeight) * zoom;
        const renderedWidth = image.naturalWidth * scale;
        const renderedHeight = image.naturalHeight * scale;
        image.style.width = `${renderedWidth}px`;
        image.style.height = `${renderedHeight}px`;
        image.style.left = `${(stageWidth - renderedWidth) * focusX}px`;
        image.style.top = `${(stageHeight - renderedHeight) * focusY}px`;
    };
    image.onload = draw;
    draw();
}

function structuredVisualEditorText(id) {
    return String(document.getElementById(id)?.value || '').trim();
}

function renderStructuredVisualDocumentEditor(project) {
    const form = document.getElementById('world-visual-document-form');
    if (!form || !project) return;
    project.structuredDocument = normalizeStructuredVisualDocument(project.structuredDocument);
    const doc = project.structuredDocument;
    const set = (id, value) => { const input = document.getElementById(id); if (input) input.value = value == null ? '' : value; };
    const requestInput = document.getElementById('world-visual-structured-request');
    if (requestInput && !String(requestInput.value || '').trim()) requestInput.value = project.imageIntent?.authoredPrompt || doc.short_description || '';
    set('world-visual-structured-intent', project.imageIntent?.authoredPrompt || '');
    set('world-visual-structured-context', project.imageIntent?.context || doc.context || '');
    set('world-visual-structured-background', doc.background_setting);
    set('world-visual-structured-lighting-conditions', doc.lighting.conditions);
    set('world-visual-structured-lighting-direction', doc.lighting.direction);
    set('world-visual-structured-lighting-shadows', doc.lighting.shadows);
    set('world-visual-structured-composition', doc.aesthetics.composition);
    set('world-visual-structured-color', doc.aesthetics.color_scheme);
    set('world-visual-structured-mood', doc.aesthetics.mood_atmosphere);
    set('world-visual-structured-depth', doc.photographic_characteristics.depth_of_field);
    set('world-visual-structured-focus', doc.photographic_characteristics.focus);
    set('world-visual-structured-camera', doc.photographic_characteristics.camera_angle);
    set('world-visual-structured-lens', doc.photographic_characteristics.lens_focal_length);
    set('world-visual-structured-style-medium', doc.style_medium);
    set('world-visual-structured-artistic-style', doc.artistic_style);
    set('world-visual-structured-aspect', project.providerControls?.aspectRatio || '3:4');
    set('world-visual-structured-resolution', project.providerControls?.resolution || '1200');
    set('world-visual-structured-seed', project.providerControls?.seed == null ? '' : project.providerControls.seed);
    set('world-visual-structured-sync', project.providerControls?.syncMode === true ? 'true' : project.providerControls?.syncMode === false ? 'false' : '');
    const rawJson = document.getElementById('world-visual-raw-json');
    if (rawJson && !document.getElementById('world-visual-document-json')?.hidden) {
        rawJson.value = JSON.stringify(doc, null, 2);
    } else if (rawJson) {
        rawJson.value = JSON.stringify(doc, null, 2);
    }
    const list = document.getElementById('world-visual-structured-objects');
    if (!list) return;
    const ids = Array.isArray(project.objectOrder) ? project.objectOrder : [];
    list.innerHTML = doc.objects.map((object, index) => {
        const objectId = ids[index] || newStructuredVisualObjectId('obj');
        const meta = project.hordeObjectMetadata?.[objectId] || {};
        const field = (key, label, multiline = false) => `<label class="form-label">${label}${multiline ? `<textarea class="form-textarea world-visual-object-field" data-field="${key}" rows="2">${escapeHTML(object[key] || '')}</textarea>` : `<input class="form-input world-visual-object-field" data-field="${key}" value="${escapeHTML(object[key] || '')}">`}</label>`;
        return `<article class="world-visual-object-card ${meta.salience === 'primary' ? 'is-primary' : ''}" data-object-id="${escapeHTML(objectId)}"><div class="world-visual-object-card-header"><span class="world-visual-object-card-title">Object ${index + 1}</span><div class="world-visual-object-actions"><select class="form-select world-visual-object-meta" data-meta="salience" title="How important this object is to the composition"><option value="primary" ${meta.salience === 'primary' ? 'selected' : ''}>Primary</option><option value="secondary" ${meta.salience === 'secondary' ? 'selected' : ''}>Secondary</option><option value="tertiary" ${meta.salience === 'tertiary' ? 'selected' : ''}>Tertiary</option></select><select class="form-select world-visual-object-meta" data-meta="kind" title="What sort of visual object this is"><option value="subject" ${meta.kind === 'subject' ? 'selected' : ''}>Subject</option><option value="scene_object" ${meta.kind === 'scene_object' ? 'selected' : ''}>Scene object</option><option value="integrated_component" ${meta.kind === 'integrated_component' ? 'selected' : ''}>Integrated component</option><option value="background_detail" ${meta.kind === 'background_detail' ? 'selected' : ''}>Background detail</option></select><button type="button" class="tool-btn world-visual-object-up" title="Move object up">↑</button><button type="button" class="tool-btn world-visual-object-down" title="Move object down">↓</button><button type="button" class="tool-btn world-visual-object-remove" title="Remove object">Remove</button></div></div><div class="world-visual-grid-2">${field('description','Description',true)}${field('relationship','Relationship',true)}${field('location','Location')}${field('relative_size','Relative size')}${field('shape_and_color','Shape and colour')}${field('texture','Texture')}${field('appearance_details','Appearance details',true)}${field('number_of_objects','Number of objects')}${field('pose','Pose')}${field('expression','Expression')}${field('clothing','Clothing')}${field('action','Action')}${field('gender','Gender')}${field('skin_tone_and_texture','Skin tone and texture')}${field('orientation','Orientation')}</div></article>`;
    }).join('');
    const count = document.getElementById('world-visual-object-count');
    if (count) count.textContent = `${doc.objects.length}/${STRUCTURED_VISUAL_MAX_OBJECTS}`;
    list.querySelectorAll('.world-visual-object-remove').forEach(button => button.onclick = () => {
        const card = button.closest('[data-object-id]');
        const index = [...list.children].indexOf(card);
        if (index >= 0) { saveStructuredVisualEditorDraft(); project.structuredDocument.objects.splice(index, 1); project.objectOrder.splice(index, 1); renderStructuredVisualDocumentEditor(project); }
    });
    list.querySelectorAll('.world-visual-object-up').forEach(button => button.onclick = () => moveStructuredVisualObject(project, button.closest('[data-object-id]'), -1));
    list.querySelectorAll('.world-visual-object-down').forEach(button => button.onclick = () => moveStructuredVisualObject(project, button.closest('[data-object-id]'), 1));
}

function readStructuredVisualEditorIntoProject(project) {
    if (!project) return null;
    const doc = normalizeStructuredVisualDocument(project.structuredDocument);
    const value = id => structuredVisualEditorText(id);
    project.imageIntent = normalizeWorldImageIntent({
        ...(project.imageIntent || {}), authoredPrompt: value('world-visual-structured-intent'), context: value('world-visual-structured-context')
    }, '', '');
    doc.short_description = value('world-visual-structured-intent').slice(0, 1200) || doc.short_description;
    doc.context = value('world-visual-structured-context').slice(0, 1600);
    doc.background_setting = value('world-visual-structured-background').slice(0, 1200);
    doc.lighting = { conditions: value('world-visual-structured-lighting-conditions').slice(0, 1200), direction: value('world-visual-structured-lighting-direction').slice(0, 1200), shadows: value('world-visual-structured-lighting-shadows').slice(0, 1200) };
    doc.aesthetics = { composition: value('world-visual-structured-composition').slice(0, 1200), color_scheme: value('world-visual-structured-color').slice(0, 1200), mood_atmosphere: value('world-visual-structured-mood').slice(0, 1200), aesthetic_score: 'very high', preference_score: 'very high' };
    doc.photographic_characteristics = { depth_of_field: value('world-visual-structured-depth').slice(0, 1200), focus: value('world-visual-structured-focus').slice(0, 1200), camera_angle: value('world-visual-structured-camera').slice(0, 1200), lens_focal_length: value('world-visual-structured-lens').slice(0, 1200) };
    doc.style_medium = value('world-visual-structured-style-medium').slice(0, 600);
    doc.artistic_style = value('world-visual-structured-artistic-style').slice(0, 900);
    const list = document.getElementById('world-visual-structured-objects');
    const nextOrder = [];
    const nextMeta = {};
    const nextObjects = [];
    [...(list?.querySelectorAll('[data-object-id]') || [])].forEach((card, index) => {
        const id = String(card.dataset.objectId || newStructuredVisualObjectId('obj'));
        const object = {};
        card.querySelectorAll('.world-visual-object-field').forEach(input => {
            const key = input.dataset.field;
            const text = String(input.value || '').trim();
            if (!text) return;
            if (key === 'number_of_objects') { const count = Number.parseInt(text, 10); if (Number.isInteger(count) && count > 0) object[key] = Math.min(100, count); }
            else object[key] = text.slice(0, 1600);
        });
        if (!object.relationship) object.relationship = index === 0 ? 'Primary subject and focal point of the image.' : 'Related to the primary subject in the scene.';
        const salience = card.querySelector('[data-meta="salience"]')?.value || (index ? 'secondary' : 'primary');
        const kind = card.querySelector('[data-meta="kind"]')?.value || (index ? 'scene_object' : 'subject');
        nextOrder.push(id); nextObjects.push(object); nextMeta[id] = { salience, kind, binding: project.hordeObjectMetadata?.[id]?.binding || { characterId: '', outfitId: '', source: 'structured_editor' } };
    });
    project.structuredDocument = normalizeStructuredVisualDocument({ ...doc, objects: nextObjects });
    project.objectOrder = nextOrder;
    project.hordeObjectMetadata = normalizeStructuredVisualObjectMetadata(nextMeta, nextOrder);
    const seedValue = value('world-visual-structured-seed');
    project.providerControls = { ...(project.providerControls || {}), aspectRatio: value('world-visual-structured-aspect') || '3:4', resolution: value('world-visual-structured-resolution') || '1200', seed: seedValue === '' ? null : Number.parseInt(seedValue, 10), syncMode: document.getElementById('world-visual-structured-sync')?.value === 'true' };
    return project;
}

function saveStructuredVisualEditorDraft() {
    const editor = worldVisualEditorState;
    if (!editor) return null;
    const project = ensureWorldVisualProject(editor.world, editor.target, editor.kind === 'npc' ? 'character' : 'location');
    return readStructuredVisualEditorIntoProject(project);
}

function recordStructuredVisualRevision(project, {
    operation = 'manual', authoredDocument = null, submittedStructuredPrompt = null,
    resolvedStructuredPrompt = null, providerRequest = null, provenance = 'visual_editor',
    resolvedOutputPolicy = 'submitted_as_current', diff = null
} = {}) {
    if (!project) return null;
    project.revisions = Array.isArray(project.revisions) ? project.revisions : [];
    const document = normalizeStructuredVisualDocument(authoredDocument || project.structuredDocument);
    const revisionId = `visual_rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const revision = {
        revisionId,
        parentRevisionId: String(project.activeRevisionId || ''),
        operation,
        authoredDocument: safeJsonClone(document),
        submittedStructuredPrompt: submittedStructuredPrompt ? safeJsonClone(submittedStructuredPrompt) : null,
        resolvedStructuredPrompt: resolvedStructuredPrompt ? safeJsonClone(resolvedStructuredPrompt) : null,
        providerRequest: providerRequest ? safeJsonClone(providerRequest) : null,
        diff: diff ? safeJsonClone(diff) : null,
        provenance,
        resolvedOutputPolicy,
        objectOrder: Array.isArray(project.objectOrder) ? project.objectOrder.slice() : [],
        hordeObjectMetadata: safeJsonClone(project.hordeObjectMetadata || {}),
        createdAt: new Date().toISOString()
    };
    project.revisions.push(revision);
    project.activeRevisionId = revisionId;
    if (resolvedOutputPolicy === 'promote' || operation === 'manual' || operation === 'refine' || operation === 'rebuild') {
        project.authoredRevisionId = revisionId;
    }
    return revision;
}

function parseStructuredVisualJson(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('The structured document is empty.');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Expected a JSON object containing the structured visual document.');
    let parsed;
    try { parsed = JSON.parse(raw.slice(start, end + 1)); }
    catch (error) { throw new Error(`Invalid structured JSON: ${error.message}`); }
    // Accept either the FIBO-shaped document itself or a wrapper used by
    // model authoring calls, but never let Horde metadata enter the document.
    const candidate = isPlainObject(parsed.structuredDocument) ? parsed.structuredDocument
        : isPlainObject(parsed.structured_prompt) ? parsed.structured_prompt : parsed;
    return normalizeStructuredVisualDocument(candidate);
}

function structuredVisualAuthoringSchemaDescription() {
    return `Return one complete JSON object with this exact FIBO-shaped visual document schema. Omit blank optional fields; keep objects as an array of PromptObject fields only (no Horde ids or metadata): {short_description:string, objects:[{description,location,relationship,relative_size,shape_and_color,texture,appearance_details,number_of_objects,pose,expression,clothing,action,gender,skin_tone_and_texture,orientation}], background_setting:string, lighting:{conditions,direction,shadows}, aesthetics:{composition,color_scheme,mood_atmosphere,aesthetic_score:"very high",preference_score:"very high"}, photographic_characteristics:{depth_of_field,focus,camera_angle,lens_focal_length}, style_medium:string, text_render?:opaque provider value, context:string, artistic_style:string}. Every object must have relationship. Preserve unaffected fields and return the complete document, not a patch.`;
}

async function runStructuredVisualAuthoring(operation, event) {
    const editor = worldVisualEditorState;
    if (!editor) return false;
    const project = saveStructuredVisualEditorDraft();
    const request = String(document.getElementById('world-visual-structured-request')?.value || '').trim();
    if (!request) return showToast('Describe the image or the change you want first.', 'error');
    const button = event?.currentTarget;
    const original = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = operation === 'compile' ? 'Compiling…' : operation === 'rebuild' ? 'Rebuilding…' : 'Refining…'; }
    try {
        const provider = worldVisualProvider(editor.world, 'new');
        const model = worldVisualModel(editor.world, provider, 'new');
        const fibo = provider === 'fal' && isFiboImageEndpoint(model);
        if (operation === 'compile' && fibo) {
            // FIBO owns natural-language compilation. The returned resolved
            // structured prompt is adopted as the initial authored document.
            const subject = editor.kind === 'npc' ? {
                name: editor.target.name, authoredPrompt: request,
                description: editor.target.appearance || editor.target.description || '',
                characterId: editor.target.id, outfit: worldCurrentOutfit(editor.target)
            } : { authoredPrompt: request, visualDescription: editor.target.visualDescription || editor.target.description || '' };
            const assetId = editor.kind === 'npc'
                ? await generateWorldNpcPortrait(editor.world, editor.target, { operation: 'compile', authoredPrompt: request, outfitId: worldCurrentOutfit(editor.target)?.id || '' })
                : await generateWorldLocationBackground(editor.world, editor.target, { operation: 'compile', authoredPrompt: request });
            registerWorldVisualVariant(editor.world, editor.target, editor.kind, assetId);
            if (editor.kind === 'npc') attachWorldVisualToOutfit(editor.target, assetId, worldCurrentOutfit(editor.target)?.id || '');
            const asset = worldMediaAsset(editor.world, assetId);
            const resolved = asset?.resolvedStructuredPrompt;
            if (!resolved) throw new Error('FIBO returned no structured prompt to compile.');
            project.structuredDocument = normalizeStructuredVisualDocument(resolved);
            if (!project.structuredDocument.objects.length && editor.kind === 'npc') {
                const fallbackId = newStructuredVisualObjectId('obj_subject');
                project.structuredDocument.objects = [{ description: editor.target.appearance || editor.target.name, relationship: 'Primary subject and focal point of the image.', clothing: worldCurrentOutfit(editor.target)?.description || '' }];
                project.objectOrder = [fallbackId];
                project.hordeObjectMetadata = { [fallbackId]: { salience: 'primary', kind: 'subject', binding: { characterId: editor.target.id, outfitId: worldCurrentOutfit(editor.target)?.id || '', source: 'fibo_compile' } } };
            }
            project.imageIntent = normalizeWorldImageIntent(project.imageIntent, request, project.imageIntent?.context || '');
            project.imageIntent.authoredPrompt = request;
            recordStructuredVisualRevision(project, { operation: 'compile', authoredDocument: project.structuredDocument, resolvedStructuredPrompt: resolved, resolvedOutputPolicy: 'promote', provenance: 'fibo_native_compile' });
        } else {
            const current = JSON.stringify(project.structuredDocument, null, 2);
            const history = operation === 'rebuild' ? JSON.stringify(project.revisions.slice(-8), null, 2) : '';
            const body = applyOpenRouterRouting({
                model: String(state.globalSettings?.structuredModel || '').trim() || editor.world?.model || state.globalSettings?.defaultModel,
                max_tokens: 4200, temperature: 0.15,
                messages: [
                    { role: 'system', content: `${operation === 'rebuild' ? 'You semantically rebuild a structured visual document from authored intent and accepted revision history.' : operation === 'refine' ? 'You revise an existing structured visual document with the author’s instruction.' : 'You compile an authored image request into a structured visual document.'}\n\n${structuredVisualAuthoringSchemaDescription()}\nDo not invent visible character facts from persona or mood. Persona is only soft context when explicitly relevant. Do not return markdown.` },
                    { role: 'user', content: [`AUTHOR REQUEST:\n${request}`, `CURRENT DOCUMENT:\n${current}`, history ? `ACCEPTED REVISION HISTORY:\n${history}` : ''].filter(Boolean).join('\n\n---\n\n') }
                ]
            }, editor.world, { scope: 'utility' });
            const response = await fetch(apiBase() + '/chat/completions', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 240)}`);
            const data = await response.json();
            const next = parseStructuredVisualJson(data.choices?.[0]?.message?.content || '');
            project.imageIntent = normalizeWorldImageIntent(project.imageIntent, operation === 'compile' ? request : project.imageIntent?.authoredPrompt || '', project.imageIntent?.context || '');
            if (operation === 'compile') project.imageIntent.authoredPrompt = request;
            project.structuredDocument = next;
            while (project.objectOrder.length < next.objects.length) project.objectOrder.push(newStructuredVisualObjectId('obj'));
            project.objectOrder.length = next.objects.length;
            project.hordeObjectMetadata = normalizeStructuredVisualObjectMetadata(project.hordeObjectMetadata, project.objectOrder);
            recordStructuredVisualRevision(project, { operation, authoredDocument: next, resolvedOutputPolicy: 'promote', provenance: `horde_model_${operation}` });
        }
        renderStructuredVisualDocumentEditor(project);
        await saveState();
        showToast(`Structured visual ${operation} complete. Review the document, then generate when ready.`, 'success');
        return true;
    } catch (error) {
        showToast(`Structured visual ${operation} failed — ${error.message}`, 'error');
        return false;
    } finally {
        if (button) { button.disabled = false; button.textContent = original; }
    }
}

function moveStructuredVisualObject(project, card, direction) {
    if (!project || !card) return;
    saveStructuredVisualEditorDraft();
    const index = [...document.querySelectorAll('#world-visual-structured-objects > [data-object-id]')].indexOf(card);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= project.structuredDocument.objects.length) return;
    [project.structuredDocument.objects[index], project.structuredDocument.objects[next]] = [project.structuredDocument.objects[next], project.structuredDocument.objects[index]];
    [project.objectOrder[index], project.objectOrder[next]] = [project.objectOrder[next], project.objectOrder[index]];
    renderStructuredVisualDocumentEditor(project);
}

function saveWorldVisualEditorFields() {
    const editor = worldVisualEditorState;
    if (!editor) return;
    const project = ensureWorldVisualProject(editor.world, editor.target, editor.kind === 'npc' ? 'character' : 'location');
    readStructuredVisualEditorIntoProject(project);
    const target = editor.target;
    target.visuals = isPlainObject(target.visuals) ? target.visuals : {};
    // Keep legacy export aliases synchronized for older worlds/importers, but
    // never read them back as active authoring truth.
    const structured = project.structuredDocument;
    const setCompat = (id, value) => { const input = document.getElementById(id); if (input) input.value = value == null ? '' : value; };
    setCompat('world-visual-primary', structured.short_description || target.appearance || target.visualDescription || '');
    setCompat('world-visual-prompt', project.imageIntent?.authoredPrompt || structured.short_description || '');
    setCompat('world-visual-subject-pose', structured.objects[0]?.pose || '');
    setCompat('world-visual-subject-expression', structured.objects[0]?.expression || '');
    setCompat('world-visual-subject-action', structured.objects[0]?.action || '');
    setCompat('world-visual-subject-orientation', structured.objects[0]?.orientation || '');
    setCompat('world-visual-subject-location', structured.objects[0]?.location || '');
    setCompat('world-visual-framing', 'auto');
    setCompat('world-visual-look-styleMedium', structured.style_medium);
    setCompat('world-visual-look-lightingConditions', structured.lighting.conditions);
    setCompat('world-visual-look-colorScheme', structured.aesthetics.color_scheme);
    setCompat('world-visual-look-depthOfField', structured.photographic_characteristics.depth_of_field);
    setCompat('world-visual-look-focus', structured.photographic_characteristics.focus);
    setCompat('world-visual-look-lensFocalLength', structured.photographic_characteristics.lens_focal_length);
    const aspect = normalizedWorldVisualAspect(document.getElementById('world-visual-aspect').value,
        editor.kind === 'npc' ? '3:4' : '16:9');
    const resolution = normalizedWorldVisualResolution(document.getElementById('world-visual-resolution').value,
        editor.kind === 'npc' ? 1200 : 1600);
    const correction = document.getElementById('world-visual-correction').value.trim().slice(0, 4000);
    if (editor.kind === 'npc') {
        target.appearance = document.getElementById('world-visual-primary').value.trim().slice(0, 8000);
        target.imagePrompt = document.getElementById('world-visual-prompt').value.trim().slice(0, 8000);
        target.visuals.portraitFraming = document.getElementById('world-visual-framing').value;
        target.visuals.imageIntent = normalizeWorldImageIntent(target.visuals.imageIntent, target.imagePrompt, target.visuals.imageIntent?.context || '');
        target.visuals.imageIntent.authoredPrompt = target.imagePrompt;
        target.visuals.framing = normalizeWorldImageFraming({
            ...(target.visuals.framing || {}), mode: target.visuals.portraitFraming,
            pose: document.getElementById('world-visual-subject-pose')?.value || '',
            expression: document.getElementById('world-visual-subject-expression')?.value || '',
            action: document.getElementById('world-visual-subject-action')?.value || '',
            orientation: document.getElementById('world-visual-subject-orientation')?.value || '',
            placementInFrame: document.getElementById('world-visual-subject-location')?.value || ''
        }, {}, {});
        target.visuals.look = normalizeWorldImageLook(target.visuals.look, worldImageGuide(editor.world) || {});
        ['styleMedium', 'lightingConditions', 'colorScheme', 'depthOfField', 'focus', 'lensFocalLength'].forEach(key => {
            const input = document.getElementById(`world-visual-look-${key}`);
            if (input) target.visuals.look[key] = String(input.value || '').trim().slice(0, 1200);
        });
        target.visuals.portraitAspectRatio = aspect;
        target.visuals.portraitResolution = resolution;
        target.visuals.portraitCorrection = correction;
        // Optional authored subject fields: blank keys stay blank and never
        // travel to a generator.
        target.visuals.portraitSubjectGuide = normalizeWorldVisualSubjectGuide(
            WORLD_VISUAL_SUBJECT_FIELDS.reduce((subject, field) => {
                subject[field.key] = document.getElementById(`world-visual-subject-${field.key}`)?.value || '';
                return subject;
            }, target.visuals.portraitSubjectGuide || {}));
        // Stable identity fields: the person, never the preset or outfit.
        target.visuals.portraitIdentityGuide = normalizeWorldVisualIdentityGuide(
            WORLD_VISUAL_IDENTITY_FIELDS.reduce((identity, field) => {
                identity[field.key] = document.getElementById(`world-visual-identity-${field.key}`)?.value || '';
                return identity;
            }, target.visuals.portraitIdentityGuide || {}));
    } else {
        target.visualDescription = document.getElementById('world-visual-primary').value.trim().slice(0, 8000);
        target.imagePrompt = document.getElementById('world-visual-prompt').value.trim().slice(0, 8000);
        target.visuals.backgroundAspectRatio = aspect;
        target.visuals.backgroundResolution = resolution;
        target.visuals.backgroundCorrection = correction;
    }
    updateWorldTokenCount();
}

function refreshWorldVisualEditorAfterAsset() {
    const editor = worldVisualEditorState;
    if (!editor) return;
    document.getElementById('world-visual-crop-x').value = '50';
    document.getElementById('world-visual-crop-y').value = '50';
    document.getElementById('world-visual-crop-zoom').value = '100';
    updateWorldVisualCropPreview();
    if (editor.kind === 'npc') renderWorldEntities();
    else renderWorldLocations();
}

function closeWorldVisualEditor() {
    const editor = worldVisualEditorState;
    document.getElementById('world-visual-editor-modal')?.classList.add('hidden');
    worldVisualEditorState = null;
    if (editor?.kind === 'npc') renderWorldEntities();
    else if (editor?.kind === 'location') renderWorldLocations();
}

// --- Outfit manager: named wardrobe entries per character ---
// An outfit owns one complete clothing description plus zero or more generated
// source images. The worn outfit feeds Fibo's clothing string, the prose
// "current visible look" and the dossier's current-outfit line.

let worldOutfitManagerState = null;
let worldOutfitManagerBound = false;

function openWorldOutfitManager(entity, world) {
    if (!entity || !world) return;
    worldOutfitManagerState = { entity, world, editId: '' };
    ensureWorldOutfitManagerBound();
    document.getElementById('world-outfit-name').value = '';
    document.getElementById('world-outfit-description').value = '';
    document.getElementById('world-outfit-instruction').value = '';
    const addBtn = document.getElementById('world-outfit-add');
    if (addBtn) addBtn.textContent = 'Add outfit';
    renderWorldOutfitManager();
    document.getElementById('world-outfit-manager-modal')?.classList.remove('hidden');
}

function closeWorldOutfitManager() {
    document.getElementById('world-outfit-manager-modal')?.classList.add('hidden');
    worldOutfitManagerState = null;
    renderWorldEntities();
}

function renderWorldOutfitManager() {
    const manager = worldOutfitManagerState;
    if (!manager) return;
    const entity = manager.entity;
    entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
    const outfits = worldOutfits(entity);
    const currentId = String(entity.visuals.currentOutfitId || '');
    const header = document.getElementById('world-outfit-manager-title');
    if (header) header.textContent = `${entity.name || 'Character'} — outfits`;
    const list = document.getElementById('world-outfit-list');
    if (!list) return;
    list.innerHTML = outfits.length ? outfits.map(outfit => {
        const thumbnails = (outfit.imageAssetIds || []).map(assetId => {
            const source = worldMediaSource(manager.world, assetId);
            return source ? `<button type="button" class="world-outfit-thumb" data-asset-id="${escapeHTML(assetId)}" title="Open this outfit image"><span style="background-image:url('${cssUrl(source)}')"></span></button>` : '';
        }).join('');
        return `
        <div class="world-outfit-row" data-outfit-id="${escapeHTML(outfit.id)}">
            <div class="world-outfit-images">${thumbnails || '<span class="form-hint">No images yet</span>'}</div>
            <div class="world-outfit-copy">
                <strong>${escapeHTML(outfit.name)}${outfit.id === currentId ? ' <span class="form-hint">· worn now</span>' : ''}</strong>
                <p class="form-hint" style="margin:0;">${escapeHTML(outfit.description)}</p>
            </div>
            <div class="world-media-actions">
                ${outfit.id === currentId ? '' : '<button type="button" class="tool-btn world-outfit-wear">Wear</button>'}
                <button type="button" class="tool-btn world-outfit-generate">Generate image</button>
                <button type="button" class="tool-btn world-outfit-edit">Edit</button>
                <button type="button" class="tool-btn world-outfit-delete">Delete</button>
            </div>
        </div>`;
    }).join('')
        : '<p class="form-hint">No outfits yet. Add one below, or describe what you want and let the AI design it.</p>';
    [...list.querySelectorAll('.world-outfit-row')].forEach(row => {
        const outfit = outfits.find(entry => entry.id === row.dataset.outfitId);
        if (!outfit) return;
        row.querySelectorAll('.world-outfit-thumb').forEach(button => button.addEventListener('click', () => {
            selectWorldOutfit(manager.world, entity, outfit.id);
            entity.visuals.portraitAssetId = button.dataset.assetId;
            entity.visuals.portraitDisplayAssetId = '';
            closeWorldOutfitManager();
            openWorldVisualEditor(manager.world, entity, 'npc');
        }));
        row.querySelector('.world-outfit-wear')?.addEventListener('click', () => {
            selectWorldOutfit(manager.world, entity, outfit.id);
            renderWorldOutfitManager();
            showToast(`${entity.name || 'This character'} now wears “${outfit.name}”.${(outfit.imageAssetIds || []).length ? ' Its latest outfit image is now active.' : ' Generate a portrait when you want one.'}`, 'success');
        });
        row.querySelector('.world-outfit-generate')?.addEventListener('click', () => {
            selectWorldOutfit(manager.world, entity, outfit.id);
            closeWorldOutfitManager();
            openWorldVisualEditor(manager.world, entity, 'npc');
            showToast(`“${outfit.name}” is worn for the next portrait. Review the brief, then Generate new.`, 'info');
        });
        row.querySelector('.world-outfit-edit')?.addEventListener('click', () => {
            manager.editId = outfit.id;
            document.getElementById('world-outfit-name').value = outfit.name;
            document.getElementById('world-outfit-description').value = outfit.description;
            document.getElementById('world-outfit-instruction').value = '';
            const addBtn = document.getElementById('world-outfit-add');
            if (addBtn) addBtn.textContent = 'Save changes';
        });
        row.querySelector('.world-outfit-delete')?.addEventListener('click', () => {
            entity.visuals.outfits = outfits.filter(entry => entry.id !== outfit.id);
            if (entity.visuals.currentOutfitId === outfit.id) {
                entity.visuals.currentOutfitId = '';
                entity.currentOutfit = '';
            }
            renderWorldOutfitManager();
            showToast(`Deleted “${outfit.name}”.`, 'success');
        });
    });
}

function ensureWorldOutfitManagerBound() {
    if (worldOutfitManagerBound) return;
    worldOutfitManagerBound = true;
    const modal = document.getElementById('world-outfit-manager-modal');
    document.getElementById('world-outfit-manager-close').onclick = closeWorldOutfitManager;
    modal.addEventListener('click', event => { if (event.target === modal) closeWorldOutfitManager(); });
    document.getElementById('world-outfit-add').onclick = () => {
        const manager = worldOutfitManagerState;
        if (!manager) return;
        const entity = manager.entity;
        const name = String(document.getElementById('world-outfit-name')?.value || '').trim().slice(0, 80);
        const description = String(document.getElementById('world-outfit-description')?.value || '').trim().slice(0, 1200);
        if (!name || !description) return showToast('An outfit needs a name and a description.', 'error');
        entity.visuals = isPlainObject(entity.visuals) ? entity.visuals : {};
        const outfits = worldOutfits(entity);
        if (manager.editId) {
            const existing = outfits.find(outfit => outfit.id === manager.editId);
            if (existing) {
                existing.name = name;
                existing.description = description;
                if (entity.visuals.currentOutfitId === existing.id) entity.currentOutfit = description;
            }
            manager.editId = '';
        } else {
            const outfit = {
                id: `outfit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                name, description
            };
            outfits.push(outfit);
            // A character's first outfit becomes the worn one automatically:
            // portraits should never silently fall back to no wardrobe.
            if (!entity.visuals.currentOutfitId) {
                entity.visuals.currentOutfitId = outfit.id;
                entity.currentOutfit = description;
            }
        }
        entity.visuals.outfits = outfits;
        document.getElementById('world-outfit-name').value = '';
        document.getElementById('world-outfit-description').value = '';
        document.getElementById('world-outfit-instruction').value = '';
        const addBtn = document.getElementById('world-outfit-add');
        if (addBtn) addBtn.textContent = 'Add outfit';
        renderWorldOutfitManager();
    };
    document.getElementById('world-outfit-ai').onclick = async event => {
        const manager = worldOutfitManagerState;
        if (!manager) return;
        const button = event.currentTarget;
        const original = button.textContent;
        const instruction = String(document.getElementById('world-outfit-instruction')?.value || '').trim();
        const name = String(document.getElementById('world-outfit-name')?.value || '').trim();
        if (!instruction && !name) return showToast('Name the outfit or write an instruction first.', 'error');
        button.disabled = true;
        button.textContent = 'Designing…';
        try {
            const text = await completeFieldWithAI('world-outfit-description',
                String(document.getElementById('world-outfit-description')?.value || ''),
                manager.entity, manager.world, 'fill',
                [instruction, name ? `Outfit name: ${name}` : ''].filter(Boolean).join('\n'));
            document.getElementById('world-outfit-description').value = text;
            showToast('Outfit designed. Review it, then add it.', 'success');
        } catch (error) {
            showToast(`Outfit design failed — ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    };
}

function exportCurrentWorldVisual() {
    const editor = worldVisualEditorState;
    if (!editor) return;
    const source = worldMediaSource(editor.world, worldVisualEditorAssetId(editor));
    if (!source) return showToast('There is no selected image to export.', 'error');
    const mime = source.match(/^data:(image\/[a-z0-9.+-]+)/i)?.[1]?.toLowerCase() || 'image/jpeg';
    const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
    const stem = String(editor.target.name || (editor.kind === 'npc' ? 'portrait' : 'location'))
        .trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'world_visual';
    const history = worldVisualHistoryForEditor(editor);
    const number = Math.max(1, history.indexOf(worldVisualEditorAssetId(editor)) + 1);
    const anchor = document.createElement('a');
    anchor.href = source;
    anchor.download = `${stem}_${editor.kind === 'npc' ? 'portrait' : 'location'}_${number}.${extension}`;
    anchor.click();
    showToast(`Exported image ${number} for ${editor.target.name || 'this visual'}.`, 'success');
}

// Refine prompt: the AI applies the author's revision instruction to the
// editor's own prompt fields. Nothing is generated — the reworked text lands
// in the inputs for review, so confirming means pressing Generate new. Only
// the fields the instruction actually concerns are rewritten; everything
// else is returned untouched (by being omitted from the response).
async function refineWorldVisualPromptWithAI(event, instructionOverride = '', options = {}) {
    const editor = worldVisualEditorState;
    if (!editor) return false;
    const button = event.currentTarget;
    const instruction = String(instructionOverride || document.getElementById('world-visual-correction').value || '').trim();
    if (!instruction) { showToast('Write the revision you want applied before refining the prompt.', 'error'); return false; }
    const originalButtonText = button.textContent;
    const isNpc = editor.kind === 'npc';
    const identityLabels = {
        gender: 'Gender', skinToneAndTexture: 'Skin tone and texture', shapeAndColor: 'Shape and color',
        texture: 'Texture', appearanceDetails: 'Appearance details', relativeSize: 'Relative size'
    };
    const stagingLabels = {
        pose: 'Pose', expression: 'Expression', action: 'Action',
        orientation: 'Orientation', location: 'Placement in frame'
    };
    const fields = isNpc ? [
        { key: 'appearance', label: 'Appearance & public impression', max: 8000 },
        { key: 'imagePrompt', label: 'Authored image prompt', max: 8000 },
        ...WORLD_VISUAL_IDENTITY_FIELDS.map(field => ({
            key: `identity_${field.key}`, label: identityLabels[field.key] || field.key, max: field.max })),
        ...WORLD_VISUAL_SUBJECT_FIELDS.map(field => ({
            key: `staging_${field.key}`, label: `${stagingLabels[field.key] || field.key} (staging)`, max: field.max }))
    ] : [
        { key: 'visualDescription', label: 'Visible physical description', max: 8000 },
        { key: 'imagePrompt', label: 'Authored image prompt', max: 8000 }
    ];
    const inputFor = key => {
        if (key === 'appearance' || key === 'visualDescription') return document.getElementById('world-visual-primary');
        if (key === 'imagePrompt') return document.getElementById('world-visual-prompt');
        const [prefix, fieldKey] = key.split('_', 2);
        if (prefix === 'identity') return document.getElementById(`world-visual-identity-${fieldKey}`);
        if (prefix === 'staging') return document.getElementById(`world-visual-subject-${fieldKey}`);
        return null;
    };
    button.disabled = true;
    button.textContent = 'Refining…';
    try {
        const model = String(state.globalSettings?.structuredModel || '').trim()
            || editor.world?.model || state.globalSettings?.defaultModel;
        const body = applyOpenRouterRouting({
            model,
            max_tokens: 2000,
            messages: [
                {
                    role: 'system',
                    content: `You revise the prompt fields of a roleplay world's visual editor.\n\nThe author supplies a revision instruction. Decide which fields it concerns and rewrite ONLY those fields so the instruction is fully applied. Preserve everything already true that the instruction does not change. Never invent identity facts that contradict established context. A blank field stays blank unless the instruction asks for it.\n\nReturn ONLY a JSON object mapping field keys to their complete new text, for example {"imagePrompt":"…"}. Omit every field you did not change. No prose, no markdown fences, no explanation.`
                },
                {
                    role: 'user',
                    content: [
                        `AUTHOR REVISION INSTRUCTION:\n${instruction.slice(0, 2000)}`,
                        aiFieldWorldContext(editor.world, editor.target),
                        `FIELDS (key — label — current text):\n${fields.map(field => {
                            const input = inputFor(field.key);
                            const current = String(input?.value || '').trim();
                            return `${field.key} — ${field.label} — ${current || '(blank)'}`;
                        }).join('\n')}`
                    ].filter(Boolean).join('\n\n---\n\n')
                }
            ]
        }, editor.world, { scope: 'utility' });
        const response = await fetch(apiBase() + '/chat/completions', {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 160)}`);
        const data = await response.json();
        const text = String(data.choices?.[0]?.message?.content || '').trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('the model returned no field changes');
        let revised;
        try { revised = JSON.parse(text.slice(firstBrace, lastBrace + 1)); }
        catch { throw new Error('the model returned malformed field changes'); }
        if (!isPlainObject(revised)) throw new Error('the model returned no field changes');
        const applied = [];
        fields.forEach(field => {
            if (!(field.key in revised)) return;
            const input = inputFor(field.key);
            if (!input) return;
            const next = String(revised[field.key] ?? '').trim().slice(0, field.max);
            if (next === String(input.value || '').trim()) return;
            input.value = next;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            autoSizeWorldVisualTextarea(input);
            applied.push(field.label);
        });
        if (!applied.length && !options.allowNoFieldChanges) throw new Error('no fields changed — try a more specific instruction');
        // Persist the reworked text with the visual settings so Generate new
        // (the confirm step) and a later editor open both see it.
        saveWorldVisualEditorFields();
        showToast(applied.length ? `Refined the prompt: ${applied.join(', ')}. Review the fields, then Generate new.` : 'Applied the outfit refinement instruction. Generate new will use it.', 'success');
        return true;
    } catch (error) {
        showToast(`Refine prompt failed — ${error.message}`, 'error');
        return false;
    } finally {
        button.disabled = false;
        button.textContent = originalButtonText;
    }
}

// Explicit prompt-interpretation debugger.  This is deliberately separate
// from compilation and generation: it proposes a field patch, shows the
// author the diff, and mutates nothing until confirmed.
async function runWorldVisual4D(event) {
    const editor = worldVisualEditorState;
    if (!editor || editor.kind !== 'npc') return;
    const button = event.currentTarget;
    const complaint = String(document.getElementById('world-visual-correction')?.value || '').trim();
    const assetId = worldVisualEditorAssetId(editor);
    const asset = worldMediaAsset(editor.world, assetId);
    if (!asset) return showToast('Generate or select an image before running 4D.', 'error');
    if (!complaint) return showToast('Describe what the provider got wrong first.', 'error');
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Diagnosing…';
    try {
        const spec = composeWorldImageSpecification(editor.world, {
            name: editor.target.name,
            description: editor.target.appearance || editor.target.description || '',
            imageIntent: editor.target.visuals?.imageIntent,
            framing: editor.target.visuals?.framing,
            look: editor.target.visuals?.look,
            outfit: worldCurrentOutfit(editor.target),
            outfitSnapshot: worldCurrentOutfit(editor.target)?.description || ''
        }, worldImageGuideForTarget(editor.world, editor.target, 'npc'));
        const model = String(state.globalSettings?.structuredModel || '').trim()
            || editor.world?.model || state.globalSettings?.defaultModel;
        const body = applyOpenRouterRouting({
            model, max_tokens: 2400,
            messages: [
                { role: 'system', content: 'You diagnose a provider image misunderstanding. Return ONLY JSON: {"proposedChanges":[{"domain":"character|imageIntent|framing|look|outfit","field":"...","before":"...","after":"...","reason":"...","authority":"persistent|image-local"}]}. Never apply changes. Do not impose generic beauty standards. Persistent Character changes must be marked authority persistent.' },
                { role: 'user', content: JSON.stringify({ complaint, character: spec.character, imageIntent: spec.imageIntent, framing: spec.framing, look: spec.look, outfit: spec.outfit, generatedAsset: { id: assetId, resolved: asset.resolvedStructuredPrompt, prompt: asset.prompt }, }) }
            ]
        }, editor.world, { scope: 'utility' });
        const response = await fetch(apiBase() + '/chat/completions', {
            method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`);
        const data = await response.json();
        const text = String(data.choices?.[0]?.message?.content || '').trim();
        const start = text.indexOf('{'); const end = text.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('the debugger returned no proposed changes');
        const proposal = JSON.parse(text.slice(start, end + 1));
        const changes = Array.isArray(proposal.proposedChanges) ? proposal.proposedChanges : [];
        if (!changes.length) throw new Error('the debugger found no field-level correction');
        const detail = changes.map(change => `${change.domain}.${change.field}\n${change.before || '(blank)'}\n→ ${change.after || '(blank)'}\n${change.reason || ''}`).join('\n\n');
        showConfirmModal('Increase 4D 3D 3D 3D 3 — proposed correction', detail, async () => {
            const inputFor = change => {
                if (change.domain === 'imageIntent' && change.field === 'authoredPrompt') return document.getElementById('world-visual-prompt');
                if (change.domain === 'character' && change.field === 'appearance') return document.getElementById('world-visual-primary');
                if (change.domain === 'framing') return document.getElementById(`world-visual-subject-${change.field}`) || document.getElementById('world-visual-framing');
                if (change.domain === 'look') return document.getElementById(`world-visual-look-${change.field}`);
                return null;
            };
            changes.forEach(change => {
                const input = inputFor(change);
                if (input && change.authority !== 'persistent') input.value = String(change.after || '').slice(0, 12000);
                else if (input && change.authority === 'persistent') input.value = String(change.after || '').slice(0, 12000);
            });
            saveWorldVisualEditorFields();
            showToast('4D correction accepted. Review the fields, then generate manually.', 'success');
        }, 'Apply proposal', 'Keep current state');
    } catch (error) {
        showToast(`4D diagnosis failed — ${error.message}`, 'error');
    } finally {
        button.disabled = false;
        button.textContent = original;
    }
}

async function runWorldVisualGeneration(revisionOnly, event) {
    const editor = worldVisualEditorState;
    if (!editor) return;
    const button = event.currentTarget;
    const correction = document.getElementById('world-visual-correction').value.trim();
    const referenceImage = revisionOnly
        ? worldMediaSource(editor.world, worldVisualEditorAssetId(editor)) : '';
    const sourceAsset = revisionOnly ? worldMediaAsset(editor.world, worldVisualEditorAssetId(editor)) : null;
    const inheritedOutfit = editor.kind === 'npc'
        ? (worldCurrentOutfit(editor.target) || worldOutfitForAsset(editor.target, worldVisualEditorAssetId(editor))) : null;
    if (revisionOnly && !referenceImage) return showToast('Select an existing image before revising it.', 'error');
    if (revisionOnly && !correction) return showToast('Write the adjustment you want before revising the image.', 'error');
    button.disabled = true;
    button.textContent = revisionOnly ? 'Revising...' : 'Generating...';
    try {
        saveWorldVisualEditorFields();
        const visualProject = ensureWorldVisualProject(editor.world, editor.target, editor.kind === 'npc' ? 'character' : 'location');
        const activeGuide = editor.kind === 'npc'
            ? worldImageGuideForTarget(editor.world, editor.target, 'npc', editor.activeBriefName || '')
            : null;
        const options = {
            revisionOnly,
            correction: revisionOnly ? correction : '',
            aspectRatio: document.getElementById('world-visual-aspect').value,
            maxDimension: Number(document.getElementById('world-visual-resolution').value),
            referenceImage,
            imageGuide: activeGuide,
            visualProject,
            operation: revisionOnly ? 'revise' : 'generate',
            resolvedOutputPolicy: revisionOnly ? 'review' : 'submitted_as_current',
            resolvedStructuredPrompt: sourceAsset?.exactResolvedStructuredPrompt
                || sourceAsset?.resolvedStructuredPrompt || null
        };
        const assetId = editor.kind === 'npc'
            ? await generateWorldNpcPortrait(editor.world, editor.target, options)
            : await generateWorldLocationBackground(editor.world, editor.target, options);
        registerWorldVisualVariant(editor.world, editor.target, editor.kind, assetId);
        if (editor.kind === 'npc') {
            const outfit = attachWorldVisualToOutfit(editor.target, assetId, inheritedOutfit?.id);
            const asset = worldMediaAsset(editor.world, assetId);
            if (asset) {
                asset.entityId = editor.target.id;
                asset.outfitId = outfit?.id || '';
                if (asset.resolvedStructuredPrompt) {
                    // Ordinary renders preserve authored state. The provider
                    // interpretation remains attached to the asset for
                    // inspection/review and is never silently projected back
                    // into Character, Framing, Look, or Image Intent.
                    asset.resolvedContext = String(asset.resolvedStructuredPrompt.context || '').slice(0, 3000);
                    const project = ensureWorldVisualProject(editor.world, editor.target, 'character');
                    recordStructuredVisualRevision(project, {
                        operation: revisionOnly ? 'rerender' : 'render',
                        authoredDocument: project.structuredDocument,
                        submittedStructuredPrompt: asset.requestMetadata?.structuredPrompt || null,
                        resolvedStructuredPrompt: asset.resolvedStructuredPrompt,
                        providerRequest: asset.exactRequest || asset.requestMetadata || null,
                        resolvedOutputPolicy: revisionOnly ? 'review' : 'submitted_as_current',
                        provenance: 'provider_render'
                    });
                }
            }
        }
        // Fresh and revised sources both need their 1:1 profile frame derived
        // so the record immediately shows a deliberate crop of the new image.
        if (editor.kind === 'npc') await deriveWorldNpcPortraitDisplay(editor.world, editor.target);
        if (revisionOnly) {
            const correctionInput = document.getElementById('world-visual-correction');
            correctionInput.value = '';
            autoSizeWorldVisualTextarea(correctionInput);
            if (editor.kind === 'npc') editor.target.visuals.portraitCorrection = '';
            else editor.target.visuals.backgroundCorrection = '';
        }
        pruneWorldMediaAssets(editor.world);
        await saveState();
        refreshWorldVisualEditorAfterAsset();
        showToast(`${revisionOnly ? 'Revised' : 'Generated'} ${editor.target.name} as image ${worldVisualHistory(editor.world, editor.target, editor.kind).length}.`, 'success');
    } catch (error) {
        showToast(`${revisionOnly ? 'Image revision' : 'Image generation'} failed: ${error.message}`, 'error');
    } finally {
        button.disabled = false;
        button.textContent = revisionOnly ? 'Refine image' : 'Generate new';
        updateWorldVisualCropPreview();
    }
}

async function runWorldVisualCropFill(event) {
    const editor = worldVisualEditorState;
    if (!editor) return;
    const button = event.currentTarget;
    const source = worldMediaSource(editor.world, worldVisualEditorAssetId(editor));
    if (!source) return showToast('Generate or select an image before using Crop & Fill.', 'error');
    button.disabled = true;
    button.textContent = 'Filling…';
    try {
        const inheritedOutfit = editor.kind === 'npc'
            ? (worldCurrentOutfit(editor.target) || worldOutfitForAsset(editor.target, worldVisualEditorAssetId(editor))) : null;
        saveWorldVisualEditorFields();
        // NPC crop-and-fill completes the fixed 1:1 profile frame; locations
        // fill toward their selected display aspect.
        const aspectRatio = editor.kind === 'npc'
            ? WORLD_NPC_PORTRAIT_DISPLAY_ASPECT
            : document.getElementById('world-visual-aspect').value;
        const maxDimension = Number(document.getElementById('world-visual-resolution').value);
        const fillReference = await frameWorldVisualForFill(source, aspectRatio, maxDimension,
            document.getElementById('world-visual-crop-x').value,
            document.getElementById('world-visual-crop-y').value,
            Number(document.getElementById('world-visual-crop-zoom').value) / 100);
        const correctionInput = document.getElementById('world-visual-correction');
        const prompt = worldVisualCropFillPrompt(editor, aspectRatio, correctionInput.value);
        const visualProject = ensureWorldVisualProject(editor.world, editor.target, editor.kind === 'npc' ? 'character' : 'location');
        const assetId = await generateWorldVisual(editor.world, prompt, {
            aspectRatio, maxDimension,
            quality: editor.kind === 'npc' ? 0.84 : 0.82,
            kind: editor.kind === 'npc' ? 'npc_portrait' : 'location_background',
            label: editor.target.name,
            referenceImage: fillReference,
            requireReference: true,
            operation: 'crop_fill',
            visualProject,
            resolvedOutputPolicy: 'review',
            imageGuide: editor.kind === 'npc'
                ? worldImageGuideForTarget(editor.world, editor.target, 'npc', editor.activeBriefName || '') : null
        });
        registerWorldVisualVariant(editor.world, editor.target, editor.kind, assetId);
        if (editor.kind === 'npc') {
            const outfit = attachWorldVisualToOutfit(editor.target, assetId, inheritedOutfit?.id);
            const asset = worldMediaAsset(editor.world, assetId);
            if (asset) {
                asset.entityId = editor.target.id;
                asset.outfitId = outfit?.id || '';
            }
        }
        // A filled NPC image is already a complete 1:1 profile frame, so it
        // serves as its own display asset instead of being cropped again.
        if (editor.kind === 'npc') editor.target.visuals.portraitDisplayAssetId = assetId;
        correctionInput.value = '';
        if (editor.kind === 'npc') editor.target.visuals.portraitCorrection = '';
        else editor.target.visuals.backgroundCorrection = '';
        pruneWorldMediaAssets(editor.world);
        refreshWorldVisualEditorAfterAsset();
        showToast(`Filled ${editor.target.name} into a ${aspectRatio} frame as image ${worldVisualHistory(editor.world, editor.target, editor.kind).length}.`, 'success');
    } catch (error) {
        showToast(`Crop & Fill failed: ${error.message}`, 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Crop & Fill';
        updateWorldVisualCropPreview();
    }
}

function ensureWorldVisualEditorBound() {
    if (worldVisualEditorBound) return;
    worldVisualEditorBound = true;
    const modal = document.getElementById('world-visual-editor-modal');
    document.getElementById('world-visual-editor-close').onclick = closeWorldVisualEditor;
    document.getElementById('world-visual-save-close').onclick = async () => {
        const editor = worldVisualEditorState;
        try {
            saveWorldVisualEditorFields();
            if (editor?.kind === 'npc' && worldVisualEditorAssetId(editor)) {
                const displayId = await deriveWorldNpcPortraitDisplay(editor.world, editor.target,
                    document.getElementById('world-visual-crop-x').value,
                    document.getElementById('world-visual-crop-y').value,
                    Number(document.getElementById('world-visual-crop-zoom').value) / 100);
                if (!displayId) throw new Error('The profile frame could not be derived from this image.');
                pruneWorldMediaAssets(editor.world);
            }
            const label = editor?.target?.name || 'Visual';
            closeWorldVisualEditor();
            showToast(`${label} visual settings and profile frame saved.`, 'success');
        } catch (error) {
            showToast(`Could not save visual settings: ${error.message}`, 'error');
        }
    };
    modal.addEventListener('click', event => { if (event.target === modal) closeWorldVisualEditor(); });
    document.getElementById('world-visual-previous').onclick = () => selectWorldVisualVariant(worldVisualEditorState, -1);
    document.getElementById('world-visual-next').onclick = () => selectWorldVisualVariant(worldVisualEditorState, 1);
    document.getElementById('world-visual-variant-filter').onchange = event => {
        if (!worldVisualEditorState) return;
        worldVisualEditorState.variantFilter = event.target.value || 'all';
        applyWorldVisualVariantFilter();
    };
    document.getElementById('world-visual-export').onclick = exportCurrentWorldVisual;
    const structuredFormTab = document.getElementById('world-visual-document-form-tab');
    const structuredJsonTab = document.getElementById('world-visual-document-json-tab');
    const structuredForm = document.getElementById('world-visual-document-form');
    const structuredJson = document.getElementById('world-visual-document-json');
    const setStructuredEditorTab = tab => {
        const json = tab === 'json';
        if (structuredForm) structuredForm.hidden = json;
        if (structuredJson) structuredJson.hidden = !json;
        structuredFormTab?.classList.toggle('is-active', !json);
        structuredJsonTab?.classList.toggle('is-active', json);
        if (json && worldVisualEditorState) {
            const project = saveStructuredVisualEditorDraft();
            const raw = document.getElementById('world-visual-raw-json');
            if (raw && project) raw.value = JSON.stringify(project.structuredDocument, null, 2);
        }
    };
    if (structuredFormTab) structuredFormTab.onclick = () => setStructuredEditorTab('form');
    if (structuredJsonTab) structuredJsonTab.onclick = () => setStructuredEditorTab('json');
    document.getElementById('world-visual-structured-compile')?.addEventListener('click', event => runStructuredVisualAuthoring('compile', event));
    document.getElementById('world-visual-structured-refine')?.addEventListener('click', event => runStructuredVisualAuthoring('refine', event));
    document.getElementById('world-visual-structured-rebuild')?.addEventListener('click', event => runStructuredVisualAuthoring('rebuild', event));
    document.getElementById('world-visual-add-object')?.addEventListener('click', () => {
        const editor = worldVisualEditorState;
        if (!editor) return;
        const project = saveStructuredVisualEditorDraft();
        if (project.structuredDocument.objects.length >= STRUCTURED_VISUAL_MAX_OBJECTS) return showToast(`A visual document can contain at most ${STRUCTURED_VISUAL_MAX_OBJECTS} authored objects.`, 'error');
        const id = newStructuredVisualObjectId('obj');
        project.structuredDocument.objects.push({ description: '', relationship: 'Related to the primary subject in the scene.' });
        project.objectOrder.push(id);
        project.hordeObjectMetadata[id] = { salience: 'secondary', kind: 'scene_object', binding: { characterId: '', outfitId: '', source: 'structured_editor' } };
        renderStructuredVisualDocumentEditor(project);
        const cards = document.querySelectorAll('#world-visual-structured-objects > [data-object-id]');
        cards[cards.length - 1]?.scrollIntoView({ block: 'nearest' });
        cards[cards.length - 1]?.querySelector('[data-field="description"]')?.focus({ preventScroll: true });
    });
    document.getElementById('world-visual-apply-json')?.addEventListener('click', async event => {
        const editor = worldVisualEditorState;
        if (!editor) return;
        const status = document.getElementById('world-visual-json-status');
        try {
            const project = saveStructuredVisualEditorDraft();
            const next = parseStructuredVisualJson(document.getElementById('world-visual-raw-json')?.value || '');
            const previous = project.structuredDocument;
            project.structuredDocument = next;
            while (project.objectOrder.length < next.objects.length) project.objectOrder.push(newStructuredVisualObjectId('obj'));
            project.objectOrder.length = next.objects.length;
            project.hordeObjectMetadata = normalizeStructuredVisualObjectMetadata(project.hordeObjectMetadata, project.objectOrder);
            recordStructuredVisualRevision(project, { operation: 'manual', authoredDocument: next, provenance: 'raw_json_editor', resolvedOutputPolicy: 'promote' });
            renderStructuredVisualDocumentEditor(project);
            await saveState();
            if (status) { status.textContent = 'Applied a valid structured-document revision.'; status.className = 'form-hint is-success'; }
        } catch (error) {
            if (status) { status.textContent = error.message; status.className = 'form-hint is-error'; }
            showToast(`Structured JSON was not applied — ${error.message}`, 'error');
        }
    });
    ['world-visual-primary', 'world-visual-prompt', 'world-visual-correction']
        .forEach(id => document.getElementById(id)?.addEventListener('input', event => autoSizeWorldVisualTextarea(event.currentTarget)));
    ['world-visual-aspect', 'world-visual-resolution', 'world-visual-crop-x', 'world-visual-crop-y', 'world-visual-crop-zoom']
        .forEach(id => { const field = document.getElementById(id); if (field) field.oninput = updateWorldVisualCropPreview; });
    document.getElementById('world-visual-apply-crop').onclick = async event => {
        const editor = worldVisualEditorState;
        if (!editor) return;
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Cropping...';
        try {
            saveWorldVisualEditorFields();
            const source = worldMediaSource(editor.world, worldVisualEditorAssetId(editor));
            if (!source) throw new Error('Generate or upload an image before cropping it.');
            if (editor.kind === 'npc') {
                // The NPC profile frame is a derived display asset: the source
                // image stays current so reopening the editor always offers
                // the full, uncropped picture for further edits.
                const displayId = await deriveWorldNpcPortraitDisplay(editor.world, editor.target,
                    document.getElementById('world-visual-crop-x').value,
                    document.getElementById('world-visual-crop-y').value,
                    Number(document.getElementById('world-visual-crop-zoom').value) / 100);
                if (!displayId) throw new Error('The profile frame could not be derived from this image.');
                pruneWorldMediaAssets(editor.world);
                refreshWorldVisualEditorAfterAsset();
                showToast(`Profile frame saved for ${editor.target.name}. The full image is preserved for future edits.`, 'success');
            } else {
                const cropped = await cropWorldVisual(source,
                    document.getElementById('world-visual-aspect').value,
                    document.getElementById('world-visual-resolution').value,
                    document.getElementById('world-visual-crop-x').value,
                    document.getElementById('world-visual-crop-y').value,
                    Number(document.getElementById('world-visual-crop-zoom').value) / 100);
                const assetId = addWorldMediaAsset(editor.world, cropped,
                    'location_background', editor.target.name,
                    { prompt: 'Manual crop of an existing portable world visual.' });
                registerWorldVisualVariant(editor.world, editor.target, editor.kind, assetId);
                pruneWorldMediaAssets(editor.world);
                refreshWorldVisualEditorAfterAsset();
                showToast(`Cropped ${editor.target.name} to the selected frame.`, 'success');
            }
        } catch (error) {
            showToast(`Crop failed: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Apply Crop';
        }
    };
    document.getElementById('world-visual-crop-fill').onclick = event => runWorldVisualCropFill(event);
    document.getElementById('world-visual-regenerate').onclick = event => runWorldVisualGeneration(false, event);
    document.getElementById('world-visual-revise').onclick = event => runWorldVisualGeneration(true, event);
    document.getElementById('world-visual-refine-prompt').onclick = event => refineWorldVisualPromptWithAI(event);
    document.getElementById('world-visual-4d').onclick = event => runWorldVisual4D(event);
    document.getElementById('world-visual-save-identity-reference').onclick = () => {
        const editor = worldVisualEditorState;
        if (!editor || editor.kind !== 'npc') return;
        const assetId = worldVisualEditorAssetId(editor);
        if (!assetId) return showToast('Select a generated image first.', 'error');
        editor.target.identityReferences = Array.isArray(editor.target.identityReferences) ? editor.target.identityReferences : [];
        editor.target.identityReferences = [
            ...editor.target.identityReferences.filter(ref => ref.assetId !== assetId),
            { assetId, purpose: 'primary_identity', revision: Number(editor.target.visuals?.imageProfileRevision || 0) || 0, notes: 'Author-selected identity reference.' }
        ].slice(-12);
        showToast('Selected image saved as a character identity reference.', 'success');
    };
    document.getElementById('world-visual-apply-outfit').onclick = event => applyWorldOutfitAndGenerate(event);
    document.getElementById('world-visual-new-outfit').onclick = () => {
        const editor = worldVisualEditorState;
        if (!editor || editor.kind !== 'npc') return;
        const outfit = createBlankWorldOutfit(editor.target);
        if (!outfit) return showToast('This character already has the maximum number of outfits.', 'error');
        selectWorldOutfit(editor.world, editor.target, outfit.id, { preferImage: false });
        renderWorldEntities();
        renderWorldVisualActiveOutfit();
        const outfitList = document.getElementById('world-visual-active-outfit-list');
        scrollWorldOutfitListToEnd(outfitList);
        focusWorldOutfitName(outfitList, outfit.id);
        showToast('Blank outfit added and selected. Fill in its description on the character screen.', 'success');
    };
    const outfitSelect = document.getElementById('world-visual-outfit-select');
    if (outfitSelect) outfitSelect.onchange = event => {
        const editor = worldVisualEditorState;
        if (!editor || editor.kind !== 'npc' || !event.target.value) return;
        selectWorldOutfit(editor.world, editor.target, event.target.value, { preferImage: false });
        renderWorldVisualActiveOutfit();
        saveWorldVisualEditorFields();
        renderWorldVisualOutfitGallery();
    };
    const leftOutfitSelect = document.getElementById('world-visual-left-outfit-select');
    if (leftOutfitSelect) leftOutfitSelect.onchange = event => {
        const editor = worldVisualEditorState;
        if (!editor || editor.kind !== 'npc' || !event.target.value) return;
        selectWorldOutfit(editor.world, editor.target, event.target.value, { preferImage: false });
        if (outfitSelect) outfitSelect.value = event.target.value;
        renderWorldVisualActiveOutfit();
        saveWorldVisualEditorFields();
        updateWorldVisualCropPreview();
    };
    const briefPicker = document.getElementById('world-visual-brief-preset');
    if (briefPicker) briefPicker.onchange = () => {
        const editor = worldVisualEditorState;
        const name = briefPicker.value;
        const preset = normalizeImageGuidePresets(state.globalSettings.imageGuidePresets)[name];
        if (!editor || !name || !preset) return;
        editor.activeBriefName = name;
        // Visual editor generation is intentionally fixed to the portrait
        // source aspect. Presets may still carry legacy aspect metadata, but
        // it must not reintroduce a per-image aspect choice.
        document.getElementById('world-visual-aspect').value = '3:4';
        if (preset.framing && editor.kind === 'npc') document.getElementById('world-visual-framing').value = preset.framing;
        saveWorldVisualEditorFields();
        const project = ensureWorldVisualProject(editor.world, editor.target, editor.kind === 'npc' ? 'character' : 'location');
        const doc = project.structuredDocument;
        const guide = normalizeWorldImageGuide(preset);
        const savedPatch = isPlainObject(preset.structuredPatch) ? preset.structuredPatch : null;
        const sourcePatch = savedPatch || {};
        if (sourcePatch.background_setting || guide.backgroundSetting) doc.background_setting = sourcePatch.background_setting || guide.backgroundSetting;
        if (sourcePatch.aesthetics?.composition || guide.composition) doc.aesthetics.composition = sourcePatch.aesthetics?.composition || guide.composition;
        if (sourcePatch.aesthetics?.color_scheme || guide.colorScheme) doc.aesthetics.color_scheme = sourcePatch.aesthetics?.color_scheme || guide.colorScheme;
        if (sourcePatch.aesthetics?.mood_atmosphere || guide.moodAtmosphere) doc.aesthetics.mood_atmosphere = sourcePatch.aesthetics?.mood_atmosphere || guide.moodAtmosphere;
        if (sourcePatch.lighting || guide.lightingConditions || guide.lightingDirection || guide.lightingShadows) doc.lighting = {
            conditions: sourcePatch.lighting?.conditions || guide.lightingConditions || doc.lighting.conditions,
            direction: sourcePatch.lighting?.direction || guide.lightingDirection || doc.lighting.direction,
            shadows: sourcePatch.lighting?.shadows || guide.lightingShadows || doc.lighting.shadows
        };
        if (sourcePatch.photographic_characteristics || guide.depthOfField || guide.focus || guide.lensFocalLength || guide.cameraAngle) doc.photographic_characteristics = {
            depth_of_field: sourcePatch.photographic_characteristics?.depth_of_field || guide.depthOfField || doc.photographic_characteristics.depth_of_field,
            focus: sourcePatch.photographic_characteristics?.focus || guide.focus || doc.photographic_characteristics.focus,
            camera_angle: sourcePatch.photographic_characteristics?.camera_angle || guide.cameraAngle || doc.photographic_characteristics.camera_angle,
            lens_focal_length: sourcePatch.photographic_characteristics?.lens_focal_length || guide.lensFocalLength || doc.photographic_characteristics.lens_focal_length
        };
        if (sourcePatch.style_medium || guide.styleMedium) doc.style_medium = sourcePatch.style_medium || guide.styleMedium;
        if (sourcePatch.artistic_style || guide.artisticStyle) doc.artistic_style = sourcePatch.artistic_style || guide.artisticStyle;
        if (sourcePatch.primaryObject && doc.objects[0]) Object.assign(doc.objects[0], sourcePatch.primaryObject);
        recordStructuredVisualRevision(project, { operation: 'manual', authoredDocument: doc, provenance: `preset:${name}`, resolvedOutputPolicy: 'promote' });
        renderStructuredVisualDocumentEditor(project);
        updateWorldVisualCropPreview();
        briefPicker.value = name;
        const activeLabel = document.getElementById('world-visual-brief-active');
        if (activeLabel) activeLabel.textContent = `Active: ${name}`;
        showToast(`Applied visual brief “${name}” to ${editor.target.name || 'this visual'}.`, 'success');
    };
    document.getElementById('world-visual-brief-save-as').onclick = async event => {
        const editor = worldVisualEditorState;
        if (!editor) return;
        const button = event.currentTarget;
        const picker = document.getElementById('world-visual-brief-preset');
        const input = document.getElementById('world-visual-brief-save-name');
        const selected = String(picker?.value || editor.activeBriefName || '').trim();
        const name = String(input?.value || '').trim().slice(0, 100) || `${selected || 'Visual brief'} - modified`;
        const presets = normalizeImageGuidePresets(state.globalSettings.imageGuidePresets);
        const guide = normalizeWorldImageGuide({
            ...(worldImageGuide(editor.world) || {}),
            ...(selected ? (presets[selected] || {}) : {})
        });
        const aspect = document.getElementById('world-visual-aspect')?.value || '';
        const framing = editor.kind === 'npc' ? document.getElementById('world-visual-framing')?.value || '' : '';
        const project = saveStructuredVisualEditorDraft();
        const structured = project ? safeJsonClone(project.structuredDocument) : null;
        presets[name] = {
            ...normalizeImageBriefPreset({ ...guide, aspectRatio: aspect, framing, description: `Saved from ${editor.target.name || 'visual editor'}.` }),
            schemaVersion: 2,
            structuredPatch: structured ? {
                background_setting: structured.background_setting,
                lighting: structured.lighting,
                aesthetics: { composition: structured.aesthetics.composition, color_scheme: structured.aesthetics.color_scheme, mood_atmosphere: structured.aesthetics.mood_atmosphere },
                photographic_characteristics: structured.photographic_characteristics,
                style_medium: structured.style_medium,
                artistic_style: structured.artistic_style,
                primaryObject: structured.objects[0] ? { location: structured.objects[0].location, relative_size: structured.objects[0].relative_size, pose: structured.objects[0].pose, expression: structured.objects[0].expression, action: structured.objects[0].action, orientation: structured.objects[0].orientation, relationship: structured.objects[0].relationship } : {}
            } : null
        };
        state.globalSettings.imageGuidePresets = presets;
        editor.activeBriefName = name;
        if (picker) {
            picker.innerHTML = '<option value="">Apply a visual brief…</option>'
                + Object.keys(presets).sort((a, b) => a.localeCompare(b)).map(key => `<option value="${escapeHTML(key)}">${escapeHTML(key)}</option>`).join('');
            picker.value = name;
        }
        if (input) input.value = '';
        const activeLabel = document.getElementById('world-visual-brief-active');
        if (activeLabel) activeLabel.textContent = `Active: ${name}`;
        button.disabled = true;
        try { await persistGlobalSettingsOnly(); showToast(`Saved global visual brief “${name}”.`, 'success'); }
        catch (error) { showToast(`Could not save visual brief — ${error.message}`, 'error'); }
        finally { button.disabled = false; }
    };

    const stage = document.getElementById('world-visual-crop-stage');
    let drag = null;
    stage.onpointerdown = event => {
        if (!worldVisualEditorState
            || !worldMediaSource(worldVisualEditorState.world, worldVisualEditorAssetId())) return;
        drag = {
            x: event.clientX, y: event.clientY,
            focusX: Number(document.getElementById('world-visual-crop-x').value),
            focusY: Number(document.getElementById('world-visual-crop-y').value)
        };
        stage.setPointerCapture(event.pointerId);
    };
    stage.onpointermove = event => {
        if (!drag) return;
        const image = document.getElementById('world-visual-crop-image');
        const overflowX = Math.max(1, image.offsetWidth - stage.clientWidth);
        const overflowY = Math.max(1, image.offsetHeight - stage.clientHeight);
        const nextX = Math.max(0, Math.min(100, drag.focusX - (event.clientX - drag.x) / overflowX * 100));
        const nextY = Math.max(0, Math.min(100, drag.focusY - (event.clientY - drag.y) / overflowY * 100));
        document.getElementById('world-visual-crop-x').value = String(nextX);
        document.getElementById('world-visual-crop-y').value = String(nextY);
        updateWorldVisualCropPreview();
    };
    stage.onpointerup = stage.onpointercancel = () => { drag = null; };
}

function openWorldVisualEditor(world, target, kind) {
    ensureWorldVisualEditorBound();
    target.visuals = isPlainObject(target.visuals) ? target.visuals : {};
    const visualProject = ensureWorldVisualProject(world, target, kind === 'npc' ? 'character' : 'location');
    worldVisualEditorState = {
        world, target, kind, variantFilter: 'all', visualProject,
        // The selected saved brief is an editor-scoped application of the
        // global preset library. It does not rewrite every other character.
        activeBriefName: kind === 'npc' ? String(target.visuals.portraitBriefId || '') : ''
    };
    const npc = kind === 'npc';
    document.getElementById('world-visual-editor-title').textContent = `${target.name || 'Untitled'} - ${npc ? 'portrait' : 'location visual'}`;
    // Write only the text node: the label also hosts the AI-fill buttons, and
    // assigning textContent to the whole label would delete them.
    (document.getElementById('world-visual-primary-label-text')
        || document.getElementById('world-visual-primary-label')).textContent =
        npc ? 'Appearance & public impression' : 'Visible physical description';
    document.getElementById('world-visual-primary').value = npc
        ? target.appearance || target.description || ''
        : target.visualDescription || target.description || '';
    document.getElementById('world-visual-prompt').value = target.visuals.imageIntent?.authoredPrompt || target.imagePrompt || '';
    document.getElementById('world-visual-framing-field').classList.toggle('hidden', !npc);
    document.getElementById('world-visual-framing').value = npc
        ? target.visuals.framing?.mode || target.visuals.portraitFraming || 'auto' : 'auto';
    // Optional per-character subject fields (NPC portraits only). Hidden for
    // locations, where the world guide and the location's own description
    // already carry the subject layer.
    const subjectField = document.getElementById('world-visual-subject-field');
    if (subjectField) {
        subjectField.classList.toggle('hidden', !npc);
        if (npc) {
            const subjectGuide = normalizeWorldVisualSubjectGuide({
                ...(target.visuals.subjectGuide || {}), ...(target.visuals.portraitSubjectGuide || {}),
                ...(target.visuals.framing || {})
            });
            WORLD_VISUAL_SUBJECT_FIELDS.forEach(field => {
                const input = document.getElementById(`world-visual-subject-${field.key}`);
                if (input) input.value = subjectGuide[field.key];
            });
        }
    }
    const lookField = document.getElementById('world-visual-look-field');
    if (lookField) {
        lookField.classList.toggle('hidden', !npc);
        if (npc) {
            const look = normalizeWorldImageLook(target.visuals.look, worldImageGuide(world) || {});
            ['styleMedium', 'lightingConditions', 'colorScheme', 'depthOfField', 'focus', 'lensFocalLength'].forEach(key => {
                const input = document.getElementById(`world-visual-look-${key}`);
                if (input) input.value = look[key] || '';
            });
        }
    }
    // Stable identity fields belong to the person, not to presets or outfits.
    const identityField = document.getElementById('world-visual-identity-field');
    if (identityField) {
        identityField.classList.toggle('hidden', !npc);
        if (npc) {
            const identityGuide = normalizeWorldVisualIdentityGuide(target.visuals.portraitIdentityGuide);
            WORLD_VISUAL_IDENTITY_FIELDS.forEach(field => {
                const input = document.getElementById(`world-visual-identity-${field.key}`);
                if (input) input.value = identityGuide[field.key];
            });
        }
    }
    const outfitField = document.getElementById('world-visual-outfit-field');
    const outfitSelect = document.getElementById('world-visual-outfit-select');
    if (outfitField && outfitSelect) {
        outfitField.classList.toggle('hidden', !npc);
        if (npc) {
            const outfits = worldOutfits(target);
            outfitSelect.innerHTML = '<option value="">No outfit selected</option>'
                + outfits.map(outfit => `<option value="${escapeHTML(outfit.id)}">${escapeHTML(outfit.name)}</option>`).join('');
            outfitSelect.value = String(target.visuals.currentOutfitId || '');
        } else outfitSelect.innerHTML = '';
    }
    // The shared AI instruction is transient: one authoring session, cleared
    // when the editor opens so stale instructions never leak into a fill.
    const aiInstruction = document.getElementById('world-visual-ai-instruction');
    if (aiInstruction) aiInstruction.value = '';
    // Visual brief presets apply the world's look plus this visual's aspect
    // and framing in one action.
    const briefPicker = document.getElementById('world-visual-brief-preset');
    if (briefPicker) {
        const presets = normalizeImageGuidePresets(state.globalSettings.imageGuidePresets);
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
        briefPicker.innerHTML = `<option value="">Apply a visual brief…</option>`
            + names.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
        briefPicker.value = npc ? String(worldVisualEditorState.activeBriefName || '') : '';
        const activeLabel = document.getElementById('world-visual-brief-active');
        if (activeLabel) activeLabel.textContent = briefPicker.value ? `Active: ${briefPicker.value}` : 'No preset selected';
    }
    // All editor generations use the same 3:4 vertical source. The profile
    // portrait is derived separately as a square crop; the source remains
    // whole and editable in the outfit/profile cards.
    document.getElementById('world-visual-aspect').value = '3:4';
    document.getElementById('world-visual-resolution').value = String(npc
        ? normalizedWorldVisualResolution(target.visuals.portraitResolution, 1200)
        : normalizedWorldVisualResolution(target.visuals.backgroundResolution, 1600));
    renderStructuredVisualDocumentEditor(visualProject);
    document.getElementById('world-visual-correction').value = npc
        ? target.visuals.portraitCorrection || '' : target.visuals.backgroundCorrection || '';
    worldVisualHistory(world, target, kind);
    const variantFilter = document.getElementById('world-visual-variant-filter');
    if (variantFilter) {
        if (npc) {
            const outfits = worldOutfits(target);
            variantFilter.innerHTML = '<option value="all">All images</option>'
                + outfits.map(outfit => `<option value="${escapeHTML(outfit.id)}">${escapeHTML(outfit.name)}</option>`).join('')
                + '<option value="unassigned">Unassigned images</option>';
            variantFilter.classList.remove('hidden');
        } else {
            variantFilter.innerHTML = '<option value="all">All images</option>';
            variantFilter.classList.add('hidden');
        }
        variantFilter.value = 'all';
    }
    document.getElementById('world-visual-regenerate').textContent = 'Generate new';
    document.getElementById('world-visual-crop-x').value = '50';
    document.getElementById('world-visual-crop-y').value = '50';
    document.getElementById('world-visual-crop-zoom').value = '100';
    // Sparkle affordances for the two authored text fields. Story-born
    // characters arrive with prose but no image prompt, so this is the only
    // route by which they ever become illustratable.
    {
        const primaryEl = document.getElementById('world-visual-primary');
        const promptEl = document.getElementById('world-visual-prompt');
        const primarySlot = document.getElementById('ai-visual-primary-actions');
        const promptSlot = document.getElementById('ai-visual-prompt-actions');
        if (primarySlot) primarySlot.innerHTML = aiFieldButtonMarkup(
            'world-visual-primary', String(primaryEl?.value || ''), 'world-visual-primary');
        if (promptSlot) promptSlot.innerHTML = aiFieldButtonMarkup(
            'ent-image-prompt', String(promptEl?.value || ''), 'world-visual-prompt');
        bindAiFieldButtons(document.getElementById('world-visual-editor-modal'), () => target, world,
            () => document.getElementById('world-visual-ai-instruction')?.value || '');
    }
    document.getElementById('world-visual-editor-modal').classList.remove('hidden');
    renderWorldVisualActiveOutfit();
    requestAnimationFrame(() => {
        autoSizeWorldVisualTextareas();
        updateWorldVisualCropPreview();
    });
}

function attachWorldVisualReference(body, provider, model, referenceImage) {
    if (!referenceImage) return body;
    if (provider === 'fal') {
        // The live fal bridge route consumes a single inline reference.
        body.imageDataUrl = referenceImage;
    } else     if (provider === 'nanogpt') {
        const mode = nanoGPTImageReferenceMode(model);
        if (mode === 'multiple') body.imageDataUrls = [referenceImage];
        else body.imageDataUrl = referenceImage;
    } else if (provider === 'gptproto') {
        body.image = referenceImage;
    } else {
        body.input_references = [{ type: 'image_url', image_url: { url: referenceImage } }];
    }
    return body;
}

async function generateWorldVisual(world, prompt, {
    aspectRatio = '16:9', maxDimension = 1600, quality = 0.78, kind, label,
    referenceImage = '', requireReference = false, imageSubject = null, imageGuide = null,
    imageSpecification = null, resolvedStructuredPrompt = null, seed = null,
    fiboCombinedRevision = false,
    operation = '' ,
    visualProject = null,
    resolvedOutputPolicy = '',
    syncMode = undefined
} = {}) {
    const presentation = normalizeWorldPresentation(world);
    const pipeline = requireReference || referenceImage ? 'revision' : 'new';
    const provider = worldVisualProvider(world, pipeline);
    if (!['openrouter', 'gptproto', 'nanogpt', 'fal'].includes(provider)) {
        throw new Error('Choose OpenRouter, GPTProto, NanoGPT or Fal under World Studio → Visuals, or upload an image manually.');
    }
    if (!providerHasCredentials(provider)) {
        throw new Error(`Add a ${providerDisplayName(provider)} API key in Settings before generating world visuals.`);
    }
    const model = worldVisualModel(world, provider, pipeline);
    let modelInfo = companionImageModelInfo(model);
    if (!modelInfo) {
        const ranked = rankCompanionImageModels(await getCompanionOutputModels('image', false, provider), provider);
        companionImageModelCatalog = ranked;
        modelInfo = ranked.find(item => item.id === model) || null;
    }
    const endpoints = await getCompanionImageEndpoints(model, false, provider);
    const endpoint = chooseCompanionImageEndpoint(endpoints, { imageProviderTag: '' }, !!referenceImage);
    const capabilities = companionImageCapabilities(modelInfo, endpoint);
    const referenceDescriptor = capabilities.input_references;
    const advertisedReference = !!referenceDescriptor
        && (referenceDescriptor.type !== 'range' || Number(referenceDescriptor.max) > 0);
    const providerReference = provider === 'fal'
        // Live-catalog fal models carry reference capability from their
        // endpoint category; unknown ids stay permissive and let the
        // endpoint's own validation decide.
        ? (modelInfo ? modelInfo.supportsReference !== false : true)
        : provider === 'nanogpt'
        ? !!nanoGPTImageReferenceMode(model)
        : provider === 'gptproto' ? !!gptProtoImageReferenceProfile(model) : false;
    const canUseReference = !!referenceImage && (advertisedReference || providerReference);
    if (requireReference && !referenceImage) {
        throw new Error('Revision requires the currently selected image as its source.');
    }
    if (requireReference && !canUseReference) {
        throw new Error(`${model} does not expose reference-image editing through its selected endpoint. Choose a reference-capable image model before revising.`);
    }
    // The authored image guide is the world's optional direction layer. It
    // rides every generation AND revision: for Fibo endpoints it travels as
    // the native structured prompt (or structured instruction with the edit
    // wording embedded); for every other provider it compiles into prompt
    // prose, which also anchors revisions to the world's look.
    const selectedImageGuide = imageGuide || worldImageGuide(world);
    const visualOperation = operation || (requireReference ? 'revise' : 'generate');
    const composedRequest = imageSpecification || composeWorldImageRequest(world, imageSubject, selectedImageGuide, {
        operation: visualOperation,
        visualProject
    });
    const fiboModel = provider === 'fal' && isFiboImageEndpoint(model);
    if (fiboModel && requireReference && !fiboCombinedRevision && !/^bria\/fibo-edit/i.test(model)) {
        throw new Error('This FIBO generation endpoint has not passed the combined refinement acceptance test. Choose a FIBO Edit revision model or complete the provider capability test first.');
    }
    const explicitPrompt = String(prompt || '').trim();
    const nativeFiboCompile = fiboModel && visualOperation === 'compile' && !resolvedStructuredPrompt;
    // Generic prompt compilation is deterministic.  The caller's explicit
    // prose is used only for a native FIBO compile or a revision instruction;
    // it is never silently appended to an ordinary rerender.
    const finalPrompt = fiboModel
        ? (nativeFiboCompile || requireReference ? explicitPrompt : '')
        : String(composedRequest.plainPrompt || '').trim();
    const requestConfig = {
        imageModel: model,
        imageParameters: { aspect_ratio: aspectRatio },
        imageProviderOptions: {},
        imageProviderTag: ''
    };
    const buildBody = includeReference => {
        const body = attachWorldVisualReference(
            applyCompanionImageParameters({ model, prompt: finalPrompt }, requestConfig, capabilities, endpoint),
            provider, model, includeReference ? referenceImage : '');
        if (provider === 'fal') {
            body.aspect_ratio = aspectRatio;
            Object.assign(body, falAdvancedRequestBody(world));
            if (fiboModel) {
                const structured = resolvedStructuredPrompt || composedRequest.structuredPrompt
                    || fiboStructuredImageGuide(world, imageSubject, '', selectedImageGuide);
                if (!nativeFiboCompile && structured) body.fiboStructuredPrompt = structured;
                body.fiboNativeCompile = nativeFiboCompile;
                body.fiboResolution = maxDimension >= 1536 ? '4MP' : '1MP';
                if (requireReference && prompt) body.fiboRevisionInstruction = String(prompt).slice(0, 4000);
                body.fiboCombinedRevision = fiboCombinedRevision === true;
                if (Number.isInteger(seed)) body.seed = seed;
                if (typeof syncMode === 'boolean') body.syncMode = syncMode;
            }
        }
        return body;
    };
    let generated;
    requestCompanionPhoto.lastResult = null;
    try {
        generated = await requestCompanionPhoto(buildBody(canUseReference), provider);
    } catch (error) {
        if (requireReference || !canUseReference
            || (!error.referencePrivacyRejected && !error.referenceTransportRejected)) throw error;
        generated = await requestCompanionPhoto(buildBody(false), provider);
    }
    const portable = await makeWorldVisualPortable(generated, maxDimension, quality);
    // A model's generated composition is the source asset. Do not silently
    // trim it into the editor's display frame: cropping is an explicit,
    // reversible derived-asset action and Crop & Fill is the API-backed way
    // to outpaint a new target frame without sacrificing source pixels.
    const providerResult = requestCompanionPhoto.lastResult || {};
    const providerResponseMetadata = isPlainObject(providerResult)
        ? Object.fromEntries(Object.entries(providerResult).filter(([key]) => key !== 'image')) : null;
    const resolved = isPlainObject(providerResult.resolved_structured_prompt)
        ? providerResult.resolved_structured_prompt : (resolvedStructuredPrompt || composedRequest.structuredPrompt || null);
    const generatedSeed = Number.isInteger(providerResult.seed) ? providerResult.seed : (Number.isInteger(seed) ? seed : null);
    const exactRequest = {
        provider, model, operation: visualOperation, prompt: finalPrompt, aspectRatio, resolution: maxDimension >= 1536 ? '4MP' : '1MP',
        structuredPrompt: nativeFiboCompile ? null : (composedRequest.structuredPrompt || null),
        compiledPlainPrompt: !fiboModel ? String(composedRequest.plainPrompt || '') : '',
        revisionInstruction: requireReference ? String(prompt || '').slice(0, 4000) : '',
        seed: generatedSeed,
        resolvedOutputPolicy: resolvedOutputPolicy || (visualOperation === 'compile' ? 'promote' : 'review')
    };
    return addWorldMediaAsset(world, portable, kind, label, {
        generated: true, model, prompt,
        seed: generatedSeed,
        resolvedStructuredPrompt: resolved,
        resolvedContext: String(resolved?.context || '').slice(0, 3000),
        outfitSnapshot: composedRequest.specification?.outfit || null,
        requestMetadata: {
            provider, model, endpoint, operation: visualOperation,
            aspectRatio, resolution: maxDimension >= 1536 ? '4MP' : '1MP',
            seed: generatedSeed,
            structuredPrompt: nativeFiboCompile ? null : (composedRequest.structuredPrompt || null),
            compiledPlainPrompt: !fiboModel ? String(composedRequest.plainPrompt || '') : '',
            combinedRevision: fiboCombinedRevision === true,
            resolvedOutputPolicy: resolvedOutputPolicy || (visualOperation === 'compile' ? 'promote' : 'review')
        },
        exactRequest,
        providerResponseMetadata,
        visualProjectId: visualProject?.target?.id || '',
        visualRevisionId: visualProject?.activeRevisionId || '',
        authoredDocument: composedRequest.specification?.structuredDocument || null,
        resolvedOutputPolicy: resolvedOutputPolicy || (visualOperation === 'compile' ? 'promote' : 'review')
    });
}

function worldVisualStylePrompt(world) {
    const presentation = normalizeWorldPresentation(world);
    const namedStyles = {
        cinematic: 'cinematic environmental concept art with believable materials and restrained dramatic lighting',
        painted_fantasy: 'richly painted fantasy illustration with cohesive brushwork and grounded detail',
        graphic_novel: 'painterly graphic-novel art with confident shapes and controlled contrast',
        sitcom_2000s: 'warm early-2000s television sitcom production design and consumer digital-camera color',
        anime_vn: 'polished cinematic anime visual-novel artwork with coherent environments and character design',
        retro_rpg: 'detailed retro role-playing game key art, clean readable silhouettes and atmospheric color',
        parchment: 'hand-inked parchment illustration with restrained pigments and cartographic texture',
        horror: 'grounded dark-horror concept art with oppressive atmosphere and readable shadow detail',
        custom: 'follow the authored art direction exactly'
    };
    return `${namedStyles[presentation.artStyle] || namedStyles.cinematic}. ${presentation.artDirection || 'Maintain one coherent visual language across this world.'}`;
}

async function generateWorldLocationBackground(world, location, options = {}) {
    // Locations carry their own subject data for structured consumers: the
    // authored brief as the short description and the visible space as the
    // background setting. Character data never enters location visuals.
    const imageSubject = {
        shortDescription: String(location.imagePrompt || '').trim(),
        backgroundSetting: String(location.visualDescription || location.description || '').trim()
    };
    if (options.revisionOnly) {
        const instruction = String(options.correction || '').trim();
        if (!instruction) throw new Error('Write a revision instruction first.');
        return generateWorldVisual(world, instruction, {
            aspectRatio: normalizedWorldVisualAspect(options.aspectRatio || location.visuals?.backgroundAspectRatio, '16:9'),
            maxDimension: normalizedWorldVisualResolution(options.maxDimension || location.visuals?.backgroundResolution, 1600),
            quality: 0.82, kind: 'location_background', label: location.name,
            referenceImage: options.referenceImage || '', requireReference: true, imageSubject
        });
    }
    if (options.operation === 'compile' && options.authoredPrompt) {
        return generateWorldVisual(world, String(options.authoredPrompt), {
            aspectRatio: '16:9', maxDimension: normalizedWorldVisualResolution(options.maxDimension || location.visuals?.backgroundResolution, 1600),
            quality: 0.82, kind: 'location_background', label: location.name,
            imageSubject, operation: 'compile', visualProject: ensureWorldVisualProject(world, location, 'location'),
            resolvedOutputPolicy: 'promote'
        });
    }
    const visibleDescription = location.visualDescription || location.description || 'Use the location name and world premise.';
    const authoredPrompt = location.imagePrompt ? `\nAuthored location brief: ${location.imagePrompt}` : '';
    const prompt = `Create an establishing visual for an interactive text RPG location.\nWorld: ${world.name}.\nWorld premise: ${world.description || 'Not specified.'}\nLocation: ${location.name}.\nVisible physical description: ${visibleDescription}\nRegion: ${location.region || 'Not specified.'}${authoredPrompt}\nArt direction: ${worldVisualStylePrompt(world)}\nShow the physical space clearly from a useful eye-level viewpoint in the requested frame. No text, labels, interface, frame, watermark, map markers or prominent posed characters. Do not reveal secrets or invent a story event. This is a reusable location background, not a one-time action scene.`;
    return generateWorldVisual(world, prompt, {
        aspectRatio: normalizedWorldVisualAspect(options.aspectRatio || location.visuals?.backgroundAspectRatio, '16:9'),
        maxDimension: normalizedWorldVisualResolution(options.maxDimension || location.visuals?.backgroundResolution, 1600),
        quality: 0.82, kind: 'location_background', label: location.name,
        referenceImage: '', imageSubject
    });
}

async function generateWorldNpcPortrait(world, npc, options = {}) {
    // Subject data for structured consumers: stable identity from the same
    // source the prose compiler uses, the currently worn outfit as the
    // clothing string, optional identity fields and staging. Blank fields
    // simply do not travel.
    const project = ensureWorldVisualProject(world, npc, 'character');
    const sceneProjection = options.sceneProjection || sidecarReaderVisualProjection(world, options.session || (typeof getCurrentWorldSession === 'function' ? getCurrentWorldSession() : null), npc.id);
    const selectedOutfit = options.outfitId
        ? worldOutfits(npc).find(entry => entry.id === String(options.outfitId))
        : null;
    const wornOutfit = selectedOutfit || worldCurrentOutfit(npc);
    const visualDocument = options.visualDocument
        || (project?.structuredDocument ? project.structuredDocument : null);
    const imageSubject = {
        name: npc.name,
        shortDescription: String(options.authoredPrompt || npc.imagePrompt || '').trim(),
        description: String(npc.appearance || npc.description || '').trim(),
        visualDescription: String(npc.appearance || npc.description || '').trim(),
        imageIntent: npc.visuals?.imageIntent,
        framing: {
            ...(npc.visuals?.framing || {}),
            relativeSizeInFrame: npc.visuals?.framing?.relativeSizeInFrame
                || npc.visuals?.portraitIdentityGuide?.relativeSize || ''
        },
        look: npc.visuals?.look,
        outfit: wornOutfit,
        outfitSnapshot: wornOutfit ? wornOutfit.description : '',
        outfitId: wornOutfit?.id || '',
        characterId: npc.id,
        sceneProjection,
        structuredDocument: visualDocument,
        ...normalizeWorldVisualIdentityGuide(npc.visuals?.portraitIdentityGuide),
        ...normalizeWorldVisualSubjectGuide(npc.visuals?.portraitSubjectGuide)
    };
    const selectedGuide = options.imageGuide || worldImageGuideForTarget(world, npc, 'npc');
    const imageSpecification = composeWorldImageRequest(world, imageSubject, selectedGuide, {
        operation: options.revisionOnly ? 'revise' : 'generate',
        revision: Number(npc.visuals?.imageProfileRevision || 0) || 0,
        visualProject: project
    });
    if (options.revisionOnly) {
        const instruction = String(options.correction || '').trim();
        if (!instruction) throw new Error('Write a revision instruction first.');
        return generateWorldVisual(world, instruction, {
            aspectRatio: normalizedWorldVisualAspect(options.aspectRatio || npc.visuals?.portraitAspectRatio, '3:4'),
            maxDimension: normalizedWorldVisualResolution(options.maxDimension || npc.visuals?.portraitResolution, 1200),
            quality: 0.84, kind: 'npc_portrait', label: npc.name,
            referenceImage: options.referenceImage || '', requireReference: true, imageSubject,
            imageGuide: selectedGuide,
            imageSpecification,
            resolvedStructuredPrompt: options.resolvedStructuredPrompt || null,
            fiboCombinedRevision: options.fiboCombinedRevision === true,
            operation: 'revise',
            visualProject: project,
            resolvedOutputPolicy: 'review',
            syncMode: project.providerControls?.syncMode
        });
    }
    return generateWorldVisual(world, options.authoredPrompt || imageSpecification.plainPrompt || imageSubject.shortDescription, {
        aspectRatio: '3:4', maxDimension: normalizedWorldVisualResolution(options.maxDimension || npc.visuals?.portraitResolution, 1200), quality: 0.84,
        kind: 'npc_portrait', label: npc.name, referenceImage: '', imageSubject,
        imageGuide: selectedGuide, imageSpecification,
        operation: options.operation || 'generate',
        visualProject: project,
        resolvedOutputPolicy: options.operation === 'compile' ? 'promote' : 'submitted_as_current',
        syncMode: project.providerControls?.syncMode
    });
}

async function generateWorldMapSkin(world) {
    const prompt = `Create a wide decorative background texture for the interactive map of an RPG world.\nWorld: ${world.name}.\nWorld premise: ${world.description || 'Not specified.'}\nArt direction: ${worldVisualStylePrompt(world)}\nThis image sits underneath a live semantic graph, so keep the center readable and relatively low contrast. Suggest terrain, material, borders, compass ornament or cartographic atmosphere appropriate to the world, but do not draw named locations, route lines, labels, legends, interface controls or text. No watermark. The application will place the authoritative nodes and connections on top.`;
    return generateWorldVisual(world, prompt, {
        aspectRatio: '16:9', maxDimension: 1600, quality: 0.76,
        kind: 'map_skin', label: `${world.name} map skin`
    });
}

