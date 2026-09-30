import Constrainautor from '@kninnug/constrainautor';
import Delaunator from 'delaunator';
import type { TinData } from './asset';

export interface TinOptions {
  /**
   * Se descartan triángulos con alguna arista mayor a `maxEdgeFactor` × la arista típica
   * (mediana) de la triangulación: evita puentear huecos del levantamiento. Supuesto S-13.
   */
  maxEdgeFactor?: number;
  /** Límite absoluto de arista [m]; si se indica, reemplaza al factor. `Infinity` = sin límite. */
  maxEdge?: number;
}

export const DEFAULT_TIN_OPTIONS = { maxEdgeFactor: 8 } as const;

export interface TinResult {
  tin: TinData;
  /** Puntos repetidos en planta que se unieron (se conserva la primera cota). */
  duplicates: number;
  /** Líneas de quiebre que no se pudieron imponer (se cruzan con otra). */
  skippedConstraints: number;
  /** Triángulos descartados por arista larga. */
  droppedTriangles: number;
}

/**
 * Triangulación de Delaunay en planta de puntos x, y, z (la cota viaja con el vértice), con
 * aristas obligadas opcionales (curvas de nivel, cresta, pie, líneas de quiebre), dadas como pares
 * de índices de punto. O(n log n): en el navegador corre en el worker.
 */
export function buildTin(
  points: Float64Array,
  constraints: Uint32Array = new Uint32Array(0),
  options: TinOptions = {},
): TinResult {
  const n = Math.floor(points.length / 3);
  // Puntos repetidos en planta (al milímetro) rompen la triangulación: se unen.
  const key = (i: number) =>
    `${Math.round((points[i * 3] ?? 0) * 1000)}:${Math.round((points[i * 3 + 1] ?? 0) * 1000)}`;
  const seen = new Map<string, number>();
  const remap = new Uint32Array(n);
  const keep: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const prev = seen.get(k);
    if (prev === undefined) {
      seen.set(k, keep.length);
      remap[i] = keep.length;
      keep.push(i);
    } else remap[i] = prev;
  }
  const m = keep.length;
  const vertices = new Float64Array(m * 3);
  const coords = new Float64Array(m * 2);
  keep.forEach((src, i) => {
    vertices[i * 3] = points[src * 3] ?? 0;
    vertices[i * 3 + 1] = points[src * 3 + 1] ?? 0;
    vertices[i * 3 + 2] = points[src * 3 + 2] ?? 0;
    coords[i * 2] = vertices[i * 3] ?? 0;
    coords[i * 2 + 1] = vertices[i * 3 + 1] ?? 0;
  });
  if (m < 3)
    return {
      tin: { vertices, triangles: new Uint32Array(0) },
      duplicates: n - m,
      skippedConstraints: 0,
      droppedTriangles: 0,
    };

  const del = new Delaunator(coords);
  let skipped = 0;
  if (constraints.length >= 2) {
    const con = new Constrainautor(del);
    for (let i = 0; i + 1 < constraints.length; i += 2) {
      const a = remap[constraints[i] ?? 0] ?? 0;
      const b = remap[constraints[i + 1] ?? 0] ?? 0;
      if (a === b) continue;
      try {
        con.constrainOne(a, b);
      } catch {
        skipped++;
      }
    }
    con.delaunify(true);
  }

  const tri = del.triangles;
  const edge = (a: number, b: number) =>
    Math.hypot(
      (coords[a * 2] ?? 0) - (coords[b * 2] ?? 0),
      (coords[a * 2 + 1] ?? 0) - (coords[b * 2 + 1] ?? 0),
    );
  const longest = new Float64Array(tri.length / 3);
  for (let t = 0; t < longest.length; t++) {
    const a = tri[t * 3] ?? 0;
    const b = tri[t * 3 + 1] ?? 0;
    const c = tri[t * 3 + 2] ?? 0;
    longest[t] = Math.max(edge(a, b), edge(b, c), edge(c, a));
  }
  const limit =
    options.maxEdge ??
    median(longest) * (options.maxEdgeFactor ?? DEFAULT_TIN_OPTIONS.maxEdgeFactor);
  const out: number[] = [];
  let dropped = 0;
  for (let t = 0; t < longest.length; t++) {
    if ((longest[t] ?? 0) > limit) {
      dropped++;
      continue;
    }
    out.push(tri[t * 3] ?? 0, tri[t * 3 + 1] ?? 0, tri[t * 3 + 2] ?? 0);
  }
  return {
    tin: { vertices, triangles: Uint32Array.from(out) },
    duplicates: n - m,
    skippedConstraints: skipped,
    droppedTriangles: dropped,
  };
}

function median(values: Float64Array): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
