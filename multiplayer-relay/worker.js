/* Horde Studio Internet room relay.
 * The relay coordinates public room state only. Provider keys and hidden canon
 * remain in the host browser. Deploy this Worker to your own Cloudflare account.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
});
const cleanName = (value, fallback = 'Player') => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 48) || fallback;
const token = (bytes = 24) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const roomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const data = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(data, value => alphabet[value % alphabet.length]).join('');
};
const safePersona = value => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    name: cleanName(input.name, ''), pronouns: String(input.pronouns || '').slice(0, 60),
    appearance: String(input.appearance || '').slice(0, 500),
    publicIdentity: String(input.publicIdentity || '').slice(0, 500),
    reputation: String(input.reputation || '').slice(0, 500), color: String(input.color || '').slice(0, 24)
  };
};
const safeSnapshot = value => {
  const input = value && typeof value === 'object' ? value : {};
  const type = input.experienceType === 'chat' ? 'chat' : 'world';
  return {
    experienceType: type,
    experienceName: String(input.experienceName || input.worldName || 'Shared Session').slice(0, 120),
    worldName: String(input.experienceName || input.worldName || 'Shared Session').slice(0, 120),
    sessionName: String(input.sessionName || 'Shared Timeline').slice(0, 120),
    location: String(input.location || 'Unknown').slice(0, 160),
    turn: Math.max(0, Math.min(Number(input.turn) || 0, 1_000_000_000)),
    history: (Array.isArray(input.history) ? input.history : []).slice(-120).map(row => ({
      role: ['dm', 'user', 'system'].includes(row?.role) ? row.role : 'system',
      text: String(row?.text || '').slice(0, 12000)
    })).filter(row => row.text)
  };
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      const code = roomCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const target = new URL('https://room/internal/create'); target.searchParams.set('code', code);
      const response = await stub.fetch(new Request(target, request));
      const payload = await response.json();
      return json({ ...payload, roomCode: code });
    }
    if (parts[0] === 'api' && parts[1] === 'rooms' && parts[2]) {
      const code = parts[2].toUpperCase();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const suffix = parts[3] || '';
      const target = new URL(request.url);
      target.hostname = 'room'; target.pathname = `/internal/${suffix}`;
      const response = await stub.fetch(new Request(target, request));
      const headers = new Headers(response.headers);
      Object.entries(CORS).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === '/health') return json({ ok: true, service: 'Horde Studio Internet Rooms', protocol: 1 });
    return json({ error: 'Not found.' }, 404);
  }
};

export class HordeRoom {
  constructor(state) {
    this.state = state;
    this.room = null;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      this.room = await this.state.storage.get('room') || null;
    });
  }
  async save() { await this.state.storage.put('room', this.room); }
  players() { return Object.values(this.room?.players || {}).sort((a, b) => a.joinedAt - b.joinedAt); }
  advance() {
    const next = this.players().find(player => !this.room.round.submissions[player.id]);
    this.room.round.activePlayerId = next?.id || '';
    this.room.round.status = next ? 'collecting' : 'ready';
  }
  authenticate(data) {
    if (!this.room || Date.now() > this.room.expiresAt || data.inviteToken !== this.room.inviteToken) throw new Error('Room invite expired.');
    const player = this.room.players[data.playerId];
    if (!player || data.playerToken !== player.token) throw new Error('Player authentication failed.');
    player.lastSeen = Date.now();
    return player;
  }
  publicState(viewer) {
    const submissions = this.room.round.submissions;
    const proposal = this.room.proposal;
    return {
      ok: true, roomCode: this.room.code, experienceType: this.room.experienceType,
      experienceName: this.room.experienceName, worldName: this.room.experienceName,
      sessionName: this.room.sessionName, revision: this.room.revision,
      isHost: viewer.isHost, hostPlayerId: this.room.hostPlayerId,
      permissions: viewer.isHost ? ['submit', 'vote', 'commit', 'resolve', 'close'] : ['submit', 'vote'],
      players: this.players().map(player => ({ id: player.id, name: player.name,
        persona: player.persona, isHost: player.isHost, online: Date.now() - player.lastSeen < 45000 })),
      round: { number: this.room.round.number, status: this.room.round.status,
        activePlayerId: this.room.round.activePlayerId,
        submissions: this.players().map(player => ({ playerId: player.id, name: player.name,
          submitted: !!submissions[player.id], ...(viewer.isHost && submissions[player.id] ? { text: submissions[player.id].text } : {}) })) },
      proposal: proposal ? { id: proposal.id, type: proposal.type, label: proposal.label,
        status: proposal.status, yes: Object.values(proposal.votes).filter(Boolean).length,
        no: Object.values(proposal.votes).filter(value => !value).length,
        myVote: proposal.votes[viewer.id] } : null,
      snapshot: this.room.snapshot
    };
  }
  broadcast() {
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(JSON.stringify({ event: 'room-updated', revision: this.room.revision })); } catch (_) {}
    }
  }
  tally() {
    const proposal = this.room.proposal;
    if (!proposal || proposal.status !== 'open') return;
    const votes = Object.values(proposal.votes);
    const majority = Math.floor(this.players().length / 2) + 1;
    if (votes.filter(Boolean).length >= majority) proposal.status = 'approved';
    else if (votes.filter(value => !value).length >= majority || votes.length >= this.players().length) proposal.status = 'rejected';
  }
  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === '/internal/create') {
      if (this.room) return json({ error: 'Room already exists.' }, 409);
      const body = await request.json(); const now = Date.now();
      const hostId = `player_${token(8)}`; const hostToken = token(); const inviteToken = token();
      const snap = safeSnapshot(body.snapshot);
      this.room = { code: String(url.searchParams.get('code') || body.roomCode || ''), inviteToken,
        experienceType: body.experienceType === 'chat' ? 'chat' : 'world',
        experienceName: cleanName(body.experienceName || body.worldName, snap.experienceName),
        sessionName: cleanName(body.sessionName, 'Shared Timeline'), hostPlayerId: hostId,
        createdAt: now, updatedAt: now, expiresAt: now + 86400000, revision: 1,
        players: { [hostId]: { id: hostId, token: hostToken, name: cleanName(body.displayName, 'Host'),
          persona: safePersona(body.persona), isHost: true, joinedAt: now, lastSeen: now } },
        round: { number: 1, status: 'collecting', submissions: {}, activePlayerId: hostId },
        proposal: null, snapshot: snap };
      await this.save(); await this.state.storage.setAlarm(this.room.expiresAt);
      return json({ ok: true, inviteToken, hostPlayerId: hostId, playerToken: hostToken });
    }
    if (url.pathname === '/internal/join' && request.method === 'POST') {
      if (!this.room || Date.now() > this.room.expiresAt) return json({ error: 'Room expired.' }, 410);
      const body = await request.json();
      if (body.inviteToken !== this.room.inviteToken) return json({ error: 'Invalid invite.' }, 403);
      if (this.players().length >= 12) return json({ error: 'Room is full.' }, 409);
      const now = Date.now(); const id = `player_${token(8)}`; const playerToken = token();
      this.room.players[id] = { id, token: playerToken, name: cleanName(body.displayName),
        persona: safePersona(body.persona), isHost: false, joinedAt: now, lastSeen: now };
      this.room.revision++; await this.save(); this.broadcast();
      return json({ ok: true, playerId: id, playerToken });
    }
    if (url.pathname === '/internal/socket') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return json({ error: 'Not found.' }, 404);
  }
  async webSocketMessage(socket, message) {
    let data;
    try { data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch (_) { return socket.send(JSON.stringify({ ok: false, error: 'Malformed message.' })); }
    const reply = (value, ok = true) => socket.send(JSON.stringify({ id: data.id, ok, ...(ok ? { data: value } : { error: value }) }));
    try {
      if (data.command === 'authenticate') {
        const player = this.authenticate(data); socket.serializeAttachment({ playerId: player.id });
        await this.save(); return reply(this.publicState(player));
      }
      const attachment = socket.deserializeAttachment();
      const player = this.authenticate({ ...data, playerId: attachment?.playerId });
      const body = data.payload || {};
      if (data.command === 'state' || data.command === 'heartbeat') return reply(this.publicState(player));
      if (data.command === 'submit') {
        if (this.room.round.status !== 'collecting' || this.room.round.activePlayerId !== player.id) throw new Error('Wait for your turn.');
        const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
        if (!text) throw new Error('Enter an action.');
        this.room.round.submissions[player.id] = { text, at: Date.now() }; this.advance();
      } else if (data.command === 'commit') {
        if (!player.isHost) throw new Error('Only the host can commit.');
        if (this.room.round.status !== 'ready') throw new Error('Every player must submit first.');
        this.room.snapshot = safeSnapshot(body.snapshot);
        this.room.round = { number: this.room.round.number + 1, status: 'collecting', submissions: {}, activePlayerId: this.players()[0].id };
        this.room.proposal = null;
      } else if (data.command === 'propose') {
        if (!['reroll', 'reset'].includes(body.type)) throw new Error('Unsupported vote.');
        this.room.proposal = { id: `vote_${token(8)}`, type: body.type, label: String(body.label || body.type).slice(0, 120), status: 'open', votes: { [player.id]: true } }; this.tally();
      } else if (data.command === 'vote') {
        if (!this.room.proposal || this.room.proposal.id !== body.proposalId || this.room.proposal.status !== 'open') throw new Error('Vote is no longer active.');
        this.room.proposal.votes[player.id] = body.approve === true; this.tally();
      } else if (data.command === 'resolve') {
        if (!player.isHost || this.room.proposal?.status !== 'approved') throw new Error('Only the host can apply an approved vote.');
        this.room.snapshot = safeSnapshot(body.snapshot); this.room.proposal.status = 'applied';
      } else if (data.command === 'close') {
        if (!player.isHost) throw new Error('Only the host can close the room.');
        await this.state.storage.deleteAll(); this.room = null; reply({ ok: true });
        for (const peer of this.state.getWebSockets()) try { peer.close(1000, 'Room closed'); } catch (_) {}
        return;
      } else throw new Error('Unknown command.');
      this.room.updatedAt = Date.now(); this.room.revision++; await this.save(); this.broadcast();
      return reply({ ok: true, revision: this.room.revision });
    } catch (error) { return reply(error.message || 'Room request failed.', false); }
  }
  async webSocketClose() {}
  async webSocketError() {}
  async alarm() {
    this.room = null; await this.state.storage.deleteAll();
    for (const socket of this.state.getWebSockets()) try { socket.close(1000, 'Room expired'); } catch (_) {}
  }
}
