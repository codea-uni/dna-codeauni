import type { PointCloudData, TinData } from './asset';
import { decimateGrid } from './decimate';
import { buildTin } from './tin';

/**
 * Nube de puntos → superficie (TIN) 2.5D, como hacen los programas de topografía: la nube es el
 * dato primario y de ella se genera la superficie que usan el diseño, las curvas y la vibración.
 * Un punto por celda de una grilla en planta (cota mínima = suelo sin vegetación ni equipos, media
 * o máxima) y Delaunay sobre esos puntos, recortando los triángulos que saltan huecos.
 */
export interface CloudSurfaceOptions {
  /** Lado de la celda [m] (1–5 m es lo usual). */
  cell: number;
  /** Cota que representa cada celda. */
  mode: 'min' | 'mean' | 'max';
  /**
   * Recorte del borde: `mask` deja solo los triángulos entre celdas con puntos (arista ≤ 3
   * celdas: sigue el contorno real y respeta huecos); `convex` cubre todo el casco convexo.
   */
  trim: 'mask' | 'convex';
}

export const DEFAULT_CLOUD_SURFACE: CloudSurfaceOptions = { cell: 2, mode: 'min', trim: 'mask' };

export interface CloudSurfaceResult {
  tin: TinData;
  /** Celdas con puntos (= vértices del TIN). */
  cells: number;
  /** Triángulos descartados por saltar un hueco. */
  droppedTriangles: number;
  /**
   * Fracción de celdas con más de 3 m entre su punto más bajo y el más alto: alta en túneles
   * (piso y techo en la misma celda) o con voladizos, donde una superficie 2.5D no representa la
   * forma real.
   */
  overhangRatio: number;
}

/** Celdas máximas de la grilla (≈ 4 millones de vértices: el TIN sigue siendo manejable). */
const MAX_CELLS = 4_000_000;

/** Puntos de la nube en coordenadas absolutas (float64). */
export function cloudWorldPoints(cloud: PointCloudData): Float64Array {
  const [ox, oy, oz] = cloud.origin;
  const p = cloud.positions;
  const out = new Float64Array(p.length);
  for (let i = 0; i + 2 < p.length; i += 3) {
    out[i] = ox + (p[i] ?? 0);
    out[i + 1] = oy + (p[i + 1] ?? 0);
    out[i + 2] = oz + (p[i + 2] ?? 0);
  }
  return out;
}

/** Fracción de celdas cuya diferencia de cota supera `spread` [m] (solo celdas con ≥ 3 puntos). */
function overhang(points: Float64Array, cell: number, spread = 3): number {
  const n = points.length / 3;
  if (n === 0) return 0;
  const x0 = points[0] ?? 0;
  const y0 = points[1] ?? 0;
  const cells = new Map<number, [number, number, number]>();
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(((points[i * 3] ?? 0) - x0) / cell);
    const cy = Math.floor(((points[i * 3 + 1] ?? 0) - y0) / cell);
    const key = (cx + 1048576) * 2097152 + (cy + 1048576);
    const z = points[i * 3 + 2] ?? 0;
    const c = cells.get(key);
    if (!c) cells.set(key, [z, z, 1]);
    else {
      if (z < c[0]) c[0] = z;
      if (z > c[1]) c[1] = z;
      c[2]++;
    }
  }
  let counted = 0;
  let high = 0;
  for (const [lo, hi, k] of cells.values()) {
    if (k < 3) continue;
    counted++;
    if (hi - lo > spread) high++;
  }
  return counted === 0 ? 0 : high / counted;
}

/**
 * Superficie TIN de una nube. Si la celda dejaría más de `MAX_CELLS` vértices se agranda (lo
 * informa `cell` en el resultado). O(n log n): corre en el worker.
 */
export function cloudToSurface(
  cloud: PointCloudData,
  options: Partial<CloudSurfaceOptions> = {},
): CloudSurfaceResult & { cell: number } {
  const o = { ...DEFAULT_CLOUD_SURFACE, ...options };
  const points = cloudWorldPoints(cloud);
  let cell = Math.max(0.1, Number.isFinite(o.cell) ? o.cell : DEFAULT_CLOUD_SURFACE.cell);
  // Tope de vértices: el área en planta sobre la celda no debe pasar de MAX_CELLS.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const area = Number.isFinite(minX) ? (maxX - minX) * (maxY - minY) : 0;
  if (area / (cell * cell) > MAX_CELLS) cell = Math.ceil(Math.sqrt(area / MAX_CELLS) * 10) / 10;
  const grid = decimateGrid(points, { cell, keep: o.mode });
  const r = buildTin(
    grid,
    undefined,
    o.trim === 'mask' ? { maxEdge: cell * 3 } : { maxEdge: Infinity },
  );
  return {
    tin: r.tin,
    cells: r.tin.vertices.length / 3,
    droppedTriangles: r.droppedTriangles,
    overhangRatio: overhang(points, Math.max(cell, 1)),
    cell,
  };
}
