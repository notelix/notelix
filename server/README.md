## server

# environment files

Generate separate database and Meilisearch secrets for production:

```bash
cp .env.prod.example .env.prod
sed -i "s/replace-with-a-random-secret/$(openssl rand -hex 32)/" .env.prod
sed -i "s/replace-with-another-random-secret/$(openssl rand -hex 32)/" .env.prod
```

Use `.env.agent.example` and `.env.dev.example` the same way for the agent and
development stacks. Do not reuse secrets between environments or commit the
generated `.env.*` files.

Every Compose stack requires a non-empty `DB_PASSWORD` while rendering its
configuration, before any container is created. Production and agent stacks
also require `MEILI_MASTER_KEY` at the same stage. Agent mode additionally
requires `AGENT_CONTROL_ORIGINS` to contain the exact `chrome-extension://` or
`moz-extension://` origin allowed to access decrypted local data. Wildcards and
ordinary website origins are rejected at startup.

# published Docker images

GitHub Actions publishes backend images to GHCR:

```
ghcr.io/notelix/notelix:prod
ghcr.io/notelix/notelix:agent
```

The compose files still default to local images. To run with a published image,
set the image override when starting the stack:

```
NOTELIX_BACKEND_IMAGE=ghcr.io/notelix/notelix:prod docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod up -d
NOTELIX_AGENT_IMAGE=ghcr.io/notelix/notelix:agent docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent up -d
```

# start prod

```
docker build . -f ./Dockerfile.prod -t notelix:prod
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod up -d
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod down
```

The production API binds to `127.0.0.1:18555` by default so credentials and
tokens are not exposed over an unprotected host-network path. Put a TLS reverse
proxy on the same host in front of that address for remote access, and set
`TRUST_PROXY_HOPS` to the exact number of trusted proxy hops. You can change the
loopback address and port with `NOTELIX_BIND_ADDRESS` and `NOTELIX_PORT`; do not
use a non-loopback address unless the network path is independently protected.

Each Compose project has an isolated default network. This prevents production,
development, and agent containers running on the same host from resolving one
another's `postgres`, `meilisearch`, or `backend` service aliases.

When upgrading an existing deployment, `docker compose up -d` recreates its
containers on the new project-scoped network. It also changes a previously
public production port to loopback unless `NOTELIX_BIND_ADDRESS` is set. After
upgrading every local Notelix stack, inspect the old `notelix` network and
remove it only when no containers remain attached.

The persistent stacks are pinned to PostgreSQL 14.24 so an image update cannot
silently perform a major-version upgrade against an existing volume.
PostgreSQL 14 reaches end of life in November 2026. New deployments should use
the PostgreSQL 17 override, and existing deployments should follow the migration
procedure below.

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres17.yml \
  --env-file .env.prod -p notelix-prod up -d
```

The production and agent stacks require `MEILI_MASTER_KEY` and run
Meilisearch in authenticated production mode. The backend and search service
use this value for authenticated requests over their Docker network;
Meilisearch is not published to the host in the production stack.

## upgrading the search service from Meilisearch 0.x

Meilisearch data files are not compatible across these versions. Notelix uses
Postgres as the source of truth and treats Meilisearch as a rebuildable search
index. The current compose files therefore use a new `meili-v1` volume and
leave the old `meili` volume untouched for recovery.

After the first start on Meilisearch 1.x, rebuild the index:

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod exec backend npm run meili:reindex
```

Verify searches before removing any old Meilisearch volume. For users with
client-side encryption, restart the local agent. It rebuilds a missing index
from its decrypted PostgreSQL copy before resuming from its persisted sync
cursor; the server cannot rebuild those encrypted search documents.

# rebuild Meilisearch index

Run this after restoring or migrating Postgres without the matching Meilisearch
volume. It builds a temporary index and atomically swaps it into service only
after every batch succeeds. A failed rebuild leaves the active index untouched.
Run it during a quiet period or briefly pause writes so changes made during the
database scan cannot be missed by the replacement index:

```
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod exec backend npm run meili:reindex
```

The normal server reindex skips annotations for client-side encrypted users,
because the server only has encrypted text for those records. Rebuild those from
the agent container instead:

```
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent exec backend npm run meili:reindex
```

Reindex batches default to 500 rows. `MEILI_REINDEX_BATCH_SIZE` accepts 1 to
5000, `MEILI_REINDEX_TIMEOUT_MS` accepts 1000 to 3600000 milliseconds, and
`MEILI_REINDEX_INTERVAL_MS` accepts 100 to 30000 milliseconds. In agent mode,
client-side-encrypted rows are included by default. Override that behavior only
with an explicit true/false `MEILI_REINDEX_INCLUDE_CLIENT_SIDE_ENCRYPTED` value.

Normal API saves and deletes enqueue a coalescing search-index update in the
same PostgreSQL transaction as the annotation and its sync history. A
replica-safe background worker retries failed Meilisearch batches with leased,
revision-guarded claims, so a search outage or process restart cannot silently
lose a later update. Existing annotations are queued when the migration runs.
`SEARCH_SYNC_BATCH_SIZE`, `SEARCH_SYNC_INTERVAL_MS`, `SEARCH_SYNC_LEASE_MS`,
`SEARCH_SYNC_RETRY_BASE_MS`, `SEARCH_SYNC_RETRY_MAX_MS`, and
`SEARCH_SYNC_SCHEMA_INTERVAL_MS` tune the defaults shown in
`.env.prod.example`. The worker also recreates the index schema and requeues
current annotations if the search index disappears while the API stays online.
The agent performs the same schema check before each enabled sync cycle and
rebuilds a recreated index from local PostgreSQL in bounded batches. This keeps
existing decrypted annotations searchable after losing only the agent's
Meilisearch volume without forcing a full server re-list.

# start dev

```
docker build . -f ./Dockerfile.dev -t notelix:dev
docker-compose -f docker-compose.dev.yml --env-file .env.dev -p notelix-dev up -d
docker-compose -f docker-compose.dev.yml --env-file .env.dev -p notelix-dev down
```

# local integration tests

The integration test validates the production, development, and agent Compose
topology, starts isolated temporary Postgres and Meilisearch containers, runs
the backend on the host, and exercises the user, annotation, sync-history, and
search APIs. It makes PostgreSQL unavailable to verify authentication returns a
retryable outage without invalidating a valid JWT, then proves that same session
recovers.
It also deletes the agent search index and verifies both startup and in-process
recovery. Test containers and data are removed when the test finishes.

```bash
npm run test:integration
```

If Chrome and the extension development dependencies are available, set
`CHROME_PATH` while running the integration suite. It will additionally load an
untrusted extension with localhost host permission and verify that the agent
rejects its decrypted search and find requests at the endpoint boundary.

The backend also supports host-side development against containers or other
service instances through `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_DATABASE`,
`MEILISEARCH_HOST`, `MEILISEARCH_ANNOTATIONS_INDEX`, and `PORT`.
Numeric runtime settings accept decimal integers only. `DB_PORT` and `PORT`
must be valid TCP ports from 1 to 65535; invalid values fail startup with a
specific configuration error instead of reaching a database or socket driver.
`RUN_MODE` defaults to `SERVER`; `AGENT` is the only alternative. Other values
fail startup so a misspelled agent mode cannot silently enable server behavior.

At startup, the backend first connects directly to `DB_DATABASE`. If it does not
exist and `DB_AUTO_CREATE` is `true`, creation is serialized across replicas and
uses `DB_ADMIN_DATABASE` (default `postgres`) as the maintenance database. The
new database is owned by `DB_USERNAME`. For least-privilege production setups,
provision the database separately, grant the application role access only to
that database, and set `DB_AUTO_CREATE=false`.
Database bootstrap retries transient connection failures for up to two minutes
by default, with individual connection attempts bounded to five seconds.
`DB_CONNECT_TIMEOUT_MS` accepts 1000 to 3600000 milliseconds and
`DB_CONNECT_RETRY_INTERVAL_MS` accepts 100 to 30000 milliseconds. Exhausting
the deadline exits the process so the container restart policy can retry and
operators receive a clear failure instead of an indefinitely hung startup.

Requests are rate limited per client IP. `RATE_LIMIT_MAX` and
`RATE_LIMIT_TTL_MS` configure the general request budget. Login, signup, and
password changes have tighter fixed limits. Budgets are stored atomically in
PostgreSQL, so clients cannot multiply their allowance by switching between
backend replicas. Expired counters are removed in bounded batches. During a
PostgreSQL outage each process retains a bounded in-memory fallback; dependent
authenticated operations still report the underlying outage. The liveness
endpoint deliberately bypasses database-backed throttling. When the backend is
behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of
proxy hops so clients are tracked separately; do not enable it for untrusted
proxies.
JSON and URL-encoded request bodies are limited to 1 MiB by default.
`REQUEST_BODY_LIMIT_BYTES` accepts values from 1024 through 16777216; larger
requests receive `413 Payload Too Large` before authentication or persistence.
Annotation responses have a separate 32 MiB budget. Snapshot and diff APIs
shorten a page and preserve `hasMore` when its serialized rows approach
`ANNOTATION_RESPONSE_LIMIT_BYTES`; this keeps valid large annotations below the
agent's receiver limit without skipping cursor progress. Unpaged legacy list,
URL query, and find requests measure their result inside a repeatable-read
transaction and return `413` before materializing an oversized response. The
budget accepts 131072 through 268435456 bytes and must exceed
`REQUEST_BODY_LIMIT_BYTES` by at least 65536 bytes. Keep it below the receiving
agent's `AGENT_SYNC_MAX_RESPONSE_BYTES` setting.

`GET /meta/health` is a process liveness check. `GET /meta/ready` checks both
PostgreSQL and Meilisearch and returns `503` when either dependency is down.
As soon as shutdown begins, readiness returns `503` with
`reason: "shutting_down"` before waiting for active workers and requests to
drain, so load balancers can stop routing new work to the instance.
Container health checks use the readiness endpoint. Dependency checks are
bounded to two seconds by default; `READINESS_TIMEOUT_MS` can set a value from
100 to 30000 milliseconds.

The production entrypoint performs database bootstrap and migrations, then
replaces itself with the Node process. This lets `SIGTERM` reach Nest directly
so rolling deployments run request-abort, search-worker, and database shutdown
hooks before the container exits. The supported production and agent Compose
stacks allow two minutes before escalating to `SIGKILL`, which accommodates the
default bounded dependency operations. If you increase database, Meilisearch,
or agent request timeouts, keep the deployment platform's termination grace
period comfortably above the longest shutdown-critical operation.
If startup fails after Nest initializes—for example, because the listen port is
already occupied—the process closes initialized workers and database pools
before exiting with a failure status, allowing the container restart policy to
retry without leaving a live but unserviceable process.

PostgreSQL is the source of truth and remains a hard startup dependency.
Meilisearch is recoverable: the backend starts in degraded mode if search is
unavailable, keeps readiness at `503`, accepts durable annotation writes into
the PostgreSQL outbox, and repairs/replays the search index after recovery.

Database pools default to 10 connections. `DB_POOL_MAX` accepts 1 to 100,
`DB_POOL_ACQUIRE_TIMEOUT_MS` accepts 100 to 600000 milliseconds, and
`DB_QUERY_TIMEOUT_MS` accepts 100 to 3600000 milliseconds. PostgreSQL query
execution, stalled query reads, and waits for a pool connection are bounded so
dependency outages cannot accumulate work indefinitely.
Authentication rejects invalid or revoked credentials with `401`, including a
client-clear signal. Database and other authentication-backend failures instead
return `503` with `retryable: true`, so a transient outage does not log clients
out or discard their local client-side encryption keys.
Migration runners wait up to two minutes for the singleton advisory lock;
`DB_MIGRATION_LOCK_TIMEOUT_MS` accepts 1000 to 3600000 milliseconds. Exceeding
the deadline fails startup so the container restart policy can retry instead of
leaving a backend permanently stuck before it serves traffic.

Meilisearch HTTP requests are bounded to 10 seconds by default;
`MEILISEARCH_REQUEST_TIMEOUT_MS` accepts values from 100 to 600000
milliseconds. Meilisearch update tasks are bounded to 30 seconds by default.
`MEILISEARCH_TASK_TIMEOUT_MS` accepts values from 100 to 600000 milliseconds.

Static access tokens are stored as one-way SHA-256 digests; raw tokens and
token-derived guest names are removed by the authentication migration. Existing
tokens continue to work after migration. Generate them with a cryptographically
secure source such as `openssl rand -hex 32`, transmit them only over HTTPS, and
never commit them or share one token between users.

Unknown static tokens are rejected by default, while already-registered tokens
continue to authenticate. Set `STATIC_TOKEN_AUTO_PROVISION=true` only when the
server intentionally provides anonymous embedded accounts. Provisioning is
coordinated across replicas and stops after `STATIC_TOKEN_AUTO_PROVISION_LIMIT`
accounts (1000 by default), preventing concurrent requests from exceeding the
account cap without allowing unrelated enrollments to build a lock queue. The
limit accepts values from 1 through 1000000 and includes existing static-token
accounts. Keep auto-provisioning disabled on an Internet-facing server unless
anonymous account creation is an explicit feature; upgrading with it disabled
does not invalidate any existing token.

Annotation synchronization history contains annotation-only snapshots. The
history security migration removes legacy embedded user objects, including
password hashes and client-side encryption metadata, from existing rows.
History retention is bounded per user after every save or deletion. By default,
the newest 10000 entries are retained within a 64 MiB serialized-payload budget;
the newest entry is always kept so every accepted write remains sync-visible.
`ANNOTATION_HISTORY_MAX_ENTRIES_PER_USER` accepts 1 through 1000000, and
`ANNOTATION_HISTORY_MAX_PAYLOAD_BYTES_PER_USER` accepts 1048576 through
17179869184 bytes. Pruning is serialized across replicas. An agent whose cursor
was pruned receives a safe full-relist signal, and stale snapshot sessions are
discarded first so the relist cannot reuse an obsolete watermark. Existing
oversized histories are brought under the configured limits on that user's next
annotation write. Same-user history IDs are allocated only while holding the
replica-safe history lock, preventing a snapshot watermark from jumping over an
older uncommitted change.

JWTs expire after 30 days by default; set `JWT_EXPIRES_IN` to a positive
duration with an explicit unit, such as `15m` or `7d`, when a shorter policy is
required. Invalid, zero, and unitless values fail startup instead of breaking
login after the service becomes ready. Changing a password increments the
account's token version and immediately revokes every previously issued JWT for
that account.

# start agent

After loading Notelix, copy its extension ID from `chrome://extensions` and set
`AGENT_CONTROL_ORIGINS=chrome-extension://<extension-id>` in `.env.agent`.
Comma-separate entries only when the same agent must serve multiple trusted
Notelix extension installations.

Agent mode enforces this allowlist both in CORS and inside the decrypted search
and find endpoints. A generic `CORS_ORIGINS` setting cannot broaden agent
access. Requests without an Origin header remain available to local command-line
tools, so keep the supported agent listener bound to loopback and treat local
host access as trusted.

```
docker build . -f ./Dockerfile.agent -t notelix:agent
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent up -d
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent down
```

# agent: sync from server

Agent sync requests time out after 30 seconds and accept at most 64 MiB of JSON
by default. `AGENT_SYNC_REQUEST_TIMEOUT_MS` supports values from 100 to 300000,
and `AGENT_SYNC_MAX_RESPONSE_BYTES` supports values from 1024 to 268435456.
Diff history is served in pages of at most 250 entries by default. The agent
drains up to 10 pages per cycle; `AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE` supports
values from 1 to 100 so large backlogs make bounded progress without starving
other work. Full re-lists use expiring, repeatable-read snapshot sessions with
pages of at most 100 annotations, keeping responses bounded without missing
writes that commit between pages. Older servers fall back to the legacy list
endpoint. The agent atomically checkpoints each completed snapshot page and
drains at most 10 per cycle; `AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE` supports
values from 1 to 100, allowing large or interrupted snapshots to resume without
replaying page one or exhausting the API rate limit.
The agent aborts an active request during shutdown and atomically persists its
sync cursor. The state is bound to a one-way identity of the server, user,
token version, and client-side encryption key; no credential is persisted.
Missing, legacy, invalid, or mismatched state causes a safe full re-list, and a
source change aborts and fences any in-flight work before the new source syncs.
Remote annotation payloads are validated against the database field limits and
canonical timestamp format before mutation. Unknown entity fields are discarded,
deletes are idempotent, and a malformed or superseded change cannot advance the
cursor. Sync base URLs must be unambiguous HTTP(S) URLs without embedded
credentials, query strings, or fragments. Requests do not follow redirects, so
tokens and sync responses remain pinned to the configured destination.

```
curl 'http://127.0.0.1:18565/agentsync/set' \
  -H 'Content-Type: application/json'\
  --data-raw '{"config":{"enabled":true,"url":"http://127.0.0.1:18555","token":"REPLACE_WITH_A_SERVER_TOKEN"}}'
```

# database backups

```bash
mkdir -p backups
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  -p notelix-prod exec -T postgres \
  pg_dump --username postgres --format=custom notelix \
  > "backups/notelix-$(date +%Y-%m-%d_%H%M%S).dump"
```

Copy backups to encrypted off-site storage and regularly test that PostgreSQL
can read them. A backup is not verified until a restore has succeeded.

## upgrading PostgreSQL 14 to PostgreSQL 17

The override uses a separate `postgres-data-v17` volume. It does not overwrite
the PostgreSQL 14 volume, which makes rollback possible until the migration has
been validated. Plan a maintenance window and first create and copy a backup as
described above.

Verify the dump and stop the old stack without deleting its volumes:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  -p notelix-prod exec -T postgres pg_restore --list \
  < backups/notelix-TIMESTAMP.dump >/dev/null
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  -p notelix-prod down
```

Start only PostgreSQL 17, restore the dump, and then start the complete stack:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres17.yml \
  --env-file .env.prod -p notelix-prod up -d postgres
docker compose -f docker-compose.prod.yml -f docker-compose.postgres17.yml \
  --env-file .env.prod -p notelix-prod exec -T postgres \
  createdb --username postgres notelix
docker compose -f docker-compose.prod.yml -f docker-compose.postgres17.yml \
  --env-file .env.prod -p notelix-prod exec -T postgres \
  pg_restore --username postgres --dbname notelix --no-owner \
  < backups/notelix-TIMESTAMP.dump
docker compose -f docker-compose.prod.yml -f docker-compose.postgres17.yml \
  --env-file .env.prod -p notelix-prod up -d
```

Run the application checks and exercise login, writes, sync, and search before
removing the old volume. Keep `docker-compose.postgres17.yml` in every future
Compose command for this deployment. The same override works with the agent and
development Compose files; use the corresponding environment file and project
name when migrating those stacks.
