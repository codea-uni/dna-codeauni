import type { Bounds3, TopographyFormat, TopographySurvey } from '../model/types';
import {
  assetHash,
  encodeAsset,
  type BlockModelData,
  type LineSetData,
  type PointCloudData,
  type OrthoImageData,
  type TinData,
  type TopographyAsset,
} from './asset';

export interface SurveyInput {
  name: string;
  /** AAAA-MM-DD. */
  surveyDate: string;
  format: TopographyFormat;
  files: string[];
  epsg?: number;
  sourceEpsg?: number;
  transform?: string;
}

export interface SurveyParts {
  tin?: TinData;
  lines?: LineSetData;
  image?: OrthoImageData;
  cloud?: PointCloudData;
  blocks?: BlockModelData;
}

/** Hashes de todos los assets de un levantamiento (para subirlos, exportarlos o verificarlos). */
export function surveyAssetHashes(s: Pick<TopographySurvey, 'assets'>): string[] {
  const a = s.assets;
  return [a.tin, a.lines, a.image, a.cloud, a.blocks].filter((h): h is string => h !== undefined);
}

export interface BuiltSurvey {
  /** Metadatos sin `id` (lo pone quien lo agrega al documento). */
  survey: Omit<TopographySurvey, 'id'>;
  /** Binarios `CRTS` a guardar, por hash. */
  assets: { hash: string; bytes: Uint8Array }[];
}

/** Caja envolvente de coordenadas x, y, z intercaladas (vacía: todo en 0). */
export function boundsOf(xyz: ArrayLike<number>, into?: Bounds3): Bounds3 {
  const b: Bounds3 = into ?? {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  for (let i = 0; i + 2 < xyz.length; i += 3) {
    const x = xyz[i] ?? 0;
    const y = xyz[i + 1] ?? 0;
    const z = xyz[i + 2] ?? 0;
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (z < b.minZ) b.minZ = z;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
    if (z > b.maxZ) b.maxZ = z;
  }
  return b;
}

/**
 * Arma un levantamiento a partir de sus partes: codifica cada una como asset `CRTS`, calcula su
 * hash y resume límites y conteos. O(n): en el navegador corre en el worker.
 */
export function buildSurvey(input: SurveyInput, parts: SurveyParts): BuiltSurvey {
  const assets: BuiltSurvey['assets'] = [];
  const hashes: TopographySurvey['assets'] = {};
  const add = (key: keyof TopographySurvey['assets'], asset: TopographyAsset) => {
    const bytes = encodeAsset(asset);
    const hash = assetHash(bytes);
    assets.push({ hash, bytes });
    hashes[key] = hash;
  };
  let bounds: Bounds3 | undefined;
  if (parts.tin) {
    add('tin', { kind: 'tin', tin: parts.tin });
    bounds = boundsOf(parts.tin.vertices, bounds);
  }
  if (parts.lines) {
    add('lines', { kind: 'lines', lines: parts.lines });
    bounds = boundsOf(parts.lines.coords, bounds);
  }
  if (parts.image) {
    add('image', { kind: 'image', image: parts.image });
    const g = parts.image.georef;
    const x2 = g.originX + g.pixelSizeX * parts.image.width;
    const y2 = g.originY + g.pixelSizeY * parts.image.height;
    const z = bounds ? bounds.minZ : 0;
    bounds = boundsOf([g.originX, g.originY, z, x2, y2, bounds ? bounds.maxZ : 0], bounds);
  }
  if (parts.cloud) {
    add('cloud', { kind: 'cloud', cloud: parts.cloud });
    const [ox, oy, oz] = parts.cloud.origin;
    const b = boundsOf(parts.cloud.positions);
    bounds = boundsOf(
      [b.minX + ox, b.minY + oy, b.minZ + oz, b.maxX + ox, b.maxY + oy, b.maxZ + oz],
      bounds,
    );
  }
  if (parts.blocks) {
    add('blocks', { kind: 'blocks', blocks: parts.blocks });
    bounds = blockModelBounds(parts.blocks, bounds);
  }
  const finite = bounds && Number.isFinite(bounds.minX);
  return {
    survey: {
      name: input.name,
      surveyDate: input.surveyDate,
      ...(input.epsg ? { epsg: input.epsg } : {}),
      source: {
        format: input.format,
        files: input.files,
        ...(input.sourceEpsg ? { sourceEpsg: input.sourceEpsg } : {}),
        ...(input.transform ? { transform: input.transform } : {}),
      },
      bounds: finite && bounds ? bounds : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
      stats: {
        points: parts.tin
          ? parts.tin.vertices.length / 3
          : parts.cloud
            ? parts.cloud.positions.length / 3
            : parts.blocks
              ? parts.blocks.centers.length / 3
              : 0,
        triangles: parts.tin ? parts.tin.triangles.length / 3 : 0,
        lines: parts.lines ? Math.max(0, parts.lines.offsets.length - 1) : 0,
      },
      assets: hashes,
    },
    assets,
  };
}

/** Caja envolvente de un modelo de bloques, con el tamaño y el giro de cada bloque. */
export function blockModelBounds(b: BlockModelData, into?: Bounds3): Bounds3 {
  const cos = Math.abs(Math.cos(b.rotation));
  const sin = Math.abs(Math.sin(b.rotation));
  const corners: number[] = [];
  for (let i = 0; i < b.centers.length / 3; i++) {
    const sx = b.sizes[i * 3] ?? 0;
    const sy = b.sizes[i * 3 + 1] ?? 0;
    const sz = b.sizes[i * 3 + 2] ?? 0;
    const hx = (sx * cos + sy * sin) / 2;
    const hy = (sx * sin + sy * cos) / 2;
    const x = b.centers[i * 3] ?? 0;
    const y = b.centers[i * 3 + 1] ?? 0;
    const z = b.centers[i * 3 + 2] ?? 0;
    corners.push(x - hx, y - hy, z - sz / 2, x + hx, y + hy, z + sz / 2);
  }
  return boundsOf(corners, into);
}
