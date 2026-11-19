const sharp = require('sharp');

const AVATAR_SIZE = 512;
const FLAG_OPACITY = 0.32;

async function createPrideAvatar(avatar, flagPath) {
  if (!Buffer.isBuffer(avatar) || avatar.length === 0) {
    throw new TypeError('Avatar image must be a non-empty Buffer.');
  }

  const [avatarImage, flagImage] = await Promise.all([
    sharp(avatar)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .png()
      .toBuffer(),
    sharp(flagPath)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .removeAlpha()
      .ensureAlpha(FLAG_OPACITY)
      .png()
      .toBuffer(),
  ]);
  const circularMask = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/></svg>`
  );

  return sharp(avatarImage)
    .composite([
      { input: flagImage, blend: 'over' },
      { input: circularMask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

module.exports = { createPrideAvatar };
