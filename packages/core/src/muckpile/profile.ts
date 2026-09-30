import type { ScalarGrid } from '../energy/contours';
import type { Vec2 } from '../model/types';
import { PILE_MIN_THICKNESS } from './simulate';
import type { MuckpileGrids } from './types';

/** Cota de una grilla en (x, y) por interpolación bilineal entre centros de celda (NaN fuera). */
export function gridElevationAt(g: ScalarGrid, x: number, y: number): number {
  if (g.nx === 0 || g.ny === 0) return NaN;
  const fx = (x - g.originX) / g.cellSize - 0.5;
  const fy = (y - g.originY) / g.cellSize - 0.5;
  if (fx < -0.5 || fy < -0.5 || fx > g.nx - 0.5 || fy > g.ny - 0.5) return NaN;
  const cx = Math.min(g.nx - 1, Math.max(0, fx));
  const cy = Math.min(g.ny - 1, Math.max(0, fy));
  const i = Math.min(Math.max(0, g.nx - 2), Math.floor(cx));
  const j = Math.min(Math.max(0, g.ny - 2), Math.floor(cy));
  const tx = g.nx > 1 ? cx - i : 0;
  const ty = g.ny > 1 ? cy - j : 0;
  const v = (ii: number, jj: number) =>
    g.values[Math.min(g.ny - 1, jj) * g.nx + Math.min(g.nx - 1, ii)] ?? NaN;
  return (
    (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - ty) +
    (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * ty
  );
}

/** Adaptador: una grilla como superficie consultable (p. ej. para comparar o calibrar). */
export function gridSurface(g: ScalarGrid): { elevationAt(x: number, y: number): number | null } {
  return {
    elevationAt: (x, y) => {
      const z = gridElevationAt(g, x, y);
      return Number.isFinite(z) ? z : null;
    },
  };
}

/** Perfil 2D de la pila en una sección vertical a–b (A7: «perfil en cualquier sección»). */
export interface MuckpileProfile {
  /** Distancia a lo largo de la sección desde a [m]. */
  s: Float64Array;
  /** Cotas antes, después y del terreno fijo [m] (NaN fuera de la grilla). */
  before: Float64Array;
  after: Float64Array;
  base: Float64Array;
  /** Largo de la sección [m]. */
  length: number;
  /** Mayor bajada de la superficie (antes − después) y su posición [m]. */
  maxDrop: { value: number; s: number };
  /** Mayor subida (después − antes) y su posición [m]. */
  maxRise: { value: number; s: number };
  /**
   * Throw en la sección: del último punto con techo in situ (antes > base) al pie de la pila más
   * alejado en el mismo sentido (espesor ≥ 0,1 m) [m]; NaN si la pila no sale del perímetro.
   */
  throw: { value: number; from: number; to: number };
}

/** Muestrea antes, después y base cada ~½ celda a lo largo de la sección a–b. */
export function sampleProfile(
  grids: Pick<MuckpileGrids, 'base' | 'before' | 'after'>,
  a: Vec2,
  b: Vec2,
): MuckpileProfile {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const step = Math.max(0.05, grids.after.cellSize / 2);
  const n = Math.max(2, Math.min(4000, Math.ceil(length / step) + 1));
  const s = new Float64Array(n);
  const before = new Float64Array(n);
  const after = new Float64Array(n);
  const base = new Float64Array(n);
  let maxDrop = { value: -Infinity, s: NaN };
  let maxRise = { value: -Infinity, s: NaN };
  let lastInSitu = -1;
  let firstInSitu = -1;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    s[k] = length * t;
    before[k] = gridElevationAt(grids.before, x, y);
    after[k] = gridElevationAt(grids.after, x, y);
    base[k] = gridElevationAt(grids.base, x, y);
    const drop = (before[k] ?? NaN) - (after[k] ?? NaN);
    if (drop > maxDrop.value) maxDrop = { value: drop, s: s[k] ?? 0 };
    if (-drop > maxRise.value) maxRise = { value: -drop, s: s[k] ?? 0 };
    if ((before[k] ?? NaN) - (base[k] ?? NaN) > PILE_MIN_THICKNESS) {
      if (firstInSitu < 0) firstInSitu = k;
      lastInSitu = k;
    }
  }
  // Pie de la pila más allá del material in situ, hacia adelante (b) o hacia atrás (a).
  let thr = { value: NaN, from: NaN, to: NaN };
  if (lastInSitu >= 0) {
    for (let k = n - 1; k > lastInSitu; k--)
      if ((after[k] ?? NaN) - (base[k] ?? NaN) >= PILE_MIN_THICKNESS) {
        thr = {
          value: (s[k] ?? 0) - (s[lastInSitu] ?? 0),
          from: s[lastInSitu] ?? 0,
          to: s[k] ?? 0,
        };
        break;
      }
    for (let k = 0; k < firstInSitu; k++)
      if ((after[k] ?? NaN) - (base[k] ?? NaN) >= PILE_MIN_THICKNESS) {
        const value = (s[firstInSitu] ?? 0) - (s[k] ?? 0);
        if (!(value <= thr.value)) thr = { value, from: s[firstInSitu] ?? 0, to: s[k] ?? 0 };
        break;
      }
  }
  return {
    s,
    before,
    after,
    base,
    length,
    maxDrop: Number.isFinite(maxDrop.value) ? maxDrop : { value: NaN, s: NaN },
    maxRise: Number.isFinite(maxRise.value) ? maxRise : { value: NaN, s: NaN },
    throw: thr,
  };
}
