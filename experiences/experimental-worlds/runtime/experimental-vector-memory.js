/*
 * Experimental Worlds' source-faithful vector-memory engine.
 *
 * The host has a separate chat-oriented vector cache.  Sharing that cache
 * would let ordinary-chat lifecycle, cache pruning, and provider changes alter
 * World cognition.  This copy retains the established retrieval behaviour,
 * but persists only under the Experimental repository and receives settings
 * and embeddings through the explicit host adapter.
 */
(function registerExperimentalWorldsVectorMemory(global) {
    'use strict';
    const CACHE_KEY = 'experimentalVectorEmbeddingCache';
    let initialized = false;
    const memorySearchTerms = value => [...new Set(String(value || '').toLocaleLowerCase()
        .match(/[\p{L}\p{N}]{3,}/gu) || [])]
        .filter(word => !['the', 'and', 'that', 'this', 'with', 'from', 'have', 'your', 'what', 'when', 'where'].includes(word))
        .slice(0, 80);
    const memoryLexicalScore = (text, terms) => {
        if (!terms.length) return 0;
        const lower = String(text || '').toLocaleLowerCase();
        const matches = terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
        return Math.min(1, matches / Math.max(2, Math.min(terms.length, 8)));
    };
    const memoryDedupeKey = memory => memory?.key
        ? `${memory.type || 'memory'}:${String(memory.key).toLocaleLowerCase()}`
        : String(memory?.text || memory?.summary || '').toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 240);
    const cosineSimilarity = (left, right) => {
        if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) return 0;
        let dot = 0, leftMagnitude = 0, rightMagnitude = 0;
        for (let index = 0; index < left.length; index += 1) {
            dot += left[index] * right[index];
            leftMagnitude += left[index] * left[index];
            rightMagnitude += right[index] * right[index];
        }
        const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
        return denominator ? dot / denominator : 0;
    };

    const api = {
        cache: new Map(),
        isFallbackActive: false,
        fallbackUntil: 0,
        maxCacheEntries: 500,
        saveTimer: null,

        namespace() {
            const settings = global.ExperimentalWorldsState?.globalSettings || {};
            const base = String(settings.embeddingBaseUrl || settings.localBaseUrl || 'default').replace(/\/$/, '');
            const model = String(settings.embeddingModel || 'openai/text-embedding-3-small').trim();
            return `${base}|${model}`;
        },

        async init() {
            if (initialized) return;
            initialized = true;
            try {
                const settings = global.ExperimentalWorldsState?.globalSettings || {};
                this.maxCacheEntries = Math.max(100, Math.min(100000, Number(settings.embeddingCacheLimit) || 10000));
                const cached = await global.ExperimentalWorldsRepository?.get?.(CACHE_KEY);
                if (cached && typeof cached === 'object') this.cache = new Map(Object.entries(cached));
                console.log(`ExperimentalWorldsVectorMemory: Loaded ${this.cache.size} cached embeddings.`);
            } catch (error) {
                initialized = false;
                console.warn('Failed to load Experimental Worlds embedding cache from IndexedDB', error);
            }
        },

        async saveCache() {
            try {
                await global.ExperimentalWorldsRepository?.setMany?.({ [CACHE_KEY]: Object.fromEntries(this.cache.entries()) });
            } catch (error) {
                console.error('Failed to persist Experimental Worlds embedding cache', error);
            }
        },

        scheduleCacheSave() {
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => this.saveCache(), 500);
        },

        hashText(text) {
            if (!text) return 'h_empty';
            const clean = text.trim().toLowerCase();
            let hash = 0xcbf29ce484222325n;
            for (let index = 0; index < clean.length; index += 1) {
                hash ^= BigInt(clean.charCodeAt(index));
                hash = BigInt.asUintN(64, hash * 0x100000001b3n);
            }
            return `h_${hash.toString(16).padStart(16, '0')}_${clean.length}`;
        },

        async getCachedEmbedding(text) {
            if (!text) return null;
            await this.init();
            const key = `${this.namespace()}|${this.hashText(text)}`;
            if (this.cache.has(key)) return this.cache.get(key);
            if (this.isFallbackActive && Date.now() < this.fallbackUntil) return null;
            if (this.isFallbackActive) this.triggerFallback(false);
            try {
                const settings = global.ExperimentalWorldsState?.globalSettings || {};
                this.maxCacheEntries = Math.max(100, Math.min(100000, Number(settings.embeddingCacheLimit) || this.maxCacheEntries || 10000));
                const embedding = await global.ExperimentalWorldsHost.getEmbedding(text);
                this.cache.set(key, embedding);
                while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value);
                this.triggerFallback(false);
                this.scheduleCacheSave();
                return embedding;
            } catch (error) {
                console.error('Experimental Worlds embedding API failed; temporarily using keyword recall:', error);
                this.triggerFallback(true);
                return null;
            }
        },

        triggerFallback(active) {
            this.isFallbackActive = active;
            this.fallbackUntil = active ? Date.now() + 60000 : 0;
            const banner = document.getElementById('world-vector-fallback-banner');
            banner?.classList.toggle('hidden', !active);
        },

        async search(memoryList, queryText, limit = 4, threshold = 0.35) {
            if (!memoryList?.length) return [];
            const words = memorySearchTerms(queryText);
            let queryVector = null;
            if (!this.isFallbackActive) {
                try { queryVector = await this.getCachedEmbedding(queryText); }
                catch (error) { console.warn('Experimental Worlds vector search fell back to keyword recall:', error); this.triggerFallback(true); }
            }
            const namespace = this.namespace();
            if (queryVector) {
                const stale = memoryList.filter(block => block?.text
                    && (!Array.isArray(block.embedding) || block.embeddingNamespace && block.embeddingNamespace !== namespace))
                    .map(block => ({ block, lexical: memoryLexicalScore(block.text, words) }))
                    .filter(item => item.lexical > 0 || item.block.pinned)
                    .sort((a, b) => b.lexical - a.lexical).slice(0, Math.max(2, Math.min(12, limit * 2)));
                for (const item of stale) {
                    const embedding = await this.getCachedEmbedding(item.block.text);
                    if (!embedding) break;
                    item.block.embedding = embedding;
                    item.block.embeddingNamespace = namespace;
                }
            }
            const now = Date.now();
            const scored = memoryList.map((block, index) => {
                if (!block) return null;
                const text = String(block.text || block.summary || '').trim();
                if (!text || block.status === 'superseded') return null;
                const lexical = memoryLexicalScore(text, words);
                const vectorAllowed = Array.isArray(queryVector) && Array.isArray(block.embedding)
                    && (!block.embeddingNamespace || block.embeddingNamespace === namespace);
                const semantic = vectorAllowed ? cosineSimilarity(queryVector, block.embedding) : 0;
                const importance = Math.max(0, Math.min(1, Number(block.importance) || 0.5));
                const ageDays = Math.max(0, (now - (Number(block.updatedAt || block.createdAt) || now)) / 86400000);
                const recency = 1 / (1 + ageDays / 30);
                const durableBoost = block.pinned ? 0.35
                    : ['state', 'thread', 'relationship'].includes(block.type) && block.status !== 'resolved' ? 0.12 : 0;
                const vectorMatch = semantic >= threshold;
                const keywordMatch = lexical > 0;
                const alwaysRelevant = block.status === 'active' && ['state', 'thread'].includes(block.type) && importance >= 0.65;
                if (!vectorMatch && !keywordMatch && !block.pinned && !alwaysRelevant) return null;
                return { block, index, score: semantic * 0.68 + lexical * 0.20 + importance * 0.07 + recency * 0.05 + durableBoost, semantic, lexical };
            }).filter(Boolean);
            scored.sort((a, b) => b.score - a.score || b.semantic - a.semantic || b.index - a.index);
            const selected = [];
            const seen = new Set();
            for (const result of scored) {
                const key = memoryDedupeKey(result.block);
                if (seen.has(key)) continue;
                seen.add(key);
                selected.push(result.block);
                if (selected.length >= limit) break;
            }
            if (scored.length) console.log(`ExperimentalWorldsVectorMemory: Hybrid recall selected ${selected.length} of ${scored.length} candidates.`);
            return selected;
        }
    };
    global.ExperimentalWorldsVectorMemory = api;
})(globalThis);
