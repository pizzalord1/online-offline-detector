const sharp = require('sharp');

const AVATAR_SIZE = 512;
const MIN_FLAG_OPACITY = 0.35;
const MAX_FLAG_OPACITY = 0.55;
const MAX_COLOR_DISTANCE = Math.sqrt(3 * 255 ** 2);

async function createAdaptiveFlagImage(avatarImage, flagPath) {
  const [avatarPixels, flagPixels] = await Promise.all([
    sharp(avatarImage).ensureAlpha().raw().toBuffer(),
    sharp(flagPath)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .removeAlpha()
      .ensureAlpha(1)
      .raw()
      .toBuffer(),
  ]);

  for (let offset = 0; offset < flagPixels.length; offset += 4) {
    const redDifference = avatarPixels[offset] - flagPixels[offset];
    const greenDifference = avatarPixels[offset + 1] - flagPixels[offset + 1];
    const blueDifference = avatarPixels[offset + 2] - flagPixels[offset + 2];
    const colorDistance = Math.sqrt(
      redDifference ** 2 +
        greenDifference ** 2 +
        blueDifference ** 2
    );
    const contrast = colorDistance / MAX_COLOR_DISTANCE;
    const opacity =
      MIN_FLAG_OPACITY +
      contrast * (MAX_FLAG_OPACITY - MIN_FLAG_OPACITY);

    flagPixels[offset + 3] = Math.round(opacity * 255);
  }

  return sharp(flagPixels, {
    raw: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function createPrideAvatar(avatar, flagPath) {
  if (!Buffer.isBuffer(avatar) || avatar.length === 0) {
    throw new TypeError('Avatar image must be a non-empty Buffer.');
  }

  const avatarImage = await sharp(avatar)
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .png()
    .toBuffer();
  const adaptiveFlagImage = await createAdaptiveFlagImage(avatarImage, flagPath);
  const circularMask = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/></svg>`
  );

  return sharp(avatarImage)
    .composite([
      { input: adaptiveFlagImage, blend: 'over' },
      { input: circularMask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

module.exports = { createPrideAvatar };
