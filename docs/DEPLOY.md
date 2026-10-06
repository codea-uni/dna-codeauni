# Despliegue

Producción: <https://dna.codeadevelopment.com> (VPS con Traefik, red Docker `proxy`).

- `Dockerfile`: compila con Node 24 + pnpm (`pnpm build`, incluye typecheck) y sirve `apps/web/dist` con nginx (etapa `web`).
- `deploy/nginx.conf`: fallback SPA a `index.html`, caché larga para `/assets/` y `no-cache` para el index. Las salas de VR (`/api/rooms/`, D-19) son WebSocket: nginx pasa `Upgrade` y `Connection` con un `proxy_read_timeout` de 1 h; Traefik ya admite WebSocket. WebXR exige HTTPS, que producción ya tiene.
- `docker-compose.yml`: labels de Traefik con TLS de Let's Encrypt. El dominio se cambia con la variable `DOMAIN`.

## Servidor (D-14): login, empresas, minas e historial

Opcional. Sin él, la web funciona como siempre (sin login, con autoguardado local).

- `Dockerfile` tiene tres etapas: `build`, `server` (bundle de Node de `apps/server`, sin `node_modules`) y `web` (nginx, la de siempre).
- `docker-compose.yml` agrega `api` y `postgres` bajo el perfil `server`, en la red interna `backend`. Solo `web` queda expuesta a Traefik; nginx pasa `/api/` a `api:3000` (mismo origen, cookie de sesión sin CORS).
- Para activarlo, la primera vez (después basta `./scripts/deploy.sh`):

  ```sh
  ./scripts/deploy.sh --server
  ```

  Completa `/opt/dna-codeauni/.env`: `COMPOSE_PROFILES=server`, `VITE_API_URL=/api` y secretos aleatorios para `POSTGRES_PASSWORD` y `BETTER_AUTH_SECRET` si faltan. Usa `plataforma@cronos.local` si no hay correo de superadministrador y fija `CRONOS_SUPERADMIN_PASSWORD=cronos123`, reemplazando la contraseña anterior. El `.env` manda: al arrancar la API se crea o sincroniza esa cuenta sin cambio obligatorio. También se crean las cuentas demo, empresas, minas y proyectos del README, salvo con `CRONOS_DEMO_DATA=false`. Desde `/platform` se pueden crear otras empresas; el superadministrador no pertenece a ninguna. Al final espera a que `/api/health` responda. El `.env` nunca va al repositorio (plantilla en `.env.example`). Para el **Asistente IA** se agrega a mano `GEMINI_API_KEY=` (y opcionalmente `GEMINI_MODEL`, por defecto `gemini-flash-latest`) y se reinicia `api`; sin clave, la pestaña avisa que falta.

- Las migraciones se aplican solas al arrancar `api`. Los datos quedan en el volumen `pgdata`; respaldo: `docker compose exec postgres pg_dump -U cronos cronos > respaldo.sql`.
- Salud: `https://<dominio>/api/health` (`status` y `database`).
- Contraseña olvidada: `docker compose exec api node dist/resetPassword.js <correo> <contraseña>` (en local: `pnpm --filter @cronos/server reset-password <correo> <contraseña>`). Queda fija (con `--temporal` se pide cambiarla al entrar) y cierra las sesiones de esa cuenta.
- El límite de 5 inicios de sesión por minuto e IP solo rige en producción (`NODE_ENV=production`, lo fija la imagen).

### Desarrollo local

```sh
pnpm dev:online   # PostgreSQL (Docker), API en :3000 y web con login en http://localhost:5173
```

`pnpm dev:online` levanta PostgreSQL con `docker-compose.dev.yml`, crea `apps/server/.env` desde su plantilla si falta, reutiliza una API que ya esté corriendo en :3000 y arranca la web en :5173 (puerto fijo: el login solo se acepta desde ese origen). Ctrl+C detiene la API y la web; PostgreSQL queda arriba para las pruebas. Por separado: `pnpm dev:server` y `VITE_API_URL=/api pnpm dev`.

El `.env` de ejemplo crea el superadministrador `plataforma@cronos.local` con la contraseña `cronos123` (la del `.env`; no se pide cambiarla). Usuarios de desarrollo en el README. No hay registro público: el administrador crea las cuentas (guía H-801). Sin `VITE_API_URL`, `pnpm dev` sigue en modo local, sin login.

Las pruebas del servidor usan ese PostgreSQL (o `TEST_DATABASE_URL`) y crean un esquema aislado por archivo; sin base se saltan con un aviso, salvo en CI.

## Actualizar con un solo script

En el VPS, dentro del checkout:

```sh
cd /opt/dna-codeauni
./deploy.sh
```

El script descarga la rama remota de seguimiento, actualiza por fast-forward y ejecuta el
build y arranque de Docker Compose. Usa el `.env` existente: no hace falta pasar `--server`
para mantener un servidor ya activado. Requiere Docker Compose, acceso a Git y la red
`proxy` de Traefik. Se detiene si hay cambios locales o archivos sin seguimiento.

### Primera actualización después de un amend

Si el checkout todavía no tiene el nuevo `deploy.sh`, obtén el script desde Git sin hacer
`pull` (el historial anterior puede haber divergido):

```sh
cd /opt/dna-codeauni
git fetch origin main && git show FETCH_HEAD:deploy.sh > /tmp/kronos-deploy.sh && sh /tmp/kronos-deploy.sh --sync-amended
```

Para actualizaciones posteriores con historial reescrito:

```sh
./deploy.sh --sync-amended
```

`--sync-amended` autoriza reemplazar el historial local por el remoto. Antes guarda el commit
local en una rama `backup/deploy-…` y exige que el checkout esté limpio. Conserva el `.env`
ignorado y los volúmenes de PostgreSQL. La rama de respaldo conserva **código**, no es un
respaldo de la base de datos; las migraciones siguen aplicándose al arrancar la API.

Para activar el servidor por primera vez: `./deploy.sh --server` (consulta arriba el efecto
sobre las cuentas). `./deploy.sh --help` muestra las opciones. Si el build o el arranque
fallan, el script termina con error; consulta `docker compose logs --tail=100`.

En local: `pnpm install` y `pnpm dev` (sin login) o `pnpm dev:online` (con login).
