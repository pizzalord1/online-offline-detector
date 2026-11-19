const { createPublicKey, verify } = require('node:crypto');

const MAX_BODY_SIZE = 1024 * 1024;
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

class PayloadTooLargeError extends Error {}

function parseDiscordPublicKey(publicKey) {
  if (typeof publicKey !== 'string' || !/^[\da-f]{64}$/i.test(publicKey)) {
    throw new TypeError('DISCORD_PUBLIC_KEY must be a 32-byte hexadecimal key.');
  }

  return createPublicKey({
    key: Buffer.concat([
      ED25519_SPKI_PREFIX,
      Buffer.from(publicKey, 'hex'),
    ]),
    format: 'der',
    type: 'spki',
  });
}

function verifyDiscordSignature(body, timestamp, signature, publicKey) {
  if (
    typeof timestamp !== 'string' ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_TIMESTAMP_AGE_SECONDS ||
    typeof signature !== 'string' ||
    !/^[\da-f]{128}$/i.test(signature)
  ) {
    return false;
  }

  return verify(
    null,
    Buffer.concat([Buffer.from(timestamp), body]),
    publicKey,
    Buffer.from(signature, 'hex')
  );
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;

      if (size > MAX_BODY_SIZE) {
        settled = true;
        request.resume();
        reject(new PayloadTooLargeError('Discord webhook payload is too large.'));
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    request.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function respond(response, status) {
  response.writeHead(status);
  response.end();
}

async function handleDiscordWebhook(request, response, {
  publicKey,
  onApplicationAuthorized,
}) {
  if (request.method !== 'POST') {
    respond(response, 405);
    return;
  }

  if (!publicKey) {
    respond(response, 503);
    return;
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    respond(response, error instanceof PayloadTooLargeError ? 413 : 400);
    return;
  }

  if (
    !verifyDiscordSignature(
      body,
      request.headers['x-signature-timestamp'],
      request.headers['x-signature-ed25519'],
      publicKey
    )
  ) {
    respond(response, 401);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    respond(response, 400);
    return;
  }

  if (payload?.type === 0) {
    respond(response, 204);
    return;
  }

  if (payload?.type !== 1) {
    respond(response, 204);
    return;
  }

  respond(response, 204);

  if (payload.event?.type === 'APPLICATION_AUTHORIZED') {
    setImmediate(() => {
      Promise.resolve()
        .then(() => onApplicationAuthorized(payload.event.data))
        .catch(error => {
          console.error('Unable to process Discord app authorization event:', error);
        });
    });
  }
}

module.exports = {
  handleDiscordWebhook,
  parseDiscordPublicKey,
};
