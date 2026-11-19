#!/usr/bin/env bash
# Sends the working tree to the server and (re)builds and restarts the bot there.
# Usage: ./deploy.sh user@host
# First time only, copy the two files that never travel with the code:
#   scp .env ids.json user@host:tft-tactics-tools-discord/
set -euo pipefail
SERVER=${1:?usage: ./deploy.sh user@host}
DIR=tft-tactics-tools-discord

tar -czf - --exclude=node_modules --exclude=.git --exclude=dist --exclude=screens \
  --exclude=logs --exclude=.env --exclude=ids.json . |
  ssh "$SERVER" "mkdir -p $DIR/logs && tar -xzf - -C $DIR"

# Refuse to start without .env and ids.json: Docker would create ids.json as a directory.
ssh "$SERVER" "cd $DIR && test -f .env && test -f ids.json \
  && docker compose up -d --build && sleep 8 && docker compose logs --tail 8 bot"
