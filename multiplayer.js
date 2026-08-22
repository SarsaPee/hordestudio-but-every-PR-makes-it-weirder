/* Horde Studio Multiplayer — host-authoritative shared Chat and World play. */
(function () {
    'use strict';

    const party = {
        mode: 'off', roomCode: '', inviteToken: '', inviteUrl: '', playerId: '',
        playerToken: '', state: null, pollTimer: null, busy: false, context: null,
        transport: 'lan', relayUrl: '', socket: null, socketReady: null,
        reconnectTimer: null, reconnectAttempt: 0, pending: new Map()
    };
    let hooks = {};
    const SESSION_KEY = 'horde_multiplayer_session_v3';
    const RELAY_KEY = 'horde_multiplayer_relay_url';

    const byId = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));

    function auth(extra = {}) {
        return { roomCode: party.roomCode, inviteToken: party.inviteToken,
            playerId: party.playerId, playerToken: party.playerToken, ...extra };
    }

    function isGuestOrigin() {
        return new URLSearchParams(location.search).has('multiplayer') && /^https?:$/.test(location.protocol);
    }

    function normalizeRelay(value) {
        let raw = String(value || '').trim().replace(/\/$/, '');
        if (!raw) return '';
        if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
        const url = new URL(raw);
        if (!/^https?:$/.test(url.protocol)) throw new Error('Relay URL must use HTTPS.');
        return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
    }

    function encodeInvite(details) {
        const bytes = new TextEncoder().encode(JSON.stringify(details));
        let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return `HS1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
    }

    function decodeInvite(value) {
        const raw = String(value || '').trim();
        if (!raw.startsWith('HS1.')) return null;
        const encoded = raw.slice(4).replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        return { transport: 'online', relayUrl: normalizeRelay(parsed.relay),
            roomCode: String(parsed.roomCode || '').toUpperCase(), inviteToken: String(parsed.inviteToken || '') };
    }

    async function relayFetch(path, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(`${party.relayUrl}${path}`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `Relay request failed (${response.status}).`);
            return data;
        } finally { clearTimeout(timer); }
    }

    function socketUrl() {
        const relay = new URL(party.relayUrl);
        relay.protocol = relay.protocol === 'https:' ? 'wss:' : 'ws:';
        relay.pathname = `${relay.pathname.replace(/\/$/, '')}/api/rooms/${party.roomCode}/socket`;
        return relay.toString();
    }

    function socketCommand(command, payload = {}, timeoutMs = 12000) {
        return new Promise(async (resolve, reject) => {
            try { await connectSocket(); } catch (error) { reject(error); return; }
            const id = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const timer = setTimeout(() => { party.pending.delete(id); reject(new Error('Internet room timed out.')); }, timeoutMs);
            party.pending.set(id, { resolve, reject, timer });
            party.socket.send(JSON.stringify({ id, command, inviteToken: party.inviteToken,
                playerId: party.playerId, playerToken: party.playerToken, payload }));
        });
    }

    function connectSocket() {
        if (party.transport !== 'online') return Promise.resolve();
        if (party.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
        if (party.socketReady) return party.socketReady;
        party.socketReady = new Promise((resolve, reject) => {
            let settled = false;
            const socket = new WebSocket(socketUrl()); party.socket = socket;
            const fail = message => { if (!settled) { settled = true; reject(new Error(message)); } };
            socket.onopen = () => {
                const id = `auth_${Date.now()}`;
                const timer = setTimeout(() => fail('Relay authentication timed out.'), 10000);
                party.pending.set(id, { resolve: data => { clearTimeout(timer); settled = true; party.state = data;
                    party.reconnectAttempt = 0; render(); resolve(); }, reject: error => { clearTimeout(timer); fail(error.message); }, timer });
                socket.send(JSON.stringify({ id, command: 'authenticate', inviteToken: party.inviteToken,
                    playerId: party.playerId, playerToken: party.playerToken }));
            };
            socket.onmessage = event => {
                let message; try { message = JSON.parse(event.data); } catch (_) { return; }
                if (message.event === 'room-updated') { void poll(); return; }
                const pending = party.pending.get(message.id); if (!pending) return;
                clearTimeout(pending.timer); party.pending.delete(message.id);
                message.ok ? pending.resolve(message.data) : pending.reject(new Error(message.error || 'Relay request failed.'));
            };
            socket.onerror = () => fail('Could not connect to the online room server. Check its address and try again.');
            socket.onclose = () => {
                party.socket = null; party.socketReady = null;
                if (!settled) fail('Relay connection closed.');
                if (party.mode !== 'off' && party.transport === 'online') scheduleReconnect();
            };
        }).finally(() => { party.socketReady = null; });
        return party.socketReady;
    }

    function scheduleReconnect() {
        clearTimeout(party.reconnectTimer);
        const delay = Math.min(15000, 700 * (2 ** Math.min(5, party.reconnectAttempt++)));
        if (byId('world-party-action-status')) byId('world-party-action-status').textContent = `Reconnecting in ${Math.ceil(delay / 1000)}s…`;
        party.reconnectTimer = setTimeout(() => connectSocket().then(poll).catch(scheduleReconnect), delay);
    }

    async function request(path, body = {}) {
        if (party.transport === 'online' && party.mode !== 'off') {
            const commands = { '/multiplayer/state': 'state', '/multiplayer/submit': 'submit',
                '/multiplayer/commit': 'commit', '/multiplayer/propose': 'propose',
                '/multiplayer/vote': 'vote', '/multiplayer/resolve': 'resolve', '/multiplayer/close': 'close' };
            const command = commands[path];
            if (!command) throw new Error('Unsupported Internet room request.');
            return socketCommand(command, body);
        }
        if (!isGuestOrigin()) return hooks.bridgeRequest(path, { method: 'POST', body, timeoutMs: 12000 });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(location.origin + path, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `Multiplayer request failed (${response.status}).`);
            return data;
        } finally { clearTimeout(timer); }
    }

    function snapshot() {
        return hooks.snapshot?.(party.context) || {};
    }

    function setMode(mode, credentials = {}) {
        party.mode = mode;
        Object.assign(party, credentials);
        [byId('world-multiplayer-btn'), byId('chat-multiplayer-btn')].filter(Boolean).forEach(button => {
            button.classList.toggle('active', mode !== 'off');
            const compact = button.id === 'world-multiplayer-btn';
            button.textContent = mode === 'host' ? `${compact ? '🌐 Party' : '◎ Multiplayer'} · Host`
                : mode === 'guest' ? `${compact ? '🌐 Party' : '◎ Multiplayer'} · Joined`
                : compact ? '🌐 Party' : '◎ Multiplayer';
        });
        if (mode === 'off') {
            clearInterval(party.pollTimer);
            clearTimeout(party.reconnectTimer);
            try { party.socket?.close(1000, 'Leaving room'); } catch (_) {}
            party.socket = null;
            party.pollTimer = null;
            party.state = null;
            sessionStorage.removeItem(SESSION_KEY);
        } else {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                mode, roomCode: party.roomCode, inviteToken: party.inviteToken,
                inviteUrl: party.inviteUrl, playerId: party.playerId,
                playerToken: party.playerToken, context: party.context,
                transport: party.transport, relayUrl: party.relayUrl
            }));
        }
    }

    function open(context = null) {
        if (context) party.context = context;
        if (!party.context && party.mode === 'off') party.context = hooks.currentContext?.() || null;
        const overlay = byId('world-multiplayer-overlay');
        overlay?.classList.remove('hidden');
        overlay?.setAttribute('aria-hidden', 'false');
        byId('world-party-start')?.classList.toggle('hidden', party.mode !== 'off');
        byId('world-party-room')?.classList.toggle('hidden', party.mode === 'off');
        const type = party.context?.type || party.state?.experienceType || 'world';
        if (byId('world-party-title')) byId('world-party-title').textContent = type === 'chat' ? 'Chat Party' : 'World Party';
        if (byId('world-party-host-heading')) byId('world-party-host-heading').textContent = type === 'chat' ? 'Host this chat' : 'Host this timeline';
        if (byId('world-party-subtitle')) byId('world-party-subtitle').textContent = `One host, one model call, one shared ${type === 'chat' ? 'message' : 'turn'} at a time.`;
        if (party.mode !== 'off') render();
    }

    function close() {
        const overlay = byId('world-multiplayer-overlay');
        overlay?.classList.add('hidden');
        overlay?.setAttribute('aria-hidden', 'true');
    }

    async function host() {
        const context = party.context || hooks.currentContext?.();
        if (!context) return window.showToast?.('Choose a Chat or World before hosting.', 'error');
        await hooks.activateContext?.(context);
        party.context = hooks.currentContext?.(context.type) || context;
        const session = hooks.currentSession?.(party.context);
        if (!session) return window.showToast?.('That timeline could not be opened.', 'error');
        const button = byId('world-party-host-btn');
        button.disabled = true;
        const transport = party.transport === 'online' ? 'online' : 'lan';
        button.textContent = transport === 'online' ? 'Creating Internet room…' : 'Starting secure LAN room…';
        try {
            const payload = {
                    experienceType: party.context.type, experienceName: party.context.name,
                    worldName: party.context.name, sessionName: session.name,
                    displayName: byId('world-party-host-name').value || 'Host',
                    persona: hooks.currentPersona?.(), snapshot: snapshot()
            };
            let result;
            if (transport === 'online') {
                party.relayUrl = normalizeRelay(byId('world-party-relay-url')?.value || party.relayUrl);
                if (!party.relayUrl) throw new Error('Enter your online room server address. Use “How to set one up free” if you do not have one yet.');
                localStorage.setItem(RELAY_KEY, party.relayUrl);
                result = await relayFetch('/api/rooms', payload);
                party.roomCode = result.roomCode; party.inviteToken = result.inviteToken;
                party.playerId = result.hostPlayerId; party.playerToken = result.playerToken;
                result.inviteUrl = encodeInvite({ relay: party.relayUrl, roomCode: result.roomCode, inviteToken: result.inviteToken });
            } else result = await hooks.bridgeRequest('/multiplayer/rooms', { method: 'POST', timeoutMs: 12000, body: payload });
            setMode('host', { roomCode: result.roomCode, inviteToken: result.inviteToken,
                inviteUrl: result.inviteUrl, playerId: result.hostPlayerId, playerToken: result.playerToken,
                transport, relayUrl: party.relayUrl });
            byId('world-party-start').classList.add('hidden');
            byId('world-party-room').classList.remove('hidden');
            startPolling();
            window.showToast?.(`${party.context.type === 'chat' ? 'Chat' : 'World'} Party is live ${transport === 'online' ? 'on the Internet' : 'on your local network'}.`, 'success');
        } catch (error) { window.showToast?.(`Could not host: ${error.message}`, 'error'); }
        finally { button.disabled = false; button.textContent = party.transport === 'online' ? 'Create Internet room' : 'Create LAN room'; }
    }

    function inviteFromLocation() {
        return new URLSearchParams(location.hash.replace(/^#/, '')).get('invite') || '';
    }

    async function join() {
        const raw = String(byId('world-party-room-code').value || '').trim();
        let decoded = null; try { decoded = decodeInvite(raw); } catch (_) {}
        const roomCode = decoded?.roomCode || raw.toUpperCase();
        const inviteToken = decoded?.inviteToken || inviteFromLocation() || sessionStorage.getItem(`horde_party_invite_${roomCode}`) || '';
        if (!roomCode || !inviteToken) return window.showToast?.('Use the complete invite link from the host.', 'error');
        const button = byId('world-party-join-btn');
        button.disabled = true;
        try {
            let result;
            if (decoded) {
                party.transport = 'online'; party.relayUrl = decoded.relayUrl;
                result = await relayFetch(`/api/rooms/${roomCode}/join`, { roomCode, inviteToken,
                    displayName: byId('world-party-join-name').value || 'Player', persona: hooks.currentPersona?.() });
            } else result = await request('/multiplayer/join', { roomCode, inviteToken,
                displayName: byId('world-party-join-name').value || 'Player', persona: hooks.currentPersona?.() });
            sessionStorage.setItem(`horde_party_invite_${roomCode}`, inviteToken);
            setMode('guest', { roomCode, inviteToken, playerId: result.playerId, playerToken: result.playerToken,
                transport: decoded ? 'online' : 'lan', relayUrl: decoded?.relayUrl || '' });
            byId('world-party-start').classList.add('hidden');
            byId('world-party-room').classList.remove('hidden');
            startPolling();
        } catch (error) { window.showToast?.(`Could not join: ${error.message}`, 'error'); }
        finally { button.disabled = false; }
    }

    async function poll() {
        if (party.mode === 'off' || party.busy) return;
        party.busy = true;
        try {
            party.state = await request('/multiplayer/state', auth());
            render();
        } catch (error) {
            if (byId('world-party-action-status')) byId('world-party-action-status').textContent = `Disconnected · ${error.message}`;
        } finally { party.busy = false; }
    }

    function startPolling() {
        clearInterval(party.pollTimer);
        void poll();
        party.pollTimer = setInterval(poll, party.transport === 'online' ? 20000 : 1800);
    }

    function render() {
        const current = party.state;
        if (!current) return;
        const type = current.experienceType || party.context?.type || 'world';
        if (byId('world-party-title')) byId('world-party-title').textContent = type === 'chat' ? 'Chat Party' : 'World Party';
        if (byId('world-party-host-heading')) byId('world-party-host-heading').textContent = type === 'chat' ? 'Host this chat' : 'Host this timeline';
        byId('world-party-role').textContent = party.mode === 'host' ? 'HOST' : 'PLAYER';
        byId('world-party-room-title').textContent = `${current.experienceName || current.worldName} · ${current.roomCode}`;
        if (!party.context) party.context = { type: current.experienceType || 'world', name: current.experienceName || current.worldName };
        byId('world-party-round-label').textContent = `Round ${current.round.number} · ${current.round.status}`;
        byId('world-party-player-count').textContent = `${current.players.length} player${current.players.length === 1 ? '' : 's'}`;
        byId('world-party-host-actions').classList.toggle('hidden', party.mode !== 'host');
        byId('world-party-invite').classList.toggle('hidden', party.mode !== 'host');
        if (party.mode === 'host') byId('world-party-invite-url').textContent = party.inviteUrl;

        const submissions = new Map(current.round.submissions.map(item => [item.playerId, item]));
        byId('world-party-players').innerHTML = current.players.map((player, index) => {
            const active = current.round.activePlayerId === player.id;
            const submitted = submissions.get(player.id)?.submitted;
            return `<div class="world-party-player${active ? ' active' : ''}"><span class="world-party-player-index">${index + 1}</span><strong>${escape(player.name)}${player.isHost ? ' ♛' : ''}</strong><span>${submitted ? '✓ ready' : active ? 'turn' : player.online ? 'waiting' : 'offline'}</span></div>`;
        }).join('');

        const feed = byId('world-party-feed');
        const history = Array.isArray(current.snapshot?.history) ? current.snapshot.history : [];
        feed.innerHTML = history.length ? history.map(message => `<div class="world-party-message ${message.role}"><small>${message.role === 'dm' ? 'World' : message.role === 'user' ? 'Party' : 'System'}</small>${escape(message.text)}</div>`).join('')
            : '<div class="world-party-empty">The host’s shared transcript will appear here after the first committed round.</div>';
        feed.scrollTop = feed.scrollHeight;

        const mine = submissions.get(party.playerId);
        const mineSubmitted = !!mine?.submitted;
        const myTurn = current.round.status === 'collecting' && current.round.activePlayerId === party.playerId;
        byId('world-party-action').disabled = !myTurn || mineSubmitted;
        byId('world-party-submit-btn').disabled = !myTurn || mineSubmitted;
        byId('world-party-action-status').textContent = mineSubmitted ? 'Submitted · waiting for the party'
            : myTurn ? 'Your turn · submit one action' : current.round.status === 'ready' ? 'All actions are ready for the host' : 'Waiting for another player';
        byId('world-party-commit-btn').classList.toggle('hidden', !(party.mode === 'host' && current.round.status === 'ready'));
        renderVote(current.proposal);
    }

    async function submit(text) {
        const action = String(text || '').trim();
        if (!action) return;
        try {
            await request('/multiplayer/submit', auth({ text: action }));
            byId('world-party-action').value = '';
            const localInput = byId(party.context?.type === 'chat' ? 'user-input' : 'world-user-input');
            if (localInput && party.mode === 'host') localInput.value = '';
            await poll();
        } catch (error) { window.showToast?.(error.message, 'error'); }
    }

    async function commit() {
        const current = party.state;
        if (party.mode !== 'host' || current?.round?.status !== 'ready') return;
        const actions = current.round.submissions.filter(item => item.submitted && item.text);
        if (!actions.length) return;
        const button = byId('world-party-commit-btn');
        button.disabled = true;
        const type = current.experienceType || party.context?.type || 'world';
        button.textContent = type === 'chat' ? 'Chat is composing the shared reply…' : 'World is resolving the party turn…';
        const before = hooks.historyLength?.(party.context) || 0;
        const roster = (current.players || []).map(player => {
            const persona = player.persona || {};
            const identity = [persona.pronouns, persona.publicIdentity, persona.reputation].filter(Boolean).join('; ');
            return `- ${player.name}${identity ? ` (${identity})` : ''}`;
        }).join('\n');
        const prompt = type === 'chat'
            ? `[MULTIPLAYER CHAT — ROUND ${current.round.number}. These are distinct participants. Never merge their identities, write one participant's action as another's, or ignore a message.\nPARTICIPANTS:\n${roster}]\n${actions.map(item => `${item.name}: ${item.text}`).join('\n')}`
            : `[WORLD PARTY — ROUND ${current.round.number}. Resolve every participant as a distinct party member. Never merge identities or silently discard an action. If actions conflict, narrate the conflict fairly. This release uses one shared canonical scene/location; do not teleport individual players elsewhere unless the whole party travels or the narration explicitly establishes a split.\nPARTICIPANTS:\n${roster}]\n${actions.map(item => `${item.name}: ${item.text}`).join('\n')}`;
        try {
            close();
            await hooks.executeTurn?.(party.context, prompt);
            const succeeded = (hooks.historyLength?.(party.context) || 0) > before;
            if (!succeeded) throw new Error('The host model did not complete the turn. The round remains ready to retry.');
            await request('/multiplayer/commit', auth({ snapshot: snapshot() }));
            await poll();
            window.showToast?.(`Party ${type === 'chat' ? 'reply' : 'turn'} committed with one host model call.`, 'success');
        } catch (error) { window.showToast?.(error.message, 'error'); }
        finally { button.disabled = false; button.textContent = 'Commit party turn · run one API call'; }
    }

    async function propose(type, label) {
        try {
            await request('/multiplayer/propose', auth({ type, label }));
            open(); await poll();
        } catch (error) { window.showToast?.(error.message, 'error'); }
    }

    async function vote(approve) {
        const proposal = party.state?.proposal;
        if (!proposal) return;
        try {
            await request('/multiplayer/vote', auth({ proposalId: proposal.id, approve }));
            await poll();
        } catch (error) { window.showToast?.(error.message, 'error'); }
    }

    function renderVote(proposal) {
        const box = byId('world-party-vote');
        if (!proposal || proposal.status === 'applied') {
            box.classList.add('hidden'); box.innerHTML = ''; return;
        }
        box.classList.remove('hidden');
        const canVote = proposal.status === 'open' && proposal.myVote == null;
        const canApply = party.mode === 'host' && proposal.status === 'approved';
        box.innerHTML = `<strong>Vote · ${escape(proposal.label)}</strong><p>${proposal.yes} yes · ${proposal.no} no · ${escape(proposal.status)}</p><div class="world-party-vote-actions">${canVote ? '<button class="btn btn-primary btn-small" data-party-vote="yes">Vote yes</button><button class="btn btn-ghost btn-small" data-party-vote="no">Vote no</button>' : ''}${canApply ? '<button class="btn btn-primary btn-small" data-party-apply>Apply approved decision</button>' : ''}</div>`;
        box.querySelector('[data-party-vote="yes"]')?.addEventListener('click', () => vote(true));
        box.querySelector('[data-party-vote="no"]')?.addEventListener('click', () => vote(false));
        box.querySelector('[data-party-apply]')?.addEventListener('click', applyDecision);
    }

    async function applyDecision() {
        const proposal = party.state?.proposal;
        if (party.mode !== 'host' || proposal?.status !== 'approved') return;
        try {
            close();
            if (proposal.type === 'reroll') await hooks.reroll?.(party.context);
            else if (proposal.type === 'reset') await hooks.resetTimeline?.(party.context);
            await request('/multiplayer/resolve', auth({ snapshot: snapshot() }));
            await poll();
        } catch (error) { window.showToast?.(error.message, 'error'); }
    }

    async function end() {
        try { await request('/multiplayer/close', auth()); } catch (_) {}
        setMode('off', { roomCode: '', inviteToken: '', inviteUrl: '', playerId: '', playerToken: '' });
        close();
        window.showToast?.('Multiplayer room ended. Your local timeline remains on this device.', 'info');
    }

    function selectTransport(value) {
        party.transport = value === 'online' ? 'online' : 'lan';
        document.querySelectorAll('[data-party-transport]').forEach(button => button.classList.toggle('active', button.dataset.partyTransport === party.transport));
        byId('world-party-relay-wrap')?.classList.toggle('hidden', party.transport !== 'online');
        if (byId('world-party-host-btn')) byId('world-party-host-btn').textContent = party.transport === 'online' ? 'Create Internet room' : 'Create LAN room';
        if (party.transport === 'online' && byId('world-party-relay-url')) byId('world-party-relay-url').value = party.relayUrl || localStorage.getItem(RELAY_KEY) || '';
    }

    function prepare(context, options = {}) {
        if (party.mode !== 'off') return open();
        party.context = context || hooks.currentContext?.() || null;
        if (options.transport) selectTransport(options.transport);
        if (options.relayUrl) { party.relayUrl = options.relayUrl; if (byId('world-party-relay-url')) byId('world-party-relay-url').value = options.relayUrl; }
        const persona = hooks.currentPersona?.();
        if (byId('world-party-host-persona')) byId('world-party-host-persona').innerHTML = persona?.name
            ? `<span>Joining as</span><strong>${escape(persona.name)}</strong><small>${escape(persona.publicIdentity || persona.pronouns || 'Current persona')}</small>`
            : '<span>No active persona</span><small>Your display name will identify you in this room.</small>';
        open(party.context);
    }

    async function joinInvite(invite, displayName = 'Player') {
        const raw = String(invite || '').trim();
        if (!raw) return window.showToast?.('Paste the complete invite link.', 'error');
        let online = null; try { online = decodeInvite(raw); } catch (_) {}
        if (online) {
            party.transport = 'online'; party.relayUrl = online.relayUrl;
            byId('world-party-room-code').value = raw;
            byId('world-party-join-name').value = displayName || 'Player';
            open(); await join(); return;
        }
        let parsed;
        try { parsed = new URL(raw); }
        catch (_) { return window.showToast?.('That does not look like a complete invite link.', 'error'); }
        const roomCode = String(parsed.searchParams.get('multiplayer') || '').trim().toUpperCase();
        const inviteToken = new URLSearchParams(parsed.hash.replace(/^#/, '')).get('invite') || '';
        if (!roomCode || !inviteToken) return window.showToast?.('The invite link is missing its room code or private token.', 'error');
        if (parsed.origin !== location.origin) {
            location.assign(raw);
            return;
        }
        byId('world-party-room-code').value = roomCode;
        byId('world-party-join-name').value = displayName || 'Player';
        sessionStorage.setItem(`horde_party_invite_${roomCode}`, inviteToken);
        open();
        await join();
    }

    function setup(options = {}) {
        hooks = options;
        if (byId('world-multiplayer-btn')) byId('world-multiplayer-btn').onclick = () => prepare(hooks.currentContext?.('world'));
        if (byId('chat-multiplayer-btn')) byId('chat-multiplayer-btn').onclick = () => prepare(hooks.currentContext?.('chat'));
        byId('world-party-close-btn').onclick = close;
        byId('world-party-host-btn').onclick = host;
        byId('world-party-join-btn').onclick = join;
        byId('world-party-submit-btn').onclick = () => submit(byId('world-party-action').value);
        byId('world-party-commit-btn').onclick = commit;
        byId('world-party-end-btn').onclick = end;
        byId('world-party-copy-btn').onclick = async () => {
            try { await navigator.clipboard.writeText(party.inviteUrl); window.showToast?.('Invite link copied.', 'success'); }
            catch (_) { window.showToast?.('Copy the invite link shown in the room.', 'info'); }
        };
        document.querySelectorAll('[data-party-transport]').forEach(button => button.onclick = () => selectTransport(button.dataset.partyTransport));
        party.relayUrl = localStorage.getItem(RELAY_KEY) || '';
        selectTransport('lan');
        byId('world-multiplayer-overlay').addEventListener('click', event => {
            if (event.target.id === 'world-multiplayer-overlay') close();
        });
        const invitedRoom = String(new URLSearchParams(location.search).get('multiplayer') || '').toUpperCase();
        let restored = null;
        try { restored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (_) {}
        if (restored?.roomCode && restored?.playerId && restored?.playerToken) {
            setMode(restored.mode === 'host' ? 'host' : 'guest', restored);
            startPolling();
        }
        if (invitedRoom && party.mode === 'off') {
            byId('world-party-room-code').value = invitedRoom;
            setTimeout(open, 100);
        }
    }

    window.HordeMultiplayer = {
        setup, open, prepare, joinInvite, submit, propose, poll, selectTransport,
        context: () => party.context,
        isHosting: () => party.mode === 'host',
        isActive: () => party.mode !== 'off',
        isMyTurn: () => party.state?.round?.activePlayerId === party.playerId
            && party.state?.round?.status === 'collecting'
    };
})();
