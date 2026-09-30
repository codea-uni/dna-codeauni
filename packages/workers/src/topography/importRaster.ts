import {
  assembleTopography,
  checkTopography,
  readLasHeader,
  worldFileFor,
  type AssembleOptions,
  type AssembleResult,
  type ImportTopoFormat,
  type OrthoImageData,
  type TopoFile,
  type TopoInspection,
} from '@cronos/core';
import { DEFAULT_CLOUD_CELL, readCloud } from './cloud';
import {
  DEFAULT_DEM_TOLERANCE,
  demToTin,
  geoTiffImage,
  inspectGeoTiff,
  worldFileImage,
} from './raster';

/** Opciones de lectura de rásteres y nubes. */
export interface RasterReadOptions {
  /** Error vertical máximo al simplificar un DEM [m] (S-17). */
  demTolerance?: number;
  /** Celda de reducción de nubes [m] (S-14). */
  cloudCell?: number;
}

const fileOf = (files: readonly TopoFile[], format: ImportTopoFormat) =>
  files.find((f) =>
    format === 'geotiff'
      ? /\.tiff?$/i.test(f.name)
      : format === 'las'
        ? /\.la[sz]$/i.test(f.name)
        : /\.(jpe?g|png|webp)$/i.test(f.name),
  );

/** Completa la inspección con lo propio de GeoTIFF, imágenes y nubes. */
export async function inspectRaster(
  files: readonly TopoFile[],
  base: TopoInspection,
): Promise<TopoInspection> {
  const format = base.format;
  if (!format) return base;
  const file = fileOf(files, format);
  if (!file) return base;
  if (format === 'geotiff') {
    const info = await inspectGeoTiff(file.bytes);
    return {
      ...base,
      raster: { kind: info.kind, width: info.width, height: info.height },
      ...(info.epsg !== undefined ? { epsg: info.epsg } : {}),
    };
  }
  if (format === 'las') {
    const h = readLasHeader(file.bytes);
    return {
      ...base,
      cloud: { count: h.count, version: h.version, compressed: h.compressed },
      ...(h.epsg !== undefined ? { epsg: h.epsg } : {}),
    };
  }
  if (format === 'image') return { ...base, missingWorldFile: !worldFileFor(files, file.name) };
  return base;
}

/** Ortofoto como parte del levantamiento: no se reproyecta (la imagen tendría que deformarse). */
function imageResult(image: OrthoImageData, options: AssembleOptions): AssembleResult {
  const g = image.georef;
  const bounds = {
    minX: Math.min(g.originX, g.originX + g.pixelSizeX * image.width),
    maxX: Math.max(g.originX, g.originX + g.pixelSizeX * image.width),
    minY: Math.min(g.originY, g.originY + g.pixelSizeY * image.height),
    maxY: Math.max(g.originY, g.originY + g.pixelSizeY * image.height),
    minZ: 0,
    maxZ: 0,
  };
  const stats = {
    points: 0,
    triangles: 0,
    lines: 0,
    duplicates: 0,
    skippedConstraints: 0,
    droppedTriangles: 0,
  };
  if (
    options.fromEpsg !== undefined &&
    options.toEpsg !== undefined &&
    options.fromEpsg !== options.toEpsg
  )
    return { parts: {}, bounds, warnings: [{ code: 'raster.noReproject' }], stats };
  // Una imagen no tiene cotas: el aviso de «cotas en 0» no aplica.
  const warnings = checkTopography(bounds, 1, {
    ...(options.projectEpsg !== undefined ? { targetEpsg: options.projectEpsg } : {}),
    ...(options.fromEpsg !== undefined ? { sourceEpsg: options.fromEpsg } : {}),
    ...(options.projectBounds ? { projectBounds: options.projectBounds } : {}),
  }).filter((w) => w.code !== 'topo.noZ');
  return { parts: { image }, bounds, warnings, stats };
}

/** Importa un GeoTIFF (DEM u ortofoto), una imagen con archivo de mundo o una nube LAS/LAZ. */
export async function importRaster(
  files: readonly TopoFile[],
  format: 'geotiff' | 'image' | 'las',
  read: RasterReadOptions,
  options: AssembleOptions,
): Promise<AssembleResult> {
  const file = fileOf(files, format);
  if (!file) throw new Error('Falta el archivo principal');
  if (format === 'image') {
    const world = worldFileFor(files, file.name);
    if (!world) throw new Error(`Falta el archivo de mundo de ${file.name}`);
    return imageResult(
      await worldFileImage(file.bytes, new TextDecoder().decode(world.bytes)),
      options,
    );
  }
  if (format === 'geotiff') {
    const info = await inspectGeoTiff(file.bytes);
    if (info.kind === 'image') return imageResult((await geoTiffImage(file.bytes)).image, options);
    const { tin } = await demToTin(file.bytes, read.demTolerance ?? DEFAULT_DEM_TOLERANCE);
    return assembleTopography(
      {
        points: [],
        lines: [],
        faces: tin,
        ...(info.epsg !== undefined ? { epsg: info.epsg } : {}),
        warnings: [],
      },
      options,
    );
  }
  const cloud = await readCloud(file.bytes, { cell: read.cloudCell ?? DEFAULT_CLOUD_CELL });
  const warnings = cloud.excluded > 0 ? [{ code: 'las.noise', params: { n: cloud.excluded } }] : [];
  const r = assembleTopography(
    {
      points: cloud.points,
      lines: [],
      ...(cloud.header.epsg !== undefined ? { epsg: cloud.header.epsg } : {}),
      warnings,
    },
    options,
  );
  return {
    ...r,
    warnings: [
      { code: 'las.read', params: { read: cloud.read, kept: cloud.points.length / 3 } },
      ...r.warnings,
    ],
  };
}
