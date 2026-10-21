import type {
  ChargeRule,
  Deck,
  Explosive,
  ExplosiveDeck,
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
 * Densidad lineal de carga DCL [kg/m] (FC-10): (π/4)·Ø²·ρ con π/4 exacto (`02 §0`).
 * - A granel: ρ·A del taladro (el explosivo llena la sección).
 * - Con diámetro efectivo (cartuchos aplastados, CR-03): ρ·A del diámetro efectivo.
 * - Encartuchado sin diámetro efectivo: masa del cartucho / largo del cartucho.
 */
export function linearChargeDensity(
  explosive: Explosive,
  diameter: Meters,
  densityOverride?: number,
  effectiveDiameter?: Meters,
): number {
  const density = densityOverride ?? explosive.density;
  if (effectiveDiameter !== undefined) return density * holeArea(effectiveDiameter);
  if (explosive.form === 'packaged' && explosive.cartridge) {
    return explosive.cartridge.mass / explosive.cartridge.length;
  }
  return density * holeArea(diameter);
}

/** Masa de un tramo de explosivo [kg]: DCL·(largo − esponjamiento) (FC-11, FC-12). */
export function explosiveDeckMass(
  deck: Pick<ExplosiveDeck, 'length' | 'densityOverride' | 'swell' | 'effectiveDiameter'>,
  explosive: Explosive,
  diameter: Meters,
): Kilograms {
  const dcl = linearChargeDensity(
    explosive,
    diameter,
    deck.densityOverride,
    deck.effectiveDiameter,
  );
  return dcl * Math.max(0, deck.length - (deck.swell ?? 0));
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
        mass = explosiveDeckMass(deck, product, hole.diameter);
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

/** Opciones de `applyChargeRule`. */
export interface ChargeRuleOptions {
  /**
   * Conserva el detonador (y su retardo) que el taladro ya tiene; la regla solo lo reubica a
   * `primerOffsetFromToe` del fondo y cambia la prima si trae una. Sin iniciadores previos se
   * usa el detonador de la regla. Así cambiar el explosivo no borra los tiempos programados.
   */
  keepInitiators?: boolean;
}

/**
 * Aplica una regla de carga: de fondo a boca, explosivo · aire (opcional) · taco.
 * Si taco + aire superan el largo, el explosivo queda en 0 m y el taco se recorta: ese taladro
 * queda sin carga y, por lo tanto, sin prima ni detonador (no se inicia un taladro vacío).
 * El iniciador (si hay detonador) se ubica a `primerOffsetFromToe` del fondo.
 */
export function applyChargeRule(
  hole: Hole,
  rule: ChargeRule,
  library: ProductLibrary,
  options: ChargeRuleOptions = {},
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
  if (charge <= 0) return { decks, initiators };
  const depth = Math.max(0, L - Math.min(rule.primerOffsetFromToe, charge));
  if (options.keepInitiators && hole.initiators.length > 0) {
    // El principal (el más profundo) va a la nueva posición; los demás quedan dentro de la carga.
    const deepest = hole.initiators.reduce((a, b) => (b.depth > a.depth ? b : a));
    for (const init of hole.initiators) {
      const next: InHoleInitiator = {
        ...init,
        depth: init === deepest ? depth : Math.min(Math.max(init.depth, L - charge), L),
      };
      if (rule.primerId) next.primerId = rule.primerId;
      initiators.push(next);
    }
    return { decks, initiators };
  }
  if (rule.detonatorId) {
    const det = library.detonators.find((d) => d.id === rule.detonatorId);
    const init: InHoleInitiator = {
      id: newId<'InHoleInitiator'>(),
      detonatorId: rule.detonatorId,
      depth,
      delay: det?.nominalDelay ?? 0,
    };
    if (rule.primerId) init.primerId = rule.primerId;
    initiators.push(init);
  }
  return { decks, initiators };
}

/**
 * Ajusta la columna de carga cuando cambia el largo del taladro con la boca fija (p. ej. otro
 * piso o altura de banco): el taco y lo de arriba quedan iguales, el cambio se toma desde el
 * fondo (el deck más profundo se alarga o se acorta; si se acaba, sigue con el de arriba) y los
 * iniciadores se mueven con el fondo. Sin explosivo, sin iniciadores.
 */
export function fitChargeToLength(
  hole: Pick<Hole, 'length' | 'decks' | 'initiators'>,
  length: number,
): Pick<Hole, 'decks' | 'initiators'> {
  if (hole.decks.length === 0) return { decks: hole.decks, initiators: hole.initiators };
  const used = hole.decks.reduce((sum, d) => sum + d.length, 0);
  // El vacío que hubiera en el fondo se conserva; la columna llega hasta él.
  const gap = Math.max(0, hole.length - used);
  const delta = Math.max(0, length - gap) - used;
  const decks = hole.decks.map((d) => ({ ...d }));
  if (delta > 0) {
    const first = decks[0];
    if (first) first.length += delta;
  } else {
    let cut = -delta;
    while (cut > 1e-12 && decks.length > 0) {
      const first = decks[0];
      if (!first) break;
      if (first.length > cut) {
        first.length -= cut;
        cut = 0;
      } else {
        cut -= first.length;
        decks.shift();
      }
    }
  }
  const shift = length - hole.length;
  const initiators = decks.some((d) => d.kind === 'explosive')
    ? hole.initiators.map((i) => ({ ...i, depth: Math.min(length, Math.max(0, i.depth + shift)) }))
    : [];
  return { decks, initiators };
}

/**
 * Taladros que una regla dejaría sin carga: su largo no supera taco + aire (p. ej. taladros de
 * boca baja en un terreno en pendiente). La interfaz los informa y permite seleccionarlos.
 */
export function holesLeftUncharged(
  holes: readonly Pick<Hole, 'id' | 'length'>[],
  rule: Pick<ChargeRule, 'stemmingLength' | 'airDeckLength'>,
): Hole['id'][] {
  const used = rule.stemmingLength + (rule.airDeckLength ?? 0);
  return holes.filter((h) => h.length - used <= 0).map((h) => h.id);
}
