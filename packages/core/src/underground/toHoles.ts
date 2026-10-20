import { newId } from '../model/ids';
import type {
  Deck,
  DetonatorId,
  Explosive,
  Hole,
  InHoleInitiator,
  Meters,
  PrimerId,
  Seconds,
  StemmingMaterialId,
} from '../model/types';
import type { FaceDesignResult, FaceHole } from './faceDesign';
import type { RingDesignResult, RingPlacement } from './ringDesign';
import { faceHoleToWorld, offsetFrame, ringHoleToWorld, type PlaneFrame } from './transform';

/**
 * Paso de un diseño subterráneo (ronda de frente o anillos) a taladros del modelo (Fase 3, S5).
 *
 * Los decks van de FONDO a BOCA, como exige `Hole.decks`. La concentración lineal del diseño se
 * respeta con el diámetro efectivo de la carga: d_ef = √(4·q/(π·ρ)), de modo que la masa que
 * calcula el carguío (ρ·π·d_ef²/4·largo) es la del diseño también en columnas desacopladas
 * (contorno con voladura suave, ayudas con carga reducida) y en productos encartuchados.
 */

export interface UndergroundProducts {
  /** Explosivo principal (fondo y columna). */
  explosive: Explosive;
  /** Explosivo del contorno con voladura suave; por defecto el principal. */
  contourExplosive?: Explosive;
  /** Material del taco; sin él, la boca queda vacía. */
  stemmingMaterialId?: StemmingMaterialId;
  /** Detonador en el taladro; sin él no se ponen iniciadores. */
  detonatorId?: DetonatorId;
  /** Cebo (booster/cartucho) del iniciador si el explosivo lo necesita. */
  primerId?: PrimerId;
}

const EPS = 1e-9;

/** Prefijo de las marcas de los taladros subterráneos (`ug-face`, `ug-ring`, `ug-relief`). */
export const UNDERGROUND_TAG_PREFIX = 'ug-';
/** Marca de los taladros de alivio (vacíos por diseño). */
export const RELIEF_TAG = 'ug-relief';
/** Marca de los taladros cargados del arranque (cuele): están juntos por diseño. */
export const CUT_TAG = 'ug-cut';

/** Marca de los taladros guía del contorno «uno sí, uno no» (vacíos por diseño). */
export const GUIDE_TAG = 'ug-guide';

/** Taladro vacío por diseño (alivio del arranque o guía del contorno): no lleva carga. */
export function isEmptyByDesign(hole: Pick<Hole, 'tags'>): boolean {
  return hole.tags?.some((t) => t === RELIEF_TAG || t === GUIDE_TAG) ?? false;
}

/** Taladro de un diseño subterráneo (frente o anillo): las reglas de banco no le aplican. */
export function isUndergroundHole(hole: Pick<Hole, 'tags'>): boolean {
  return hole.tags?.some((t) => t.startsWith(UNDERGROUND_TAG_PREFIX)) ?? false;
}

/** Diámetro efectivo que da la concentración `linearCharge` con la densidad del producto. */
export function effectiveChargeDiameter(linearCharge: number, density: number): Meters {
  return Math.sqrt((4 * linearCharge) / (Math.PI * density));
}

function explosiveDeck(
  product: Explosive,
  length: Meters,
  linearCharge: number,
  holeDiameter: Meters,
): Deck {
  const deck: Deck = { id: newId<'Deck'>(), kind: 'explosive', length, explosiveId: product.id };
  const dEff = effectiveChargeDiameter(linearCharge, product.density);
  // A granel y acoplado (d_ef = d) no hace falta: la masa ya es ρ·A del taladro.
  if (product.form === 'packaged' || Math.abs(dEff - holeDiameter) > 1e-6 * holeDiameter)
    deck.effectiveDiameter = dEff;
  return deck;
}

function stemmingDeck(length: Meters, materialId: StemmingMaterialId | undefined): Deck[] {
  if (length <= EPS || !materialId) return [];
  return [{ id: newId<'Deck'>(), kind: 'stemming', length, materialId }];
}

function initiators(
  products: UndergroundProducts,
  primed: Explosive | null,
  depth: Meters,
  delay: Seconds,
): InHoleInitiator[] {
  if (!products.detonatorId || !primed) return [];
  const init: InHoleInitiator = {
    id: newId<'InHoleInitiator'>(),
    detonatorId: products.detonatorId,
    depth: Math.max(0, depth),
    delay,
  };
  if (products.primerId && primed.needsBooster) init.primerId = products.primerId;
  return [init];
}

/** Decks de un taladro de frente (fondo → boca) y explosivo que lleva el cebo. */
function faceDecks(
  h: FaceHole,
  products: UndergroundProducts,
): { decks: Deck[]; primed: Explosive | null } {
  const c = h.charge;
  if (!c) return { decks: [], primed: null };
  const product =
    h.role === 'contour' ? (products.contourExplosive ?? products.explosive) : products.explosive;
  const decks: Deck[] = [];
  if (c.bottom.length > EPS && c.bottom.linearCharge > 0)
    decks.push(explosiveDeck(product, c.bottom.length, c.bottom.linearCharge, h.diameter));
  if (c.column.length > EPS && c.column.linearCharge > 0)
    decks.push(explosiveDeck(product, c.column.length, c.column.linearCharge, h.diameter));
  decks.push(...stemmingDeck(c.stemming, products.stemmingMaterialId));
  return { decks, primed: decks.length > 0 ? product : null };
}

export interface FaceToHolesInput {
  design: FaceDesignResult;
  frame: PlaneFrame;
  products: UndergroundProducts;
  /** Tiempo por número de retardo [s] (secuencia tipo período largo). */
  delayInterval: Seconds;
  /**
   * Separación mínima entre taladros consecutivos [s] (electrónicos). 0 (por defecto) = todos los
   * taladros del mismo número salen juntos; > 0 = secuencia continua sin acoplamiento: cada taladro
   * sale en max(número × intervalo, anterior + separación), en el orden del diseño.
   */
  holeInterval?: Seconds;
  labelPrefix?: string;
  tag?: string;
}

/**
 * Tiempos de disparo de la ronda [s] (null en los alivios), en el orden de `design.holes`. Con
 * `holeInterval` > 0 la secuencia es continua: nadie comparte tiempo y el orden se respeta.
 */
export function faceFiringTimes(
  design: Pick<FaceDesignResult, 'holes'>,
  delayInterval: Seconds,
  holeInterval: Seconds = 0,
): (Seconds | null)[] {
  let prev = -Infinity;
  return design.holes.map((h) => {
    if (h.delay === null) return null;
    const nominal = h.delay * delayInterval;
    if (!(holeInterval > 0)) return nominal;
    const t = Math.max(nominal, prev + holeInterval);
    prev = t;
    return t;
  });
}

/**
 * Taladros de la ronda del frente en coordenadas de proyecto. Los alivios y las guías del contorno
 * quedan vacíos.
 */
export function faceRoundToHoles(input: FaceToHolesInput): Hole[] {
  const prefix = input.labelPrefix ?? 'F-';
  const tag = input.tag ?? 'ug-face';
  const times = faceFiringTimes(input.design, input.delayInterval, input.holeInterval ?? 0);
  return input.design.holes.map((h, k) => {
    const w = faceHoleToWorld(input.frame, h);
    const { decks, primed } = faceDecks(h, input.products);
    // Cebo cerca del fondo, dentro de la carga de fondo (o de la columna en el contorno).
    const depth = w.length - Math.min(0.3, 0.5 * (h.length - (h.charge?.stemming ?? 0)));
    return {
      id: newId<'Hole'>(),
      label: `${prefix}${String(h.index)}`,
      collar: w.collar,
      diameter: h.diameter,
      length: w.length,
      inclination: w.inclination,
      azimuth: w.azimuth,
      subdrill: 0,
      decks,
      initiators: h.delay === null ? [] : initiators(input.products, primed, depth, times[k] ?? 0),
      status: 'designed',
      tags:
        h.role === 'relief'
          ? [tag, RELIEF_TAG]
          : h.guide
            ? [tag, GUIDE_TAG]
            : h.role === 'cut'
              ? [tag, CUT_TAG]
              : [tag],
    } satisfies Hole;
  });
}

export interface RingsToHolesInput {
  ring: RingDesignResult;
  /** Marco del primer anillo (origen en el centro del piso de la galería). */
  frame: PlaneFrame;
  placements: readonly RingPlacement[];
  products: UndergroundProducts;
  labelPrefix?: string;
  tag?: string;
}

/**
 * Taladros de N anillos: el anillo i se desplaza `placement.offset` a lo largo de la galería y
 * suma `placement.delayOffset` a los tiempos del anillo. Collar sin carga = taco.
 */
export function ringsToHoles(input: RingsToHolesInput): Hole[] {
  const prefix = input.labelPrefix ?? 'A';
  const tag = input.tag ?? 'ug-ring';
  const q = input.ring.linearCharge;
  const product = input.products.explosive;
  const out: Hole[] = [];
  for (const placement of input.placements) {
    const frame = offsetFrame(input.frame, placement.offset);
    for (const h of input.ring.holes) {
      const w = ringHoleToWorld(frame, h);
      const decks: Deck[] = [];
      if (h.chargedLength > EPS) decks.push(explosiveDeck(product, h.chargedLength, q, h.diameter));
      decks.push(...stemmingDeck(h.unchargedCollar, input.products.stemmingMaterialId));
      const charged = h.chargedLength > EPS;
      out.push({
        id: newId<'Hole'>(),
        label: `${prefix}${String(placement.index + 1)}-${String(h.index)}`,
        collar: w.collar,
        diameter: h.diameter,
        length: w.length,
        inclination: w.inclination,
        azimuth: w.azimuth,
        subdrill: 0,
        decks,
        initiators: charged
          ? initiators(
              input.products,
              product,
              w.length - Math.min(0.5, 0.5 * h.chargedLength),
              h.delay + placement.delayOffset,
            )
          : [],
        status: 'designed',
        tags: [tag],
      });
    }
  }
  return out;
}
