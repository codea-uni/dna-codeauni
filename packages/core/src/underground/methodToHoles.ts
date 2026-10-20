import { newId } from '../model/ids';
import type { Deck, Explosive, Hole, InHoleInitiator, Seconds, Vec3 } from '../model/types';
import type { MethodContext, MethodDesign, MethodHole, P3 } from './methods';
import { CUT_TAG, effectiveChargeDiameter, RELIEF_TAG, type UndergroundProducts } from './toHoles';
import { directionToHoleAngles, localToWorld, type PlaneFrame } from './transform';

/**
 * Paso de un diseño por método de minado (`designByMethod`) a taladros del modelo. Igual que
 * `faceRoundToHoles`/`ringsToHoles`: decks de FONDO a BOCA, carga lineal del diseño respetada con
 * el diámetro efectivo, cebo cerca del fondo de la carga más profunda y tiempo programado del
 * diseño. El marco debe ser horizontal (dump 0): x → derecha, y → avance, z → arriba.
 */

const EPS = 1e-9;

/** Punto local del diseño a coordenadas de proyecto. */
export function methodPointToWorld(frame: PlaneFrame, p: P3): Vec3 {
  return localToWorld(frame, { u: p.x, v: p.z }, p.y);
}

/** Secciones de contexto (galería, ronda, tajeo) en coordenadas de proyecto. */
export function methodContextToWorld(frame: PlaneFrame, c: MethodContext): Vec3[][] {
  return c.sections.map((s) => s.map((p) => methodPointToWorld(frame, p)));
}

function frameAzimuth(frame: PlaneFrame): number {
  const a = Math.atan2(frame.forward.x, frame.forward.y);
  return a < 0 ? a + 2 * Math.PI : a;
}

function decksOf(
  h: MethodHole,
  products: UndergroundProducts,
): { decks: Deck[]; primed: Explosive | null } {
  const decks: Deck[] = [];
  let primed: Explosive | null = null;
  for (const d of h.decks) {
    if (d.length <= EPS) continue;
    if (d.kind === 'charge') {
      const product =
        d.product === 'contour'
          ? (products.contourExplosive ?? products.explosive)
          : products.explosive;
      const deck: Deck = {
        id: newId<'Deck'>(),
        kind: 'explosive',
        length: d.length,
        explosiveId: product.id,
      };
      const dEff = effectiveChargeDiameter(d.linearCharge, product.density);
      if (product.form === 'packaged' || Math.abs(dEff - h.diameter) > 1e-6 * h.diameter)
        deck.effectiveDiameter = dEff;
      decks.push(deck);
      primed ??= product;
    } else if (d.kind === 'stemming') {
      if (products.stemmingMaterialId)
        decks.push({
          id: newId<'Deck'>(),
          kind: 'stemming',
          length: d.length,
          materialId: products.stemmingMaterialId,
        });
      else decks.push({ id: newId<'Deck'>(), kind: 'air', length: d.length });
    } else if (d.kind === 'plug')
      decks.push({ id: newId<'Deck'>(), kind: 'plug', length: d.length, name: 'Tapón' });
    else decks.push({ id: newId<'Deck'>(), kind: 'air', length: d.length });
  }
  // El aire de la boca no hace falta: lo que sobra arriba se reporta como vacío.
  while (decks.length > 0 && decks[decks.length - 1]?.kind === 'air') decks.pop();
  return { decks, primed };
}

/** Profundidad del cebo desde la boca: cerca del fondo de la primera carga (desde el fondo). */
function primerDepth(h: MethodHole): number {
  let fromToe = 0;
  for (const d of h.decks) {
    if (d.kind === 'charge' && d.length > EPS)
      return h.length - fromToe - Math.min(0.5, 0.5 * d.length);
    fromToe += d.length;
  }
  return h.length;
}

export interface MethodToHolesInput {
  design: MethodDesign;
  frame: PlaneFrame;
  products: UndergroundProducts;
  /** Marca de la plantilla (`ug-…`). */
  tag: string;
  labelPrefix?: string;
  /**
   * Separación mínima entre taladros [s] (electrónicos): > 0 = secuencia continua, ningún taladro
   * sale junto con otro (sin acoplamiento); cada uno sale en max(tiempo nominal, anterior +
   * separación), en orden de tiempo nominal. 0 (por defecto) = los del mismo tiempo salen juntos.
   */
  holeSeparation?: Seconds;
}

/** Tiempos de disparo con secuencia continua (ver `MethodToHolesInput.holeSeparation`). */
export function continuousDelays(
  delays: readonly (Seconds | null)[],
  separation: Seconds,
): (Seconds | null)[] {
  if (!(separation > 0)) return [...delays];
  const order = delays
    .map((d, i) => ({ d, i }))
    .filter((x): x is { d: Seconds; i: number } => x.d !== null)
    .sort((a, b) => a.d - b.d || a.i - b.i);
  const out: (Seconds | null)[] = [...delays];
  let prev = -Infinity;
  for (const { d, i } of order) {
    const t = Math.max(d, prev + separation);
    out[i] = t;
    prev = t;
  }
  return out;
}

/** Taladros del diseño por método en coordenadas de proyecto. Los alivios quedan vacíos. */
export function methodDesignToHoles(input: MethodToHolesInput): Hole[] {
  const prefix = input.labelPrefix ?? 'M';
  const times = continuousDelays(
    input.design.holes.map((h) => h.delay),
    input.holeSeparation ?? 0,
  );
  const fallback = frameAzimuth(input.frame);
  return input.design.holes.map((h, k) => {
    const collar = methodPointToWorld(input.frame, h.collar);
    const toe = methodPointToWorld(input.frame, h.toe);
    const a = directionToHoleAngles(toe.x - collar.x, toe.y - collar.y, toe.z - collar.z, fallback);
    const { decks, primed } = decksOf(h, input.products);
    const initiators: InHoleInitiator[] = [];
    if (h.delay !== null && primed && input.products.detonatorId) {
      const init: InHoleInitiator = {
        id: newId<'InHoleInitiator'>(),
        detonatorId: input.products.detonatorId,
        depth: Math.max(0, primerDepth(h)),
        delay: times[k] ?? h.delay,
      };
      if (input.products.primerId && primed.needsBooster) init.primerId = input.products.primerId;
      initiators.push(init);
    }
    return {
      id: newId<'Hole'>(),
      label: `${prefix}${String(h.index)}`,
      collar,
      diameter: h.diameter,
      length: a.length,
      inclination: a.inclination,
      azimuth: a.azimuth,
      subdrill: 0,
      decks,
      initiators,
      status: 'designed',
      tags:
        h.role === 'relief'
          ? [input.tag, RELIEF_TAG]
          : h.role === 'cut'
            ? [input.tag, CUT_TAG]
            : [input.tag],
    } satisfies Hole;
  });
}
