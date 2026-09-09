function worldVisualProvider(world, pipeline = 'new') {
    const presentation = normalizeWorldPresentation(world);
    const requestedValue = pipeline === 'revision'
        ? presentation.revisionImageProvider : presentation.newImageProvider;
    if (pipeline === 'revision' && requestedValue === 'same_as_new') {
        return worldVisualProvider(world, 'new');
    }
    const requested = requestedValue === 'inherit'
        ? normalizedProviderId(ExperimentalWorldsVisualMediaHost.globalSettings().apiProvider) : requestedValue;
    if (requested === 'fal') return 'fal';
    const provider = normalizedProviderId(requested);
    return ['openrouter', 'gptproto', 'nanogpt', 'local'].includes(provider) ? provider : 'openrouter';
}

function worldVisualModel(world, provider, pipeline = 'new') {
    const presentation = normalizeWorldPresentation(world);
    const authored = String(pipeline === 'revision'
        ? (presentation.revisionImageModel || presentation.newImageModel) : presentation.newImageModel || '').trim();
    if (provider === 'gptproto' && authored === 'google/gemini-3.1-flash-lite-image') {
        return 'gemini-3.1-flash-lite-image';
    }
    if (provider === 'openrouter' && authored === 'gemini-3.1-flash-lite-image') {
        return 'google/gemini-3.1-flash-lite-image';
    }
    return authored || companionImageModelFallback(provider);
}

function blobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('The generated image could not be embedded in the world save.'));
        reader.readAsDataURL(blob);
    });
}

async function makeWorldVisualPortable(source, maxDimension, quality) {
    let data = normalizeGeneratedImageSource(source);
    if (!data) throw new Error('The image provider returned no usable image.');
    if (!data.startsWith('data:image/')) {
        let response;
        try {
            response = await fetch(data);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await blobAsDataUrl(await response.blob());
        } catch (error) {
            const stable = await stabilizeGeneratedImageSource(data);
            if (!stable.startsWith('data:image/')) {
                throw new Error('The image was generated, but its temporary URL could not be embedded. Run Horde Studio with its launcher so the secure local media bridge can stabilize provider URLs.');
            }
            data = stable;
        }
    }
    return optimizeImage(data, maxDimension, quality);
}
