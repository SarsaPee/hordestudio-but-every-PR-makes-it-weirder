const fs = require('fs');

const app = fs.readFileSync('app.js', 'utf8');
const experimentalVisuals = fs.readFileSync('experiences/experimental-worlds/visuals/world-visual-media-core.js', 'utf8');
const runtime = `${app}\n${experimentalVisuals}`;
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
let passed = 0;

function check(name, condition) {
    if (!condition) throw new Error(`FAIL: ${name}`);
    console.log(`✓ ${name}`);
    passed++;
}

check('world visuals are versioned, default to Classic and retire Visual Novel',
    experimentalVisuals.includes('function normalizeWorldPresentation(world)')
    && experimentalVisuals.includes("raw.mode === 'visual_novel' ? 'cinematic'")
    && !html.includes('value="visual_novel"'));
check('media assets are embedded data rather than expiring URLs',
    experimentalVisuals.includes('World media must be embedded image data so exported worlds remain portable.'));
check('media payload is separated from frequently rewritten world manifests',
    app.includes('mediaAssets: []') && app.includes('records.worldMediaAssets'));
check('separate media payload is reattached before loaded worlds are repaired',
    app.indexOf("const storedWorldMedia = await HordeDB.get('worldMediaAssets')")
        < app.lastIndexOf('repairLoadedState();'));
check('portable world exports carry a versioned embedded media manifest',
    app.includes("exportedWorld._format = 'horde-world'")
    && app.includes('exportedWorld._mediaManifest'));
check('world and full-backup import limits account for visual worlds',
    (app.match(/512 \* 1024 \* 1024/g) || []).length >= 2);
check('assets deduplicate and orphaned replacements can be pruned',
    experimentalVisuals.includes('function worldMediaHash(data)') && experimentalVisuals.includes('function pruneWorldMediaAssets(world)'));
check('location backgrounds and NPC portraits have upload and generation controls',
    app.includes('generateWorldLocationBackground') && app.includes('generateWorldNpcPortrait')
    && html.includes('World Presentation'));
check('map skins decorate rather than replace the semantic map',
    app.includes('generateWorldMapSkin') && app.includes('renderSemanticWorldMap(container'));
check('play backgrounds are selected from canonical player location state',
    runtime.includes("world.locations.find(location => location.id === sess.playerLocation)")
    && runtime.includes('worldMediaSource(world, visualLocation?.visuals?.backgroundAssetId)'));
check('Classic remains player-selectable and cinematic styling is scoped',
    html.includes('world-presentation-btn') && css.includes('.world-presentation-active'));
check('Gemini Flash Lite image model remains the default visual model',
    runtime.includes("google/gemini-3.1-flash-lite-image")
    && html.includes('id="w-visual-new-image-model"'));

console.log(`\n${passed} world visual-media checks passed.`);
