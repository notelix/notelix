# notelix

![logo](design/logo/FullColor_TransparentBg_1280x1024_72dpi.png)

An open source web note taking / highlighter software

![demo](design/demo.png)


Powered by the powerful and reliable MIT-licensed web-marker: https://github.com/notelix/web-marker

# installing
```
cd server
yarn install
cd ..
cd chrome-extension 
yarn install 
```

# setting up databases
```bash
mkdir notelix-data
cd notelix-data
docker run --name notelix-typesense --restart always -d -p 8108:8108 -v "$(pwd)/typesense-data:/data" typesense/typesense:0.20.0 --data-dir /data --api-key=Hu52dwsas2AdxdE --enable-cors
docker run --name notelix-mysql --restart always -d -p 3306:3306 -v "$(pwd)/mysql-data:/var/lib/mysql" -e MYSQL_ROOT_PASSWORD=notelix mysql/mysql-server:latest
sleep 60
docker exec -it notelix-mysql mysql -uroot -pnotelix --execute "set global max_allowed_packet = 1024*1024;"
docker exec -it notelix-mysql mysql -uroot -pnotelix --execute "CREATE USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY '123456'; GRANT ALL ON *.* TO 'root'@'%'; FLUSH PRIVILEGES;"
docker exec -it notelix-mysql mysql -uroot -pnotelix --execute "create database notelix CHARACTER SET=utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd server
npx typeorm schema:sync
cd src/typesense/schema
./install.sh
```

# running server
```
cd server
npm start
```

or

```
pm2 start npm -- start
```

# running chrome extension
```
cd chrome-extension
./build-extension.sh
```

Then `Load unpacked` from `chrome://extensions/`

# public development server

If you would like to try this plugin, you can use this `Server`:

```
https://dev.notelix.com
```

# TODO
* [ ] support docker compose; publish docker image
* [ ] automated data backup script
* [ ] front end dashboard, supporting search, etc. (if clientside search is enabled, search feature might be limited)
* [ ] add user docs, screenshots, etc.
* [ ] add installation guide
* [ ] free public server
* [ ] chrome web store
* [ ] refactor code