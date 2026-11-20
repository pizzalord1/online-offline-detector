const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStatusMessage,
  STATUS_REFRESH_BUTTON_ID,
} = require('../status-embed');

test('creates a status embed with activity, avatar, and refresh button', () => {
  const message = createStatusMessage({
    userId: '123456789012345678',
    status: 'dnd',
    avatarURL: 'https://cdn.example/avatar.png',
    activity: {
      typeName: 'Playing',
      name: 'Chess',
      details: 'A match',
      state: 'Ranked',
    },
  });
  const embed = message.embeds[0].toJSON();
  const button = message.components[0].components[0].toJSON();

  assert.equal(
    embed.description,
    '<@123456789012345678> is currently **Do Not Disturb**.'
  );
  assert.equal(embed.thumbnail.url, 'https://cdn.example/avatar.png');
  assert.equal(embed.fields[0].value, 'Playing: Chess\nA match\nRanked');
  assert.equal(button.custom_id, STATUS_REFRESH_BUTTON_ID);
  assert.deepEqual(message.allowedMentions, { parse: [] });
});

test('shows a fallback for unknown status and missing activity', () => {
  const message = createStatusMessage({
    userId: '123456789012345678',
    status: 'unknown',
    activity: null,
  });
  const embed = message.embeds[0].toJSON();

  assert.match(embed.description, /\*\*Unknown\*\*/);
  assert.equal(embed.fields[0].value, 'No activity detected.');
  assert.equal(embed.thumbnail, undefined);
});
