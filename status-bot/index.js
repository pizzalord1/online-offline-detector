require('dotenv').config();
const { readFileSync } = require('fs');
const { createServer } = require('http');
const { join } = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const { DISCORD_TOKEN, TARGET_USER_ID } = process.env;
if (!DISCORD_TOKEN || !TARGET_USER_ID) {
  throw new Error('Set DISCORD_TOKEN and TARGET_USER_ID in the environment.');
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid port number.');
}

const statusPage = readFileSync(join(__dirname, 'status.html'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
  ],
});

let currentStatus = 'offline';
let currentAvatarURL = null;

client.once('ready', () => {
  console.log(`Bot online as ${client.user.tag}`);

  client.users.fetch(TARGET_USER_ID)
    .then((user) => {
      currentAvatarURL = user.displayAvatarURL({ size: 128 });
    })
    .catch((error) => {
      console.error(`Unable to fetch avatar for user ${TARGET_USER_ID}:`, error);
    });

  for (const guild of client.guilds.cache.values()) {
    const presence = guild.presences.cache.get(TARGET_USER_ID);
    if (presence) {
      currentStatus = presence.status;
      console.log(`Initial status: ${currentStatus}`);
      return;
    }
  }

  console.warn('No online presence was cached at startup; status is displayed as offline. Check that the bot shares a server with the user and has Presence Intent enabled.');
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (newPresence.userId === TARGET_USER_ID) {
    const previousStatus = currentStatus;
    currentStatus = newPresence.status;
    if (previousStatus !== currentStatus) {
      console.log(`Status: ${previousStatus} → ${currentStatus}`);
    }
  }
});

const server = createServer((req, res) => {
  const pathname = req.url?.split('?')[0];

  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(statusPage);
    return;
  }

  if (req.method === 'GET' && pathname === '/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      status: currentStatus,
      avatar: currentAvatarURL,
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, () => console.log(`Web server listening on port ${port}`));

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Discord login failed:', error);
  process.exitCode = 1;
});