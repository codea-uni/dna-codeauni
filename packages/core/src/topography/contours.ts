import type { TinData } from './asset';

export interface ContourOptions {
  /** Separación entre curvas [m]. */
  interval: number;
  /** Cada cuántas curvas va una maestra (más marcada). */
  majorEvery?: number;
}

/** Curvas de nivel como segmentos sueltos (para dibujar). */
export interface ContourSet {
  /** x1, y1, x2, y2 por segmento. */
  segments: Float64Array;
  /** Cota de cada segmento. */
  levels: Float64Array;
  /** 1 si el segmento es de una curva maestra. */
  major: Uint8Array;
}

/**
 * Curvas de nivel de un TIN: cada triángulo se corta con los planos z = k·intervalo. Una cota
 * exactamente igual a la de un vértice se desplaza un épsilon hacia arriba para no generar
 * segmentos degenerados. O(triángulos × curvas por triángulo): corre en el worker.
 */
export function contoursFromTin(tin: TinData, options: ContourOptions): ContourSet {
  const { interval } = options;
  const majorEvery = options.majorEvery ?? 5;
  const seg: number[] = [];
  const lev: number[] = [];
  const maj: number[] = [];
  if (!(interval > 0)) return pack(seg, lev, maj);
  const v = tin.vertices;
  const tri = tin.triangles;
  const eps = interval * 1e-9;
  for (let t = 0; t < tri.length; t += 3) {
    const p = [tri[t] ?? 0, tri[t + 1] ?? 0, tri[t + 2] ?? 0].map((i) => ({
      x: v[i * 3] ?? 0,
      y: v[i * 3 + 1] ?? 0,
      z: v[i * 3 + 2] ?? 0,
    }));
    const [a, b, c] = p as [(typeof p)[0], (typeof p)[0], (typeof p)[0]];
    const zmin = Math.min(a.z, b.z, c.z);
    const zmax = Math.max(a.z, b.z, c.z);
    for (let k = Math.ceil(zmin / interval); k * interval <= zmax; k++) {
      const level = k * interval;
      const zl = level + eps;
      const pts: number[] = [];
      for (const [u, w] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        if ((u.z - zl) * (w.z - zl) < 0) {
          const f = (zl - u.z) / (w.z - u.z);
          pts.push(u.x + f * (w.x - u.x), u.y + f * (w.y - u.y));
        }
      }
      if (pts.length === 4) {
        seg.push(pts[0] ?? 0, pts[1] ?? 0, pts[2] ?? 0, pts[3] ?? 0);
        lev.push(level);
        maj.push(k % majorEvery === 0 ? 1 : 0);
      }
    }
  }
  return pack(seg, lev, maj);
}

function pack(seg: number[], lev: number[], maj: number[]): ContourSet {
  return {
    segments: Float64Array.from(seg),
    levels: Float64Array.from(lev),
    major: Uint8Array.from(maj),
  };
}
