# Despliegue

Producción: <https://dna.codeadevelopment.com> (VPS con Traefik, red Docker `proxy`).

- `Dockerfile`: compila con Node 24 + pnpm (`pnpm build`, incluye typecheck) y sirve `apps/web/dist` con nginx.
- `deploy/nginx.conf`: fallback SPA a `index.html`, caché larga para `/assets/` y `no-cache` para el index.
- `docker-compose.yml`: labels de Traefik con TLS de Let's Encrypt. El dominio se cambia con la variable `DOMAIN`.

## Actualizar

```sh
cd /opt/dna-codeauni
./scripts/deploy.sh   # git pull + docker compose up -d --build
```

En local se sigue usando `pnpm install` y `pnpm dev`.
