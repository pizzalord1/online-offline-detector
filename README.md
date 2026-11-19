# online-offline-detector

A lightweight Discord bot that displays a user's online status.

## Run locally

From `status-bot`, install dependencies with `npm ci`, set `DISCORD_TOKEN`,
`TARGET_USER_ID`, and `DISCORD_PUBLIC_KEY` in a `.env` file, then run
`npm start`. The server listens on port `3000` by default.

To DM users who install the app to their accounts, configure the Discord
Developer Portal's Webhooks endpoint as `/discord-events` on your public URL,
enable webhook events, and subscribe to `APPLICATION_AUTHORIZED`. The public
key is listed under General Information in the portal.

The bot needs the Presence Intent enabled in the Discord Developer Portal and
the Message Content Intent enabled to respond to `meow`. It must share a server
with the user being monitored.

## Deploy on Render

Create a Web Service with `status-bot` as its root directory, `npm ci` as the
build command, and `npm start` as the start command. Set `DISCORD_TOKEN`,
`TARGET_USER_ID`, and `DISCORD_PUBLIC_KEY` as environment variables. Render's
assigned `PORT` is used automatically, and `/health` can be used as the
health-check path.

## Deploy on Cloudflare

The bot can also run in a Cloudflare Container behind a Worker at
`status.pizzalord.online`. Follow [status-bot/DEPLOY.md](status-bot/DEPLOY.md)
for prerequisites, secret setup, deployment, and verification.
