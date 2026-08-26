#!/usr/bin/env bash
set -euo pipefail

integration_server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
integration_compose=(
  docker compose
  --project-name notelix-integration
  --file "${integration_server_dir}/docker-compose.test.yml"
)
integration_server_log="$(mktemp)"
integration_server_pid=""
integration_server_port="${NOTELIX_TEST_SERVER_PORT:-18575}"
integration_db_port="${NOTELIX_TEST_DB_PORT:-18576}"
integration_meili_port="${NOTELIX_TEST_MEILI_PORT:-18577}"
integration_meili_key="notelix-integration-meili-master-key"

cleanup() {
  integration_exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${integration_server_pid}" ]]; then
    kill "${integration_server_pid}" >/dev/null 2>&1 || true
    wait "${integration_server_pid}" >/dev/null 2>&1 || true
  fi

  "${integration_compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true

  if [[ ${integration_exit_code} -ne 0 ]]; then
    echo "Notelix server log:" >&2
    sed -n '1,240p' "${integration_server_log}" >&2
  fi
  rm -f "${integration_server_log}"
  exit "${integration_exit_code}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "${integration_server_dir}"
"${integration_compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
"${integration_compose[@]}" up --detach --wait

export NODE_ENV=test
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

node ./tools/ensure-pg-db.js
npm run build
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
node ./dist/main.js >"${integration_server_log}" 2>&1 &
integration_server_pid=$!

node ./tools/test-live-api.js
node ./tools/meili-reindex.js
