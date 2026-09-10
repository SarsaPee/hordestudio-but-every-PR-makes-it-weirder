/*
 * Private, source-faithful utility closure for Experimental Worlds.
 *
 * These small helpers used to resolve from app.js merely because the custom
 * World implementation shared a document with Horde Studio.  They are copied
 * here under Experimental names so deleting Chat, VH, Video, Pip, stock
 * Worlds, or the host bootstrap does not remove basic World rendering,
 * validation, JSON recovery, persona projection, or portrait handling.
 */
(function (global) {
    'use strict';

    // Every viewport-level Experimental surface lives beneath one mode-owned
    // portal.  The original runtime used document.body because it was the
    // only Worlds implementation in the application.  Retaining that paint
    // model through a private portal keeps the real overlays, dialogs,
    // thoughts, weather and source ScenePulse UI intact without letting them
    // become ambient surfaces for Chat, stock Worlds, or another experience.
    const EXPERIMENTAL_PORTAL_ID = 'experimental-worlds-portal-root';
    function experimentalWorldsPortalRoot() {
        let root = document.getElementById(EXPERIMENTAL_PORTAL_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = EXPERIMENTAL_PORTAL_ID;
            root.className = 'experimental-worlds-portal-root';
            root.dataset.owner = 'experimental-worlds';
            document.body.appendChild(root);
        }
        return root;
    }
    global.ExperimentalWorldsDom = Object.freeze({
        portalRoot: experimentalWorldsPortalRoot,
        clearPortal() {
            const root = document.getElementById(EXPERIMENTAL_PORTAL_ID);
            if (root?.dataset.owner === 'experimental-worlds') root.replaceChildren();
        }
    });

    // Request ownership is World-domain state, not a host-wide generation
    // lock.  Keeping these controllers here means the Experimental engine can
    // be mounted with only its adapter and settings host; Chat/VH/Video or a
    // stock World runtime cannot accidentally own, clear, or reuse its work.
    const requestRuntime = {
        turnInProgress: false,
        generationController: null,
        sidecarRetryInProgress: false,
        readerRefreshController: null
    };
    global.ExperimentalWorldsRuntime = Object.freeze({
        turnInProgress: () => requestRuntime.turnInProgress,
        setTurnInProgress: value => { requestRuntime.turnInProgress = value === true; },
        generationController: () => requestRuntime.generationController,
        setGenerationController: controller => { requestRuntime.generationController = controller || null; },
        sidecarRetryInProgress: () => requestRuntime.sidecarRetryInProgress,
        setSidecarRetryInProgress: value => { requestRuntime.sidecarRetryInProgress = value === true; },
        readerRefreshController: () => requestRuntime.readerRefreshController,
        setReaderRefreshController: controller => { requestRuntime.readerRefreshController = controller || null; },
        abortAll() {
            requestRuntime.generationController?.abort?.();
            requestRuntime.readerRefreshController?.abort?.();
            requestRuntime.generationController = null;
            requestRuntime.readerRefreshController = null;
            requestRuntime.turnInProgress = false;
            requestRuntime.sidecarRetryInProgress = false;
        }
    });

    global.experimentalIsPlainObject = function experimentalIsPlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const proto = Object.getPrototypeOf(value);
        return proto === null || Object.prototype.toString.call(value) === '[object Object]';
    };

    global.experimentalSafeJsonClone = function experimentalSafeJsonClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value, (key, item) => {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return undefined;
            return item;
        }));
    };

    global.experimentalEscapeHTML = function experimentalEscapeHTML(str) {
        return String(str ?? '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    global.experimentalCssUrl = function experimentalCssUrl(url) {
        if (!url) return '';
        const cleaned = String(url).replace(/["'()\\<>\n\r]/g, '');
        if (/^\s*(javascript|vbscript):/i.test(cleaned)) return '';
        return cleaned;
    };

    global.experimentalDisplayInitials = function experimentalDisplayInitials(name, fallback = '?') {
        return (String(name || fallback).trim().match(/\b[\p{L}\p{N}]/gu) || [fallback])
            .slice(0, 2).join('').toUpperCase();
    };

    global.experimentalNormalizePersona = function experimentalNormalizePersona(persona = {}) {
        return {
            ...persona,
            id: String(persona.id || `persona_${Date.now()}`).slice(0, 100),
            name: String(persona.name || 'Unnamed Persona').slice(0, 120),
            text: String(persona.text || '').slice(0, 12000),
            age: String(persona.age || '').slice(0, 40),
            pronouns: String(persona.pronouns || '').slice(0, 80),
            appearance: String(persona.appearance || '').slice(0, 2000),
            publicIdentity: String(persona.publicIdentity || '').slice(0, 2000),
            reputation: String(persona.reputation || '').slice(0, 2000),
            color: /^#[0-9a-f]{6}$/i.test(String(persona.color || ''))
                ? String(persona.color).toUpperCase() : '#4A90E2'
        };
    };

    global.experimentalPersonaPromptText = function experimentalPersonaPromptText(persona) {
        if (!persona) return '';
        const p = global.experimentalNormalizePersona(persona);
        return [
            `Name: ${p.name}`,
            p.age ? `Age: ${p.age}` : '',
            p.pronouns ? `Pronouns: ${p.pronouns}` : '',
            p.appearance ? `Visible appearance: ${p.appearance}` : '',
            p.publicIdentity ? `Public identity: ${p.publicIdentity}` : '',
            p.reputation ? `Reputation and what others may have heard: ${p.reputation}` : '',
            p.text ? `Additional roleplay notes: ${p.text}` : ''
        ].filter(Boolean).join('\n');
    };

    global.experimentalOptimizeImage = async function experimentalOptimizeImage(base64Str, maxDimension = 1024, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (!img.naturalWidth || !img.naturalHeight) return reject(new Error('The image has no readable dimensions.'));
                const scale = Math.min(1, maxDimension / img.naturalWidth, maxDimension / img.naturalHeight);
                const width = Math.max(1, Math.round(img.naturalWidth * scale));
                const height = Math.max(1, Math.round(img.naturalHeight * scale));
                let src = img;
                let curW = img.naturalWidth, curH = img.naturalHeight;
                while (curW / 2 >= width) {
                    const step = document.createElement('canvas');
                    step.width = Math.round(curW / 2); step.height = Math.round(curH / 2);
                    const sctx = step.getContext('2d');
                    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
                    sctx.drawImage(src, 0, 0, step.width, step.height);
                    src = step; curW = step.width; curH = step.height;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('This browser could not create an image canvas.'));
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(src, 0, 0, width, height);
                const normalized = canvas.toDataURL('image/jpeg', quality);
                if (!normalized || normalized === 'data:,') return reject(new Error('The browser could not encode this image.'));
                resolve(normalized);
            };
            img.onerror = () => reject(new Error('This browser could not decode the image. Try JPEG, PNG or WebP; HEIC support depends on the browser.'));
            img.src = base64Str;
        });
    };

    global.experimentalReadImageFile = function experimentalReadImageFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('No image was selected.'));
            if (file.size > 25 * 1024 * 1024) return reject(new Error('The image is larger than 25 MB.'));
            if (file.type && !file.type.startsWith('image/')) return reject(new Error('That file is not an image.'));
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('The browser could not read that file.'));
            reader.readAsDataURL(file);
        });
    };

    global.experimentalNormalizeUploadedImage = async function experimentalNormalizeUploadedImage(file, maxDimension = 1024, quality = 0.85) {
        return global.experimentalOptimizeImage(await global.experimentalReadImageFile(file), maxDimension, quality);
    };

    global.experimentalDirtyJSONRepair = function experimentalDirtyJSONRepair(s) {
        s = String(s || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
        const firstBrace = s.indexOf('{');
        if (firstBrace === -1) return s;
        s = s.substring(firstBrace);
        let insideString = false, escaped = false, clean = '';
        const openBrackets = [];
        for (let i = 0; i < s.length; i += 1) {
            const char = s[i];
            if (insideString) {
                if (escaped) { clean += char; escaped = false; }
                else if (char === '\\') { clean += char; escaped = true; }
                else if (char === '"') { insideString = false; clean += char; }
                else if (char === '\n') clean += '\\n';
                else if (char === '\r') clean += '\\r';
                else if (char === '\t') clean += '\\t';
                else clean += char;
            } else if (char === '"') { insideString = true; clean += char; }
            else if (char === '{' || char === '[') { openBrackets.push(char); clean += char; }
            else if (char === '}' || char === ']') {
                if (clean.trim().endsWith(',')) clean = clean.trim().slice(0, -1);
                if (openBrackets.length && openBrackets[openBrackets.length - 1] === (char === '}' ? '{' : '[')) openBrackets.pop();
                clean += char;
            } else clean += char;
        }
        if (insideString) clean += '"';
        if (clean.trim().endsWith(',')) clean = clean.trim().slice(0, -1);
        while (openBrackets.length) clean += openBrackets.pop() === '{' ? '}' : ']';
        return clean;
    };

    global.experimentalExtractJSON = function experimentalExtractJSON(text) {
        try { return JSON.parse(global.experimentalDirtyJSONRepair(text)); }
        catch (_) {
            try {
                const firstBrace = String(text).indexOf('{');
                const lastBrace = String(text).lastIndexOf('}');
                if (firstBrace === -1 || lastBrace === -1) throw new Error('Could not find a valid JSON object block in response.');
                return JSON.parse(String(text).substring(firstBrace, lastBrace + 1).replace(/,\s*([}\]])/g, '$1').replace(/(\r\n|\n|\r)/gm, '\\n'));
            } catch (error) { throw new Error(error.message); }
        }
    };

    global.experimentalSafeParseJSONRepair = function experimentalSafeParseJSONRepair(raw) {
        try { return JSON.parse(global.experimentalDirtyJSONRepair(String(raw || ''))); }
        catch (_) { return null; }
    };
})(globalThis);
