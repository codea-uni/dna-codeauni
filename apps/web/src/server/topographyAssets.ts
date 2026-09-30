import { ApiError } from '@cronos/api';
import type { Project } from '@cronos/core';
import { getAsset } from '../persistence/assets';
import { api } from './api';

/**
 * Antes de guardar un proyecto en la mina (D-16): sube los assets de topografía que el servidor
 * no tiene. Solo viajan los que faltan; el servidor verifica el hash de cada uno.
 */
export async function uploadMissingAssets(mineId: string, project: Project): Promise<void> {
  const hashes = project.topography.flatMap((s) =>
    [s.assets.tin, s.assets.lines, s.assets.image].filter((h): h is string => h !== undefined),
  );
  const missing = await api.missingAssets(mineId, hashes);
  for (const hash of missing) {
    const bytes = await getAsset(hash);
    if (!bytes)
      throw new ApiError(0, 'asset_local_missing', `Asset ${hash} is not in this browser`);
    await api.uploadAsset(mineId, hash, bytes);
  }
}
