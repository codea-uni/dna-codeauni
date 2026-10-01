import type { Bench, Blast, BlastBoundary, Meters, Radians, Vec2 } from '../model/types';
import { outwardNormal, polygonEdge } from './boundary';
import { pointInPolygon } from './polygon';

/**
 * Geometría de la cara libre (talud) de un perímetro (A7b): ángulo desde la horizontal y alto,
 * del banco o propios del perímetro (`BlastBoundary.faceAngle`, `faceHeight`). La cresta está en el
 * techo del banco (piso + H) y el pie, `height` más abajo y `run` = height / tan β hacia afuera.
 * Es geometría pura: no hay constantes de dominio.
 */
export interface FaceGeometry {
  /** Ángulo de la cara desde la horizontal [rad] (π/2 = vertical). */
  angle: Radians;
  /** Alto de la cara, de la cresta al pie [m]. */
  height: Meters;
  /** Cota de la cresta (techo del banco) y del pie [m]. */
  crestZ: Meters;
  toeZ: Meters;
  /** Avance horizontal de la cresta al pie [m] (0 si la cara es vertical). */
  run: Meters;
}

export function boundaryFace(
  bench: Bench,
  boundary?: Pick<BlastBoundary, 'floorElevation' | 'faceAngle' | 'faceHeight'>,
): FaceGeometry {
  const floor = boundary?.floorElevation ?? bench.floorElevation;
  const crestZ = floor + bench.height;
  const angle = boundary?.faceAngle ?? bench.faceAngle;
  const height = Math.max(0, boundary?.faceHeight ?? bench.height);
  const run = angle > 0 && angle < Math.PI / 2 ? height / Math.tan(angle) : 0;
  return { angle, height, crestZ, toeZ: crestZ - height, run };
}

/**
 * Distancia horizontal de la cresta a la cara a la cota z [m]: 0 en la cresta, `run` en el pie
 * (y constante debajo del pie). La cara se aleja de los taladros al bajar: el burden al pie de una
 * cara inclinada es mayor que en la cresta.
 */
export function faceOffsetAt(face: FaceGeometry, z: number): Meters {
  const depth = Math.min(face.height, Math.max(0, face.crestZ - z));
  return face.angle > 0 && face.angle < Math.PI / 2 ? depth / Math.tan(face.angle) : 0;
}

/** Arista de cara libre en planta con la geometría de su cara y su normal exterior. */
export interface FaceEdge {
  a: Vec2;
  b: Vec2;
  normal: Vec2;
  face: FaceGeometry;
  boundary: BlastBoundary;
}

export function faceEdges(blast: Pick<Blast, 'bench' | 'boundaries'>): FaceEdge[] {
  const out: FaceEdge[] = [];
  for (const boundary of blast.boundaries) {
    const face = boundaryFace(blast.bench, boundary);
    for (const i of boundary.freeFaceEdges) {
      const e = polygonEdge(boundary.polygon, i);
      const normal = outwardNormal(boundary.polygon, i);
      if (e && normal) out.push({ a: e[0], b: e[1], normal, face, boundary });
    }
  }
  return out;
}

/** Punto de (x, y) proyectado en la arista: parámetro t ∈ [0, 1] y distancia exterior (con signo). */
export function edgeFrame(e: Pick<FaceEdge, 'a' | 'b' | 'normal'>, x: number, y: number) {
  const dx = e.b.x - e.a.x;
  const dy = e.b.y - e.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? ((x - e.a.x) * dx + (y - e.a.y) * dy) / len2 : 0;
  const outward = (x - e.a.x) * e.normal.x + (y - e.a.y) * e.normal.y;
  return { t, outward };
}

/**
 * Frente a una cara libre, dentro de la cuña del talud: la arista más cercana cuya franja exterior
 * contiene (x, y) y la distancia exterior s a su cresta, con s < run. `null` si no hay cuña ahí.
 */
export function faceWedgeAt(
  edges: readonly FaceEdge[],
  x: number,
  y: number,
): { edge: FaceEdge; s: number } | null {
  let best: { edge: FaceEdge; s: number } | null = null;
  for (const e of edges) {
    if (e.face.run <= 0) continue;
    const { t, outward } = edgeFrame(e, x, y);
    if (t < 0 || t > 1 || outward <= 0 || outward >= e.face.run) continue;
    if (!best || outward < best.s) best = { edge: e, s: outward };
  }
  return best;
}

/**
 * ¿(x, y, z) está en el aire delante de una cara libre (banco sin topografía)? Fuera de todos los
 * perímetros, en la franja exterior de una arista libre, entre el pie y la cresta y más allá de la
 * cara a esa cota. Detrás del banco (aristas que no son cara libre) sigue la roca.
 */
export function inFrontOfFace(
  blast: Pick<Blast, 'bench' | 'boundaries'>,
  edges: readonly FaceEdge[] = faceEdges(blast),
): (x: number, y: number, z: number) => boolean {
  const polygons = blast.boundaries.filter((b) => b.polygon.length >= 3).map((b) => b.polygon);
  return (x, y, z) => {
    if (polygons.some((p) => pointInPolygon(x, y, p))) return false;
    for (const e of edges) {
      if (z <= e.face.toeZ || z >= e.face.crestZ + 1e-9) continue;
      const { t, outward } = edgeFrame(e, x, y);
      if (t < 0 || t > 1 || outward <= 0) continue;
      if (outward > faceOffsetAt(e.face, z)) return true;
    }
    return false;
  };
}

/** Medición de la cara en la topografía: ángulo y alto medianos y las muestras usadas. */
export interface FaceMeasurement {
  angle: Radians;
  height: Meters;
  samples: number;
}

/**
 * Mide el talud en la superficie a lo largo de las aristas de cara libre (supuesto S-26): cada
 * ~2 m se recorre la normal exterior desde la cresta en pasos de 0,25 m (hasta 4·H) y el pie es
 * el primer punto, tras bajar al menos 1 m, donde la pendiente local es menor que 20°. Alto =
 * cota de la cresta − cota del pie; ángulo = atan(alto / avance). Se devuelve la mediana.
 */
export function measureFace(
  elevationAt: (x: number, y: number) => number | null,
  boundary: Pick<BlastBoundary, 'polygon' | 'freeFaceEdges'>,
  benchHeight: Meters,
): FaceMeasurement | null {
  const heights: number[] = [];
  const angles: number[] = [];
  const step = 0.25;
  const flat = Math.tan((20 * Math.PI) / 180);
  for (const i of boundary.freeFaceEdges) {
    const e = polygonEdge(boundary.polygon, i);
    const nrm = outwardNormal(boundary.polygon, i);
    if (!e || !nrm) continue;
    const [a, b] = e;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / 2));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const crest = elevationAt(px, py);
      if (crest === null) continue;
      let prev = crest;
      let toe: { s: number; z: number } | null = null;
      for (let s = step; s <= 4 * benchHeight; s += step) {
        const z = elevationAt(px + nrm.x * s, py + nrm.y * s);
        if (z === null) break;
        const slope = (prev - z) / step;
        if (crest - z >= 1 && slope < flat) {
          toe = { s: s - step, z: prev };
          break;
        }
        prev = z;
      }
      if (!toe || toe.s <= 0) continue;
      const h = crest - toe.z;
      heights.push(h);
      angles.push(Math.atan2(h, toe.s));
    }
  }
  if (heights.length === 0) return null;
  const median = (v: number[]) => {
    const s = [...v].sort((p, q) => p - q);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
  };
  return { angle: median(angles), height: median(heights), samples: heights.length };
}
