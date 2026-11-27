const sharp = require('sharp');

const AVATAR_SIZE = 512;
const MIN_FLAG_OPACITY = 0.35;
const MAX_FLAG_OPACITY = 0.55;
const MAX_COLOR_DISTANCE = Math.sqrt(3 * 255 ** 2);
const MAX_OVERLAY_PIXELS = 40_000_000;

async function compressOverlayToLimit(image, maxBytes) {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new TypeError('Overlay image must be a non-empty Buffer.');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError('Maximum overlay size must be a positive safe integer.');
  }

  for (const dimension of [512, 384, 256, 128, 64]) {
    for (const quality of [90, 75, 60, 45, 30]) {
      const compressed = await sharp(image, {
        limitInputPixels: MAX_OVERLAY_PIXELS,
      })
        .rotate()
        .resize(dimension, dimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality, alphaQuality: 100, effort: 4 })
        .toBuffer();

      if (compressed.length <= maxBytes) return compressed;
    }
  }

  throw new Error('Unable to compress uploaded overlay to the required size.');
}

async function createAdaptiveOverlayImage(avatarImage, overlayImage) {
  const [avatarPixels, overlayPixels] = await Promise.all([
    sharp(avatarImage).ensureAlpha().raw().toBuffer(),
    sharp(overlayImage)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);

  for (let offset = 0; offset < overlayPixels.length; offset += 4) {
    const redDifference = avatarPixels[offset] - overlayPixels[offset];
    const greenDifference =
      avatarPixels[offset + 1] - overlayPixels[offset + 1];
    const blueDifference = avatarPixels[offset + 2] - overlayPixels[offset + 2];
    const colorDistance = Math.sqrt(
      redDifference ** 2 +
        greenDifference ** 2 +
        blueDifference ** 2
    );
    const contrast = colorDistance / MAX_COLOR_DISTANCE;
    const opacity =
      MIN_FLAG_OPACITY +
      contrast * (MAX_FLAG_OPACITY - MIN_FLAG_OPACITY);

    overlayPixels[offset + 3] = Math.round(
      overlayPixels[offset + 3] * opacity
    );
  }

  return sharp(overlayPixels, {
    raw: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function createImageOverlay(avatar, overlayImage) {
  if (!Buffer.isBuffer(avatar) || avatar.length === 0) {
    throw new TypeError('Avatar image must be a non-empty Buffer.');
  }

  const avatarImage = await sharp(avatar)
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .png()
    .toBuffer();
  const adaptiveOverlayImage = await createAdaptiveOverlayImage(
    avatarImage,
    overlayImage
  );
  const circularMask = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/></svg>`
  );

  return sharp(avatarImage)
    .composite([
      { input: adaptiveOverlayImage, blend: 'over' },
      { input: circularMask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

module.exports = { compressOverlayToLimit, createImageOverlay };
