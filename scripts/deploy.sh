#!/usr/bin/env sh
# Actualiza y despliega en producción (Docker + Traefik).
# Uso: ./scripts/deploy.sh
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
