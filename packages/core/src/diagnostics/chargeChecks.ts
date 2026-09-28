import { deckIntervals, explosiveDeckMass, indexLibrary } from '../charging/charge';
import { scaledDepthOfBurial } from '../charging/sdob';
import type { Blast, Explosive, HoleId, HoleWater, ProductLibrary } from '../model/types';
import type { DesignCheck, DesignCheckOptions } from './designChecks';

const TOL = 1e-3;

/**
 * Compatibilidad producto–agua (P-09, RM-02): con agua estática no ANFO ni productos sin
 * resistencia al agua (salvo ANFO con funda y bombeo previo); con agua dinámica, solo emulsión
 * (bombeable o encartuchada) de alta resistencia.
 */
export function waterCompatible(explosive: Explosive, water: HoleWater | undefined): boolean {
  if (water === 'static')
    return explosive.family !== 'anfo' && explosive.waterResistance !== 'none';
  if (water === 'dynamic')
    return explosive.family === 'emulsion' && explosive.waterResistance === 'high';
  return true;
}

/**
 * Revisión de la carga (G4, `docs/theory/02 §2` y `§6`): cierre de la columna (R3: error),
 * booster en cada tramo de agente de voladura (RM-05), agua (P-09), diámetro crítico (CK-09) y
 * profundidad escalada de enterramiento (CK-08, P-01). Todo lo que no está en R3 es advertencia.
 */
export function chargeChecks(
  blast: Blast,
  library: ProductLibrary,
  options: DesignCheckOptions,
): DesignCheck[] {
  const lib = indexLibrary(library);
  const openColumn: HoleId[] = [];
  const noBooster: HoleId[] = [];
  const water: HoleId[] = [];
  const critical: HoleId[] = [];
  const sdobSevere: HoleId[] = [];
  const sdobLow: HoleId[] = [];
  for (const h of blast.holes) {
    const intervals = deckIntervals(h);
    const charges = intervals.filter((iv) => iv.deck.kind === 'explosive');
    if (charges.length === 0) continue;
    const used = h.decks.reduce((s, d) => s + d.length, 0);
    if (used < h.length - TOL) openColumn.push(h.id);
    let boosterMissing = false;
    let waterBad = false;
    let belowCritical = false;
    // Una carga es un tramo continuo de explosivo (productos en contacto, p. ej. fondo + columna);
    // los decks se separan con taco o aire (glosario de R1, «deck»). Cada carga con un agente de
    // voladura necesita un booster dentro.
    let column = { top: Infinity, bottom: -Infinity, needsBooster: false };
    /** Cierra la carga en curso; true si le falta booster. */
    const closeColumn = (): boolean => {
      const { top, bottom } = column;
      const missing =
        column.needsBooster &&
        !h.initiators.some(
          (init) =>
            init.primerId !== undefined && init.depth >= top - TOL && init.depth <= bottom + TOL,
        );
      column = { top: Infinity, bottom: -Infinity, needsBooster: false };
      return missing;
    };
    for (const iv of intervals) {
      if (iv.deck.kind !== 'explosive') {
        if (closeColumn()) boosterMissing = true;
        continue;
      }
      const product = lib.explosives.get(iv.deck.explosiveId);
      if (!product || explosiveDeckMass(iv.deck, product, h.diameter) <= 0) continue;
      column.top = Math.min(column.top, iv.top);
      column.bottom = Math.max(column.bottom, iv.bottom);
      if (product.needsBooster) column.needsBooster = true;
      if (!waterCompatible(product, h.water)) waterBad = true;
      const chargeDiameter = iv.deck.effectiveDiameter ?? h.diameter;
      if (product.criticalDiameter !== undefined && chargeDiameter < product.criticalDiameter)
        belowCritical = true;
    }
    if (closeColumn()) boosterMissing = true;
    if (boosterMissing) noBooster.push(h.id);
    if (waterBad) water.push(h.id);
    if (belowCritical) critical.push(h.id);
    const sd = scaledDepthOfBurial(h, lib);
    if (sd && sd.sdob < options.sdob.severe) sdobSevere.push(h.id);
    else if (sd && sd.sdob < options.sdob.safe) sdobLow.push(h.id);
  }
  const checks: DesignCheck[] = [
    {
      id: 'openColumn',
      severity: 'error',
      title: 'Columna que no cierra',
      detail:
        'La suma de tramos es menor que la longitud del taladro: completa con taco o aire (cierre de tramos, R3).',
      holes: openColumn,
    },
    {
      id: 'noBooster',
      severity: 'warning',
      title: 'Agente de voladura sin booster',
      detail:
        'Una carga (tramo continuo de explosivo) con agente de voladura no tiene booster dentro: puede no detonar (tiro fallado) o deflagrar (RM-05).',
      holes: noBooster,
    },
    {
      id: 'waterIncompatible',
      severity: 'warning',
      title: 'Explosivo no apto para el agua del taladro',
      detail:
        'Agua estática: sin ANFO (emulsión o ANFO pesado con alta emulsión, o ANFO con funda y bombeo). Agua dinámica: solo emulsión (P-09).',
      holes: water,
    },
    {
      id: 'belowCriticalDiameter',
      severity: 'warning',
      title: 'Diámetro de carga menor que el crítico',
      detail: 'Por debajo del diámetro crítico el explosivo no detona de forma estable (CK-09).',
      holes: critical,
    },
    {
      id: 'sdobSevere',
      severity: 'warning',
      title: 'Confinamiento insuficiente (SDOB severa)',
      detail: `Profundidad escalada de enterramiento < ${String(options.sdob.severe)} m/kg^⅓: proyección y onda aérea severas (DF-20, fuente secundaria; configurable).`,
      params: { value: options.sdob.severe },
      holes: sdobSevere,
    },
    {
      id: 'sdobLow',
      severity: 'info',
      title: 'Confinamiento bajo (SDOB)',
      detail: `Profundidad escalada de enterramiento < ${String(options.sdob.safe)} m/kg^⅓: posible proyección desde el collar (DF-20; configurable).`,
      params: { value: options.sdob.safe },
      holes: sdobLow,
    },
  ];
  return checks.filter((c) => c.holes.length > 0);
}
