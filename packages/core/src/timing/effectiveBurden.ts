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

function segmentDistance(x: number, y: number, [a, b]: [Vec2, Vec2]): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
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
 * de adelante de los vecinos de la misma fila, cuyas distancias a la cara varían un poco en
 * perímetros irregulares. Sin burden nominal, cualquier diferencia mayor que 1 mm.
 */
export function frontMargin(nominalBurden: number): number {
  return Number.isFinite(nominalBurden) ? 0.5 * nominalBurden : FRONT_TOL;
}

/**
 * Burden efectivo según la secuencia (FC-22, RM-07, `docs/theory/02 §3`, P-02). Para cada taladro,
 * la distancia (en planta, desde la boca) a la superficie libre más cercana en el instante en que
 * detona. Superficies libres: la cara libre definida por el usuario y los taladros que detonaron
 * al menos `reliefRate`·B antes (P-02: el alivio necesita tiempo de desplazamiento; 0 = caso
 * límite optimista).
 *
 * Un taladro detonado alivia solo a los que están **detrás** de él respecto de la cara libre
 * (al menos media fila más lejos de ella, `frontMargin`): así se reproduce CR-05, donde en el amarre 5 la fila trasera conserva
 * B_ef = 6 m aunque sus vecinos de fila ya detonaron (P-16, por confirmar). Sin cara libre
 * definida, cualquier taladro detonado alivia.
 * Búsqueda con el índice espacial (flatbush): el vecino elegible más cercano, acotado por la
 * distancia a la cara libre.
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
  const burdenOf = new Map(blast.patterns.map((p) => [p.id, p.burden]));
  const segs = freeFaceSegments(blast);
  const hasFace = segs.length > 0;
  blast.holes.forEach((h, i) => {
    const b = h.patternId ? burdenOf.get(h.patternId) : undefined;
    if (b !== undefined) nominal[i] = b;
    for (const s of segs)
      faceDistance[i] = Math.min(
        faceDistance[i] ?? Infinity,
        segmentDistance(h.collar.x, h.collar.y, s),
      );
  });
  const index = holeIndex(blast.holes);
  blast.holes.forEach((hi, i) => {
    const ti = fireTime[i] ?? NaN;
    if (!Number.isFinite(ti)) return;
    const bi = nominal[i] ?? NaN;
    const delay = reliefRate * (Number.isFinite(bi) ? bi : 0);
    const di = faceDistance[i] ?? Infinity;
    const margin = frontMargin(bi);
    // Alivia un taladro que detonó al menos `delay` antes y, con cara libre, que está delante.
    // Estrictamente antes: el propio taladro y los simultáneos no alivian.
    const relieving = (j: number) =>
      ti - (fireTime[j] ?? NaN) > 1e-9 &&
      ti - (fireTime[j] ?? NaN) >= delay - 1e-9 &&
      (!hasFace || (faceDistance[j] ?? Infinity) < di - margin);
    const near = index.nearest(hi.collar.x, hi.collar.y, di, (j) => !relieving(j));
    effective[i] = near ? Math.hypot(hi.collar.x - near.x, hi.collar.y - near.y) : di;
  });
  return { effective, nominal, faceDistance };
}
