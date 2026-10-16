import type { Vec2 } from '../model/types';

/**
 * Recorta un polígono con un semiplano (Sutherland–Hodgman): queda la parte donde
 * (p − point)·normal ≥ 0. Sirve para partir un perímetro en zonas (p. ej. mineral y desmonte).
 * Devuelve [] si no queda nada.
 */
export function clipPolygonHalfPlane(polygon: readonly Vec2[], point: Vec2, normal: Vec2): Vec2[] {
  const side = (p: Vec2) => (p.x - point.x) * normal.x + (p.y - point.y) * normal.y;
  const out: Vec2[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % n] as Vec2;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push({ x: a.x, y: a.y });
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  // Vértices repetidos (el corte pasa justo por un vértice).
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length] as Vec2;
    return out.length < 2 || Math.hypot(p.x - q.x, p.y - q.y) > 1e-9;
  });
}

/** ¿El segmento ab está sobre el segmento cd (colineal y contenido, con tolerancia)? */
export function segmentOnSegment(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol = 1e-6): boolean {
  const len = Math.hypot(d.x - c.x, d.y - c.y);
  if (len === 0) return false;
  const ux = (d.x - c.x) / len;
  const uy = (d.y - c.y) / len;
  const off = (p: Vec2) => Math.abs((p.x - c.x) * uy - (p.y - c.y) * ux);
  const along = (p: Vec2) => (p.x - c.x) * ux + (p.y - c.y) * uy;
  return (
    off(a) < tol &&
    off(b) < tol &&
    along(a) > -tol &&
    along(a) < len + tol &&
    along(b) > -tol &&
    along(b) < len + tol
  );
}
