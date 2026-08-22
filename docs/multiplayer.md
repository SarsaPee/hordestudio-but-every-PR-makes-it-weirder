# Horde Studio multiplayer

Multiplayer is a host-authoritative, turn-based mode shared by Chat Library and Worlds.

## The model

```text
players -> LAN host or online room server -> host browser -> host's API provider
```

- The host owns the canonical save, Chat or World state, and provider configuration.
- Guests never receive the host's API key, provider request or hidden World state.
- Players act in a fixed order and submit one action per round.
- After every player is ready, the host explicitly commits the round. Horde Studio combines the named actions and runs the existing Chat or World engine on the host.
- Only the host's sanitized visible transcript, location and round metadata are published back to the room.
- Rerolls and hard timeline resets require a majority vote. Approval does not mutate the save until the host applies the decision.
- Every participant has a separate display name and public persona brief. The host prompt names each participant explicitly.

## Hosting

1. Start Horde Studio with its launcher.
2. Open **Multiplayer** in the main sidebar, or select **Play Together** in Chat Library / Worlds.
3. Choose **Same Wi-Fi / LAN** or **Internet room**, then choose a character, group room or World.
4. Share the generated LAN link or `HS1.…` Internet invite code.

LAN rooms exist in the running Horde Studio process. Internet rooms live in the configured online room server for up to 24 hours. Browser-tab refreshes recover room credentials from session storage; they are deliberately not written into exports.

## Security boundary

The party service is deliberately separate from the localhost provider bridge. Its public LAN handler can only:

- serve Horde Studio's public app and bundled showcase assets;
- join an invite-token-protected room;
- read the sanitized room snapshot;
- submit the current player's action; and
- create or vote on an allowed proposal.

Provider, OAuth, local-image, filesystem and server-control routes are not exposed on the party port. Host commit, vote resolution and room shutdown are loopback-only operations.

## Online room server

Horde Studio includes a self-hostable Cloudflare Durable Object room server in
`multiplayer-relay/`. The Multiplayer screen includes the complete free setup
guide. Deploy it with Wrangler, then paste its HTTPS URL into
**Multiplayer → Internet room → Online room server address**. It uses WebSockets for live updates,
reconnects with exponential backoff, and enforces server-side permissions:

- everyone may submit their own turn and vote;
- only the host may commit a round, apply an approved decision, or close a room;
- maximum 12 players; and
- the room server receives submitted actions and the sanitized shared transcript, but never provider keys or hidden World state.

Horde Studio does not ship a centrally operated public server yet. A server owner
is responsible for Cloudflare usage, abuse controls and availability.

## Current limitations

- Maximum 12 players.
- World sessions treat players as one shared party at one canonical location.
- Player identities survive refreshes in the same browser session. There is no host migration or account identity.
- Virtual Human multiplayer is not included.

The important boundary remains: this is multi-player shared-party play, not yet
independent per-player simulation. The World kernel still has one canonical
scene, clock and HUD. Independent locations, inventories and private knowledge
need a future per-player world-state schema.
