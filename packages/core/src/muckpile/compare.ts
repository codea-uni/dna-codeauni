import type { ScalarGrid } from '../energy/contours';
import type { MuckpileParams } from '../model/types';
import { gridElevationAt } from './profile';
import { PILE_MIN_THICKNESS, simulateMuckpile, type MuckpileInput } from './simulate';
import type { ElevationSource, MuckpileGrids } from './types';

/** Diferencia entre la pila simulada y una superficie medida (dron, levantamiento; A7 §Calibración). */
export interface SurfaceComparison {
  /** Simulada − medida por celda [m]; NaN fuera de la zona de la voladura o sin medición. */
  error: ScalarGrid;
  /** Raíz del error cuadrático medio [m]. */
  rmse: number;
  /** Error medio (sesgo) [m]: positivo = la simulación queda alta. */
  meanError: number;
  maxAbsError: number;
  /** Celdas comparadas. */
  cells: number;
}

/**
 * Compara la superficie de la pila con la medida en las celdas de la zona de la voladura: donde
 * había material in situ o donde hay pila (simulada o medida) de al menos 0,1 m sobre el terreno.
 * `frame` fija la retícula de evaluación (la calibración compara todas las corridas en la misma);
 * fuera de su grilla, la superficie simulada es el terreno fijo del marco.
 */
export function compareSurface(
  grids: Pick<MuckpileGrids, 'base' | 'before' | 'after'>,
  measured: ElevationSource,
  frame: Pick<MuckpileGrids, 'base' | 'before'> = grids,
): SurfaceComparison {
  const { base, before } = frame;
  const own = base === grids.base;
  const values = new Float32Array(base.nx * base.ny).fill(NaN);
  let sum = 0;
  let sum2 = 0;
  let maxAbs = 0;
  let cells = 0;
  for (let j = 0; j < base.ny; j++)
    for (let i = 0; i < base.nx; i++) {
      const k = j * base.nx + i;
      const x = base.originX + (i + 0.5) * base.cellSize;
      const y = base.originY + (j + 0.5) * base.cellSize;
      const z = measured.elevationAt(x, y);
      if (z === null || !Number.isFinite(z)) continue;
      const b = base.values[k] ?? NaN;
      const inGrid = own ? (grids.after.values[k] ?? NaN) : gridElevationAt(grids.after, x, y);
      const sim = Number.isFinite(inGrid) ? inGrid : b;
      const zone =
        (before.values[k] ?? NaN) - b > PILE_MIN_THICKNESS ||
        sim - b >= PILE_MIN_THICKNESS ||
        z - b >= PILE_MIN_THICKNESS;
      if (!zone) continue;
      const e = sim - z;
      values[k] = e;
      sum += e;
      sum2 += e * e;
      maxAbs = Math.max(maxAbs, Math.abs(e));
      cells++;
    }
  return {
    error: {
      originX: base.originX,
      originY: base.originY,
      cellSize: base.cellSize,
      nx: base.nx,
      ny: base.ny,
      values,
    },
    rmse: cells > 0 ? Math.sqrt(sum2 / cells) : NaN,
    meanError: cells > 0 ? sum / cells : NaN,
    maxAbsError: maxAbs,
    cells,
  };
}

export interface CalibrationRange {
  min: number;
  max: number;
  /** Valores a probar (≥ 1; con 1 se usa `min`). */
  steps: number;
}

export interface CalibrationPoint {
  k: number;
  n: number;
  rmse: number;
}

export interface CalibrationResult {
  /** Modelo calibrado (una ley de potencia: la de los parámetros, o k·(Q^⅓/B)^n si era Zhang). */
  velocityModel: 'scaledBurden' | 'richardsMoore';
  best: CalibrationPoint | null;
  points: CalibrationPoint[];
  elapsedMs: number;
}

const values = (r: CalibrationRange) =>
  r.steps <= 1
    ? [r.min]
    : Array.from({ length: r.steps }, (_, i) => r.min + ((r.max - r.min) * i) / (r.steps - 1));

/**
 * Búsqueda por grilla de k y n de la ley de potencia que minimiza el RMSE contra la superficie
 * medida (primera versión de la calibración, FC-40/FC-45 → R2 con perfiles reales, F4 C4).
 */
export function calibrateMuckpile(
  input: MuckpileInput,
  params: MuckpileParams,
  measured: ElevationSource,
  ranges: { k: CalibrationRange; n: CalibrationRange },
  onProgress?: (done: number, total: number) => void,
): CalibrationResult {
  const t0 = performance.now();
  const velocityModel = params.velocityModel === 'richardsMoore' ? 'richardsMoore' : 'scaledBurden';
  const ks = values(ranges.k);
  const ns = values(ranges.n);
  const total = ks.length * ns.length;
  const runs: { k: number; n: number; grids: MuckpileGrids }[] = [];
  for (const k of ks)
    for (const n of ns) {
      runs.push({ k, n, grids: simulateMuckpile(input, { ...params, velocityModel, k, n }).grids });
      onProgress?.(runs.length, total);
    }
  // Marco común: la grilla más grande (todas comparten el terreno fijo y la retícula).
  let frame: MuckpileGrids | null = null;
  for (const r of runs)
    if (!frame || r.grids.base.nx * r.grids.base.ny > frame.base.nx * frame.base.ny)
      frame = r.grids;
  const points: CalibrationPoint[] = [];
  let best: CalibrationPoint | null = null;
  for (const r of runs) {
    const rmse = frame ? compareSurface(r.grids, measured, frame).rmse : NaN;
    const p = { k: r.k, n: r.n, rmse };
    points.push(p);
    if (Number.isFinite(rmse) && (!best || rmse < best.rmse)) best = p;
  }
  return { velocityModel, best, points, elapsedMs: performance.now() - t0 };
}
