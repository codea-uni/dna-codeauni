import type { Migration } from 'kysely/migration';

/**
 * Migraciones en orden de nombre (`AAAA_MM_DD_NN_tema`). Se importan de forma estática para que el
 * bundle de producción las incluya. Una migración aplicada no se edita: se agrega otra.
 */
export const migrations: Record<string, Migration> = {};
