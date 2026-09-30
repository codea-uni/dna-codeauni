import type { Migration } from 'kysely/migration';
import * as auth from './2026_09_30_01_auth';
import * as organizations from './2026_09_30_02_organizations';

/**
 * Migraciones en orden de nombre (`AAAA_MM_DD_NN_tema`). Se importan de forma estática para que el
 * bundle de producción las incluya. Una migración aplicada no se edita: se agrega otra.
 */
export const migrations: Record<string, Migration> = {
  '2026_09_30_01_auth': auth,
  '2026_09_30_02_organizations': organizations,
};
