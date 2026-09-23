import type {
  ChargeRule,
  Deck,
  Explosive,
  Hole,
  InHoleInitiator,
  Kilograms,
  Meters,
  ProductLibrary,
} from '../model/types';
import { newId } from '../model/ids';

/** Tramo de un deck a lo largo del eje, medido desde la BOCA [m]. `top` < `bottom`. */
export interface DeckInterval {
  deck: Deck;
  top: Meters;
  bottom: Meters;
}

/** Posición de cada deck (ordenados de fondo a boca) como profundidades desde la boca. */
export function deckIntervals(hole: Pick<Hole, 'decks' | 'length'>): DeckInterval[] {
  const out: DeckInterval[] = [];
  let bottom = hole.length;
  for (const deck of hole.decks) {
    const top = bottom - deck.length;
    out.push({ deck, top, bottom });
    bottom = top;
  }
  return out;
}

/** Área de la sección del taladro [m²]. */
export function holeArea(diameter: Meters): number {
  return (Math.PI * diameter * diameter) / 4;
}

/**
 * Carga lineal [kg/m]. A granel: ρ·A del taladro (el explosivo llena la sección).
 * Encartuchado: masa del cartucho / largo del cartucho (cartuchos en contacto).
 */
export function linearChargeDensity(
  explosive: Explosive,
  diameter: Meters,
  densityOverride?: number,
): number {
  if (explosive.form === 'packaged' && explosive.cartridge) {
    return explosive.cartridge.mass / explosive.cartridge.length;
  }
  return (densityOverride ?? explosive.density) * holeArea(diameter);
}

export interface HoleCharge {
  /** Masa de explosivo en decks [kg] (sin primas). */
  explosive: Kilograms;
  /** Masa de primas/boosters [kg]. */
  primers: Kilograms;
  /** Energía total (explosivo + primas con explosivo conocido) [J]. */
  energy: number;
  /** Largo cargado con explosivo [m]. */
  chargeLength: Meters;
  /** Largo de taco [m]. */
  stemmingLength: Meters;
  /** Largo no ocupado por decks (queda vacío en la boca) [m]. */
  emptyLength: Meters;
  /** Masa por deck (0 para decks sin explosivo) en el mismo orden que `hole.decks`. */
  deckMasses: Kilograms[];
  /** Costo de explosivo + taco + primas + detonadores (si los productos lo definen). */
  cost: number;
}

interface ProductIndex {
  explosives: Map<string, Explosive>;
  primers: Map<string, ProductLibrary['primers'][number]>;
  stemming: Map<string, ProductLibrary['stemmingMaterials'][number]>;
  detonators: Map<string, ProductLibrary['detonators'][number]>;
}

export function indexLibrary(library: ProductLibrary): ProductIndex {
  return {
    explosives: new Map(library.explosives.map((e) => [e.id, e])),
    primers: new Map(library.primers.map((p) => [p.id, p])),
    stemming: new Map(library.stemmingMaterials.map((s) => [s.id, s])),
    detonators: new Map(library.detonators.map((d) => [d.id, d])),
  };
}

/** Carga de un taladro. Decks que referencian productos inexistentes cuentan como 0 kg. */
export function holeCharge(hole: Hole, lib: ProductIndex): HoleCharge {
  const area = holeArea(hole.diameter);
  let explosive = 0;
  let energy = 0;
  let chargeLength = 0;
  let stemmingLength = 0;
  let used = 0;
  let cost = 0;
  const deckMasses: number[] = [];
  for (const deck of hole.decks) {
    used += deck.length;
    let mass = 0;
    if (deck.kind === 'explosive') {
      const product = lib.explosives.get(deck.explosiveId);
      if (product) {
        mass = linearChargeDensity(product, hole.diameter, deck.densityOverride) * deck.length;
        energy += mass * product.energy;
        cost += mass * (product.costPerKg ?? 0);
      }
      chargeLength += deck.length;
    } else if (deck.kind === 'stemming') {
      stemmingLength += deck.length;
      const material = lib.stemming.get(deck.materialId);
      cost += area * deck.length * (material?.costPerM3 ?? 0);
    } else if (deck.kind === 'plug') {
      cost += deck.cost ?? 0;
    }
    explosive += mass;
    deckMasses.push(mass);
  }
  let primers = 0;
  for (const init of hole.initiators) {
    cost += lib.detonators.get(init.detonatorId)?.costPerUnit ?? 0;
    if (!init.primerId) continue;
    const primer = lib.primers.get(init.primerId);
    if (!primer) continue;
    primers += primer.mass;
    cost += primer.costPerUnit ?? 0;
    const pe = primer.explosiveId ? lib.explosives.get(primer.explosiveId) : undefined;
    if (pe) energy += primer.mass * pe.energy;
  }
  return {
    explosive,
    primers,
    energy,
    chargeLength,
    stemmingLength,
    emptyLength: Math.max(0, hole.length - used),
    deckMasses,
    cost,
  };
}

/**
 * Aplica una regla de carga: de fondo a boca, explosivo · aire (opcional) · taco.
 * Si taco + aire superan el largo, el explosivo queda en 0 m y el taco se recorta.
 * El iniciador (si hay detonador) se ubica a `primerOffsetFromToe` del fondo.
 */
export function applyChargeRule(
  hole: Hole,
  rule: ChargeRule,
  library: ProductLibrary,
): Pick<Hole, 'decks' | 'initiators'> {
  const L = hole.length;
  const stemming = Math.min(rule.stemmingLength, L);
  const air = Math.min(rule.airDeckLength ?? 0, L - stemming);
  const charge = Math.max(0, L - stemming - air);
  const decks: Deck[] = [];
  if (charge > 0)
    decks.push({
      id: newId<'Deck'>(),
      kind: 'explosive',
      explosiveId: rule.explosiveId,
      length: charge,
    });
  if (air > 0) decks.push({ id: newId<'Deck'>(), kind: 'air', length: air });
  if (stemming > 0)
    decks.push({
      id: newId<'Deck'>(),
      kind: 'stemming',
      materialId: rule.stemmingMaterialId,
      length: stemming,
    });

  const initiators: InHoleInitiator[] = [];
  if (rule.detonatorId) {
    const det = library.detonators.find((d) => d.id === rule.detonatorId);
    const init: InHoleInitiator = {
      id: newId<'InHoleInitiator'>(),
      detonatorId: rule.detonatorId,
      depth: Math.max(0, L - Math.min(rule.primerOffsetFromToe, charge)),
      delay: det?.nominalDelay ?? 0,
    };
    if (rule.primerId) init.primerId = rule.primerId;
    initiators.push(init);
  }
  return { decks, initiators };
}
