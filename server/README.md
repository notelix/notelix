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

# docker

```
docker network create notelix
```

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

The integration test starts isolated, temporary Postgres and Meilisearch
containers, runs the backend on the host, and exercises the user, annotation,
sync-history, and search APIs. Test containers and data are removed when the
test finishes.

```bash
npm run test:integration
```

The backend also supports host-side development against containers or other
service instances through `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_DATABASE`,
`MEILISEARCH_HOST`, `MEILISEARCH_ANNOTATIONS_INDEX`, and `PORT`.

Requests are rate limited per client IP. `RATE_LIMIT_MAX` and
`RATE_LIMIT_TTL_MS` configure the general request budget. Login, signup, and
password changes have tighter fixed limits. When the backend is behind a
trusted reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of proxy hops
so clients are tracked separately; do not enable it for untrusted proxies.

# start agent

```
docker build . -f ./Dockerfile.agent -t notelix:agent
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent up -d
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent down
```

# agent: sync from server

```
curl 'http://127.0.0.1:18565/agentsync/set' \
  -H 'Content-Type: application/json'\
  --data-raw '{"config":{"enabled":true, "url": "http://127.0.0.1:18555", "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNjQ0OTM5NzcxfQ.nxwGaDlwnF-soMR2Wq8QrFxkd9xQ6qPtw578PqjnRJUjWarHuT0qtbx96S4LUnVIJanVJdpLJ2ZB_pgU-aAwN3TGBZx0OfrMWcTqojIIZm8Ugh9KzqsLkmGfqbQZ0vszghCditHK8c0Mh_e_JiGHE_PYVTGt8EviwZrv_dFxYNt3F14ZcQ5-j4h-oXOdma7Jfd_xXjUHzJ7LoPalfHxMvW9KNKtqh4Crz946VfhQciMjWxJIWxUBpIvm059E9KNCv5B80XEwzyQIUVoleUeczDvjjXR_NWrEwkgukOR8gOpyAvcPvRueHhUZS61-se_V8DmqVpb4YURAP2YunfH1QP1DExcqecI16GIRkZ3zN2B5CLS7e5rnXOVuxFPuag7onmGm6jn8JBGhB5FVaCMdozas5WihY5Z0FrVgbIvZMBQb1ax4LOD8bEhYbZ0JbVRV5ni0F3fmB5JTclf0QcHVDjl6GOH2aKOvocrQcP2KHfRoy8MKRcg6JpJLQ9bsgZJw4mls_PdqFO3oqdEHZzzlC8M6ESTgr4cRLVvYd9zNdKvIoMjeDsgATevPqf7hosNKtofWFhUp92c41t-UP44sLj3L3806H-ezm-QsJMjfI5gRVTFJMG66FcGYKdMfhvEWACHdHYVW6dOaI16zXB-plLljL8oIbyukr7RUQLnTgP0"}}'
```

# database backup the easy way

```bash
#!/bin/bash
set -e
basepath='/root/backup/notelix/'

docker exec -e PGPASSWORD="..."  notelix-dev_postgres_1 pg_dump --host=127.0.0.1 --port=5432 --username=postgres notelix  > ${basepath}notelix-$(date +%Y-%m-%d_%H).sql
/usr/bin/nice -n 19 gzip -f ${basepath}notelix-$(date +%Y-%m-%d_%H).sql
rclone copy ${basepath}notelix-$(date +%Y-%m-%d_%H).sql.gz notelix-backup:/notelix-$(date +%Y-%m-%d_%H).sql.gz
find ${basepath} -mtime +30 -name "*.sql.gz" -exec basename {} \; | xargs -I% -n1 rclone delete notelix-backup:/%
find ${basepath} -mtime +30 -name "*.sql.gz" -exec rm -rf {} \;

rm -rf ${basepath}/*.sql

```

```
30 */8 * * * (/root/backup/notelix.sh && curl -s https://hc-ping.com/33d0b6aa-...) 2>&1 | logger -t notelix-backup
```
