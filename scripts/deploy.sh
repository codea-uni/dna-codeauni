#!/usr/bin/env sh
# Actualiza y despliega en producción (Docker + Traefik).
#
# Uso:
#   ./scripts/deploy.sh            # despliega según .env (solo la web si no activa el servidor)
#   ./scripts/deploy.sh --server   # activa login, empresas, minas e historial (D-14)
#
# Con --server completa en .env lo que falte (nunca reemplaza un valor existente):
#   COMPOSE_PROFILES=server, VITE_API_URL=/api, y secretos aleatorios para POSTGRES_PASSWORD y
#   BETTER_AUTH_SECRET. Para el primer administrador, exportar CRONOS_ADMIN_EMAIL antes de
#   la primera vez: su contraseña temporal se genera y se muestra una sola vez.
set -eu
cd "$(dirname "$0")/.."

random() { head -c 48 /dev/urandom | base64 | tr -d '\n/+='; }

# Agrega VAR=valor a .env si VAR no tiene valor (una línea comentada no cuenta).
ensure_var() {
  if ! grep -q "^$1=." .env; then
    sed -i "/^$1=$/d" .env
    printf '%s=%s\n' "$1" "$2" >>.env
    return 0
  fi
  return 1
}

if [ "${1:-}" = "--server" ]; then
  touch .env
  chmod 600 .env
  ensure_var COMPOSE_PROFILES server || true
  ensure_var VITE_API_URL /api || true
  ensure_var POSTGRES_PASSWORD "$(random)" || true
  ensure_var BETTER_AUTH_SECRET "$(random)" || true
  if [ -n "${CRONOS_ADMIN_EMAIL:-}" ]; then
    ensure_var CRONOS_ADMIN_EMAIL "$CRONOS_ADMIN_EMAIL" || true
    admin_password="$(random | cut -c1-16)"
    if ensure_var CRONOS_ADMIN_PASSWORD "$admin_password"; then
      echo "Primer administrador: $CRONOS_ADMIN_EMAIL"
      echo "Contraseña temporal: $admin_password (se pide cambiarla al entrar; guárdala ahora)"
    fi
  elif ! grep -q '^CRONOS_ADMIN_EMAIL=.' .env; then
    echo "Aviso: sin CRONOS_ADMIN_EMAIL no se crea el primer administrador."
    echo "       Repetir con: CRONOS_ADMIN_EMAIL=correo@empresa ./scripts/deploy.sh --server"
  fi
fi

git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps

# Con el servidor activo, esperar a que la API y su base respondan.
if grep -q '^COMPOSE_PROFILES=.*server' .env 2>/dev/null; then
  printf 'Esperando la API'
  i=0
  until docker compose exec -T api wget -qO- http://localhost:3000/api/health 2>/dev/null | grep -q '"status":"ok"'; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo ' sin respuesta. Revisar: docker compose logs api'
      exit 1
    fi
    printf '.'
    sleep 2
  done
  echo ' lista.'
fi
