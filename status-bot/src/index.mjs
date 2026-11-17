import { DurableObject } from 'cloudflare:workers';

const CONTAINER_PORT = 3000;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const HEALTH_CHECK_ATTEMPTS = 40;
const HEALTH_CHECK_INTERVAL_MS = 500;

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
    await this.ensureContainerReady();

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';

    const forwardedRequest = new Request(url, request);
    forwardedRequest.headers.delete('host');

    return this.ctx.container.getTcpPort(CONTAINER_PORT).fetch(forwardedRequest);
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

    const runningContainer = await container.inspect();
    if (runningContainer?.image && runningContainer.image !== container.images.base) {
      await container.destroy('Container image updated');
    }

    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: 'lite',
        enableInternet: true,
        env: {
          DISCORD_TOKEN: this.env.DISCORD_TOKEN,
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
        await response.body?.cancel();

        if (response.ok) {
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

function getStatusBotStub(env) {
  const id = env.STATUS_BOT.idFromName('discord-status-bot');
  return env.STATUS_BOT.get(id);
}

export default {
  fetch(request, env) {
    return getStatusBotStub(env).fetch(request);
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const response = await getStatusBotStub(env).fetch(
          new Request('https://status-bot.internal/health')
        );
        await response.body?.cancel();

        if (!response.ok) {
          throw new Error(`Container keep-alive failed with HTTP ${response.status}.`);
        }
      })()
    );
  },
};
