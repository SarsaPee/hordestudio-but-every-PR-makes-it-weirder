(function initHordePortraitPromptCompiler(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.HordePortraitPromptCompiler = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createHordePortraitPromptCompiler() {
    'use strict';

    const NAMED_STYLES = Object.freeze({
        cinematic: 'cinematic environmental concept art with believable materials and restrained dramatic lighting',
        painted_fantasy: 'richly painted fantasy illustration with cohesive brushwork and grounded detail',
        graphic_novel: 'painterly graphic-novel art with confident shapes and controlled contrast',
        sitcom_2000s: 'warm early-2000s television sitcom production design and consumer digital-camera color',
        anime_vn: 'polished cinematic anime visual-novel artwork with coherent environments and character design',
        retro_rpg: 'detailed retro role-playing game key art, clean readable silhouettes and atmospheric color',
        parchment: 'hand-inked parchment illustration with restrained pigments and cartographic texture',
        horror: 'grounded dark-horror concept art with oppressive atmosphere and readable shadow detail',
        custom: 'follow the authored art direction exactly'
    });

    function cleanText(value) {
        return String(value || '').trim();
    }

    function worldVisualStylePrompt(world, presentation = world?.presentation || {}) {
        const namedStyle = NAMED_STYLES[presentation.artStyle] || NAMED_STYLES.cinematic;
        const authoredDirection = cleanText(presentation.artDirection);
        if (authoredDirection) return `${namedStyle}. ${authoredDirection}`;

        const bible = world?.artBible && typeof world.artBible === 'object' ? world.artBible : {};
        const fallback = [bible.medium, bible.lighting, bible.people].map(cleanText).filter(Boolean).join(' ');
        return `${namedStyle}. ${fallback || 'Maintain one coherent visual language across this world.'}`;
    }

    function portraitComposition(npc) {
        const override = cleanText(npc?.visuals?.portraitFraming
            || npc?.portraitFraming || npc?.portraitComposition).toLowerCase();
        const allowed = new Set(['close-up', 'waist-up', 'three-quarter', 'full-body', 'auto']);
        return allowed.has(override) ? override : 'auto';
    }

    function compositionInstruction(composition) {
        const explicit = {
            'close-up': 'Use a close portrait only because the authored character data explicitly requests it. Omit all naturally out-of-frame details.',
            'waist-up': 'Use a natural waist-up environmental portrait. Omit lower-body details rather than relocating them into frame.',
            'three-quarter': 'Use a natural three-quarter environmental portrait that preserves posture, build and clothing silhouette.',
            'full-body': 'Use a natural full-body environmental portrait with believable posture and all worn items kept on the body.'
        };
        return explicit[composition]
            || 'Choose a natural three-quarter or full-body environmental composition when height, build, posture, clothing silhouette or footwear materially contributes to identity; otherwise use a relaxed waist-up portrait. Never default to a casting headshot.';
    }

    function compileWorldNpcPortraitPrompt(world, npc, presentation = world?.presentation || {}) {
        const stableIdentity = cleanText(npc?.appearance) || cleanText(npc?.description)
            || 'Derive a grounded visible appearance from the world and character name.';
        const authoredBrief = cleanText(npc?.imagePrompt);
        const currentLook = cleanText(npc?.currentAppearance || npc?.currentOutfit || npc?.portraitOutfit);
        const composition = portraitComposition(npc);
        const renderingStyle = worldVisualStylePrompt(world, presentation);
        const identityParts = [
            `Character: ${cleanText(npc?.name) || 'Unnamed recurring character'}.`,
            `Stable visual identity: ${stableIdentity}`,
            authoredBrief ? `Authored portrait brief: ${authoredBrief}` : '',
            currentLook ? `Current visible look for this image only: ${currentLook}` : ''
        ].filter(Boolean).join('\n');

        return [
            'Create a reusable visual identity image for a persistent character in an interactive text RPG.',
            `World: ${cleanText(world?.name) || 'Unnamed world'}.`,
            '',
            '[WORLD RENDERING STYLE - controls how the image is rendered, not who the person is]',
            renderingStyle,
            '',
            '[CHARACTER VISUAL IDENTITY - highest authority]',
            identityParts,
            '',
            '[COMPOSITION]',
            compositionInstruction(composition),
            'Use a natural environmental portrait rather than a neutral passport, casting or corporate headshot. Preserve the character\'s authored subculture, makeup intensity and imperfection, physicality, age, styling and characteristic expression. A readable face does not mean softened makeup, generic styling or a neutral smile.',
            'Treat clothing and accessories as identity evidence, not a checklist of props. If a detail falls outside the chosen crop, omit it. Never move footwear, bags, jewellery, tools or clothing onto furniture or display them separately merely to make every noun visible.',
            '',
            '[AUTHORITY AND SAFETY]',
            'Character data controls who the person is. World art direction controls rendering style. Composition must not neutralise, beautify away, masculinise, de-age or otherwise flatten authored identity.',
            'Do not infer or depict secrets, hidden allegiances, future events or private goals. Do not invent logos, band names, readable signage or symbolic props to communicate a subculture. Show one coherent person only, with no duplicate person, border, interface, text or watermark.'
        ].join('\n');
    }

    function worldNpcPortraitRequest(world, npc, presentation = world?.presentation || {}, options = {}) {
        const canonical = typeof globalThis !== 'undefined' ? globalThis.ExperimentalWorldsCanonicalImageComposer : null;
        if (canonical?.composeWorldImageRequest) {
            const request = canonical.composeWorldImageRequest(world, {
                name: npc?.name,
                description: npc?.appearance || npc?.description || '',
                imagePrompt: npc?.imagePrompt || '',
                imageIntent: npc?.visuals?.imageIntent,
                framing: npc?.visuals?.framing,
                look: npc?.visuals?.look,
                outfitSnapshot: npc?.visuals?.outfits?.find(outfit => outfit.id === npc?.visuals?.currentOutfitId)?.description || npc?.currentOutfit || ''
            }, presentation.imageGuide || {}, { operation: options.correction ? 'revise' : 'generate' });
            return {
                prompt: request.plainPrompt,
                structuredPrompt: request.structuredPrompt,
                aspectRatio: '3:4',
                maxDimension: Number(options.maxDimension || 1200),
                quality: 0.84
            };
        }
        const correction = cleanText(options.correction);
        const prompt = compileWorldNpcPortraitPrompt(world, npc, presentation)
            + (correction ? `\n\n[REQUESTED REVISION]\n${correction}\nApply this correction without losing any other canonical visual identity.` : '');
        const requestedResolution = Number(options.maxDimension || npc?.visuals?.portraitResolution);
        return {
            prompt,
            aspectRatio: cleanText(options.aspectRatio || npc?.visuals?.portraitAspectRatio
                || npc?.portraitAspectRatio) || '3:4',
            maxDimension: Number.isFinite(requestedResolution)
                ? Math.max(512, Math.min(2048, requestedResolution)) : 1200,
            quality: 0.84
        };
    }

    return Object.freeze({
        compileWorldNpcPortraitPrompt,
        portraitComposition,
        worldNpcPortraitRequest,
        worldVisualStylePrompt
    });
}));
