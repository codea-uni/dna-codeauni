import { Delaunay } from 'd3-delaunay';
import type { Vec2 } from '../model/types';
import { pointInPolygon, polygonSignedArea } from '../geometry/polygon';

/**
 * Recorta `subject` (cualquier polígono simple) con `clip` convexo (Sutherland–Hodgman).
 * Las celdas de Voronoi son convexas, así que se usan como recortador y el perímetro
 * (posiblemente cóncavo) como sujeto: la intersección es correcta.
 */
export function clipPolygonConvex(subject: readonly Vec2[], clip: readonly Vec2[]): Vec2[] {
  if (clip.length < 3) return [];
  const ccw = polygonSignedArea(clip) > 0;
  let output = subject.slice();
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i] as Vec2;
    const b = clip[(i + 1) % clip.length] as Vec2;
    const side = (p: Vec2) => {
      const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      return ccw ? c : -c;
    };
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j] as Vec2;
      const prev = input[(j + input.length - 1) % input.length] as Vec2;
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0) {
        if (sp < 0) output.push(intersect(prev, cur, sp, sc));
        output.push(cur);
      } else if (sp >= 0) {
        output.push(intersect(prev, cur, sp, sc));
      }
    }
  }
  return output;
}

function intersect(p: Vec2, q: Vec2, sp: number, sq: number): Vec2 {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

/** Polígono convexo CCW desplazado hacia afuera `d` metros (esquinas en inglete). */
function offsetConvex(poly: readonly Vec2[], d: number): Vec2[] {
  const n = poly.length;
  const lines: { p: Vec2; dir: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % n] as Vec2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const normal = { x: dir.y, y: -dir.x }; // exterior para CCW
    lines.push({ p: { x: a.x + normal.x * d, y: a.y + normal.y * d }, dir });
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n];
    const l2 = lines[i];
    if (!l1 || !l2) continue;
    const den = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(den) < 1e-9) {
      out.push(l2.p);
      continue;
    }
    const t = ((l2.p.x - l1.p.x) * l2.dir.y - (l2.p.y - l1.p.y) * l2.dir.x) / den;
    out.push({ x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t });
  }
  return out;
}

export interface InfluenceResult {
  /** Área de influencia por taladro [m²]. */
  areas: Float64Array;
  /** Contorno automático usado para taladros fuera de todo perímetro (null si no hizo falta). */
  autoBoundary: Vec2[] | null;
}

/**
 * Área de influencia de cada taladro: celda de Voronoi de las bocas recortada al perímetro que
 * contiene al taladro. Los taladros fuera de todo perímetro usan la envolvente convexa de todas las
 * bocas expandida media distancia típica entre vecinos (o un rectángulo si son colineales).
 * Taladros coincidentes comparten 0 m².
 */
export function influenceAreas(
  points: readonly Vec2[],
  boundaries: readonly (readonly Vec2[])[] = [],
): InfluenceResult {
  const n = points.length;
  const areas = new Float64Array(n);
  if (n === 0) return { areas, autoBoundary: null };
  // Coordenadas locales para no perder precisión con UTM.
  const ox = points[0]?.x ?? 0;
  const oy = points[0]?.y ?? 0;
  const coords = new Float64Array(n * 2);
  points.forEach((p, i) => {
    coords[i * 2] = p.x - ox;
    coords[i * 2 + 1] = p.y - oy;
  });
  const delaunay = new Delaunay(coords);
  const polys = boundaries
    .filter((b) => b.length >= 3)
    .map((b) => b.map((p) => ({ x: p.x - ox, y: p.y - oy })));
  const clipOf: (Vec2[] | null)[] = [];
  let needsAuto = false;
  for (let i = 0; i < n; i++) {
    const x = coords[i * 2] ?? 0;
    const y = coords[i * 2 + 1] ?? 0;
    const poly = polys.find((p) => pointInPolygon(x, y, p)) ?? null;
    clipOf.push(poly);
    if (!poly) needsAuto = true;
  }
  const auto = needsAuto ? autoContour(delaunay, coords, n) : null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of [...polys.flat(), ...(auto ?? [])]) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = Math.max(maxX - minX, maxY - minY) + 1;
  const voronoi = delaunay.voronoi([minX - pad, minY - pad, maxX + pad, maxY + pad]);
  for (let i = 0; i < n; i++) {
    const cell = voronoi.cellPolygon(i) as [number, number][] | null;
    const clip = clipOf[i] ?? auto;
    if (!cell || !clip) continue; // punto duplicado
    const cellPoly = cell.slice(0, -1).map(([x, y]) => ({ x, y }));
    areas[i] = Math.abs(polygonSignedArea(clipPolygonConvex(clip, cellPoly)));
  }
  return { areas, autoBoundary: auto ? auto.map((p) => ({ x: p.x + ox, y: p.y + oy })) : null };
}

/** Envolvente convexa expandida media distancia mediana entre vecinos (rectángulo si son colineales). */
function autoContour(delaunay: Delaunay<Delaunay.Point>, coords: Float64Array, n: number): Vec2[] {
  const nn: number[] = [];
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (const j of delaunay.neighbors(i)) {
      const d = Math.hypot(
        (coords[i * 2] ?? 0) - (coords[j * 2] ?? 0),
        (coords[i * 2 + 1] ?? 0) - (coords[j * 2 + 1] ?? 0),
      );
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  nn.sort((a, b) => a - b);
  const half = (nn[Math.floor(nn.length / 2)] ?? 5) / 2;
  const hull: Vec2[] = [];
  for (const i of delaunay.hull) hull.push({ x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 });
  if (hull.length >= 3 && Math.abs(polygonSignedArea(hull)) > 1e-6) {
    if (polygonSignedArea(hull) < 0) hull.reverse();
    return offsetConvex(hull, half);
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, coords[i * 2] ?? 0);
    maxX = Math.max(maxX, coords[i * 2] ?? 0);
    minY = Math.min(minY, coords[i * 2 + 1] ?? 0);
    maxY = Math.max(maxY, coords[i * 2 + 1] ?? 0);
  }
  return [
    { x: minX - half, y: minY - half },
    { x: maxX + half, y: minY - half },
    { x: maxX + half, y: maxY + half },
    { x: minX - half, y: maxY + half },
  ];
}
