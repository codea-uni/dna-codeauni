import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_KEY = 'cronos.chunkReload';

/**
 * `React.lazy` que reintenta la descarga del trozo (red inestable) y, si el trozo ya no existe
 * (se publicó una versión nueva y la página quedó con los nombres viejos), recarga la página una
 * vez. `lazy` recuerda el error para siempre: sin esto, «Reintentar» no servía y la ventana (p. ej.
 * Documentación) quedaba sin cargar hasta recargar a mano.
 */
export function lazyWithRetry<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  attempts = 3,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const mod = await load();
        try {
          globalThis.sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          // sin almacenamiento: nada que limpiar
        }
        return mod;
      } catch (error) {
        last = error;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    reloadOnce();
    throw last;
  });
}

/** Recarga la página como mucho una vez por minuto (evita bucles si el servidor está caído). */
function reloadOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    const at = Number(globalThis.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - at < 60_000) return;
    globalThis.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}
