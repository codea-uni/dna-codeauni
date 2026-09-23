import type { BlastBoundary, Pattern, Vec2 } from '../model/types';
import { unitToAzimuth } from './vec';
import { pointInPolygon, polygonSignedArea } from './polygon';

/** Extremos de la arista i (vértice i → i+1, la última cierra con el 0). */
export function polygonEdge(polygon: readonly Vec2[], i: number): [Vec2, Vec2] | null {
  const n = polygon.length;
  const a = polygon[((i % n) + n) % n];
  const b = polygon[(((i + 1) % n) + n) % n];
  return a && b ? [a, b] : null;
}

/** Normal unitaria de la arista que apunta hacia AFUERA del polígono (sentido de desplazamiento en una cara libre). */
export function outwardNormal(polygon: readonly Vec2[], i: number): Vec2 | null {
  const e = polygonEdge(polygon, i);
  if (!e) return null;
  const [a, b] = e;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  // En un polígono antihorario el interior queda a la izquierda de cada arista.
  return polygonSignedArea(polygon) > 0
    ? { x: dy / len, y: -dx / len }
    : { x: -dy / len, y: dx / len };
}

/** Arista más cercana a un punto y su distancia [m]. */
export function nearestEdge(
  polygon: readonly Vec2[],
  x: number,
  y: number,
): { index: number; distance: number } | null {
  let best: { index: number; distance: number } | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const e = polygonEdge(polygon, i);
    if (!e) continue;
    const [a, b] = e;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
    if (!best || d < best.distance) best = { index: i, distance: d };
  }
  return best;
}

/** Primer perímetro que contiene el punto. */
export function boundaryAt(
  boundaries: readonly BlastBoundary[],
  x: number,
  y: number,
): BlastBoundary | undefined {
  return boundaries.find((b) => b.polygon.length >= 3 && pointInPolygon(x, y, b.polygon));
}

/**
 * Orientación de filas paralela a la (primera) cara libre, avanzando hacia el interior:
 * la primera fila queda junto al talud y las siguientes se alejan de él.
 */
export function freeFaceAlignment(
  boundary: BlastBoundary,
): Pick<Pattern, 'rowAzimuth' | 'rowAdvance'> | null {
  const i = boundary.freeFaceEdges[0];
  if (i === undefined) return null;
  const e = polygonEdge(boundary.polygon, i);
  if (!e) return null;
  const [a, b] = e;
  if (a.x === b.x && a.y === b.y) return null;
  // Interior a la izquierda (antihorario) o a la derecha (horario) de la arista.
  return {
    rowAzimuth: unitToAzimuth(b.x - a.x, b.y - a.y),
    rowAdvance: polygonSignedArea(boundary.polygon) > 0 ? 'left' : 'right',
  };
}
