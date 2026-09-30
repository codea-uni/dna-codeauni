import {
  CloudAccumulator,
  readLasHeader,
  readLasPoints,
  type CloudOptions,
  type LasHeader,
} from '@cronos/core';

/** Celda de reducción por defecto [m] (supuesto S-14). */
export const DEFAULT_CLOUD_CELL = 0.5;

export interface CloudResult {
  points: Float64Array;
  header: LasHeader;
  read: number;
  excluded: number;
}

/** ¿Corre en Node (pruebas)? Allí laz-perf encuentra su `.wasm` solo. */
const inNode = (): boolean =>
  typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node ===
  'string';

/**
 * Nube LAS o LAZ reducida en el momento (S-14). El LAZ se descomprime con laz-perf (LASzip,
 * Apache-2.0) punto a punto dentro del worker: la nube completa nunca está en memoria como JS.
 */
export async function readCloud(bytes: Uint8Array, options: CloudOptions): Promise<CloudResult> {
  const header = readLasHeader(bytes);
  if (!header.compressed) {
    const acc = readLasPoints(bytes, header, options);
    return { points: acc.points(), header, read: acc.read, excluded: acc.excluded };
  }
  const { createLazPerf } = await import('laz-perf');
  const wasmUrl = inNode() ? null : (await import('laz-perf/lib/web/laz-perf.wasm?url')).default;
  const lp = await createLazPerf(wasmUrl ? { locateFile: () => wasmUrl } : {});
  const file = lp._malloc(bytes.length);
  lp.HEAPU8.set(bytes, file);
  const laz = new lp.LASZip();
  try {
    laz.open(file, bytes.length);
    const length = laz.getPointLength();
    const point = lp._malloc(length);
    const acc = new CloudAccumulator({ ...header, recordLength: length }, options);
    const count = laz.getCount();
    for (let i = 0; i < count; i++) {
      laz.getPoint(point);
      // La memoria del módulo puede crecer: la vista se toma después de cada punto.
      acc.add(new DataView(lp.HEAPU8.buffer, point, length), 0);
    }
    lp._free(point);
    return { points: acc.points(), header, read: acc.read, excluded: acc.excluded };
  } finally {
    laz.delete();
    lp._free(file);
  }
}
