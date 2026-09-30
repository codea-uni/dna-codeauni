# Despliegue

Producción: <https://dna.codeadevelopment.com> (VPS con Traefik, red Docker `proxy`).

- `Dockerfile`: compila con Node 24 + pnpm (`pnpm build`, incluye typecheck) y sirve `apps/web/dist` con nginx (etapa `web`).
- `deploy/nginx.conf`: fallback SPA a `index.html`, caché larga para `/assets/` y `no-cache` para el index.
- `docker-compose.yml`: labels de Traefik con TLS de Let's Encrypt. El dominio se cambia con la variable `DOMAIN`.

## Servidor (D-14): login, empresas, minas e historial

Opcional. Sin él, la web funciona como siempre (sin login, con autoguardado local).

- `Dockerfile` tiene tres etapas: `build`, `server` (bundle de Node de `apps/server`, sin `node_modules`) y `web` (nginx, la de siempre).
- `docker-compose.yml` agrega `api` y `postgres` bajo el perfil `server`, en la red interna `backend`. Solo `web` queda expuesta a Traefik; nginx pasa `/api/` a `api:3000` (mismo origen, cookie de sesión sin CORS).
- Para activarlo, la primera vez (después basta `./scripts/deploy.sh`):

  ```sh
  CRONOS_ADMIN_EMAIL=correo@empresa ./scripts/deploy.sh --server
  ```

  Completa `/opt/dna-codeauni/.env` sin tocar lo que ya tenga: `COMPOSE_PROFILES=server`, `VITE_API_URL=/api` y secretos aleatorios para `POSTGRES_PASSWORD` y `BETTER_AUTH_SECRET`. Con `CRONOS_ADMIN_EMAIL` crea el primer administrador y muestra una sola vez su contraseña temporal. Al final espera a que `/api/health` responda. El `.env` nunca va al repositorio (plantilla en `.env.example`).

- Las migraciones se aplican solas al arrancar `api`. Los datos quedan en el volumen `pgdata`; respaldo: `docker compose exec postgres pg_dump -U cronos cronos > respaldo.sql`.
- Salud: `https://<dominio>/api/health` (`status` y `database`).
- Contraseña olvidada: `docker compose exec api node dist/resetPassword.js <correo> <contraseña temporal>` (en local: `pnpm --filter @cronos/server reset-password <correo> <contraseña>`). Queda temporal y cierra las sesiones de esa cuenta.
- El límite de 5 inicios de sesión por minuto e IP solo rige en producción (`NODE_ENV=production`, lo fija la imagen).

### Desarrollo local

```sh
pnpm dev:online   # PostgreSQL (Docker), API en :3000 y web con login en http://localhost:5173
```

`pnpm dev:online` levanta PostgreSQL con `docker-compose.dev.yml`, crea `apps/server/.env` desde su plantilla si falta, reutiliza una API que ya esté corriendo en :3000 y arranca la web en :5173 (puerto fijo: el login solo se acepta desde ese origen). Ctrl+C detiene la API y la web; PostgreSQL queda arriba para las pruebas. Por separado: `pnpm dev:server` y `VITE_API_URL=/api pnpm dev`.

El `.env` de ejemplo crea el administrador `admin@cronos.local` (contraseña temporal `admin-cronos-dev`, se cambia al entrar). No hay registro público: el administrador crea las cuentas (guía H-801). Sin `VITE_API_URL`, `pnpm dev` sigue en modo local, sin login.

Las pruebas del servidor usan ese PostgreSQL (o `TEST_DATABASE_URL`) y crean un esquema aislado por archivo; sin base se saltan con un aviso, salvo en CI.

## Actualizar

```sh
cd /opt/dna-codeauni
./scripts/deploy.sh   # git pull + docker compose up -d --build (con el servidor si .env lo activa)
```

En local: `pnpm install` y `pnpm dev` (sin login) o `pnpm dev:online` (con login).
