#!/bin/sh
set -eu

node ./tools/ensure-pg-db.js
node ./tools/run-migrations.js

# Replace the bootstrap shell so the Nest process receives container signals
# directly and can run its shutdown hooks before exiting.
exec node ./dist/main.js
