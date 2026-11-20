const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const STATUS_REFRESH_BUTTON_ID = 'status:refresh';

const STATUS_DISPLAY = {
  online: { label: 'Online', color: 0x57f287 },
  idle: { label: 'Idle', color: 0xfee75c },
  dnd: { label: 'Do Not Disturb', color: 0xed4245 },
  offline: { label: 'Offline', color: 0x747f8d },
};

function createStatusMessage({ userId, status, avatarURL, activity }) {
  const statusDisplay = STATUS_DISPLAY[status] || {
    label: 'Unknown',
    color: 0x5865f2,
  };
  const activityLines = [
    activity?.typeName && activity.name
      ? `${activity.typeName}: ${activity.name}`
      : activity?.name || activity?.typeName,
    activity?.details,
    activity?.state,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(statusDisplay.color)
    .setTitle('Discord Status')
    .setDescription(`<@${userId}> is currently **${statusDisplay.label}**.`)
    .addFields({
      name: 'Activity',
      value: activityLines.join('\n').slice(0, 1024) || 'No activity detected.',
    })
    .setTimestamp();

  if (avatarURL) {
    embed.setThumbnail(avatarURL);
  }

  const refreshButton = new ButtonBuilder()
    .setCustomId(STATUS_REFRESH_BUTTON_ID)
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(refreshButton)],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  createStatusMessage,
  STATUS_REFRESH_BUTTON_ID,
};
