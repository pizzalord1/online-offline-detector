import { DurableObject } from 'cloudflare:workers';

const CONTAINER_PORT = 3000;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const HEALTH_CHECK_ATTEMPTS = 40;
const HEALTH_CHECK_INTERVAL_MS = 500;
const OAUTH_REDIRECT_URI = 'https://status.pizzalord.online/oauth/callback';
const OAUTH_STATE_COOKIE = 'discord_oauth_state';
const AVATAR_DECORATION_STORAGE_KEY = 'avatarDecorationAsset';
const CONTAINER_IMAGE_STORAGE_KEY = 'containerImage';
const DISCORD_PUBLIC_KEY_STORAGE_KEY = 'discordPublicKey';

export class StatusContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.starting = undefined;

    const container = ctx.container;
    if (container?.running) {
      void ctx
        .blockConcurrencyWhile(() =>
          container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS)
        )
        .catch(error => {
          console.error('Unable to restore container inactivity timeout:', error);
        });
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/oauth/connect') {
      return this.startOAuth(request);
    }

    if (url.pathname === '/oauth/callback') {
      return this.finishOAuth(request, url);
    }

    await this.ensureContainerReady();

    const pathname = url.pathname;
    url.protocol = 'http:';
    url.host = 'container';

    const forwardedRequest = new Request(url, request);
    forwardedRequest.headers.delete('host');

    const response = await this.ctx.container
      .getTcpPort(CONTAINER_PORT)
      .fetch(forwardedRequest);
    if (!response) {
      return new Response('Status container returned no response.', {
        status: 502,
      });
    }

    if (pathname !== '/status' || !response.ok) {
      return response;
    }

    const avatarDecorationAsset = await this.ctx.storage.get(
      AVATAR_DECORATION_STORAGE_KEY
    );
    if (typeof avatarDecorationAsset !== 'string') {
      return response;
    }

    const status = await response.json();
    status.avatarDecoration = getAvatarDecorationURL(avatarDecorationAsset);

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store');

    return new Response(JSON.stringify(status), {
      status: response.status,
      headers,
    });
  }

  startOAuth(request) {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!this.hasOAuthConfiguration()) {
      return oauthPage(
        'OAuth is not configured on the status service yet.',
        503
      );
    }

    const state = createOAuthState();
    const authorizeURL = new URL('https://discord.com/oauth2/authorize');
    authorizeURL.search = new URLSearchParams({
      client_id: this.env.DISCORD_OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state,
    }).toString();

    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizeURL.toString(),
        'Cache-Control': 'no-store',
        'Set-Cookie': `${OAUTH_STATE_COOKIE}=${state}; Path=/oauth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  }

  async finishOAuth(request, url) {
    const clearStateCookie =
      `${OAUTH_STATE_COOKIE}=; Path=/oauth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': clearStateCookie,
    });
    const page = (message, status) =>
      new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>Discord connection</title><p>${message}</p><a href="/">Return to status</a></html>`,
        { status, headers }
      );

    if (request.method !== 'GET') {
      return page('Method not allowed.', 405);
    }

    if (!this.hasOAuthConfiguration()) {
      return page('OAuth is not configured on the status service yet.', 503);
    }

    const stateCookie = getCookie(request, OAUTH_STATE_COOKIE);
    const state = url.searchParams.get('state');
    if (!stateCookie || !state || stateCookie !== state) {
      return page('The sign-in request expired or could not be verified. Please try again.', 400);
    }

    if (url.searchParams.has('error')) {
      return page('Discord authorization was canceled.', 400);
    }

    const code = url.searchParams.get('code');
    if (!code) {
      return page('Discord did not return an authorization code. Please try again.', 400);
    }

    let tokenResponse;
    try {
      tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.env.DISCORD_OAUTH_CLIENT_ID,
          client_secret: this.env.DISCORD_OAUTH_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: OAUTH_REDIRECT_URI,
        }),
      });
    } catch (error) {
      console.error('Discord OAuth token exchange request failed:', error);
      return page('Could not contact Discord to complete sign-in. Please try again.', 502);
    }

    if (!tokenResponse.ok) {
      console.error(
        `Discord OAuth token exchange failed with HTTP ${tokenResponse.status}.`
      );
      return page('Discord could not complete sign-in. Please try again.', 502);
    }

    let tokenData;
    try {
      tokenData = await tokenResponse.json();
    } catch (error) {
      console.error('Discord OAuth token response was invalid:', error);
      return page('Discord returned an invalid sign-in response. Please try again.', 502);
    }

    if (typeof tokenData?.access_token !== 'string') {
      console.error('Discord OAuth token response did not include an access token.');
      return page('Discord returned an invalid sign-in response. Please try again.', 502);
    }

    let profileResponse;
    try {
      profileResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
    } catch (error) {
      console.error('Discord profile request failed:', error);
      return page('Could not retrieve your Discord profile. Please try again.', 502);
    }

    if (!profileResponse.ok) {
      console.error(
        `Discord profile request failed with HTTP ${profileResponse.status}.`
      );
      return page('Could not retrieve your Discord profile. Please try again.', 502);
    }

    let profile;
    try {
      profile = await profileResponse.json();
    } catch (error) {
      console.error('Discord profile response was invalid:', error);
      return page('Discord returned an invalid profile response. Please try again.', 502);
    }

    if (profile?.id !== this.env.TARGET_USER_ID) {
      return page('You signed in with a different Discord account than the monitored account.', 403);
    }

    const asset = profile.avatar_decoration_data?.asset;
    if (typeof asset === 'string' && asset.length > 0) {
      await this.ctx.storage.put(AVATAR_DECORATION_STORAGE_KEY, asset);
    } else {
      await this.ctx.storage.delete(AVATAR_DECORATION_STORAGE_KEY);
    }

    return new Response(null, {
      status: 303,
      headers: {
        Location: '/?oauth=connected',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': clearStateCookie,
      },
    });
  }

  hasOAuthConfiguration() {
    return Boolean(
      this.env.DISCORD_OAUTH_CLIENT_ID &&
      this.env.DISCORD_OAUTH_CLIENT_SECRET &&
      this.env.TARGET_USER_ID
    );
  }

  async ensureContainerReady() {
    const container = this.ctx.container;
    if (!container) {
      throw new Error('No container is configured for StatusContainer.');
    }

    this.starting ??= this.startAndWaitForHealth(container).finally(() => {
      this.starting = undefined;
    });

    await this.starting;
  }

  async startAndWaitForHealth(container) {
    if (!this.env.DISCORD_TOKEN || !this.env.TARGET_USER_ID) {
      throw new Error('Set DISCORD_TOKEN and TARGET_USER_ID as Worker secrets.');
    }

    const deployedImage = container.images.base;
    const previousImage = await this.ctx.storage.get(CONTAINER_IMAGE_STORAGE_KEY);
    const configuredPublicKey = this.env.DISCORD_PUBLIC_KEY || '';
    const previousPublicKey =
      (await this.ctx.storage.get(DISCORD_PUBLIC_KEY_STORAGE_KEY)) || '';
    const runningContainer = await container.inspect();
    const imageChanged =
      previousImage !== deployedImage ||
      (runningContainer?.image && runningContainer.image !== deployedImage);
    const publicKeyChanged = previousPublicKey !== configuredPublicKey;
    const containerChanged = imageChanged || publicKeyChanged;

    if (containerChanged && container.running) {
      await container.destroy('Container image or Discord public key updated');
    }

    if (containerChanged || !container.running) {
      container.start({
        image: deployedImage,
        instance: 'lite',
        enableInternet: true,
        env: {
          DISCORD_TOKEN: this.env.DISCORD_TOKEN,
          DISCORD_PUBLIC_KEY: this.env.DISCORD_PUBLIC_KEY,
          TARGET_USER_ID: this.env.TARGET_USER_ID,
          PORT: String(CONTAINER_PORT),
        },
      });
    }

    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(CONTAINER_PORT);
    let lastError;

    for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt += 1) {
      try {
        const response = await port.fetch('http://container/health', {
          signal: AbortSignal.timeout(1000),
        });
        if (!response) {
          throw new Error('Container health check returned no response.');
        }
        await response.body?.cancel();

        if (response.ok) {
          await this.ctx.storage.put(CONTAINER_IMAGE_STORAGE_KEY, deployedImage);
          await this.ctx.storage.put(
            DISCORD_PUBLIC_KEY_STORAGE_KEY,
            configuredPublicKey
          );
          return;
        }

        lastError = new Error(`Health check failed with HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
      }

      await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
    }

    throw new Error('Status bot container did not become healthy.', {
      cause: lastError,
    });
  }
}

function createOAuthState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }

  return null;
}

function getAvatarDecorationURL(asset) {
  return `https://cdn.discordapp.com/avatar-decoration-presets/${encodeURIComponent(asset)}.png?size=128`;
}

function oauthPage(message, status) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Discord connection</title></head><body><p>${message}</p><a href="/">Return to status</a></body></html>`,
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
      },
    }
  );
}

function getStatusBotStub(env) {
  const id = env.STATUS_BOT.idFromName('discord-status-bot');
  return env.STATUS_BOT.get(id);
}

export default {
  async fetch(request, env) {
    const response = await getStatusBotStub(env).fetch(request);
    if (!response) {
      return new Response('Status service returned no response.', {
        status: 502,
      });
    }
    return response;
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const response = await getStatusBotStub(env).fetch(
          new Request('https://status-bot.internal/health')
        );
        if (!response) {
          throw new Error('Container keep-alive returned no response.');
        }
        await response.body?.cancel();

        if (!response.ok) {
          throw new Error(`Container keep-alive failed with HTTP ${response.status}.`);
        }
      })()
    );
  },
};
