server
---

# `.env` file

```
POSTGRES_PASSWORD=123456
```

# start server

```
docker-compose -p notelix-server up -d 
docker-compose -p notelix-server down
docker volume rm notelix-server_postgres-data
```
