# online-offline-detector

A lightweight Discord bot that displays a user's online status.

## Run locally

From `status-bot`, install dependencies with `npm ci`, set `DISCORD_TOKEN` and
`TARGET_USER_ID` in a `.env` file, then run `npm start`. The server listens on
port `3000` by default.

The bot needs the Presence Intent enabled in the Discord Developer Portal and
the Message Content Intent enabled to respond to `meow`. It must share a server
with the user being monitored.

## Deploy on Render

Create a Web Service with `status-bot` as its root directory, `npm ci` as the
build command, and `npm start` as the start command. Set `DISCORD_TOKEN` and
`TARGET_USER_ID` as environment variables. Render's assigned `PORT` is used
automatically, and `/health` can be used as the health-check path.

## Deploy on Cloudflare

The bot can also run in a Cloudflare Container behind a Worker at
`status.pizzalord.online`. Follow [status-bot/DEPLOY.md](status-bot/DEPLOY.md)
for prerequisites, secret setup, deployment, and verification.
