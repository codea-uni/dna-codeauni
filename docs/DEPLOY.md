# Despliegue

Producción: <https://dna.codeadevelopment.com> (VPS con Traefik, red Docker `proxy`).

- `Dockerfile`: compila con Node 24 + pnpm (`pnpm build`, incluye typecheck) y sirve `apps/web/dist` con nginx (etapa `web`).
- `deploy/nginx.conf`: fallback SPA a `index.html`, caché larga para `/assets/` y `no-cache` para el index.
- `docker-compose.yml`: labels de Traefik con TLS de Let's Encrypt. El dominio se cambia con la variable `DOMAIN`.

## Servidor (D-14): login, empresas, minas e historial

Opcional. Sin él, la web funciona como siempre (sin login, con autoguardado local).

- `Dockerfile` tiene tres etapas: `build`, `server` (bundle de Node de `apps/server`, sin `node_modules`) y `web` (nginx, la de siempre).
- `docker-compose.yml` agrega `api` y `postgres` bajo el perfil `server`, en la red interna `backend`. Solo `web` queda expuesta a Traefik; nginx pasa `/api/` a `api:3000` (mismo origen, cookie de sesión sin CORS).
- Para activarlo, en `/opt/dna-codeauni/.env` (nunca en el repositorio; plantilla en `.env.example`):

  ```sh
  COMPOSE_PROFILES=server
  VITE_API_URL=/api
  POSTGRES_PASSWORD=<contraseña larga>
  ```

- Las migraciones se aplican solas al arrancar `api`. Los datos quedan en el volumen `pgdata`; respaldo: `docker compose exec postgres pg_dump -U cronos cronos > respaldo.sql`.
- Salud: `https://<dominio>/api/health` (`status` y `database`).

### Desarrollo local

```sh
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL en localhost:54329
cp apps/server/.env.example apps/server/.env
pnpm dev:server                                  # API en localhost:3000
VITE_API_URL=/api pnpm dev                       # web con login; Vite pasa /api a :3000
```

El `.env` de ejemplo crea el administrador `admin@cronos.local` (contraseña temporal `admin-cronos-dev`, se cambia al entrar). No hay registro público: el administrador crea las cuentas (guía H-801). Sin `VITE_API_URL`, `pnpm dev` sigue en modo local, sin login.

Las pruebas del servidor usan ese PostgreSQL (o `TEST_DATABASE_URL`) y crean un esquema aislado por archivo; sin base se saltan con un aviso, salvo en CI.

## Actualizar

```sh
cd /opt/dna-codeauni
./scripts/deploy.sh   # git pull + docker compose up -d --build
```

En local se sigue usando `pnpm install` y `pnpm dev`.
