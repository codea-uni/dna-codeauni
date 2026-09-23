import { deckIntervals } from '../charging/charge';
import type { Bench, BlastBoundary, Hole, Vec3 } from '../model/types';
import { outwardNormal, polygonEdge } from './boundary';
import { holeToe } from './hole';

export type SegmentKind = 'explosive' | 'stemming' | 'air' | 'water' | 'plug' | 'empty';

/** Tramo de la columna de un taladro en 3D (coordenadas de proyecto). */
export interface HoleSegment {
  kind: SegmentKind;
  /** Producto (explosivo o material de taco) si aplica. */
  productId?: string;
  from: Vec3;
  to: Vec3;
}

/**
 * Tramos 3D de un taladro de boca a fondo: los decks (de fondo a boca en el modelo) más el tramo
 * vacío que quede en la boca. Siempre cubren toda la longitud del taladro.
 */
export function holeSegments3d(hole: Hole): HoleSegment[] {
  const toe = holeToe(hole);
  const at = (depth: number): Vec3 => {
    const t = hole.length > 0 ? Math.min(1, Math.max(0, depth / hole.length)) : 0;
    return {
      x: hole.collar.x + (toe.x - hole.collar.x) * t,
      y: hole.collar.y + (toe.y - hole.collar.y) * t,
      z: hole.collar.z + (toe.z - hole.collar.z) * t,
    };
  };
  const out: HoleSegment[] = [];
  let highest = hole.length; // profundidad del borde superior del deck más alto
  for (const { deck, top, bottom } of deckIntervals(hole)) {
    const t = Math.max(0, top);
    if (bottom <= t) continue;
    const seg: HoleSegment = { kind: deck.kind, from: at(t), to: at(bottom) };
    if (deck.kind === 'explosive') seg.productId = deck.explosiveId;
    else if (deck.kind === 'stemming') seg.productId = deck.materialId;
    out.push(seg);
    highest = Math.min(highest, t);
  }
  if (hole.decks.length === 0) return [{ kind: 'empty', from: hole.collar, to: toe }];
  if (highest > 1e-9) out.push({ kind: 'empty', from: hole.collar, to: at(highest) });
  return out;
}

/**
 * Caras de talud de un perímetro: por cada arista de cara libre, un cuadrilátero desde la cresta
 * (cota superior del banco) hasta el pie (cota de piso), desplazado hacia afuera H / tan(ángulo de cara).
 * Vértices: [cresta A, cresta B, pie B, pie A].
 */
export function freeFaceQuads(boundary: BlastBoundary, bench: Bench): [Vec3, Vec3, Vec3, Vec3][] {
  const top = bench.floorElevation + bench.height;
  const run =
    bench.faceAngle > 0 && bench.faceAngle < Math.PI / 2
      ? bench.height / Math.tan(bench.faceAngle)
      : 0;
  const quads: [Vec3, Vec3, Vec3, Vec3][] = [];
  for (const i of boundary.freeFaceEdges) {
    const e = polygonEdge(boundary.polygon, i);
    const nrm = outwardNormal(boundary.polygon, i);
    if (!e || !nrm) continue;
    const [a, b] = e;
    quads.push([
      { x: a.x, y: a.y, z: top },
      { x: b.x, y: b.y, z: top },
      { x: b.x + nrm.x * run, y: b.y + nrm.y * run, z: bench.floorElevation },
      { x: a.x + nrm.x * run, y: a.y + nrm.y * run, z: bench.floorElevation },
    ]);
  }
  return quads;
}
