# Deploy on Cloudflare

The Worker routes requests for `status.pizzalord.online` to a single
Durable Object-backed container running the existing Discord bot. The Worker
forwards site requests to the container; a five-minute Cron Trigger requests
`/health` to keep the container active.

## Prerequisites

- The `pizzalord.online` zone is active in the Cloudflare account you deploy to.
- Docker Desktop (or another Docker-compatible engine) is running.
- The Discord bot token and the monitored Discord user's ID are available.
- The bot has Discord's Presence Intent enabled and shares a server with the
  monitored user.

## Deploy

From the repository root:

```sh
cd status-bot
npm ci
node ./node_modules/wrangler/bin/wrangler.js login
node ./node_modules/wrangler/bin/wrangler.js secret put DISCORD_TOKEN
node ./node_modules/wrangler/bin/wrangler.js secret put TARGET_USER_ID
npm run deploy
```

`npm run deploy` first checks that `wrangler.jsonc` includes the
`StatusContainer` image, its `STATUS_BOT` Durable Object binding, and the
required Durable Object export. Always deploy through this command so Wrangler
uploads the container configuration. Do not deploy the Worker with a raw API
script upload that omits its container metadata; the local preflight cannot
protect deployments that bypass this command.

Wrangler prompts for each secret value. Do not commit either value or add it to
`wrangler.jsonc`. The target user ID is required by the bot even though it is
not a secret in the same way as the token.

The Docker build context is the repository root so the image can include
`IMG_2094.JPG`, which the existing status page serves as its favicon.

## Discord profile decoration OAuth

In the Discord Developer Portal, register this exact OAuth2 redirect URI:

```text
https://status.pizzalord.online/oauth/callback
```

Set the application's Client ID and Client Secret as Worker secrets from
`status-bot`:

```sh
node ./node_modules/wrangler/bin/wrangler.js secret put DISCORD_OAUTH_CLIENT_ID
node ./node_modules/wrangler/bin/wrangler.js secret put DISCORD_OAUTH_CLIENT_SECRET
```

The status page's **Connect Discord** link requests only the `identify` scope.
The callback verifies the signed-in user matches `TARGET_USER_ID`, stores only
the decoration asset in Durable Object storage, and does not retain the OAuth
access token. Reconnect if the account's decoration changes.

## Verify

The first deployment can take several minutes while Cloudflare provisions the
container. Then check:

```sh
curl https://status.pizzalord.online/health
curl https://status.pizzalord.online/status
```

The first request may take longer while the container starts. `/status` should
return the bot's JSON status. The existing status page and site can continue
using their current paths; the Worker forwards `/`, `/status`, and `/health` to
the bot.

To redeploy after code changes, run `npm run deploy` from `status-bot`. To review
deployed container instances, run:

```sh
node ./node_modules/wrangler/bin/wrangler.js containers list
```
