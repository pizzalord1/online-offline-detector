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

Wrangler prompts for each secret value. Do not commit either value or add it to
`wrangler.jsonc`. The target user ID is required by the bot even though it is
not a secret in the same way as the token.

The Docker build context is the repository root so the image can include
`IMG_2094.JPG`, which the existing status page serves as its favicon.

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
