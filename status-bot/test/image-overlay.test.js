const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { join } = require('node:path');
const sharp = require('sharp');

const {
  compressOverlayToLimit,
  createImageOverlay,
} = require('../image-overlay');

const flagPath = join(__dirname, '..', 'pride flag.webp');
const additionalFlagPaths = [
  'Bisexual-Pride-flag.webp',
  'aroace-flag.webp',
  'trans-flag.webp',
  'pan-flag.webp',
  'Lesbian-Pride-flag.webp',
].map(filename => join(__dirname, '..', filename));

async function createSolidAvatar(background) {
  return sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background,
    },
  })
    .png()
    .toBuffer();
}

async function createWhiteAvatar() {
  return createSolidAvatar('#ffffff');
}

test('creates a circular 512px avatar with the overlay blended over it', async () => {
  const avatar = await createWhiteAvatar();
  const output = await createImageOverlay(avatar, flagPath);
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
    const output = await createImageOverlay(
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

test('increases opacity when flag and avatar colors have strong contrast', async () => {
  const avatarColor = [0, 255, 255];
  const avatar = await createSolidAvatar({
    r: avatarColor[0],
    g: avatarColor[1],
    b: avatarColor[2],
  });
  const output = await createImageOverlay(avatar, flagPath);
  const outputPixels = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const flagPixels = await sharp(flagPath)
    .resize(512, 512, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const pixelOffset = (64 * 512 + 256);
  const outputRGB = Array.from(outputPixels.subarray(pixelOffset * 4, pixelOffset * 4 + 3));
  const flagRGB = Array.from(flagPixels.subarray(pixelOffset * 3, pixelOffset * 3 + 3));
  const fixedOpacityRGB = flagRGB.map(
    (channel, index) => channel * 0.35 + avatarColor[index] * 0.65
  );
  const colorDistance = color =>
    Math.hypot(...color.map((channel, index) => channel - flagRGB[index]));

  assert.ok(colorDistance(outputRGB) < colorDistance(fixedOpacityRGB));
});

test('rejects an empty avatar buffer', async () => {
  await assert.rejects(
    createImageOverlay(Buffer.alloc(0), flagPath),
    {
      name: 'TypeError',
      message: 'Avatar image must be a non-empty Buffer.',
    }
  );
});

test('accepts a user-uploaded image buffer as the overlay', async () => {
  const avatar = await createWhiteAvatar();
  const overlay = await sharp(flagPath).png().toBuffer();
  const output = await createImageOverlay(avatar, overlay);
  const { width, height } = await sharp(output).metadata();

  assert.equal(width, 512);
  assert.equal(height, 512);
});

test('preserves transparency in a user-uploaded PNG overlay', async () => {
  const avatar = await createWhiteAvatar();
  const overlay = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const output = await createImageOverlay(avatar, overlay);
  const { data, info } = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const centerPixel = (256 * info.width + 256) * info.channels;

  assert.deepEqual(Array.from(data.subarray(centerPixel, centerPixel + 3)), [
    255,
    255,
    255,
  ]);
});

test('compresses uploads larger than 8 MB to the configured size limit', async () => {
  const noisyPixels = randomBytes(2048 * 2048 * 3);
  const largeImage = await sharp(noisyPixels, {
    raw: { width: 2048, height: 2048, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const maxBytes = 8 * 1024 * 1024;

  assert.ok(largeImage.length > maxBytes);

  const compressed = await compressOverlayToLimit(largeImage, maxBytes);

  assert.ok(compressed.length <= maxBytes);
  assert.equal((await sharp(compressed).metadata()).format, 'webp');
});
