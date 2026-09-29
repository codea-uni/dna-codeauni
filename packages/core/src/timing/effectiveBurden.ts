import { polygonEdge } from '../geometry/boundary';
import { PointIndex } from '../geometry/spatialIndex';
import type { Blast, Vec2 } from '../model/types';

export interface EffectiveBurden {
  /** Burden efectivo por taladro [m]: distancia a la superficie libre más cercana al detonar (NaN sin tiempo; Infinity sin cara libre ni alivio). */
  effective: Float64Array;
  /** Burden nominal de la malla del taladro [m] (NaN sin malla). */
  nominal: Float64Array;
  /** Distancia a la cara libre original [m] (Infinity si la voladura no tiene cara libre). */
  faceDistance: Float64Array;
  /**
   * Dirección unitaria en planta desde la boca hacia la superficie libre más cercana al detonar
   * [x0, y0, x1, y1, …]: hacia donde sale el material (A5). (0, 0) si no hay superficie libre.
   */
  toward: Float64Array;
}

/** Segmentos de cara libre en planta: aristas marcadas del perímetro y líneas de cresta. */
export function freeFaceSegments(blast: Pick<Blast, 'boundaries' | 'freeFaces'>): [Vec2, Vec2][] {
  const segs: [Vec2, Vec2][] = [];
  for (const b of blast.boundaries)
    for (const i of b.freeFaceEdges) {
      const e = polygonEdge(b.polygon, i);
      if (e) segs.push(e);
    }
  for (const f of blast.freeFaces)
    for (let k = 0; k + 1 < f.crest.length; k++) {
      const a = f.crest[k];
      const c = f.crest[k + 1];
      if (a && c) segs.push([a, c]);
    }
  return segs;
}

/** Punto del segmento más cercano a (x, y). */
function closestOnSegment(x: number, y: number, [a, b]: [Vec2, Vec2]): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

const FRONT_TOL = 1e-3; // m

/** Índice espacial de las bocas (ids = índice del taladro). */
export function holeIndex(holes: Blast['holes']): PointIndex<number> {
  return new PointIndex(
    holes.map((_, i) => i),
    Float64Array.from(holes, (h) => h.collar.x),
    Float64Array.from(holes, (h) => h.collar.y),
  );
}

/**
 * «Delante» de un taladro = al menos media fila (0,5·B) más cerca de la cara libre: separa la fila
 * de adelante de los vecinos de la misma fila (orden invertido, CK-10). Sin burden nominal,
 * cualquier diferencia mayor que 1 mm.
 */
export function frontMargin(nominalBurden: number): number {
  return Number.isFinite(nominalBurden) ? 0.5 * nominalBurden : FRONT_TOL;
}

/**
 * Burden efectivo según la secuencia (FC-22, RM-07, `docs/theory/02 §3`, P-02 y P-16). Para cada
 * taladro, la distancia (en planta, desde la boca) a la superficie libre más cercana en el instante
 * en que detona. Superficies libres: la cara libre definida por el usuario y el frente que dejan
 * los taladros que detonaron al menos `reliefRate`·B antes (P-02: el alivio necesita tiempo de
 * desplazamiento; 0 = caso límite optimista).
 *
 * P-16: alivia **cualquier** taladro previo, también los vecinos de la misma fila; los simultáneos
 * no. La distancia es la perpendicular a la isócrona de los taladros detonados, aproximada por el
 * segmento entre el taladro detonado más cercano y su vecino detonado más próximo (a menos de
 * 2·max(B, S)); si no hay vecino, la distancia al punto (P-02).
 * Búsqueda con el índice espacial (flatbush), acotada por la distancia a la cara libre.
 */
export function effectiveBurden(
  blast: Pick<Blast, 'holes' | 'patterns' | 'boundaries' | 'freeFaces'>,
  fireTime: Float64Array,
  reliefRate: number,
): EffectiveBurden {
  const n = blast.holes.length;
  const effective = new Float64Array(n).fill(NaN);
  const nominal = new Float64Array(n).fill(NaN);
  const faceDistance = new Float64Array(n).fill(Infinity);
  const toward = new Float64Array(2 * n);
  const facePoint: (Vec2 | null)[] = new Array<Vec2 | null>(n).fill(null);
  const patternOf = new Map(blast.patterns.map((p) => [p.id, p]));
  const segs = freeFaceSegments(blast);
  const reach = new Float64Array(n).fill(Infinity);
  blast.holes.forEach((h, i) => {
    const p = h.patternId ? patternOf.get(h.patternId) : undefined;
    if (p) {
      nominal[i] = p.burden;
      reach[i] = 2 * Math.max(p.burden, p.spacing);
    }
    for (const s of segs) {
      const q = closestOnSegment(h.collar.x, h.collar.y, s);
      const d = Math.hypot(q.x - h.collar.x, q.y - h.collar.y);
      if (d < (faceDistance[i] ?? Infinity)) {
        faceDistance[i] = d;
        facePoint[i] = q;
      }
    }
  });
  const setToward = (i: number, from: Vec2, to: Vec2 | null) => {
    if (!to) return;
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d > 0) {
      toward[2 * i] = (to.x - from.x) / d;
      toward[2 * i + 1] = (to.y - from.y) / d;
    }
  };
  const index = holeIndex(blast.holes);
  blast.holes.forEach((hi, i) => {
    const ti = fireTime[i] ?? NaN;
    if (!Number.isFinite(ti)) return;
    const bi = nominal[i] ?? NaN;
    const delay = reliefRate * (Number.isFinite(bi) ? bi : 0);
    const di = faceDistance[i] ?? Infinity;
    // Estrictamente antes y con al menos `delay`: el propio taladro y los simultáneos no alivian.
    const relieving = (j: number) =>
      ti - (fireTime[j] ?? NaN) > 1e-9 && ti - (fireTime[j] ?? NaN) >= delay - 1e-9;
    const { x, y } = hi.collar;
    const near = index.nearest(x, y, di, (j) => !relieving(j));
    if (!near) {
      effective[i] = di;
      setToward(i, hi.collar, facePoint[i] ?? null);
      return;
    }
    const pair = index.nearest(
      near.x,
      near.y,
      reach[i] ?? Infinity,
      (j) => j === near.id || !relieving(j),
    );
    const target = pair ? closestOnSegment(x, y, [near, pair]) : near;
    effective[i] = Math.hypot(x - target.x, y - target.y);
    setToward(i, hi.collar, target);
  });
  return { effective, nominal, faceDistance, toward };
}
