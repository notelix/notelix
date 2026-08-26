#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

compose_test_dir="$(mktemp -d -t notelix-compose-config-XXXXXX)"
cleanup() {
  rm -rf -- "$compose_test_dir"
}
trap cleanup EXIT

for stack in prod agent dev; do
  cp "docker-compose.${stack}.yml" "$compose_test_dir/"
  if [[ "$stack" == "prod" ]]; then
    grep -Ev '^NOTELIX_(BIND_ADDRESS|PORT)=' \
      .env.prod.example >"$compose_test_dir/.env.prod"
  else
    cp ".env.${stack}.example" "$compose_test_dir/.env.${stack}"
  fi
  docker compose \
    --project-name "notelix-compose-test-${stack}" \
    --file "$compose_test_dir/docker-compose.${stack}.yml" \
    --env-file "$compose_test_dir/.env.${stack}" \
    config --format json >"$compose_test_dir/${stack}.json"
done

NOTELIX_BIND_ADDRESS=0.0.0.0 NOTELIX_PORT=28555 docker compose \
  --project-name notelix-compose-test-prod-override \
  --file "$compose_test_dir/docker-compose.prod.yml" \
  --env-file "$compose_test_dir/.env.prod" \
  config --format json >"$compose_test_dir/prod-override.json"

node - "$compose_test_dir" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const configDirectory = process.argv[2];
const stacks = ['prod', 'agent', 'dev'];
const configs = Object.fromEntries(
  stacks.map((stack) => [
    stack,
    JSON.parse(fs.readFileSync(path.join(configDirectory, `${stack}.json`))),
  ]),
);

const networkNames = stacks.map((stack) => {
  const network = configs[stack].networks.default;
  assert.equal(
    network.external,
    undefined,
    `${stack} must not use an external default network`,
  );
  assert.equal(
    network.name,
    `notelix-compose-test-${stack}_default`,
    `${stack} must use its project-scoped default network`,
  );
  return network.name;
});
assert.equal(
  new Set(networkNames).size,
  stacks.length,
  'deployment stacks must not share a default network',
);

function backendPort(config) {
  const port = config.services.backend.ports.find(
    (candidate) => candidate.target === 3000,
  );
  assert.ok(port, 'backend port 3000 must be published');
  return port;
}

const productionPort = backendPort(configs.prod);
assert.equal(productionPort.host_ip, '127.0.0.1');
assert.equal(productionPort.published, '18555');
assert.equal(configs.prod.services.postgres.ports, undefined);
assert.equal(configs.prod.services.meilisearch.ports, undefined);

for (const stack of ['agent', 'dev']) {
  assert.equal(
    backendPort(configs[stack]).host_ip,
    '127.0.0.1',
    `${stack} backend must remain bound to loopback`,
  );
  for (const dependency of ['postgres', 'meilisearch']) {
    for (const port of configs[stack].services[dependency].ports || []) {
      assert.equal(
        port.host_ip,
        '127.0.0.1',
        `${stack} ${dependency} must remain bound to loopback`,
      );
    }
  }
}

const overriddenConfig = JSON.parse(
  fs.readFileSync(path.join(configDirectory, 'prod-override.json')),
);
const overriddenPort = backendPort(overriddenConfig);
assert.equal(overriddenPort.host_ip, '0.0.0.0');
assert.equal(overriddenPort.published, '28555');
NODE

echo "Compose deployment topology checks passed."
