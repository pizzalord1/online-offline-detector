# Deploy on Cloudflare

The Worker routes requests for `status.pizzalord.online` to a single
Durable Object-backed container running the existing Discord bot. The Worker
forwards site requests to the container; a five-minute Cron Trigger requests
`/health` to keep the container active.

## Prerequisites

- The `pizzalord.online` zone is active in the Cloudflare account you deploy to.
- Docker Desktop (or another Docker-compatible engine) is running.
- The Discord bot token and the monitored Discord user's ID are available.
- The bot has Discord's Presence and Message Content intents enabled and shares
  a server with the monitored user.
- The bot invite includes the `applications.commands` scope so slash commands
  can be registered.

## Deploy

From the repository root:

```sh
cd status-bot
npm ci
node ./node_modules/wrangler/bin/wrangler.js login
node ./node_modules/wrangler/bin/wrangler.js secret put DISCORD_TOKEN
node ./node_modules/wrangler/bin/wrangler.js secret put TARGET_USER_ID
node ./node_modules/wrangler/bin/wrangler.js secret put DISCORD_PUBLIC_KEY
npm run deploy
```

`npm run deploy` first checks that `wrangler.jsonc` includes the
`StatusContainer` image, its `STATUS_BOT` Durable Object binding, and the
required Durable Object export. Always deploy through this command so Wrangler
uploads the container configuration. Do not deploy the Worker with a raw API
script upload that omits its container metadata; the local preflight cannot
protect deployments that bypass this command.

Wrangler prompts for each value. Keep runtime values out of `wrangler.jsonc`;
the target user ID and public key are not secrets in the same way as the bot
token.

On startup, the bot registers `/mrbeast` as a global command with both guild
and user installation enabled. This allows the command to be used in servers
where the bot itself has not been added, after the app has been installed to a
user account. Global commands can take up to an hour to propagate.

`/status` posts an embed with the monitored user's current cached status and
activity. Its **Refresh** button redraws the embed from the latest presence
event received by the bot. The bot's global activity remains **Watching the
status**; Discord bots cannot show a separate presence for each viewer or use
the Social SDK party and join-secret fields from the sample.

To send a welcome DM when someone installs the app to their account, set
`DISCORD_PUBLIC_KEY` to the application's public key from **General
Information** in the Discord Developer Portal. On the portal's **Webhooks**
page, set the endpoint URL to
`https://status.pizzalord.online/discord-events`, enable webhook events, and
subscribe to `APPLICATION_AUTHORIZED`. The endpoint verifies Discord's
Ed25519 signatures and only sends DMs for user installs; server installs are
ignored. A welcome DM is not sent when the user has DMs unavailable.

The bot also registers `/image` for servers and user-installed private-channel
contexts, including group DMs. `/image overlay member:@person overlay:<option>`
sends a circular PNG with the selected Pride flag blended with color-adaptive
opacity from 35% to 55%. Opacity increases where the overlay and avatar colors
contrast strongly and decreases where they are similar. Choose Rainbow Pride,
Bisexual, Aroace, Transgender, Pansexual, or Lesbian. To use a camera-roll
image, choose **Choose your own overlay** and attach an image up to 50 MB.
Uploads over 8 MB are automatically compressed to 8 MB or less. The selected
member must have opted in, unless you select yourself. The generated image is
posted publicly in the channel.

All six Pride flag images are included in the container image.

In the Discord Developer Portal, enable **User Install** under Installation
and enable the `Guild Install` and `User Install` integration types for the
command. Configure the user-install link to include the `applications.commands`
scope, then install the app to your own account with that link. This lets you
use `/image` without adding the bot to the server or group DM; the bot process
must still be online to respond. `/image` supports the private-channel context
for user-installed use in group DMs. User installation does not give the app
permission to read or send arbitrary messages; commands only respond to their
interactions.

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
