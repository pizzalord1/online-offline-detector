require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const path = require('path');

const { DISCORD_TOKEN, TARGET_USER_ID } = process.env;
if (!DISCORD_TOKEN || !TARGET_USER_ID) {
  throw new Error('Set DISCORD_TOKEN and TARGET_USER_ID in the .env file.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
  ],
});

const app = express();
let currentStatus = 'offline';

client.once('ready', () => {
  console.log(`Bot online as ${client.user.tag}`);

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
    currentStatus = newPresence.status;
    console.log(`Status: ${oldPresence?.status} → ${newPresence.status}`);
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'status.html')));
app.get('/status', (req, res) => res.json({ status: currentStatus }));

app.listen(3000, () => console.log('Web server on http://localhost:3000'));

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Discord login failed:', error);
  process.exitCode = 1;
});