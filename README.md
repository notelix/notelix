# notelix

![logo](design/logo/FullColor_TransparentBg_1280x1024_72dpi.png)

An open source web note taking / highlighter software (chrome extension with backend)

![demo](design/demo.gif)

Powered by the powerful and reliable MIT-licensed web-marker: https://github.com/notelix/web-marker

If you want to try out this chrome extension, just go to the [release page](https://github.com/notelix/notelix/releases)
and download a zip
file. [(How to install chrome plugin from zip?)](https://dev.to/ben/how-to-install-chrome-extensions-manually-from-github-1612)

# building and running chrome extension

```
cd chrome-extension
./build-extension.sh
```

Then `Load unpacked` from `chrome://extensions/`

# building and running backend

```
cd ./server
echo "DB_PASSWORD=$(echo $RANDOM$RANDOM$RANDOM | md5sum | head -c 32)" > .env.dev
docker network create notelix

# start server in dev mode

docker build . -f ./Dockerfile.dev -t notelix:dev
docker-compose -f docker-compose.dev.yml --env-file .env.dev -p notelix-dev up -d 
```

# Architecture

![](./design/architecture.png)

# Running notelix agent (only necessary when client-side encryption is enabled)

```
cd server
echo "DB_PASSWORD=123456" > .env.agent
docker network create notelix
docker build . -f ./Dockerfile.agent -t notelix:agent
docker-compose -f docker-compose.agent.yml --env-file .env.agent -p notelix-agent up -d
```

Wait a bit, refresh a tab in Chrome, then wait a bit for data to sync.

After successful data sync, you will be able to use advanced features such as searching, with client-side encryption
enabled.

# Public DEV server

```
https://public-dev.notelix.com/
```

Note: this server is free-to-use, but **doesn't provide any guarantee regarding availability or data safety**.

In fact, this database will be reset when there is major Notelix API change. (expected every year).

Only use this dev server when you are trying out Notelix.

For production use, please host your own server (see `building and running backend`), and
use cron + pg_dump or https://github.com/wal-g/wal-g to backup your database.

# Using Notelix as SaaS to add it to your website without requiring users to install a browser extension

See [chrome-extension/saas.html](./chrome-extension/saas.html)
