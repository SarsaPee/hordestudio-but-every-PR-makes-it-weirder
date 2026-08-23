/* Horde Studio shared optional RPG mechanics.
 * Used by Worlds and Multiplayer. Old string inventories remain importable.
 */
(function () {
    'use strict';

    const VERSION = 1;
    const TYPES = Object.freeze(['weapon', 'armor', 'clothing', 'consumable', 'tool', 'cyberware', 'treasure', 'quest', 'custom']);
    const MODES = Object.freeze(['off', 'light', 'full']);
    const clone = value => JSON.parse(JSON.stringify(value ?? null));
    const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0, min = -100000, max = 100000) => {
        const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    };
    const id = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    const numberMap = value => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
        .map(([key, amount]) => [clean(key, 80), number(amount)]).filter(([key, amount]) => key && amount));

    function mode(value, fallback = 'full') {
        const selected = clean(value, 20).toLowerCase();
        return MODES.includes(selected) ? selected : fallback;
    }

    function modifiers(value = {}) {
        return {
            checks: number(value.checks), damage: number(value.damage), armor: number(value.armor),
            attributes: numberMap(value.attributes), skills: numberMap(value.skills), stats: numberMap(value.stats),
            defenses: numberMap(value.defenses), resources: numberMap(value.resources)
        };
    }

    function normalizeItem(value, options = {}) {
        const source = typeof value === 'string' ? { name: value } : (value && typeof value === 'object' ? value : {});
        const type = TYPES.includes(clean(source.type, 30).toLowerCase()) ? clean(source.type, 30).toLowerCase() : 'custom';
        const quantity = Math.max(0, Math.floor(number(source.quantity, 1, 0, 9999)));
        const maxCharges = Math.max(0, Math.floor(number(source.maxCharges ?? source.max_charges, 0, 0, 9999)));
        const maxDurability = Math.max(0, Math.floor(number(source.maxDurability ?? source.max_durability, 0, 0, 9999)));
        return {
            schemaVersion: VERSION, id: clean(source.id, 100) || id('item'), name: clean(source.name || options.name || 'Item', 120),
            type, subtype: clean(source.subtype, 80), quantity, description: clean(source.description, 800),
            tags: [...new Set((Array.isArray(source.tags) ? source.tags : clean(source.tags, 300).split(','))
                .map(tag => clean(tag, 40)).filter(Boolean))].slice(0, 20),
            slot: clean(source.slot, 50), equipped: !!source.equipped, weight: number(source.weight, 0, 0, 99999),
            value: number(source.value ?? source.price, 0, 0, 1e9), rarity: clean(source.rarity || 'common', 40),
            damage: clean(source.damage || source.damageDice || source.damage_dice, 40), damageType: clean(source.damageType || source.damage_type, 50),
            armor: number(source.armor, 0, -1000, 1000), range: clean(source.range, 80),
            charges: maxCharges ? Math.min(maxCharges, Math.max(0, Math.floor(number(source.charges, maxCharges)))) : 0, maxCharges,
            durability: maxDurability ? Math.min(maxDurability, Math.max(0, Math.floor(number(source.durability, maxDurability)))) : 0, maxDurability,
            requirements: {
                level: Math.max(0, Math.floor(number(source.requirements?.level, 0, 0, 1000))),
                attributes: numberMap(source.requirements?.attributes), skills: numberMap(source.requirements?.skills),
                text: clean(source.requirements?.text, 300)
            },
            modifiers: modifiers(source.modifiers || source.bonuses || {}),
            useEffects: (Array.isArray(source.useEffects || source.use_effects) ? (source.useEffects || source.use_effects) : [])
                .filter(entry => entry && typeof entry === 'object').slice(0, 20).map(entry => ({
                    name: clean(entry.name || 'Effect', 100), kind: ['buff', 'debuff', 'condition'].includes(entry.kind) ? entry.kind : 'buff',
                    duration: Math.floor(number(entry.duration, -1, -1, 9999)), modifiers: modifiers(entry.modifiers || {}),
                    description: clean(entry.description, 400)
                }))
        };
    }

    function normalizeInventory(values) {
        return (Array.isArray(values) ? values : []).map(value => normalizeItem(value)).filter(item => item.name && item.quantity > 0).slice(0, 500);
    }

    function itemName(value) { return clean(typeof value === 'string' ? value : value?.name, 120); }
    function itemKey(value) { return itemName(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

    function findItem(inventory, query) {
        const key = itemKey(query); if (!key) return null;
        const items = normalizeInventory(inventory);
        return items.find(item => item.id === query || itemKey(item) === key)
            || items.find(item => itemKey(item).includes(key) || key.includes(itemKey(item))) || null;
    }

    function validateEquip(sheet, itemValue, slot) {
        const item = normalizeItem(itemValue); const targetSlot = clean(slot || item.slot, 50);
        if (!targetSlot) return { ok: false, reason: 'This item has no equipment slot.' };
        if (sheet?.equipment && !(targetSlot in sheet.equipment)) return { ok: false, reason: `Unknown equipment slot: ${targetSlot}.` };
        const req = item.requirements || {};
        if (Number(sheet?.level || 1) < Number(req.level || 0)) return { ok: false, reason: `Requires level ${req.level}.` };
        for (const [key, minimum] of Object.entries(req.attributes || {})) if (Number(sheet?.attributes?.[key] || 0) < minimum) return { ok: false, reason: `Requires ${key} ${minimum}.` };
        for (const [key, minimum] of Object.entries(req.skills || {})) if (Number(sheet?.skills?.[key] || 0) < minimum) return { ok: false, reason: `Requires ${key} ${minimum}.` };
        return { ok: true, slot: targetSlot, item };
    }

    function equippedItems(sheet) {
        const inventory = normalizeInventory(sheet?.inventory);
        const ids = new Set(Object.values(sheet?.equipment || {}).filter(Boolean));
        return inventory.filter(item => item.equipped || ids.has(item.id));
    }

    function combinedModifiers(items) {
        const total = modifiers({});
        normalizeInventory(items).forEach(item => {
            total.checks += item.modifiers.checks; total.damage += item.modifiers.damage;
            total.armor += item.armor + item.modifiers.armor;
            ['attributes', 'skills', 'stats', 'defenses', 'resources'].forEach(group => Object.entries(item.modifiers[group] || {})
                .forEach(([key, value]) => { total[group][key] = Number(total[group][key] || 0) + value; }));
        });
        return total;
    }

    function calculatedSheet(sheet, mechanicsMode = 'full') {
        const active = mode(mechanicsMode) !== 'off'; const bonuses = active ? combinedModifiers(equippedItems(sheet)) : modifiers({});
        const add = (base, extra) => Object.fromEntries(Object.entries(base || {}).map(([key, value]) => [key, Number(value || 0) + Number(extra?.[key] || 0)]));
        const addResources = (base, extra) => Object.fromEntries(Object.entries(base || {}).map(([key, value]) => {
            const bonus = Number(extra?.[key] || 0);
            if (value && typeof value === 'object') return [key, { ...clone(value), value: Number(value.value || 0) + bonus, max: Number(value.max || 0) + bonus }];
            return [key, Number(value || 0) + bonus];
        }));
        return { ...clone(sheet), calculated: { modifiers: bonuses,
            attributes: add(sheet?.attributes, bonuses.attributes), skills: add(sheet?.skills, bonuses.skills),
            defenses: add(sheet?.defenses, bonuses.defenses), resources: addResources(sheet?.resources, bonuses.resources) } };
    }

    function describeModifiers(value) {
        const mod = value?.modifiers ? modifiers(value.modifiers) : modifiers(value || {}); const parts = [];
        if (mod.checks) parts.push(`${mod.checks > 0 ? '+' : ''}${mod.checks} checks`);
        if (mod.damage) parts.push(`${mod.damage > 0 ? '+' : ''}${mod.damage} damage`);
        if (Number(value?.armor || 0) + mod.armor) parts.push(`${Number(value?.armor || 0) + mod.armor > 0 ? '+' : ''}${Number(value?.armor || 0) + mod.armor} armor`);
        ['attributes', 'skills', 'stats', 'defenses', 'resources'].forEach(group => Object.entries(mod[group]).forEach(([key, amount]) => parts.push(`${amount > 0 ? '+' : ''}${amount} ${key}`)));
        return parts.join(' · ');
    }

    window.HordeRpgMechanics = { VERSION, TYPES, MODES, mode, modifiers, normalizeItem, normalizeInventory, itemName, itemKey,
        findItem, validateEquip, equippedItems, combinedModifiers, calculatedSheet, describeModifiers, clone };
})();
