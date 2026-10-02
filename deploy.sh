#!/usr/bin/env sh
# Ejecutar dentro del checkout del VPS. No requiere Node ni pnpm en el host.
set -eu

usage() {
  cat <<'HELP'
Uso: ./deploy.sh [--sync-amended] [--server]

  Sin opciones     Actualiza la rama con fast-forward y despliega con el .env existente.
  --sync-amended   Permite reemplazar el historial local tras un amend/force-push.
                   Guarda primero HEAD en una rama backup/deploy-…; exige checkout limpio.
  --server         Activa el perfil servidor mediante scripts/deploy.sh --server.
                   Esta opción de configuración fija la contraseña admin como indica DEPLOY.md.
  --help           Muestra esta ayuda.

Requisitos: Git, Docker Compose, acceso al remoto y red Docker externa proxy con Traefik.
HELP
}

# La función se lee completa antes de actualizar el propio archivo desde Git.
main() {
  sync_amended=false
  enable_server=false
  for arg in "$@"; do
    case "$arg" in
      --sync-amended) sync_amended=true ;;
      --server) enable_server=true ;;
      --help|-h) usage; return 0 ;;
      *) printf 'Opción desconocida: %s\n' "$arg" >&2; usage >&2; return 1 ;;
    esac
  done

  command -v git >/dev/null 2>&1 || { echo 'Falta Git.' >&2; return 1; }
  command -v docker >/dev/null 2>&1 || { echo 'Falta Docker.' >&2; return 1; }
  repo_dir=$(git rev-parse --show-toplevel)
  cd "$repo_dir"
  branch=$(git symbolic-ref --quiet --short HEAD) || {
    echo 'Selecciona la rama de despliegue; HEAD está separado.' >&2; return 1;
  }
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    echo 'Hay cambios locales o archivos sin seguimiento. Guárdalos antes de desplegar.' >&2
    echo 'El .env ignorado por Git se conserva y no impide el despliegue.' >&2
    return 1
  fi
  remote=$(git config --get "branch.$branch.remote") || {
    echo 'La rama no tiene remoto de seguimiento.' >&2; return 1;
  }
  remote_ref=$(git config --get "branch.$branch.merge") || {
    echo 'La rama no tiene rama remota de seguimiento.' >&2; return 1;
  }
  [ "$remote" != '.' ] || { echo 'El seguimiento debe apuntar a un remoto.' >&2; return 1; }
  docker compose version >/dev/null
  docker info >/dev/null
  docker network inspect proxy >/dev/null 2>&1 || {
    echo 'Falta la red Docker proxy. Configura Traefik antes de desplegar (docs/DEPLOY.md).' >&2
    return 1
  }

  printf '\nActualizando %s desde %s (%s)…\n' "$branch" "$remote" "$remote_ref"
  git fetch "$remote" "$remote_ref"
  target=$(git rev-parse FETCH_HEAD)
  previous=$(git rev-parse HEAD)
  if git merge-base --is-ancestor "$previous" "$target"; then
    git merge --ff-only "$target"
  elif [ "$sync_amended" = true ]; then
    backup="backup/deploy-$(date -u +%Y%m%dT%H%M%SZ)-$$"
    git branch "$backup" "$previous"
    printf 'Commit anterior guardado en %s\n' "$backup"
    # --keep aborta si una modificación concurrente fuera a perderse. No usa git clean.
    git reset --keep "$target"
  else
    echo 'El historial divergió (por ejemplo, después de un amend).' >&2
    echo 'Para sincronizarlo guardando una rama de respaldo: ./deploy.sh --sync-amended' >&2
    return 1
  fi

  printf '\nDesplegando commit %s…\n' "$(git rev-parse --short HEAD)"
  if [ "$enable_server" = true ]; then
    sh scripts/deploy.sh --no-pull --server
  else
    sh scripts/deploy.sh --no-pull
  fi
  printf '\nDespliegue terminado. Commit: %s\n' "$(git rev-parse --short HEAD)"
}

main "$@"
