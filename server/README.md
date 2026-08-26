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
client-side encryption, restart the local agent and allow it to synchronize;
the server cannot rebuild their encrypted search documents.

# rebuild Meilisearch index

Run this after restoring or migrating Postgres without the matching Meilisearch
volume. It clears and rebuilds the search index, so run it during a quiet period
or briefly pause writes:

```
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod exec backend npm run meili:reindex
```

The normal server reindex skips annotations for client-side encrypted users,
because the server only has encrypted text for those records. Rebuild those from
the agent container instead:

```
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent exec backend npm run meili:reindex
```

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
search APIs. Test containers and data are removed when the test finishes.

```bash
npm run test:integration
```

The backend also supports host-side development against containers or other
service instances through `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_DATABASE`,
`MEILISEARCH_HOST`, `MEILISEARCH_ANNOTATIONS_INDEX`, and `PORT`.

At startup, the backend first connects directly to `DB_DATABASE`. If it does not
exist and `DB_AUTO_CREATE` is `true`, creation is serialized across replicas and
uses `DB_ADMIN_DATABASE` (default `postgres`) as the maintenance database. The
new database is owned by `DB_USERNAME`. For least-privilege production setups,
provision the database separately, grant the application role access only to
that database, and set `DB_AUTO_CREATE=false`.

Requests are rate limited per client IP. `RATE_LIMIT_MAX` and
`RATE_LIMIT_TTL_MS` configure the general request budget. Login, signup, and
password changes have tighter fixed limits. When the backend is behind a
trusted reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of proxy hops
so clients are tracked separately; do not enable it for untrusted proxies.

`GET /meta/health` is a process liveness check. `GET /meta/ready` checks both
PostgreSQL and Meilisearch and returns `503` when either dependency is down.
Container health checks use the readiness endpoint. Dependency checks are
bounded to two seconds by default; `READINESS_TIMEOUT_MS` can set a value from
100 to 30000 milliseconds.

Static access tokens are stored as one-way SHA-256 digests; raw tokens and
token-derived guest names are removed by the authentication migration. Existing
tokens continue to work after migration. Generate them with a cryptographically
secure source such as `openssl rand -hex 32`, transmit them only over HTTPS, and
never commit them or share one token between users.

Annotation synchronization history contains annotation-only snapshots. The
history security migration removes legacy embedded user objects, including
password hashes and client-side encryption metadata, from existing rows.

JWTs expire after 30 days by default; set `JWT_EXPIRES_IN` to another
`jsonwebtoken` duration when a shorter policy is required. Changing a password
increments the account's token version and immediately revokes every previously
issued JWT for that account.

# start agent

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
other work.
The agent aborts an active request during shutdown and atomically persists its
sync cursor. The state is bound to a one-way identity of the server, user,
token version, and client-side encryption key; no credential is persisted.
Missing, legacy, invalid, or mismatched state causes a safe full re-list, and a
source change aborts and fences any in-flight work before the new source syncs.

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
