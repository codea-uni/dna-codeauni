import { Delaunay } from 'd3-delaunay';
import type { Vec2 } from '../model/types';

export interface Isochrones {
  /** Segmentos [x1, y1, x2, y2, …] en coordenadas de proyecto [m]. */
  segments: Float64Array;
  /** Valor [s] de cada segmento. */
  levels: Float32Array;
  interval: number;
}

/**
 * Isócronas por interpolación lineal sobre la triangulación de Delaunay de las bocas.
 * Se descartan triángulos con aristas mayores a `maxEdgeFactor` × la mediana de vecinos
 * (bordes cóncavos de la voladura) para no inventar contornos fuera de ella.
 */
export function computeIsochrones(
  points: readonly Vec2[],
  times: Float64Array,
  interval: number,
  maxEdgeFactor = 2.5,
): Isochrones {
  const idx: number[] = [];
  for (let i = 0; i < points.length; i++) if (Number.isFinite(times[i])) idx.push(i);
  const empty = { segments: new Float64Array(0), levels: new Float32Array(0), interval };
  if (idx.length < 3 || !(interval > 0)) return empty;
  const ox = points[idx[0] ?? 0]?.x ?? 0;
  const oy = points[idx[0] ?? 0]?.y ?? 0;
  const xs = new Float64Array(idx.length);
  const ys = new Float64Array(idx.length);
  const vs = new Float64Array(idx.length);
  let tMin = Infinity;
  let tMax = -Infinity;
  idx.forEach((i, k) => {
    xs[k] = (points[i]?.x ?? 0) - ox;
    ys[k] = (points[i]?.y ?? 0) - oy;
    const v = times[i] ?? 0;
    vs[k] = v;
    tMin = Math.min(tMin, v);
    tMax = Math.max(tMax, v);
  });
  const coords = new Float64Array(idx.length * 2);
  for (let k = 0; k < idx.length; k++) {
    coords[k * 2] = xs[k] ?? 0;
    coords[k * 2 + 1] = ys[k] ?? 0;
  }
  const d = new Delaunay(coords);
  const tri = d.triangles;
  const edges: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    let best = Infinity;
    for (const j of d.neighbors(k))
      best = Math.min(best, Math.hypot((xs[k] ?? 0) - (xs[j] ?? 0), (ys[k] ?? 0) - (ys[j] ?? 0)));
    if (Number.isFinite(best)) edges.push(best);
  }
  edges.sort((a, b) => a - b);
  const maxEdge = (edges[Math.floor(edges.length / 2)] ?? Infinity) * maxEdgeFactor;

  // Niveles estrictamente posteriores al primer disparo (la isócrona inicial es degenerada).
  const firstK = Math.floor(tMin / interval + 1e-9) + 1;
  const segs: number[] = [];
  const levels: number[] = [];
  const len = (a: number, b: number) =>
    Math.hypot((xs[a] ?? 0) - (xs[b] ?? 0), (ys[a] ?? 0) - (ys[b] ?? 0));
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] ?? 0;
    const b = tri[t + 1] ?? 0;
    const c = tri[t + 2] ?? 0;
    if (len(a, b) > maxEdge || len(b, c) > maxEdge || len(c, a) > maxEdge) continue;
    const va = vs[a] ?? 0;
    const vb = vs[b] ?? 0;
    const vc = vs[c] ?? 0;
    const lo = Math.min(va, vb, vc);
    const hi = Math.max(va, vb, vc);
    const kMax = Math.floor(hi / interval + 1e-9);
    for (let k = Math.max(firstK, Math.ceil(lo / interval - 1e-9)); k <= kMax; k++) {
      const level = k * interval;
      // Pequeño desplazamiento para evitar vértices exactamente sobre el nivel.
      const L = level + interval * 1e-6;
      const pts: number[] = [];
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const vp = vs[p] ?? 0;
        const vq = vs[q] ?? 0;
        if ((vp - L) * (vq - L) < 0) {
          const f = (L - vp) / (vq - vp);
          pts.push(
            (xs[p] ?? 0) + ((xs[q] ?? 0) - (xs[p] ?? 0)) * f + ox,
            (ys[p] ?? 0) + ((ys[q] ?? 0) - (ys[p] ?? 0)) * f + oy,
          );
        }
      }
      if (pts.length === 4) {
        segs.push(...pts);
        levels.push(level);
      }
    }
  }
  return { segments: Float64Array.from(segs), levels: Float32Array.from(levels), interval };
}

/** Intervalo "redondo" para ~`target` isócronas en el rango dado [s]. */
export function niceInterval(range: number, target = 12): number {
  if (!(range > 0)) return 0.025;
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}
