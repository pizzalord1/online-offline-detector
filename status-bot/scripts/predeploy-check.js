const fs = require('node:fs');
const path = require('node:path');

function validateConfig(config) {
  const errors = [];
  const containers = config?.containers;
  const statusContainer = Array.isArray(containers)
    ? containers.find(container => container?.class_name === 'StatusContainer')
    : undefined;

  if (!statusContainer) {
    errors.push('containers must define the StatusContainer class.');
  } else {
    const baseImage = statusContainer.images?.base;
    if (
      !baseImage ||
      typeof baseImage.dockerfile !== 'string' ||
      typeof baseImage.build_context !== 'string'
    ) {
      errors.push(
        'StatusContainer must define images.base.dockerfile and images.base.build_context.'
      );
    }
  }

  const bindings = config?.durable_objects?.bindings;
  if (
    !Array.isArray(bindings) ||
    !bindings.some(
      binding =>
        binding?.name === 'STATUS_BOT' &&
        binding?.class_name === 'StatusContainer'
    )
  ) {
    errors.push(
      'durable_objects.bindings must bind STATUS_BOT to StatusContainer.'
    );
  }

  const containerExport = config?.exports?.StatusContainer;
  if (
    containerExport?.type !== 'durable-object' ||
    containerExport.storage !== 'sqlite'
  ) {
    errors.push(
      'exports.StatusContainer must declare a durable-object with sqlite storage.'
    );
  }

  return errors;
}

function main() {
  const configPath = path.join(__dirname, '..', 'wrangler.jsonc');
  let config;

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`Unable to parse ${configPath}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('Deployment config preflight failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Deployment config preflight passed.');
}

if (require.main === module) {
  main();
}

module.exports = { validateConfig };
