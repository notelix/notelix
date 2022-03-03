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
echo 'DB_PASSWORD=123456' > .env
docker network create notelix

# start server in dev mode

docker build . -f ./Dockerfile.dev -t notelix:dev
docker-compose -f docker-compose.dev.yml --env-file .env.dev -p notelix-dev up -d 
```

# Architecture

![](./design/architecture.png)
