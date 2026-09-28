/** Metadatos de una versión autoguardada (el JSON va aparte, en `SavedVersion.text`). */
export interface VersionInfo {
  id: number;
  projectId: string;
  name: string;
  /** ISO 8601. */
  savedAt: string;
  holes: number;
}

/** Versiones que se conservan por proyecto (H-102). */
export const KEEP_VERSIONS = 20;
/** Separación mínima entre versiones del historial; dentro de ella se sobrescribe la última. */
export const MIN_VERSION_GAP_MS = 60_000;

/**
 * Qué hacer al autoguardar: sobrescribir la última versión del proyecto si es reciente (o crear
 * una nueva) y borrar las que excedan `KEEP_VERSIONS`.
 * ponytail: una versión por minuto como máximo; si hace falta más detalle, guardar diferencias.
 */
export function planWrite(
  existing: readonly VersionInfo[],
  projectId: string,
  now: Date,
): { overwriteId: number | null; deleteIds: number[] } {
  const mine = existing
    .filter((v) => v.projectId === projectId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const last = mine[0];
  const overwrite =
    last !== undefined && now.getTime() - Date.parse(last.savedAt) < MIN_VERSION_GAP_MS;
  const keep = overwrite ? KEEP_VERSIONS : KEEP_VERSIONS - 1; // la nueva ocupa un lugar
  return {
    overwriteId: overwrite ? last.id : null,
    deleteIds: mine.slice(keep).map((v) => v.id),
  };
}
