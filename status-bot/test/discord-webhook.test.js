const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { generateKeyPairSync, sign } = require('node:crypto');

const {
  handleDiscordWebhook,
  parseDiscordPublicKey,
} = require('../discord-webhook');

const { privateKey, publicKey: generatedPublicKey } = generateKeyPairSync('ed25519');
const publicKeyDER = generatedPublicKey.export({
  format: 'der',
  type: 'spki',
});
const publicKey = parseDiscordPublicKey(publicKeyDER.subarray(-32).toString('hex'));

async function withWebhookServer(onApplicationAuthorized, run) {
  const server = createServer((request, response) => {
    void handleDiscordWebhook(request, response, {
      publicKey,
      onApplicationAuthorized,
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

function createSignedRequest(
  url,
  payload,
  { timestamp = String(Math.floor(Date.now() / 1000)), valid = true } = {}
) {
  const body = JSON.stringify(payload);
  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]);
  const signature = sign(null, message, privateKey);

  if (!valid) signature[0] ^= 0xff;

  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-timestamp': timestamp,
      'x-signature-ed25519': signature.toString('hex'),
    },
    body,
  });
}

test('acknowledges Discord pings with 204', async () => {
  let callbackCount = 0;
  await withWebhookServer(
    () => {
      callbackCount += 1;
    },
    async url => {
      const response = await createSignedRequest(url, { type: 0 });
      assert.equal(response.status, 204);
    }
  );
  assert.equal(callbackCount, 0);
});

test('acknowledges an application authorization and dispatches its event data', async () => {
  let resolveAuthorization;
  const authorization = new Promise(resolve => {
    resolveAuthorization = resolve;
  });
  const data = {
    integration_type: 1,
    user: { id: '123456789012345678' },
  };

  await withWebhookServer(resolveAuthorization, async url => {
    const response = await createSignedRequest(url, {
      type: 1,
      event: { type: 'APPLICATION_AUTHORIZED', data },
    });

    assert.equal(response.status, 204);
    assert.deepEqual(await authorization, data);
  });
});

test('rejects invalid signatures and stale timestamps', async () => {
  let callbackCount = 0;
  await withWebhookServer(
    () => {
      callbackCount += 1;
    },
    async url => {
      const payload = { type: 1, event: { type: 'APPLICATION_AUTHORIZED', data: {} } };
      const invalidSignature = await createSignedRequest(url, payload, {
        valid: false,
      });
      const staleTimestamp = await createSignedRequest(url, payload, {
        timestamp: String(Math.floor(Date.now() / 1000) - 600),
      });

      assert.equal(invalidSignature.status, 401);
      assert.equal(staleTimestamp.status, 401);
    }
  );
  assert.equal(callbackCount, 0);
});
