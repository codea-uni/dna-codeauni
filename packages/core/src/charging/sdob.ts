import type { Hole, Kilograms, Meters } from '../model/types';
import { deckIntervals, explosiveDeckMass, type indexLibrary } from './charge';

export interface ScaledDepthOfBurial {
  /** Profundidad escalada de enterramiento SD = D / W^(1/3) [m/kg^(1/3)]. */
  sdob: number;
  /** Distancia del collar al centro de masa de la carga de referencia [m]. */
  depth: Meters;
  /** Masa de la carga de referencia W [kg]. */
  mass: Kilograms;
  /** Largo de la carga de referencia [m] (10·Ø, o el deck entero si es más corto). */
  length: Meters;
  /** Índice en `hole.decks` del deck usado. */
  deckIndex: number;
}

/**
 * Profundidad escalada de enterramiento (SDOB, Chiappetta; FC-18, RM-08, `docs/theory/02 §2`).
 * Es un modelo de **confinamiento** con raíz cúbica, distinto de la distancia escalada de
 * vibración (raíz cuadrada, `vibration/`).
 *
 * Criterio del ingeniero (P-01): se usa la carga más cercana a la superficie (la que controla la
 * eyección del taco y el flyrock), con su propia densidad en taladro (masa/largo del deck). La carga
 * de referencia son sus primeros 10 diámetros: W = q·10·Ø y D = material sobre la carga + 5·Ø.
 * Si el deck mide menos de 10·Ø, se toma su masa real y su centro.
 * Las cámaras de aire (y el tramo vacío en la boca) sobre la carga **no confinan** y no se cuentan
 * en D: así se reproduce el «SD corregido» de CR-02 «Actual» (aire de 1,3 m bajo el taco → 1,14);
 * midiendo desde el collar daría 1,33 (P-14, por confirmar). Es el criterio conservador.
 * ponytail: D se mide a lo largo del eje; en inclinados la profundidad vertical sería menor.
 *
 * Devuelve null si el taladro no tiene explosivo.
 */
export function scaledDepthOfBurial(
  hole: Hole,
  lib: ReturnType<typeof indexLibrary>,
): ScaledDepthOfBurial | null {
  const intervals = deckIntervals(hole);
  // Los decks van de fondo a boca: el último con explosivo es el más cercano a la superficie.
  for (let i = intervals.length - 1; i >= 0; i--) {
    const iv = intervals[i];
    if (iv?.deck.kind !== 'explosive') continue;
    const product = lib.explosives.get(iv.deck.explosiveId);
    if (!product || iv.deck.length <= 0) continue;
    const mass = explosiveDeckMass(iv.deck, product, hole.diameter);
    if (mass <= 0) continue;
    const q = mass / iv.deck.length; // densidad lineal en taladro, tras esponjar
    const diameter = iv.deck.effectiveDiameter ?? hole.diameter;
    const length = Math.min(10 * diameter, iv.deck.length);
    const w = q * length;
    let cover = 0; // material que confina sobre la carga (taco, tapón…), sin aire ni vacío
    for (let k = i + 1; k < intervals.length; k++) {
      const d = intervals[k]?.deck;
      if (d && d.kind !== 'air') cover += d.length;
    }
    const depth = cover + length / 2;
    return { sdob: depth / Math.cbrt(w), depth, mass: w, length, deckIndex: i };
  }
  return null;
}
