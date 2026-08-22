(function () {
    'use strict';
    if (!window.HordeLabs) throw new Error('labs-core.js must load before labs-tasks.js');

    const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
    const string = (values) => values ? { type: 'string', enum: values } : { type: 'string' };
    const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
    const boolean = { type: 'boolean' };

    function plainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function unique(values) { return [...new Set((Array.isArray(values) ? values : []).map(String))]; }
    function idAllowed(id, allowed, blank = true) {
        const value = String(id || '');
        return (blank && !value) || unique(allowed).includes(value);
    }
    function evidenceExists(evidence, envelope) {
        const excerpt = String(evidence || '').trim().toLowerCase();
        if (!excerpt) return true;
        const source = String(envelope.text || envelope.narrative || envelope.message || '').toLowerCase();
        return source.includes(excerpt);
    }
    function boundedSignals(raw) {
        const source = plainObject(raw) ? raw : {};
        return Object.fromEntries(['warmth', 'pressure', 'vulnerability', 'boundaryRespect', 'urgency', 'hostility', 'reciprocity']
            .map(key => [key, Math.max(-3, Math.min(3, Math.round(Number(source[key]) || 0)))]));
    }

    function parseJsonCandidate(text) {
        const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        try { return JSON.parse(source); } catch (_) {}
        const start = source.indexOf('{');
        const end = source.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try { return JSON.parse(source.slice(start, end + 1)); } catch (_) {}
        }
        return null;
    }

    function compactWorldFrame(text, envelope) {
        const json = parseJsonCandidate(text);
        if (plainObject(json)) return json;
        const source = String(text || '').trim().replace(/```[^\n]*\n?/g, '').replace(/```/g, '');
        const positional = source.match(/MWF\s*[|:]\s*([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([\s\S]*)/i);
        const fields = {};
        if (positional) {
            ['actorId', 'intent', 'destinationId', 'targetId', 'phase', 'outfitOperation', 'durationMinutes', 'confidence', 'evidence']
                .forEach((key, index) => { fields[key] = positional[index + 1].trim(); });
        } else {
            const aliases = {
                actor: 'actorId', actorid: 'actorId', intent: 'intent', destination: 'destinationId', destinationid: 'destinationId',
                target: 'targetId', targetid: 'targetId', phase: 'phase', outfit: 'outfitOperation', outfitoperation: 'outfitOperation',
                outfittext: 'outfitText', minutes: 'durationMinutes', duration: 'durationMinutes', durationminutes: 'durationMinutes',
                confidence: 'confidence', evidence: 'evidence'
            };
            const pattern = /(?:^|[;|\n,{}])\s*["']?([a-z_]+)["']?\s*[:=]\s*["']?([^;|\n,}]*?)["']?\s*(?=$|[;|\n,}])/gi;
            for (const match of source.matchAll(pattern)) {
                const key = aliases[match[1].toLowerCase().replaceAll('_', '')];
                if (key) fields[key] = match[2].trim();
            }
        }
        const allowed = (value, list, fallback = '') => {
            const raw = String(value || '').trim().replace(/^[-–—]$/, '');
            return unique(list).find(id => id.toLowerCase() === raw.toLowerCase()) || fallback;
        };
        const actorId = allowed(fields.actorId, envelope.allowedActorIds, 'player');
        const destinationId = allowed(fields.destinationId, envelope.allowedLocationIds);
        const targetId = allowed(fields.targetId, envelope.allowedTargetIds);
        let evidence = String(fields.evidence || '').trim().replace(/^['"]|['"]$/g, '').slice(0, 220);
        const original = String(envelope.text || '');
        if (evidence && !original.toLowerCase().includes(evidence.toLowerCase())) evidence = '';
        if (!evidence && destinationId) {
            const location = (Array.isArray(envelope.locations) ? envelope.locations : []).find(item => item.id === destinationId);
            if (location && original.toLowerCase().includes(String(location.name || '').toLowerCase())) evidence = original.slice(0, 220);
        }
        let confidence = Number(fields.confidence) || 0;
        if (confidence > 1) confidence /= 100;
        return {
            actorId, intent: String(fields.intent || 'other').toLowerCase(), destinationId, targetId,
            phase: String(fields.phase || 'intended').toLowerCase(),
            outfitOperation: String(fields.outfitOperation || 'none').toLowerCase(),
            outfitText: String(fields.outfitText || '').slice(0, 160),
            durationMinutes: Number(fields.durationMinutes) || 0,
            evidence, confidence: Math.max(0, Math.min(1, confidence))
        };
    }

    HordeLabs.registerTask('social_signal', {
        mode: 'universal', minimumTier: 'micro', maxInputChars: 3500, maxOutputTokens: 100, cacheMs: 300000,
        system: `You are a tiny private classifier inside a simulation engine. Analyze only the supplied message and relationship context. Return the required JSON. Scores are evidence signals from -3 to 3, not state changes. Do not answer the message, roleplay, invent context, or diagnose the person. Evidence must be a short exact excerpt from the message or blank.`,
        schema: object({
            signals: object({
                warmth: number(-3, 3), pressure: number(-3, 3), vulnerability: number(-3, 3),
                boundaryRespect: number(-3, 3), urgency: number(-3, 3), hostility: number(-3, 3), reciprocity: number(-3, 3)
            }),
            messageKind: string(['question', 'request', 'affection', 'conflict', 'boundary', 'logistics', 'disclosure', 'casual', 'other']),
            evidence: string(), confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate) || !plainObject(candidate.signals)) return { ok: false, reason: 'Missing social signals.' };
            if (!evidenceExists(candidate.evidence, envelope)) return { ok: false, reason: 'Evidence was not present in the message.' };
            const kinds = ['question', 'request', 'affection', 'conflict', 'boundary', 'logistics', 'disclosure', 'casual', 'other'];
            return { ok: true, reason: 'Signals are bounded and evidence-grounded.', value: {
                signals: boundedSignals(candidate.signals),
                messageKind: kinds.includes(candidate.messageKind) ? candidate.messageKind : 'other',
                evidence: String(candidate.evidence || '').slice(0, 180),
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('status_update', {
        mode: 'chat', minimumTier: 'micro', maxInputChars: 4800, maxOutputTokens: 130,
        system: `You update a private optional chat HUD after one completed exchange. Use only supplied meter IDs. Return absolute meter values within each supplied minimum and maximum. Change a value only when the exchange contains clear evidence relevant to that meter; otherwise preserve it. The short status must describe only explicit current conversational state, never hidden thoughts, biography, off-screen events, diagnoses, or invented facts. Do not answer the player or write roleplay prose.`,
        schema: object({
            meters: { type: 'array', maxItems: 8, items: object({ id: string(), value: number(-1000000, 1000000), evidence: string() }) },
            status: string(), statusEvidence: string(), confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate) || !Array.isArray(candidate.meters)) return { ok: false, reason: 'Missing HUD meter list.' };
            const definitions = Array.isArray(envelope.meters) ? envelope.meters : [];
            const byId = new Map(definitions.map(meter => [String(meter.id), meter]));
            const meters = [];
            for (const raw of candidate.meters.slice(0, 8)) {
                const definition = byId.get(String(raw.id));
                if (!definition) return { ok: false, reason: 'HUD update used an unknown meter.' };
                const min = Number(definition.min) || 0;
                const max = Number(definition.max) || 100;
                const numeric = Number(raw.value);
                if (!Number.isFinite(numeric)) return { ok: false, reason: 'HUD update used a non-numeric value.' };
                const value = Math.max(min, Math.min(max, numeric));
                const current = Math.max(min, Math.min(max, Number(definition.current) || min));
                const evidence = String(raw.evidence || '').trim();
                if (value !== current && !evidence) return { ok: false, reason: 'A changed HUD meter needs exact evidence.' };
                if (!evidenceExists(evidence, envelope)) return { ok: false, reason: 'HUD evidence was not present in the exchange.' };
                meters.push({ id: String(raw.id), value, evidence: evidence.slice(0, 180) });
            }
            const status = String(candidate.status || '').trim().slice(0, 280);
            const statusEvidence = String(candidate.statusEvidence || '').trim().slice(0, 180);
            if (status && (!statusEvidence || !evidenceExists(statusEvidence, envelope))) {
                return { ok: false, reason: 'HUD status needs exact evidence from the exchange.' };
            }
            return { ok: true, reason: `Validated ${meters.length} bounded HUD meter update${meters.length === 1 ? '' : 's'}.`, value: {
                meters, status, statusEvidence,
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('memory_gate', {
        mode: 'universal', minimumTier: 'micro', maxInputChars: 5000, maxOutputTokens: 130,
        system: `You are a private memory gate. Decide whether the supplied completed exchange deserves no memory, recent context only, or durable memory. Use only explicit facts. Never infer biography, intent, relationship status, or events that were not stated. Subject and witness IDs must come from allowed IDs. The factual sentence must be short, neutral, third person, and blank unless recent_only or durable.`,
        schema: object({
            memoryClass: string(['discard', 'recent_only', 'durable']),
            kind: string(['fact', 'preference', 'promise', 'wound', 'joke', 'milestone', 'event', 'none']),
            subjectIds: { type: 'array', items: string(), maxItems: 8 },
            witnessIds: { type: 'array', items: string(), maxItems: 16 },
            factualSentence: string(), novelty: number(0, 3), emotionalWeight: number(0, 3),
            confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate)) return { ok: false, reason: 'Missing memory decision.' };
            const subjectIds = unique(candidate.subjectIds);
            const witnessIds = unique(candidate.witnessIds);
            if (subjectIds.some(id => !idAllowed(id, envelope.allowedSubjectIds, false))) return { ok: false, reason: 'Unknown memory subject.' };
            if (witnessIds.some(id => !idAllowed(id, envelope.allowedWitnessIds, false))) return { ok: false, reason: 'Unknown memory witness.' };
            const classes = ['discard', 'recent_only', 'durable'];
            const memoryClass = classes.includes(candidate.memoryClass) ? candidate.memoryClass : 'discard';
            const sentence = String(candidate.factualSentence || '').trim().slice(0, 360);
            if (memoryClass !== 'discard' && !sentence) return { ok: false, reason: 'A retained memory needs a factual sentence.' };
            return { ok: true, reason: 'Memory candidates and witnesses are allowlisted.', value: {
                memoryClass,
                kind: ['fact', 'preference', 'promise', 'wound', 'joke', 'milestone', 'event', 'none'].includes(candidate.kind) ? candidate.kind : 'none',
                subjectIds, witnessIds, factualSentence: memoryClass === 'discard' ? '' : sentence,
                novelty: Math.max(0, Math.min(3, Math.round(Number(candidate.novelty) || 0))),
                emotionalWeight: Math.max(0, Math.min(3, Math.round(Number(candidate.emotionalWeight) || 0))),
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('memory_relevance', {
        mode: 'humans', minimumTier: 'micro', maxInputChars: 6000, maxOutputTokens: 110, cacheMs: 180000,
        system: `You are a tiny private memory index. Select only memory IDs that are directly useful for understanding the supplied current message or contact reason. IDs must come from allowedMemoryIds. Do not summarize, rewrite, infer facts, answer the message, or select memories merely because they are emotional. An empty list is correct when nothing is relevant.`,
        schema: object({
            memoryIds: { type: 'array', items: string(), maxItems: 10 },
            confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate) || !Array.isArray(candidate.memoryIds)) return { ok: false, reason: 'Missing memory selection.' };
            const memoryIds = unique(candidate.memoryIds).slice(0, 10);
            if (memoryIds.some(id => !idAllowed(id, envelope.allowedMemoryIds, false))) {
                return { ok: false, reason: 'Memory selection used an unknown ID.' };
            }
            return { ok: true, reason: `Selected ${memoryIds.length} allowlisted memor${memoryIds.length === 1 ? 'y' : 'ies'}.`, value: {
                memoryIds,
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('human_social_gate', {
        mode: 'humans', minimumTier: 'micro', maxInputChars: 3000, maxOutputTokens: 72, cacheMs: 900000,
        system: `You are a tiny private posting gate. Decide whether the supplied authoritative current-life facts contain an ordinary, plausible reason for this person to post now. Do not write the post, invent an event, infer hidden thoughts, or reward frequency. Return false when nothing is worth sharing. Evidence must be an exact excerpt from currentContext.`,
        schema: object({
            shouldPost: boolean,
            format: string(['status', 'photo', 'none']),
            evidence: string(),
            confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate)) return { ok: false, reason: 'Missing social-post decision.' };
            if (!evidenceExists(candidate.evidence, { text: envelope.currentContext })) {
                return { ok: false, reason: 'Post evidence was not present in current life.' };
            }
            const shouldPost = candidate.shouldPost === true;
            const format = shouldPost && ['status', 'photo'].includes(candidate.format) ? candidate.format : 'none';
            return { ok: true, reason: shouldPost ? 'Grounded post opportunity found.' : 'No grounded post opportunity.', value: {
                shouldPost,
                format,
                evidence: String(candidate.evidence || '').slice(0, 180),
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('human_contact_gate', {
        mode: 'humans', minimumTier: 'micro', maxInputChars: 3600, maxOutputTokens: 84, cacheMs: 300000,
        system: `You are a tiny private contact-appropriateness classifier. The deterministic life engine has already found a possible reason to contact the player. Decide only whether sending a message now is plausible given the supplied current situation, availability, unanswered-message state and reason. Do not write the message, roleplay, invent motives, alter relationships, or treat a score as permission. A due explicit promise should normally proceed. Return unsure rather than guessing. Evidence must be an exact excerpt from currentContext.`,
        schema: object({
            decision: string(['contact', 'wait', 'unsure']),
            evidence: string(), confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate)) return { ok: false, reason: 'Missing contact decision.' };
            const decision = ['contact', 'wait', 'unsure'].includes(candidate.decision) ? candidate.decision : 'unsure';
            const evidence = String(candidate.evidence || '').trim().slice(0, 180);
            if (decision !== 'unsure' && (!evidence || !evidenceExists(evidence, { text: envelope.currentContext }))) {
                return { ok: false, reason: 'Contact advice needs exact evidence from current context.' };
            }
            return { ok: true, reason: 'Advisory contact decision is evidence-grounded.', value: {
                decision, evidence,
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('world_micro_frame', {
        mode: 'worlds', minimumTier: 'micro', maxInputChars: 3600, maxOutputTokens: 96,
        system: `You are a tiny semantic sensor inside a deterministic world engine. Read only the supplied player text and candidate lists. Identify the player's own completed or attempted action; quoted speech is not a physical action. Select IDs only from the supplied allowlists. Prefer an explicit later action over an ambiguous earlier phrase. Return exact evidence copied from the player text. Never narrate, invent facts, calculate routes, calculate travel time, or assume an arrival. Use blank IDs and intent "other" rather than guess.`,
        embeddedSystem: `Classify one player action. Output exactly one short pipe-separated line and nothing else:\nMWF|actorId|intent|destinationId|-|phase|outfitOperation|durationMinutes|confidencePercent|exact evidence\nUse IDs copied from the input lists. actorId is usually player. intent is move, look, speak, interact, outfit, wait, inspect, combat, ooc, or other. phase is intended, attempted, in_progress, or completed. Use - for blank IDs. Confidence is 0 to 100. Evidence must be copied exactly from text. Quoted speech is not movement. Never explain.`,
        parseOutput: compactWorldFrame,
        schema: object({
            actorId: string(),
            intent: string(['move', 'look', 'speak', 'interact', 'outfit', 'wait', 'inspect', 'combat', 'ooc', 'other']),
            destinationId: string(), targetId: string(),
            phase: string(['intended', 'attempted', 'in_progress', 'completed']),
            outfitOperation: string(['none', 'add', 'remove', 'replace', 'clear']),
            outfitText: string(), durationMinutes: number(0, 14400),
            evidence: string(), confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate)) return { ok: false, reason: 'Missing Micro World frame.' };
            if (!idAllowed(candidate.actorId, envelope.allowedActorIds, false)) return { ok: false, reason: 'Micro World frame used an unknown actor.' };
            if (!idAllowed(candidate.destinationId, envelope.allowedLocationIds)) return { ok: false, reason: 'Micro World frame used an unknown destination.' };
            if (!idAllowed(candidate.targetId, envelope.allowedTargetIds)) return { ok: false, reason: 'Micro World frame used an unknown target.' };
            if (!evidenceExists(candidate.evidence, envelope)) return { ok: false, reason: 'Micro World evidence was not present in player text.' };
            const intents = ['move', 'look', 'speak', 'interact', 'outfit', 'wait', 'inspect', 'combat', 'ooc', 'other'];
            const phases = ['intended', 'attempted', 'in_progress', 'completed'];
            const outfitOperations = ['none', 'add', 'remove', 'replace', 'clear'];
            const intent = intents.includes(candidate.intent) ? candidate.intent : 'other';
            const evidence = String(candidate.evidence || '').trim().slice(0, 220);
            if (intent !== 'other' && !evidence) return { ok: false, reason: 'A classified World action needs exact evidence.' };
            const outfitOperation = outfitOperations.includes(candidate.outfitOperation) ? candidate.outfitOperation : 'none';
            const outfitText = String(candidate.outfitText || '').trim().slice(0, 160);
            if (outfitText && !evidence.toLowerCase().includes(outfitText.toLowerCase())) {
                return { ok: false, reason: 'Outfit text was not grounded in the evidence span.' };
            }
            const noOp = intent === 'other' && Number(candidate.confidence) === 0;
            return { ok: true, reason: noOp
                ? 'Tiny output reduced to a safe no-op; deterministic parsing retained control.'
                : 'Micro World frame is allowlisted and evidence-grounded.', value: {
                actorId: String(candidate.actorId), intent,
                destinationId: String(candidate.destinationId || ''), targetId: String(candidate.targetId || ''),
                phase: phases.includes(candidate.phase) ? candidate.phase : 'intended',
                outfitOperation, outfitText,
                durationMinutes: Math.max(0, Math.min(14400, Math.round(Number(candidate.durationMinutes) || 0))),
                evidence, confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('event_lens', {
        mode: 'worlds', minimumTier: 'small', maxInputChars: 6500, maxOutputTokens: 180,
        system: `You classify actor-scoped events in a text simulation. Use only allowed actor, target, and location IDs. Distinguish intended, attempted, in_progress, and completed. Directional language is not arrival. Another actor moving never moves the player. Dialogue claims and hypothetical actions are not completed physical events. Return no event rather than guess. Evidence must be an exact short excerpt.`,
        schema: object({
            events: { type: 'array', maxItems: 8, items: object({
                actorId: string(), kind: string(['move', 'outfit', 'item', 'speech', 'social', 'time', 'none']),
                targetId: string(), locationId: string(),
                phase: string(['intended', 'attempted', 'in_progress', 'completed']),
                evidence: string(), confidence: number(0, 1)
            }) },
            ambiguous: boolean, confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate) || !Array.isArray(candidate.events)) return { ok: false, reason: 'Missing event list.' };
            const events = [];
            for (const raw of candidate.events.slice(0, 8)) {
                if (!plainObject(raw) || !idAllowed(raw.actorId, envelope.allowedActorIds, false)) {
                    return { ok: false, reason: 'Event used an unknown actor.' };
                }
                if (!idAllowed(raw.targetId, envelope.allowedTargetIds)) return { ok: false, reason: 'Event used an unknown target.' };
                if (!idAllowed(raw.locationId, envelope.allowedLocationIds)) return { ok: false, reason: 'Event used an unknown location.' };
                if (!evidenceExists(raw.evidence, envelope)) return { ok: false, reason: 'Event evidence was not present in source text.' };
                events.push({
                    actorId: String(raw.actorId), kind: ['move', 'outfit', 'item', 'speech', 'social', 'time', 'none'].includes(raw.kind) ? raw.kind : 'none',
                    targetId: String(raw.targetId || ''), locationId: String(raw.locationId || ''),
                    phase: ['intended', 'attempted', 'in_progress', 'completed'].includes(raw.phase) ? raw.phase : 'intended',
                    evidence: String(raw.evidence || '').slice(0, 180),
                    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0))
                });
            }
            return { ok: true, reason: 'All event actors and targets are canonical.', value: {
                events, ambiguous: candidate.ambiguous === true,
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('continuity_sentinel', {
        mode: 'worlds', minimumTier: 'small', maxInputChars: 8500, maxOutputTokens: 180,
        system: `You are a continuity critic, not a writer. Compare the canonical pre-frame, narrative, and proposed receipt. Report only contradictions supported by those inputs. Never repair, rewrite, add events, or invent missing facts. Entity IDs must come from allowed IDs. If uncertain, return an empty issue list.`,
        schema: object({
            issues: { type: 'array', maxItems: 8, items: object({
                code: string(['wrong_actor', 'impossible_location', 'missing_transition', 'knowledge_leak', 'time_conflict', 'outfit_conflict', 'receipt_mismatch', 'other']),
                entityId: string(), evidence: string(), severity: string(['low', 'medium', 'high']), confidence: number(0, 1)
            }) },
            confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate) || !Array.isArray(candidate.issues)) return { ok: false, reason: 'Missing continuity issue list.' };
            const issues = [];
            for (const raw of candidate.issues.slice(0, 8)) {
                if (!idAllowed(raw.entityId, envelope.allowedEntityIds)) return { ok: false, reason: 'Continuity issue used an unknown entity.' };
                issues.push({
                    code: String(raw.code || 'other'), entityId: String(raw.entityId || ''),
                    evidence: String(raw.evidence || '').slice(0, 220),
                    severity: ['low', 'medium', 'high'].includes(raw.severity) ? raw.severity : 'low',
                    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0))
                });
            }
            return { ok: true, reason: issues.length
                ? `Continuity report found ${issues.length} bounded issue${issues.length === 1 ? '' : 's'}.`
                : 'Continuity report found no grounded issue.', value: {
                issues, confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('life_beat', {
        mode: 'humans', minimumTier: 'small', maxInputChars: 6500, maxOutputTokens: 150,
        background: true, needleCompatible: false,
        system: `You propose at most three private micro-beats between deterministic life anchors. A beat must be ordinary, plausible, caused by supplied schedule/personality/context, and must not create relationships, purchases, injuries, travel, secrets, promises, messages, or major events. Use supplied place and person IDs only. Return an empty list when no beat adds meaningful continuity.`,
        schema: object({
            beats: { type: 'array', maxItems: 3, items: object({
                anchorId: string(), placeId: string(), withIds: { type: 'array', items: string(), maxItems: 4 },
                summary: string(), emotionalTone: string(), confidence: number(0, 1)
            }) },
            confidence: number(0, 1)
        }),
        validate(candidate, envelope) {
            if (!plainObject(candidate) || !Array.isArray(candidate.beats)) return { ok: false, reason: 'Missing life-beat list.' };
            const beats = [];
            for (const raw of candidate.beats.slice(0, 3)) {
                if (!idAllowed(raw.anchorId, envelope.allowedAnchorIds, false)) return { ok: false, reason: 'Life beat lacks a canonical anchor.' };
                if (!idAllowed(raw.placeId, envelope.allowedPlaceIds)) return { ok: false, reason: 'Life beat used an unknown place.' };
                const withIds = unique(raw.withIds);
                if (withIds.some(id => !idAllowed(id, envelope.allowedPersonIds, false))) return { ok: false, reason: 'Life beat used an unknown person.' };
                const summary = String(raw.summary || '').trim().slice(0, 240);
                if (!summary) continue;
                beats.push({ anchorId: String(raw.anchorId), placeId: String(raw.placeId || ''), withIds,
                    summary, emotionalTone: String(raw.emotionalTone || '').slice(0, 60),
                    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)) });
            }
            return { ok: true, reason: 'Life beats are anchored and use established people and places.', value: {
                beats, confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });

    HordeLabs.registerTask('pip_route', {
        mode: 'universal', minimumTier: 'micro', maxInputChars: 1400, maxOutputTokens: 72,
        // Pip actions are reversible navigation suggestions, never state
        // mutation. Semantic validation and exact evidence still apply, so a
        // lower per-task gate is appropriate while world and Human state tasks
        // continue to obey the user's stricter global threshold.
        needleConfidence: 0.2,
        needleInput: envelope => String(envelope.text || ''),
        needleTools: [
            ['answer_help', 'The user asks for an explanation of a Horde Studio feature.'],
            ['diagnose_labs', 'The user reports a TinyBrain, local cognition or Horde Labs failure.'],
            ['diagnose_provider', 'The user reports an API, provider, model connection or media generation failure.'],
            ['open_settings', 'The user explicitly asks to open Horde Studio Settings.'],
            ['open_labs', 'The user explicitly asks to open Horde Labs or TinyBrain configuration.'],
            ['navigate', 'The user asks to open a named Horde Studio section.']
        ].map(([name, description]) => ({
            name, description,
            parameters: {
                type: 'object',
                properties: {
                    evidence: { type: 'string', description: 'A short exact phrase copied from the user request.' },
                    ...(name === 'navigate' ? { destination: { type: 'string', enum: ['chat', 'humans', 'worlds', 'pip', 'personas', 'customize'], description: 'The named section to open.' } } : {})
                },
                required: name === 'navigate' ? ['evidence', 'destination'] : ['evidence']
            }
        })),
        system: `Route one Horde Studio help request; do not answer it. Choose answer_help for an explanation, diagnose_labs for a TinyBrain/Labs failure, diagnose_provider for an API/provider failure, open_settings when the user explicitly asks to open settings, open_labs when they explicitly ask to open Labs, or navigate when they ask to open a named section. Copy a short exact phrase from the request as evidence.`,
        // Destination is intentionally optional. Needle is evidence-grounded and
        // correctly omits arguments the user did not supply; requiring an empty
        // placeholder made otherwise valid routes refuse the entire call.
        schema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['answer_help', 'diagnose_labs', 'diagnose_provider', 'open_settings', 'open_labs', 'navigate'], description: 'The single safest help action supported by the request.' },
                destination: { type: 'string', enum: ['chat', 'humans', 'worlds', 'pip', 'personas', 'customize', 'settings', 'labs'], description: 'Named Horde Studio section, only for navigate.' },
                evidence: { type: 'string', description: 'A short exact phrase copied from the user request.' }
            },
            required: ['action', 'evidence']
        },
        validate(candidate, envelope) {
            if (!plainObject(candidate)) return { ok: false, reason: 'Missing Pip route.' };
            const actions = ['answer_help', 'diagnose_labs', 'diagnose_provider', 'open_settings', 'open_labs', 'navigate'];
            const destinations = ['', 'chat', 'humans', 'worlds', 'pip', 'personas', 'customize', 'settings', 'labs'];
            const proposedAction = candidate.action || candidate._needleTool;
            const action = actions.includes(proposedAction) ? proposedAction : 'answer_help';
            const destination = destinations.includes(candidate.destination) ? candidate.destination : '';
            const evidence = String(candidate.evidence || '').trim().slice(0, 180);
            const source = String(envelope.text || '').toLowerCase();
            const aligned = action === 'answer_help'
                || (action === 'open_settings' && /\bsettings?\b/.test(source))
                || (action === 'open_labs' && /\b(?:labs?|tiny\s*brain|local cognition)\b/.test(source))
                || (action === 'diagnose_labs' && /\b(?:labs?|tiny\s*brain|local cognition)\b/.test(source) && /\b(?:error|fail|broken|not work|invalid|timeout|problem)\b/.test(source))
                || (action === 'diagnose_provider' && /\b(?:api|provider|model|image|photo|voice|video|tts|openrouter|gptproto|nanogpt|nvidia|bedrock|comfy)\b/.test(source) && /\b(?:error|fail|broken|not work|invalid|timeout|connection|decode|load)\b/.test(source))
                || (action === 'navigate' && destination && source.includes(destination === 'humans' ? 'human' : destination));
            if (!aligned) return { ok: false, reason: 'Pip route did not align with the literal request.' };
            if (action === 'navigate' && !destination) return { ok: false, reason: 'Navigation route needs a known destination.' };
            return { ok: true, reason: 'Pip request was routed without executing it.', value: {
                action, destination, evidence: evidenceExists(evidence, envelope) ? evidence : '',
                confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0))
            } };
        }
    });
})();
