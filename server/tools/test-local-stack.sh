#!/usr/bin/env bash
set -euo pipefail

integration_server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
integration_compose=(
  docker compose
  --project-name notelix-integration
  --file "${integration_server_dir}/docker-compose.test.yml"
)
integration_server_log="$(mktemp)"
integration_secondary_server_log="$(mktemp)"
integration_agent_server_log="$(mktemp)"
integration_degraded_server_log="$(mktemp)"
integration_agent_state_path="$(mktemp)"
integration_auth_state_path="$(mktemp)"
integration_server_pid=""
integration_secondary_server_pid=""
integration_agent_server_pid=""
integration_degraded_server_pid=""
integration_server_port="${NOTELIX_TEST_SERVER_PORT:-18575}"
integration_secondary_server_port="${NOTELIX_TEST_SECONDARY_SERVER_PORT:-18578}"
integration_agent_server_port="${NOTELIX_TEST_AGENT_SERVER_PORT:-18579}"
integration_degraded_server_port="${NOTELIX_TEST_DEGRADED_SERVER_PORT:-18580}"
integration_db_port="${NOTELIX_TEST_DB_PORT:-18576}"
integration_meili_port="${NOTELIX_TEST_MEILI_PORT:-18577}"
integration_meili_key="notelix-integration-meili-master-key"

stop_meilisearch() {
  "${integration_compose[@]}" stop --timeout 5 meilisearch
  local attempt container_id
  container_id="$("${integration_compose[@]}" ps --all --quiet meilisearch)"
  for ((attempt = 1; attempt <= 50; attempt += 1)); do
    if [[ -z "${container_id}" ]] ||
      [[ "$(docker inspect --format '{{.State.Status}}' "${container_id}" 2>/dev/null || true)" == "exited" ]]; then
      return
    fi
    sleep 0.1
  done
  echo "Meilisearch test container did not stop completely" >&2
  return 1
}

start_meilisearch() {
  local attempt
  for attempt in 1 2 3; do
    if "${integration_compose[@]}" up --detach --wait meilisearch; then
      return
    fi
    echo "Retrying Meilisearch test container startup" >&2
    sleep 1
  done
  echo "Meilisearch test container did not become healthy" >&2
  return 1
}

pause_postgres() {
  "${integration_compose[@]}" pause postgres
  local attempt container_id
  container_id="$("${integration_compose[@]}" ps --all --quiet postgres)"
  for ((attempt = 1; attempt <= 50; attempt += 1)); do
    if [[ -n "${container_id}" ]] &&
      [[ "$(docker inspect --format '{{.State.Status}}' "${container_id}" 2>/dev/null || true)" == "paused" ]]; then
      return
    fi
    sleep 0.1
  done
  echo "PostgreSQL test container did not pause" >&2
  return 1
}

resume_postgres() {
  "${integration_compose[@]}" unpause postgres
  local attempt container_id
  container_id="$("${integration_compose[@]}" ps --all --quiet postgres)"
  for ((attempt = 1; attempt <= 100; attempt += 1)); do
    if [[ -n "${container_id}" ]] &&
      [[ "$(docker inspect --format '{{.State.Health.Status}}' "${container_id}" 2>/dev/null || true)" == "healthy" ]]; then
      return
    fi
    sleep 0.1
  done
  echo "PostgreSQL test container did not recover after unpausing" >&2
  return 1
}

cleanup() {
  integration_exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${integration_server_pid}" ]]; then
    kill "${integration_server_pid}" >/dev/null 2>&1 || true
    wait "${integration_server_pid}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${integration_secondary_server_pid}" ]]; then
    kill "${integration_secondary_server_pid}" >/dev/null 2>&1 || true
    wait "${integration_secondary_server_pid}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${integration_agent_server_pid}" ]]; then
    kill "${integration_agent_server_pid}" >/dev/null 2>&1 || true
    wait "${integration_agent_server_pid}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${integration_degraded_server_pid}" ]]; then
    kill "${integration_degraded_server_pid}" >/dev/null 2>&1 || true
    wait "${integration_degraded_server_pid}" >/dev/null 2>&1 || true
  fi

  "${integration_compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true

  if [[ ${integration_exit_code} -ne 0 ]]; then
    echo "Notelix server log:" >&2
    sed -n '1,240p' "${integration_server_log}" >&2
    echo "Notelix secondary server log:" >&2
    sed -n '1,240p' "${integration_secondary_server_log}" >&2
    echo "Notelix agent server log:" >&2
    sed -n '1,240p' "${integration_agent_server_log}" >&2
    echo "Notelix degraded-startup server log:" >&2
    sed -n '1,240p' "${integration_degraded_server_log}" >&2
  fi
  rm -f "${integration_server_log}" "${integration_secondary_server_log}" \
    "${integration_agent_server_log}" "${integration_degraded_server_log}" \
    "${integration_agent_state_path}" "${integration_auth_state_path}"
  exit "${integration_exit_code}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "${integration_server_dir}"
npm run test:compose
"${integration_compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
"${integration_compose[@]}" up --detach --wait

export NODE_ENV=test
export STATIC_TOKEN_AUTO_PROVISION=true
export STATIC_TOKEN_AUTO_PROVISION_LIMIT=1
export PORT="${integration_server_port}"
export DB_HOST=127.0.0.1
export DB_PORT="${integration_db_port}"
export DB_USERNAME=postgres
export DB_PASSWORD=notelix-integration-password
export DB_DATABASE=notelix_integration
export MEILISEARCH_HOST="http://127.0.0.1:${integration_meili_port}"
export MEILISEARCH_API_KEY="${integration_meili_key}"
export MEILISEARCH_ANNOTATIONS_INDEX=annotations_integration
export TEST_SERVER_URL="http://127.0.0.1:${integration_server_port}"
export TEST_SECONDARY_SERVER_URL="http://127.0.0.1:${integration_secondary_server_port}"
export TEST_AGENT_SERVER_URL="http://127.0.0.1:${integration_agent_server_port}"

meili_unauthenticated_status="$(
  curl --silent --output /dev/null --write-out '%{http_code}' \
    "${MEILISEARCH_HOST}/indexes"
)"
if [[ "${meili_unauthenticated_status}" -ge 200 && "${meili_unauthenticated_status}" -lt 300 ]]; then
  echo "Meilisearch accepted an unauthenticated index request" >&2
  exit 1
fi
curl --fail --silent --output /dev/null \
  --header "Authorization: Bearer ${MEILISEARCH_API_KEY}" \
  "${MEILISEARCH_HOST}/indexes"

integration_database_creator_pids=()
for _attempt in 1 2 3 4 5; do
  node ./tools/ensure-pg-db.js &
  integration_database_creator_pids+=("$!")
done
for integration_database_creator_pid in "${integration_database_creator_pids[@]}"; do
  wait "${integration_database_creator_pid}"
done
npm run build
node ./tools/test-runtime-config.js
node ./tools/test-database-connect-timeout.js
DB_POOL_MAX=2 \
  DB_POOL_ACQUIRE_TIMEOUT_MS=200 \
  DB_QUERY_TIMEOUT_MS=200 \
  node ./tools/test-database-operation-timeouts.js
node ./tools/test-migration-lock-timeout.js
node ./tools/test-migration-lock-live.js
node ./tools/test-meili-reindex-atomic.js
npm run migration:run:compiled &
integration_migration_pid_one=$!
npm run migration:run:compiled &
integration_migration_pid_two=$!
wait "${integration_migration_pid_one}"
wait "${integration_migration_pid_two}"
npm run migration:run:compiled

export DB_DATABASE=notelix_legacy_integration
node ./tools/ensure-pg-db.js
"${integration_compose[@]}" exec --no-TTY postgres \
  psql --set ON_ERROR_STOP=1 --username postgres --dbname "${DB_DATABASE}" \
  <"${integration_server_dir}/test/fixtures/legacy-schema.sql"
npm run migration:run:compiled
node ./tools/assert-legacy-migration.js

export DB_DATABASE=notelix_integration
DB_POOL_ACQUIRE_TIMEOUT_MS=1000 DB_QUERY_TIMEOUT_MS=5000 \
  node ./dist/main.js >"${integration_server_log}" 2>&1 &
integration_server_pid=$!
PORT="${integration_secondary_server_port}" \
  STATIC_TOKEN_AUTO_PROVISION=false \
  DB_POOL_ACQUIRE_TIMEOUT_MS=1000 DB_QUERY_TIMEOUT_MS=5000 \
  node ./dist/main.js >"${integration_secondary_server_log}" 2>&1 &
integration_secondary_server_pid=$!

export TEST_AUTH_STATE_PATH="${integration_auth_state_path}"
node ./tools/test-auth-database-outage.js prepare
pause_postgres
node ./tools/test-auth-database-outage.js outage
resume_postgres
node ./tools/test-auth-database-outage.js recovered

node ./tools/test-live-api.js
node ./tools/meili-reindex.js

stop_meilisearch
PORT="${integration_degraded_server_port}" \
  node ./dist/main.js >"${integration_degraded_server_log}" 2>&1 &
integration_degraded_server_pid=$!
TEST_DEGRADED_SERVER_URL="http://127.0.0.1:${integration_degraded_server_port}" \
  node ./tools/test-degraded-startup.js
kill "${integration_degraded_server_pid}" >/dev/null 2>&1 || true
wait "${integration_degraded_server_pid}" >/dev/null 2>&1 || true
integration_degraded_server_pid=""
node <<'NODE'
const assert = require('assert');

async function assertDegradedReadiness() {
  const serverUrl = process.env.TEST_SERVER_URL;
  const liveness = await fetch(`${serverUrl}/meta/health`);
  assert.strictEqual(liveness.status, 200);
  assert.deepStrictEqual(await liveness.json(), { status: 'ok' });

  const readiness = await fetch(`${serverUrl}/meta/ready`);
  assert.strictEqual(readiness.status, 503);
  assert.deepStrictEqual(await readiness.json(), {
    status: 'unavailable',
    checks: { postgres: 'up', meilisearch: 'down' },
  });
  console.log('Degraded readiness test passed.');
}

assertDegradedReadiness().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

node ./tools/test-search-outbox.js save
start_meilisearch
node ./tools/test-search-outbox.js verify-save

stop_meilisearch
node ./tools/test-search-outbox.js delete
start_meilisearch
node ./tools/test-search-outbox.js verify-delete

export MEILISEARCH_ANNOTATIONS_INDEX=annotations_agent_recovery
node ./tools/test-agent-search-recovery.js prepare
RUN_MODE=AGENT \
  AGENT_CONTROL_ORIGINS=chrome-extension://integration-test \
  CORS_ORIGINS='*' \
  PORT="${integration_agent_server_port}" \
  AGENT_SYNC_STATE_PATH="${integration_agent_state_path}" \
  AGENT_SYNC_URL_OVERRIDE=http://127.0.0.1:1 \
  node ./dist/main.js >"${integration_agent_server_log}" 2>&1 &
integration_agent_server_pid=$!
node ./tools/test-agent-search-recovery.js verify-startup
if [[ -n "${CHROME_PATH:-}" ]]; then
  node ./tools/test-agent-browser-origin.js "${CHROME_PATH}"
fi
node ./tools/test-agent-search-recovery.js verify-runtime
