/* Shared, deterministic activity kernel. No DOM, wall clock, providers, or prose parsing. */
(function (root, factory) {
    const engine = factory();
    if (typeof module === 'object' && module.exports) module.exports = engine;
    else root.VHActivityEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
    const resources = raw => Object.fromEntries(Object.entries(raw || {}).slice(0, 30)
        .filter(([key]) => /^[a-z][a-z0-9_]{0,39}$/.test(key) && !['constructor', 'prototype'].includes(key))
        .map(([key, value]) => [key, clamp(value, 0, 10000)]));
    function normalize(raw = {}) {
        return {
            projects: (Array.isArray(raw?.projects) ? raw.projects : []).filter(p=>p && typeof p==='object').slice(-32).map(p=>({id:String(p.id||'').slice(0,80),label:String(p.label||'').slice(0,200),targetMs:clamp(p.targetMs,0,6e9),progressMs:clamp(p.progressMs,0,6e9),completedAt:clamp(p.completedAt,0,9e15)})),
            learning: (Array.isArray(raw?.learning) ? raw.learning : []).filter(p=>p && typeof p==='object').slice(-32).map(p=>({id:String(p.id||'').slice(0,80),definitionKey:String(p.definitionKey||'').slice(0,30),completed:clamp(p.completed,0,10000),missed:clamp(p.missed,0,10000)})),
            version: 3, catalogKey: String(raw?.catalogKey || '').slice(0, 30), conversationUntil: clamp(raw?.conversationUntil, 0, 9e15),
            attentionReservationKey: String(raw?.attentionReservationKey || '').slice(0, 1000), plannerStartedAt: clamp(raw?.plannerStartedAt, 0, 9e15), plannedDays: (Array.isArray(raw?.plannedDays) ? raw.plannedDays : []).map(String).slice(-7), lastAdvancedAt: clamp(raw?.lastAdvancedAt, 0, 9e15),
            resources: resources(raw?.resources),
            goals: (Array.isArray(raw?.goals) ? raw.goals : []).filter(goal => goal && typeof goal === 'object').slice(-60).map(goal => ({
                id: String(goal.id || '').slice(0, 100), label: String(goal.label || '').slice(0, 200),
                kind: ['recovery', 'meal', 'focus', 'leisure', 'contact', 'preparation'].includes(goal.kind) ? goal.kind : 'focus',
                definitionKey: String(goal.definitionKey || '').slice(0, 30),
                projectId: String(goal.projectId || '').slice(0,80), learningEnabled: goal.learningEnabled === true, learningRecorded: goal.learningRecorded === true,
                opportunityId: String(goal.opportunityId || '').slice(0, 80),
                participantId: String(goal.participantId || '').slice(0, 80),
                commitmentId: String(goal.commitmentId || '').slice(0, 100),
                notBefore: clamp(goal.notBefore, 0, 9e15), expiresAt: clamp(goal.expiresAt, 0, 9e15),
                minEnergy: clamp(goal.minEnergy, 0, 100),
                priority: clamp(goal.priority, 0, 100), createdAt: clamp(goal.createdAt, 0, 9e15),
                deadline: clamp(goal.deadline, 0, 9e15), completedAt: clamp(goal.completedAt, 0, 9e15),
                status: ['planned', 'active', 'paused', 'blocked', 'completed', 'abandoned'].includes(goal.status) ? goal.status : 'planned',
                reason: String(goal.reason || '').slice(0, 300),
                stepIndex: Math.floor(clamp(goal.stepIndex, 0, 20)),
                steps: (Array.isArray(goal.steps) ? goal.steps : []).filter(step => step && typeof step === 'object').slice(0, 20).map(step => ({
                    label: String(step.label || 'Working on the goal').slice(0, 200),
                    durationMs: clamp(step.durationMs, goal.projectId ? 1 : 60000, 24 * 3600000),
                    progressMs: clamp(step.progressMs, 0, 24 * 3600000),
                    costs: resources(step.costs), produces: resources(step.produces), charged: step.charged === true,
                    energy: clamp(step.energy, -30, 30), stress: clamp(step.stress, -30, 30), hunger: clamp(step.hunger, -100, 100)
                }))
            })).filter(goal => goal.id && goal.label && goal.steps.length),
            events: (Array.isArray(raw?.events) ? raw.events : []).filter(event => event && typeof event === 'object').slice(-150).map(event => ({
                id: String(event.id || '').slice(0, 160), at: clamp(event.at, 0, 9e15),
                goalId: String(event.goalId || '').slice(0, 100), kind: String(event.kind || '').slice(0, 30),
                summary: String(event.summary || '').slice(0, 400)
            }))
        };
    }
    function addGoal(state, kind, id, now, label = '') {
        label = String(label || '');
        if (state.goals.some(goal => goal.id === id)) return null;
        const step = (label, minutes, energy, stress, costs = {}, produces = {}) => ({
            label, durationMs: minutes * 60000, progressMs: 0, energy, stress, hunger: 0, costs, produces, charged: false
        });
        const recipes = {
            recovery: { label: 'Rest and recover', priority: 65, steps: [step('Taking a restorative break', 20, 18, -8)] },
            meal: { label: 'Prepare and eat a meal', priority: 50, steps: [
                step('Getting ingredients', 20, -3, 0, {}, { ingredients: 1 }),
                step('Preparing a meal', 25, -4, 0, { ingredients: 1 }, { meal: 1 }),
                { ...step('Eating the prepared meal', 15, 12, -3, { meal: 1 }), hunger: -60 }
            ] },
            leisure: { label: 'Take time for a personal interest', priority: 35, steps: [step('Enjoying a personal interest', 25, -2, -6)] },
            contact: { label: 'Have a conversation with someone in their life', priority: 55, steps: [step('Talking with a familiar person', 15, -2, -2)] },
            preparation: { label: 'Prepare for a promise', priority: 70, steps: [step('Making time to prepare for a promise', 10, -2, 0)] },
            focus: { label: 'Make progress on a personal task', priority: 45,
                steps: [step('Spending focused time on a personal task', 30, -8, -2)] }
        };
        const recipe = recipes[kind];
        if (!recipe) return null;
        if (['leisure', 'contact', 'preparation'].includes(kind) && label.trim()) {
            recipe.label = label.trim(); recipe.steps[0].label = label.trim();
        }
        if (kind === 'focus' && label.trim()) {
            recipe.label = `Spend focused time on ${label.trim()}`;
            recipe.steps[0].label = `Working on ${label.trim()}`.slice(0, 200);
        }
        // Retain unfinished goals; discard only old resolved records to make room.
        if (state.goals.length >= 60) {
            const index = state.goals.findIndex(goal => ['completed', 'abandoned'].includes(goal.status));
            if (index < 0) return null;
            state.goals.splice(index, 1);
        }
        const goal = { id, kind, projectId: '', learningEnabled: false, learningRecorded: false, definitionKey: '', opportunityId: '', participantId: '', commitmentId: '', notBefore: 0, expiresAt: 0, minEnergy: 0, label: String(recipe.label).slice(0, 200), priority: recipe.priority,
            createdAt: now, deadline: 0, completedAt: 0, status: 'planned', reason: 'Waiting for an opportunity.',
            stepIndex: 0, steps: recipe.steps };
        state.goals.push(goal);
        return goal;
    }
    function event(state, goal, kind, at, summary, suffix = '') {
        const id = `${goal.id}:${kind}:${suffix || at}`;
        if (state.events.some(item => item.id === id)) return;
        if (['completed','missed'].includes(kind) && goal.learningEnabled && goal.opportunityId && !goal.learningRecorded) {
            state.learning ||= [];
            let learned = state.learning.find(item=>item.id===goal.opportunityId && item.definitionKey===goal.definitionKey);
            if (!learned) { learned={id:goal.opportunityId,definitionKey:goal.definitionKey,completed:0,missed:0}; state.learning.push(learned); state.learning=state.learning.slice(-32); }
            learned[kind] = Math.min(10000,learned[kind]+1); goal.learningRecorded=true;
        }
        state.events.push({ id, goalId: goal.id, kind, at, summary });
        state.events = state.events.slice(-150);
    }
    function advance(state, until, context = {}) {
        let from = state.lastAdvancedAt || until;
        if (until <= from) { if (!state.lastAdvancedAt) state.lastAdvancedAt = until; return { energy: 0, stress: 0, hunger: 0 }; }
        state.lastAdvancedAt = until;
        const delta = { energy: 0, stress: 0, hunger: 0 };
        from = Math.max(from, Math.min(until, state.conversationUntil || 0));
        if (from >= until) return delta;
        const pending = state.goals.filter(goal => !['completed', 'abandoned'].includes(goal.status));
        pending.forEach(goal => {
            if (goal.expiresAt && goal.expiresAt <= from) {
                goal.status = 'abandoned'; goal.reason = 'The opportunity window closed before completion.';
                event(state, goal, 'missed', from, goal.reason, 'window');
            }
        });
        const available = context.availability === 'available';
        if (!available) {
            pending.filter(goal => goal.status === 'active').forEach(goal => {
                goal.status = 'paused'; goal.reason = `Interrupted by ${context.label || context.availability || 'another obligation'}.`;
                event(state, goal, 'paused', from, goal.reason);
            });
            return delta;
        }
        let cursor = from;
        let transitions = 0;
        while (cursor < until && transitions++ < 60) {
            const candidates = pending.filter(goal => !['completed', 'abandoned'].includes(goal.status) && Math.max(goal.createdAt, goal.notBefore || 0) <= cursor);
            const nextArrival = Math.min(until, ...pending.filter(goal => !['completed', 'abandoned'].includes(goal.status)
                && Math.max(goal.createdAt, goal.notBefore || 0) > cursor).map(goal => Math.max(goal.createdAt, goal.notBefore || 0)));
            const score = goal => goal.priority + Math.min(20, Math.max(0, cursor - goal.createdAt) / 3600000)
                + (goal.deadline ? Math.max(0, 25 * (1 - Math.max(0, goal.deadline - cursor) / 3600000)) : 0)
                + (goal.kind === 'recovery' && context.energy < 30 ? 35 : 0)
                + (goal.kind === 'meal' && context.hunger >= 65 ? 35 : 0)
                + (goal.kind === 'contact' ? (Number(context.socialNeed) || 0) * 0.2 : 0)
                + (goal.status === 'active' ? 15 : 0);
            candidates.sort((a, b) => score(b) - score(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
            let selected = null;
            for (const goal of candidates) {
                if (goal.expiresAt && goal.expiresAt <= cursor) {
                    goal.status = 'abandoned'; goal.reason = 'The opportunity window closed before completion.';
                    event(state, goal, 'missed', cursor, goal.reason, 'window'); continue;
                }
                if (goal.minEnergy && context.energy < goal.minEnergy) { goal.status = 'blocked'; goal.reason = 'Not enough energy for this activity.'; continue; }
                if (goal.participantId && !context.availablePeople?.includes(goal.participantId)) {
                    goal.status = 'blocked'; goal.reason = 'The other person is not known to be available.'; continue;
                }
                const step = goal.steps[goal.stepIndex];
                if (!step) { goal.status = 'completed'; goal.completedAt = cursor; continue; }
                const missing = !step.charged && Object.entries(step.costs).find(([key, count]) => (state.resources[key] || 0) < count);
                if (missing) { goal.status = 'blocked'; goal.reason = `Missing ${missing[0]}.`; continue; }
                selected = goal; break;
            }
            if (!selected) {
                if (nextArrival < until) { cursor = nextArrival; continue; }
                break;
            }
            const goal = selected, step = goal.steps[goal.stepIndex];
            cursor = Math.max(cursor, goal.createdAt);
            if (cursor >= until) break;
            pending.filter(other => other !== goal && other.status === 'active').forEach(other => {
                other.status = 'paused'; other.reason = `Making room for ${goal.label}.`;
                event(state, other, 'paused', cursor, other.reason);
            });
            if (goal.status !== 'active') event(state, goal, 'started', cursor,
                `${step.progressMs ? 'Resumed' : 'Started'} ${step.label}.`);
            goal.status = 'active'; goal.reason = step.label;
            if (!step.charged) {
                Object.entries(step.costs).forEach(([key, count]) => { state.resources[key] -= count; });
                step.charged = true;
            }
            const spent = Math.min(nextArrival - cursor, until - cursor, goal.expiresAt ? goal.expiresAt - cursor : Infinity, Math.max(0, step.durationMs - step.progressMs));
            step.progressMs += spent; cursor += spent;
            const project = goal.projectId && state.projects?.find(item=>item.id===goal.projectId);
            if (project && spent > 0) {
                const fraction=spent/step.durationMs;
                delta.energy += step.energy*fraction; delta.stress += step.stress*fraction; delta.hunger += (Number(step.hunger)||0)*fraction;
                project.progressMs = Math.min(project.targetMs,project.progressMs+spent);
                if (project.progressMs >= project.targetMs && !project.completedAt) {
                    project.completedAt=cursor;
                    event(state,goal,'project_completed',cursor,`Reached the planned work target for ${project.label}.`,project.id);
                }
            }
            if (step.progressMs < step.durationMs) {
                if (cursor < until) continue;
                break;
            }
            Object.entries(step.produces).forEach(([key, count]) => { state.resources[key] = (state.resources[key] || 0) + count; });
            if (!project) { delta.energy += step.energy; delta.stress += step.stress; delta.hunger += Number(step.hunger) || 0; }
            event(state, goal, 'step_completed', cursor, `Finished ${step.label}.`, String(goal.stepIndex));
            goal.stepIndex++;
            if (goal.stepIndex >= goal.steps.length) {
                goal.status = 'completed'; goal.completedAt = cursor; goal.reason = 'Every activity step finished.';
                event(state, goal, 'completed', cursor, `Completed ${goal.label}.`, 'done');
            }
        }
        return delta;
    }
    function reserveAttention(state, now, batchKey, durationMs = 30000) {
        if (!batchKey || state.attentionReservationKey === batchKey) return false;
        const active = state.goals.find(goal => goal.status === 'active');
        // Conversation with someone else is not a solo interruptible task.
        if (!active || active.kind === 'contact') return false;
        state.attentionReservationKey = batchKey;
        state.conversationUntil = Math.max(state.conversationUntil || 0, now + clamp(durationMs, 15000, 120000));
        active.status = 'paused'; active.reason = 'Making room for the current text conversation.';
        event(state, active, 'paused', now, active.reason);
        return true;
    }
    function normalizeOpportunities(value) {
        const seen = new Set();
        return (Array.isArray(value) ? value : []).filter(item => item && typeof item === 'object')
            .slice(0, 16).map((item, index) => ({
                id: String(item.id || `option_${index}`).slice(0, 80),
                label: String(item.label || '').trim().slice(0, 150),
                kind: ['focus', 'leisure', 'contact', 'recovery', 'meal'].includes(item.kind) ? item.kind : 'focus',
                projectMinutes: item.kind === 'focus' ? clamp(item.projectMinutes,0,100000) : 0,
                learnFromOutcomes: item.learnFromOutcomes === true,
                participantId: String(item.participantId || '').slice(0, 80),
                days: [...new Set((Array.isArray(item.days) ? item.days : [0,1,2,3,4,5,6]).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))],
                startMinute: clamp(item.startMinute ?? 540, 0, 1439), endMinute: clamp(item.endMinute ?? 1320, 1, 1440),
                priority: clamp(item.priority ?? 40, 0, 80), minEnergy: clamp(item.minEnergy ?? 15, 0, 100),
                costs: resources(item.costs), reason: String(item.reason || 'A personal interest offers something worthwhile to do.').slice(0, 240)
            })).filter(item => item.label && item.endMinute > item.startMinute && !seen.has(item.id) && seen.add(item.id));
    }
    function roll(seed) {
        let hash = 2166136261;
        for (const ch of String(seed)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
        return (hash >>> 0) / 4294967296;
    }
    function plan(state, now, context) {
        state.plannedDays ||= [];
        const options = normalizeOpportunities(context.opportunities);
        state.projects ||= []; state.learning ||= [];
        for (const option of options.filter(item=>item.projectMinutes>0)) {
            let project=state.projects.find(item=>item.id===option.id);
            if (!project && state.projects.length>=32) continue;
            if (!project) { project={id:option.id,label:option.label,targetMs:option.projectMinutes*60000,progressMs:0,completedAt:0}; state.projects.push(project); }
            project.label=option.label; project.targetMs=option.projectMinutes*60000;
            if (project.progressMs < project.targetMs) project.completedAt=0;
        }
        const learnedAdjustment = item => {
            if (!item.learnFromOutcomes) return 0;
            const record=state.learning.find(record=>record.id===item.id && (!record.definitionKey || record.definitionKey===definitionKey(item)));
            const count=(record?.completed||0)+(record?.missed||0);
            return count<3 ? 0 : Math.max(-6,Math.min(6,(record.completed-record.missed)/count*6));
        };
        const definitionKey = item => String(Math.floor(roll(JSON.stringify(item,(key,value) => (key==='projectMinutes' && !value) || (key==='learnFromOutcomes' && !value) ? undefined : value)) * 4294967296));
        const catalogKey = definitionKey(options);
        if (state.catalogKey && state.catalogKey !== catalogKey) {
            state.plannedDays = [];
            state.goals.filter(goal => goal.opportunityId && !['completed', 'abandoned'].includes(goal.status)).forEach(goal => {
                const option = options.find(item => item.id === goal.opportunityId);
                if (!option || goal.definitionKey !== definitionKey(option)) {
                    goal.status = 'abandoned'; goal.reason = 'This opportunity was changed or removed.';
                    event(state, goal, 'replanned', now, goal.reason);
                }
            });
        }
        state.catalogKey = catalogKey;
        // New/cancelled/rescheduled promises are meaningful replanning inputs.
        // Preparation never claims that the promise itself has been fulfilled.
        const promises = (context.commitments || []).filter(item => item.status === 'pending' && item.dueAt > 0 && (!item.createdAt || item.createdAt <= now));
        state.goals.filter(goal => goal.commitmentId && !['completed', 'abandoned'].includes(goal.status)).forEach(goal => {
            const promise = promises.find(item => item.id === goal.commitmentId);
            if (!promise) { goal.status = 'abandoned'; goal.reason = 'The commitment is no longer pending.'; }
            else { goal.deadline = promise.dueAt; goal.notBefore = Math.max(goal.createdAt, promise.dueAt - 30 * 60000); }
        });
        promises.filter(item => item.dueAt - now <= 24 * 3600000).slice(0, 6).forEach(item => {
            if (state.goals.some(goal => goal.commitmentId === item.id && !['completed', 'abandoned'].includes(goal.status))) return;
            const goal = addGoal(state, 'preparation', `promise:${String(item.id).slice(0, 60)}:${item.dueAt}`, now,
                `Prepare for: ${String(item.text || 'a commitment').slice(0, 120)}`);
            if (goal) { goal.commitmentId = item.id; goal.deadline = item.dueAt; goal.notBefore = Math.max(now, item.dueAt - 30 * 60000); }
        });
        if (state.plannedDays.includes(context.dateKey)) return;
        state.plannedDays.push(context.dateKey); state.plannedDays = state.plannedDays.slice(-7);
        const midnight = context.midnight;
        const candidates = options.filter(item => (!item.projectMinutes || state.projects.some(p=>p.id===item.id && p.progressMs < item.projectMinutes*60000)) && item.days.includes(context.weekday) && midnight + item.endMinute * 60000 > now
            && (item.kind !== 'contact' || (context.people || []).some(person => person.id === item.participantId
                && (!person.availableAfter || person.availableAfter < midnight + item.endMinute * 60000))))
            .map(item => ({ item, score: item.priority + learnedAdjustment(item) + roll(`${context.seed}|${context.dateKey}|${item.id}`) * 20 }))
            .sort((a,b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
        for (const { item, score } of candidates.slice(0, 3)) {
            const person = (context.people || []).find(person => person.id === item.participantId);
            if (item.kind === 'contact' && !person) continue;
            const goal = addGoal(state, item.kind, `option:${context.dateKey}:${item.id.slice(0, 40)}:${definitionKey(item)}`, now,
                item.kind === 'contact' ? `Talk with ${person.name}` : item.label);
            if (!goal) continue;
            goal.projectId = item.projectMinutes ? item.id : ''; goal.learningEnabled = item.learnFromOutcomes;
            goal.definitionKey = definitionKey(item); goal.opportunityId = item.id; goal.participantId = item.kind === 'contact' ? person.id : '';
            goal.notBefore = Math.max(now, midnight + item.startMinute * 60000, item.kind === 'contact' ? Number(person.availableAfter) || 0 : 0);
            goal.expiresAt = midnight + item.endMinute * 60000; goal.deadline = goal.expiresAt;
            goal.minEnergy = item.minEnergy; goal.priority = score; goal.reason = item.reason;
            // Variation is chosen once and persisted, never rerolled on a tick.
            const factor = 0.85 + roll(`${context.seed}|duration|${context.dateKey}|${item.id}`) * 0.3;
            goal.steps.forEach(step => { step.durationMs = Math.round(step.durationMs * factor / 60000) * 60000; });
            if (goal.projectId) {
                const project=state.projects.find(p=>p.id===goal.projectId);
                const step=goal.steps[0]; const remaining=Math.min(step.durationMs,project.targetMs-project.progressMs);
                const fraction=remaining/step.durationMs; step.energy*=fraction; step.stress*=fraction; step.hunger*=fraction; step.durationMs=remaining;
            }
            goal.steps[0].costs = { ...goal.steps[0].costs, ...item.costs };
        }
    }
    function effects(raw = {}, availability = 'available', company = false) {
        const asleep = availability === 'asleep', occupied = ['busy', 'private'].includes(availability);
        const number = (value, fallback, lo, hi) => Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
        return { energyPerHour: number(raw?.energyPerHour, asleep ? 12 : occupied ? -3.5 : -1.5, -20, 15),
            stressTarget: number(raw?.stressTarget, asleep ? 10 : occupied ? 50 : 18, 0, 100),
            socialPerHour: number(raw?.socialPerHour, company ? -10 : asleep ? 0.15 : 1.25, -20, 10),
            hungerPerHour: number(raw?.hungerPerHour, asleep ? 2 : 5, -20, 15) };
    }
    function proposeNeeds(state, now, needs = {}) {
        const pending = kind => state.goals.some(goal => goal.kind === kind && !['completed', 'abandoned'].includes(goal.status));
        const bucket = Math.floor(now / (6 * 3600000));
        if ((needs.energy < 25 || needs.stress > 75) && !pending('recovery')) {
            const goal = addGoal(state, 'recovery', `need:recovery:${bucket}`, now);
            if (goal) goal.reason = needs.energy < 25 ? 'Low energy makes recovery a priority.' : 'Stress makes a restorative break worthwhile.';
        }
        if (needs.hunger >= 65 && !pending('meal')) {
            const goal = addGoal(state, 'meal', `need:meal:${bucket}`, now);
            if (goal) goal.reason = 'Hunger motivates preparing something to eat.';
        }
    }
    return { normalize, addGoal, advance, effects, proposeNeeds, normalizeOpportunities, plan, reserveAttention };
});
