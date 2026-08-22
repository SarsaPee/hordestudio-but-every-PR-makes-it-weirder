# Horde Studio Online Room Server

This tiny server lets Horde Studio players join the same room from different
networks. The host browser still owns the save, provider configuration and the
only model call. Players never need the host's provider key.

## Free setup (about five minutes)

1. Create a Cloudflare account at <https://dash.cloudflare.com/sign-up>.
2. Open Terminal in this `multiplayer-relay` folder.
3. Run:

   ```sh
   npx wrangler login
   npx wrangler deploy
   ```

4. Cloudflare prints an address ending in `.workers.dev`. Paste that address into
   **Horde Studio → Multiplayer → Internet room → Online room server address**.
5. Choose a Chat or World, create the room, and share its `HS1…` invite code.

Cloudflare Durable Objects currently have a Workers Free plan. Check Cloudflare's
current limits before sharing a server publicly:
<https://developers.cloudflare.com/durable-objects/platform/pricing/>.

Rooms use Durable Object WebSockets, expire after 24 hours, support up to 12
players, reconnect with browser-held player tokens, and enforce host/player
permissions on the server. The server can read submitted actions and the sanitized
shared transcript; it never receives provider API keys or hidden world state.

For a public deployment, set an explicit origin allowlist, add abuse/rate limits,
and review Cloudflare usage before sharing the relay URL widely.
