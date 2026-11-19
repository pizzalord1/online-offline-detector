require('dotenv').config();

const { createReadStream, readFileSync } = require('fs');
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
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  ],
});

let currentStatus = 'offline';
let currentAvatarURL = null;
let currentAvatarDecorationURL = null;

let currentActivity = {
  type: null,
  typeName: null,
  name: null,
  details: null,
  state: null,
};

const ActivityTypeNames = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening',
  3: 'Watching',
  4: 'Custom Status',
  5: 'Competing',
};

function updateActivity(presence) {
  if (!presence) {
    currentActivity = {
      type: null,
      typeName: null,
      name: null,
      details: null,
      state: null,
    };
    return;
  }

  const activity =
    presence.activities.find(a => a.type !== 4) ||
    presence.activities[0];

  if (!activity) {
    currentActivity = {
      type: null,
      typeName: null,
      name: null,
      details: null,
      state: null,
    };
    return;
  }

  currentActivity = {
    type: activity.type,
    typeName: ActivityTypeNames[activity.type] || 'Unknown',
    name: activity.name || null,
    details: activity.details || null,
    state: activity.state || null,
  };
}

client.once('ready', async () => {
  console.log(`Bot online as ${client.user.tag}`);

  try {
    const user = await client.users.fetch(TARGET_USER_ID, { force: true });

    currentAvatarURL = user.displayAvatarURL({
      size: 128,
      extension: 'png',
    });
    currentAvatarDecorationURL = user.avatarDecorationURL();
  } catch (error) {
    console.error(
      `Unable to fetch avatar for user ${TARGET_USER_ID}:`,
      error
    );
  }

  for (const guild of client.guilds.cache.values()) {
    const presence = guild.presences.cache.get(TARGET_USER_ID);

    if (presence) {
      currentStatus = presence.status;
      updateActivity(presence);

      console.log(`Initial status: ${currentStatus}`);
      console.log('Initial activity:', currentActivity);

      return;
    }
  }

  console.warn(
    'No online presence was cached at startup; status is displayed as offline.'
  );
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (newPresence.userId !== TARGET_USER_ID) return;

  const previousStatus = currentStatus;

  currentStatus = newPresence.status;
  updateActivity(newPresence);

  if (previousStatus !== currentStatus) {
    console.log(`Status: ${previousStatus} -> ${currentStatus}`);
  }

  console.log('Updated activity:', currentActivity);
});

client.on('messageCreate', async message => {
  if (
    message.author.bot ||
    !message.guild ||
    message.content.trim().toLowerCase() !== 'meow'
  ) {
    return;
  }

  try {
    await message.reply({
      content: 'Meow!',
      allowedMentions: { repliedUser: false },
    });
  } catch (error) {
    console.error('Unable to reply to meow message:', error);
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

  if (req.method === 'GET' && pathname === '/IMG_2094.JPG') {
    const icon = createReadStream(
      join(__dirname, '..', 'IMG_2094.JPG')
    );

    icon.on('error', error => {
      console.error('Unable to serve image:', error);

      if (!res.headersSent) {
        res.writeHead(404);
      }

      res.end();
    });

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    });

    icon.pipe(res);
    return;
  }

  if (req.method === 'GET' && pathname === '/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });

    res.end(
      JSON.stringify({
        status: currentStatus,
        avatar: currentAvatarURL,
        avatarDecoration: currentAvatarDecorationURL,
        activity: currentActivity,
      })
    );

    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
    });

    res.end('ok');
    return;
  }

  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
  });

  res.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Web server listening on port ${port}`);
});

client.login(DISCORD_TOKEN).catch(error => {
  console.error('Discord login failed:', error);
  process.exitCode = 1;
});
