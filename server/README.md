server
---

# `.env` file

```
DB_PASSWORD=123456
```

# start prod

```
docker build . -f ./Dockerfile.prod -t notelix:prod
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod up -d 
docker-compose -f docker-compose.prod.yml --env-file .env.prod -p notelix-prod down
docker volume rm notelix-prod_postgres-data
```

# start dev

```
docker build . -f ./Dockerfile.dev -t notelix:dev
docker-compose -f docker-compose.dev.yml --env-file .env.dev -p notelix-dev up -d 
docker-compose -f docker-compose.dev.yml --env-file .env.dev -p notelix-dev down
docker volume rm notelix-dev_postgres-data
```

# start edge

```
docker build . -f ./Dockerfile.edge -t notelix:edge
docker-compose -f docker-compose.edge.yml --env-file .env.edge -p notelix-edge up -d 
docker-compose -f docker-compose.edge.yml --env-file .env.edge -p notelix-edge down
docker volume rm notelix-edge_postgres-data
```

# edge: sync from server

```
curl 'http://127.0.0.1:18565/edgesync/set' \
  -H 'Content-Type: application/json'\
  --data-raw '{"config":{"enabled":true, "url": "http://127.0.0.1:18555", "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNjQ0OTM5NzcxfQ.nxwGaDlwnF-soMR2Wq8QrFxkd9xQ6qPtw578PqjnRJUjWarHuT0qtbx96S4LUnVIJanVJdpLJ2ZB_pgU-aAwN3TGBZx0OfrMWcTqojIIZm8Ugh9KzqsLkmGfqbQZ0vszghCditHK8c0Mh_e_JiGHE_PYVTGt8EviwZrv_dFxYNt3F14ZcQ5-j4h-oXOdma7Jfd_xXjUHzJ7LoPalfHxMvW9KNKtqh4Crz946VfhQciMjWxJIWxUBpIvm059E9KNCv5B80XEwzyQIUVoleUeczDvjjXR_NWrEwkgukOR8gOpyAvcPvRueHhUZS61-se_V8DmqVpb4YURAP2YunfH1QP1DExcqecI16GIRkZ3zN2B5CLS7e5rnXOVuxFPuag7onmGm6jn8JBGhB5FVaCMdozas5WihY5Z0FrVgbIvZMBQb1ax4LOD8bEhYbZ0JbVRV5ni0F3fmB5JTclf0QcHVDjl6GOH2aKOvocrQcP2KHfRoy8MKRcg6JpJLQ9bsgZJw4mls_PdqFO3oqdEHZzzlC8M6ESTgr4cRLVvYd9zNdKvIoMjeDsgATevPqf7hosNKtofWFhUp92c41t-UP44sLj3L3806H-ezm-QsJMjfI5gRVTFJMG66FcGYKdMfhvEWACHdHYVW6dOaI16zXB-plLljL8oIbyukr7RUQLnTgP0"}}' 
```
