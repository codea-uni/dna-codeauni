import type { Migration } from 'kysely/migration';
import * as auth from './2026_09_30_01_auth';
import * as organizations from './2026_09_30_02_organizations';
import * as projects from './2026_09_30_03_projects';
import * as platform from './2026_09_30_04_platform';
import * as superadminAlone from './2026_09_30_05_superadmin_without_organization';
import * as topography from './2026_09_30_06_topography';
import * as knowledge from './2026_10_13_01_knowledge';
import * as presets from './2026_10_13_02_presets';
import * as cloudBlocks from './2026_10_20_01_cloud_blocks';
import * as projectKind from './2026_10_20_02_project_kind';
import * as workings from './2026_10_20_02_workings';
import * as mineVibration from './2026_10_20_03_mine_vibration';

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
  '2026_09_30_06_topography': topography,
  '2026_10_13_01_knowledge': knowledge,
  '2026_10_13_02_presets': presets,
  '2026_10_20_01_cloud_blocks': cloudBlocks,
  '2026_10_20_02_project_kind': projectKind,
  '2026_10_20_02_workings': workings,
  '2026_10_20_03_mine_vibration': mineVibration,
};
