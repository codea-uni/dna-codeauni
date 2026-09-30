import type { Migration } from 'kysely/migration';
import * as auth from './2026_09_30_01_auth';
import * as organizations from './2026_09_30_02_organizations';
import * as projects from './2026_09_30_03_projects';
import * as platform from './2026_09_30_04_platform';
import * as superadminAlone from './2026_09_30_05_superadmin_without_organization';

/**
 * Migraciones en orden de nombre (`AAAA_MM_DD_NN_tema`). Se importan de forma estática para que el
 * bundle de producción las incluya. Una migración aplicada no se edita: se agrega otra.
 */
export const migrations: Record<string, Migration> = {
  '2026_09_30_01_auth': auth,
  '2026_09_30_02_organizations': organizations,
  '2026_09_30_03_projects': projects,
  '2026_09_30_04_platform': platform,
  '2026_09_30_05_superadmin_without_organization': superadminAlone,
};
