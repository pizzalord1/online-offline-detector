// created by pizzasgrave on discord. Code is open source and can be found at https://github.com/pizzalord1/online-offline-detector

require('dotenv').config();

const { createReadStream, readFileSync } = require('fs');
const { createServer } = require('http');
const { join } = require('path');
const {
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
} = require('discord.js');
const { createPrideAvatar } = require('./pride-overlay');

const { DISCORD_TOKEN, TARGET_USER_ID } = process.env;
const MR_BEAST_GIF_URL = 'https://klipy.com/gifs/mrbeast-29';
const PRIDE_FLAG_PATH = join(__dirname, 'pride flag.webp');
const prideOptIns = new Set();

const slashCommands = [
  new SlashCommandBuilder()
    .setName('mrbeast')
    .setDescription('Send the MrBeast GIF')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2),
  new SlashCommandBuilder()
    .setName('meow')
    .setDescription('Make the bot meow')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2),
  new SlashCommandBuilder()
    .setName('pride')
    .setDescription('Create a Pride overlay for an opted-in member')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 2)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Allow others to create a Pride overlay for your avatar')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Revoke permission to create a Pride overlay for your avatar')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('overlay')
        .setDescription('Create an overlay for yourself or an opted-in member')
        .addUserOption(option =>
          option
            .setName('member')
            .setDescription('Member whose avatar to use')
            .setRequired(true)
        )
    ),
];

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
    typeName: ActivityTypeNames[activity.type] || 'unknown',
    name: activity.name || null,
    details: activity.details || null,
    state: activity.state || null,
  };
}

async function registerSlashCommands() {
  await client.application.commands.set(
    slashCommands.map(command => command.toJSON())
  );
  console.log('global slash commands registered');
}

client.once('ready', async () => {
  console.log(`Bot online as ${client.user.tag}`);

  try {
  await registerSlashCommands();
  } catch (error) {
    console.error('unable to register slash commands:', error);
  }

  try {
    const user = await client.users.fetch(TARGET_USER_ID, { force: true });

    currentAvatarURL = user.displayAvatarURL({
      size: 128,
      extension: 'png',
    });
    currentAvatarDecorationURL = user.avatarDecorationURL();
  } catch (error) {
    console.error(
      `unable to fetch avatar for user ${TARGET_USER_ID}:`,
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
    'no online presence was cached at startup; status is displayed as offline.'
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
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim().toLowerCase();
  const reply =
    content === 'meow'
      ? 'Meow!'
      : /\bmr\s+beast\b/.test(content)
        ? MR_BEAST_GIF_URL
        : null;

  if (!reply) return;

  try {
    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: true },
    });
  } catch (error) {
    console.error('Unable to reply to message trigger:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'mrbeast') {
      await interaction.reply(MR_BEAST_GIF_URL);
      return;
    }

    if (interaction.commandName === 'meow') {
      await interaction.reply('Meow!');
      return;
    }

    if (interaction.commandName === 'pride') {
      const consentScope = interaction.guildId ?? interaction.channelId;
      if (!consentScope) {
        await interaction.reply({
          content: 'Use this command in a server or group chat.',
          ephemeral: true,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      const consentKey = `${consentScope}:${interaction.user.id}`;

      if (subcommand === 'enable') {
        prideOptIns.add(consentKey);
        await interaction.reply({
          content: 'You opted in. Others may now create a Pride overlay for your avatar in this conversation.',
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'disable') {
        prideOptIns.delete(consentKey);
        await interaction.reply({
          content: 'You opted out. Others can no longer create a Pride overlay for your avatar in this conversation.',
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'overlay') {
        const member = interaction.options.getUser('member', true);
        if (
          member.id !== interaction.user.id &&
          !prideOptIns.has(`${consentScope}:${member.id}`)
        ) {
          await interaction.reply({
            content: 'That member has not opted in. They can run `/pride enable` first.',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply();

        const avatarResponse = await fetch(
          member.displayAvatarURL({ size: 512, extension: 'png' }),
          {
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!avatarResponse.ok) {
          throw new Error(`Discord avatar request failed with HTTP ${avatarResponse.status}.`);
        }

        const contentType = avatarResponse.headers.get('content-type') || '';
        const contentLength = Number(avatarResponse.headers.get('content-length'));
        if (
          !contentType.startsWith('image/') ||
          (Number.isFinite(contentLength) && contentLength > 8 * 1024 * 1024)
        ) {
          throw new Error('Discord returned an invalid or oversized avatar image.');
        }

        const avatar = Buffer.from(await avatarResponse.arrayBuffer());
        if (avatar.length > 8 * 1024 * 1024) {
          throw new Error('Discord returned an oversized avatar image.');
        }

        const image = await createPrideAvatar(avatar, PRIDE_FLAG_PATH);
        await interaction.editReply({
          content: `Pride overlay for <@${member.id}>`,
          files: [
            new AttachmentBuilder(image, { name: 'pride-avatar.png' }),
          ],
          allowedMentions: { parse: [] },
        });
      }
    }
  } catch (error) {
    console.error('Unable to reply to slash command:', error);
    if (interaction.isRepliable()) {
      const response = {
        content: 'Unable to run this slash command. Please try again later.',
      };

      try {
        if (interaction.deferred) {
          await interaction.editReply(response);
        } else if (!interaction.replied) {
          await interaction.reply({ ...response, ephemeral: true });
        }
      } catch (replyError) {
        console.error('Unable to report slash command failure:', replyError);
      }
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
