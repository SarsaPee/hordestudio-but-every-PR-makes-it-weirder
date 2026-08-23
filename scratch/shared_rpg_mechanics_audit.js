const assert = require('assert');

global.window = global;
require('../rpg-mechanics.js');

const RPG = global.HordeRpgMechanics;
assert(RPG, 'shared RPG mechanics did not load');

const sheet = {
    level: 3,
    attributes: { Strength: 10 },
    skills: { Stealth: 2 },
    defenses: { Armor: 11 },
    resources: { HP: { id: 'HP', name: 'HP', value: 18, max: 20 } },
    equipment: { body: 'coat' },
    inventory: [
        'rope',
        { id: 'coat', name: 'Armored coat', type: 'clothing', slot: 'body', equipped: true, armor: 2,
            modifiers: { attributes: { Strength: 1 }, skills: { Stealth: -1 }, defenses: { Armor: 2 }, resources: { HP: 5 } } }
    ]
};

const migrated = RPG.normalizeInventory(sheet.inventory);
assert.strictEqual(migrated[0].name, 'rope', 'legacy text items must migrate');
assert.strictEqual(migrated[0].type, 'custom', 'legacy items must remain usable as custom items');

const full = RPG.calculatedSheet(sheet, 'full').calculated;
assert.strictEqual(full.attributes.Strength, 11, 'equipment attribute bonus missing');
assert.strictEqual(full.skills.Stealth, 1, 'equipment skill penalty missing');
assert.strictEqual(full.defenses.Armor, 13, 'equipment defense bonus missing');
assert.strictEqual(full.resources.HP.value, 23, 'resource current value bonus missing');
assert.strictEqual(full.resources.HP.max, 25, 'resource maximum bonus missing');

const off = RPG.calculatedSheet(sheet, 'off').calculated;
assert.strictEqual(off.attributes.Strength, 10, 'off mode must pause attribute bonuses');
assert.strictEqual(off.resources.HP.value, 18, 'off mode must pause resource bonuses');
assert.strictEqual(RPG.normalizeInventory(sheet.inventory).length, 2, 'off mode must not delete item data');

console.log('shared_rpg_mechanics_audit: ok');
