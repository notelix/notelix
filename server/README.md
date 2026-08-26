## server

# `.env` file

```
DB_PASSWORD=123456
```

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
docker volume rm notelix-prod_postgres-data
docker volume rm notelix-prod_meili
docker volume rm notelix-prod_data
```

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
docker volume rm notelix-dev_postgres-data
docker volume rm notelix-dev_meili
docker volume rm notelix-dev_data
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

# start agent

```
docker build . -f ./Dockerfile.agent -t notelix:agent
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent up -d
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent down
docker volume rm notelix-agent_postgres-data
docker volume rm notelix-agent_meili
docker volume rm notelix-agent_data
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
