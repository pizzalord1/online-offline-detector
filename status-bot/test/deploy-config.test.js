const test = require('node:test');
const assert = require('node:assert/strict');

const { validateConfig } = require('../scripts/predeploy-check');

function validConfig() {
  return {
    containers: [
      {
        class_name: 'StatusContainer',
        images: {
          base: {
            dockerfile: './Dockerfile',
            build_context: '..',
          },
        },
      },
    ],
    durable_objects: {
      bindings: [
        {
          name: 'STATUS_BOT',
          class_name: 'StatusContainer',
        },
      ],
    },
    exports: {
      StatusContainer: {
        type: 'durable-object',
        storage: 'sqlite',
      },
    },
  };
}

test('accepts the configured container image and Durable Object binding', () => {
  assert.deepEqual(validateConfig(validConfig()), []);
});

test('rejects a missing container image configuration', () => {
  const config = validConfig();
  delete config.containers;

  assert.match(validateConfig(config).join('\n'), /containers must define/);
});

test('rejects a missing StatusContainer Durable Object binding', () => {
  const config = validConfig();
  config.durable_objects.bindings = [];

  assert.match(
    validateConfig(config).join('\n'),
    /bind STATUS_BOT to StatusContainer/
  );
});
