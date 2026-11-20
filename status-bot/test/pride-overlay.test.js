const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const sharp = require('sharp');

const { createPrideAvatar } = require('../pride-overlay');

const flagPath = join(__dirname, '..', 'pride flag.webp');
const additionalFlagPaths = [
  'Bisexual-Pride-flag.webp',
  'aroace-flag.webp',
  'trans-flag.webp',
  'pan-flag.webp',
].map(filename => join(__dirname, '..', filename));

async function createWhiteAvatar() {
  return sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background: '#ffffff',
    },
  })
    .png()
    .toBuffer();
}

test('creates a circular 512px avatar with the flag blended over it', async () => {
  const avatar = await createWhiteAvatar();
  const output = await createPrideAvatar(avatar, flagPath);
  const { data, info } = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(info.width, 512);
  assert.equal(info.height, 512);
  assert.equal(data[3], 0);

  const flagPixel = (128 * info.width + 256) * info.channels;
  assert.equal(data[flagPixel + 3], 255);
  assert.ok(data[flagPixel] > data[flagPixel + 1]);
  assert.ok(data[flagPixel + 1] > 100);
});

for (const additionalFlagPath of additionalFlagPaths) {
  test(`creates an overlay using ${additionalFlagPath.split('/').pop()}`, async () => {
    const output = await createPrideAvatar(
      await createWhiteAvatar(),
      additionalFlagPath
    );
    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.equal(info.width, 512);
    assert.equal(info.height, 512);
    const flagPixel = (64 * info.width + 256) * info.channels;
    assert.equal(data[flagPixel + 3], 255);
    assert.ok(
      data[flagPixel] < 255 ||
        data[flagPixel + 1] < 255 ||
        data[flagPixel + 2] < 255
    );
  });
}

test('rejects an empty avatar buffer', async () => {
  await assert.rejects(
    createPrideAvatar(Buffer.alloc(0), flagPath),
    {
      name: 'TypeError',
      message: 'Avatar image must be a non-empty Buffer.',
    }
  );
});
