#!/usr/bin/env bash

APIKEY=$(docker exec notelix-typesense ps aux | grep -Po '(?<=api-key=)(.+?) ')

for FILE in *.json; do
  echo "Installing $FILE"
  curl "http://localhost:8108/collections" \
        -X POST \
        -H "X-TYPESENSE-API-KEY: ${APIKEY}" \
        -d "$(cat ./$FILE)"
done
