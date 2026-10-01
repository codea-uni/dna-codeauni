import { deckIntervals, explosiveDeckMass, indexLibrary } from '../charging/charge';
import type { Blast, CalcParams, KgPerM3, Meters, ProductLibrary, Radians } from '../model/types';
import type { EffectiveBurden } from '../timing/effectiveBurden';
import { holeBoundary } from '../geometry/boundary';
import { boundaryFace } from '../geometry/face';

/** Gravedad estándar [m/s²]. */
export const STANDARD_GRAVITY = 9.80665;
const G = STANDARD_GRAVITY;

/**
 * B/Ø mínimo del modelo: el menor de los casos citados de Zhang et al. (2021) es Malmberget,
 * 0,8 m / 115 mm ≈ 7 (S-09). Por debajo, v ∝ 1/B se dispara fuera de lo validado.
 */
export const MIN_BURDEN_DIAMETER_RATIO = 7;

/**
 * Velocidad de burden (Zhang, Chi & Yi 2021, J. Rock Mech. Geotech. Eng. 13(4):767–773, FC-36):
 * v_B = √[π·c_B·ρ_e·e_e·c_e / (2·ρ_r·tan θ)]·(d/B), con c_e = largo de carga / altura de banco.
 * Solo para carga acoplada (P-21). SI: ρ en kg/m³, e_e en J/kg, v en m/s.
 */
export function burdenVelocity(p: {
  diameter: Meters;
  burden: Meters;
  explosiveDensity: KgPerM3;
  explosiveEnergy: number;
  chargeRatio: number;
  rockDensity: KgPerM3;
  cB: number;
  theta: Radians;
}): number {
  return (
    Math.sqrt(
      (Math.PI * p.cB * p.explosiveDensity * p.explosiveEnergy * p.chargeRatio) /
        (2 * p.rockDensity * Math.tan(p.theta)),
    ) *
    (p.diameter / p.burden)
  );
}

/**
 * Alcance horizontal del centroide del burden por tiro parabólico (FC-37, P-21):
 * R = (v·cos α/g)·[v·sin α + √((v·sin α)² + 2·g·h)], α = ángulo de lanzamiento sobre la
 * horizontal (90° − ángulo de la cara) y h = altura del centroide sobre el piso (≈ H/2).
 */
export function ballisticRange(v: number, launchAngle: Radians, height: Meters): Meters {
  const vx = v * Math.cos(launchAngle);
  const vy = v * Math.sin(launchAngle);
  return (vx / G) * (vy + Math.sqrt(vy * vy + 2 * G * height));
}

/**
 * Fila contada desde la cara libre original (1 = primera): una fila por cada burden nominal de
 * distancia a la cara, redondeando a la mitad (A5). Sin cara o sin malla, 1.
 */
export function rowFromFace(faceDistance: number, nominalBurden: number): number {
  return Number.isFinite(faceDistance) && Number.isFinite(nominalBurden) && nominalBurden > 0
    ? Math.max(1, Math.floor(faceDistance / nominalBurden + 0.5))
    : 1;
}

export interface Displacement {
  /** Velocidad de burden por taladro [m/s] (NaN sin carga, sin superficie libre o desacoplado). */
  velocity: Float64Array;
  /** Alcance del centroide [m], ya reducido por fila (v·k^(n−1)). */
  range: Float64Array;
  /** Fila contada desde la cara libre (1 = primera). */
  row: Float64Array;
  /** Taladros fuera de la validez del modelo: carga desacoplada o B/Ø < 7. */
  excluded: number;
}

/**
 * Desplazamiento por taladro (A5): velocidad de Zhang con el burden efectivo, dirección hacia la
 * superficie libre al detonar (`eb.toward`, normal a la isócrona, `R1` F21) y alcance balístico.
 * Las filas posteriores se reducen con v·k^(n−1): k es de calibración de sitio (R0, S-01).
 */
export function computeDisplacement(
  blast: Pick<Blast, 'holes' | 'bench'> & Partial<Pick<Blast, 'boundaries' | 'patterns'>>,
  library: ProductLibrary,
  rockDensity: KgPerM3,
  eb: EffectiveBurden,
  params: CalcParams['displacement'],
): Displacement {
  const lib = indexLibrary(library);
  const n = blast.holes.length;
  const velocity = new Float64Array(n).fill(NaN);
  const range = new Float64Array(n).fill(NaN);
  const row = new Float64Array(n).fill(NaN);
  const H = blast.bench.height;
  // α = 90° − ángulo de la cara del perímetro del taladro (propio o el del banco; A7b).
  const launchOf = (h: Blast['holes'][number]) =>
    Math.PI / 2 - boundaryFace(blast.bench, holeBoundary(blast, h)).angle;
  let excluded = 0;
  blast.holes.forEach((h, i) => {
    const b = eb.effective[i] ?? NaN;
    const nominal = eb.nominal[i] ?? NaN;
    if (!Number.isFinite(b) || b <= 0) return;
    let mass = 0;
    let volume = 0;
    let energy = 0;
    let length = 0;
    let isDecoupled = false;
    for (const iv of deckIntervals(h)) {
      if (iv.deck.kind !== 'explosive') continue;
      const product = lib.explosives.get(iv.deck.explosiveId);
      if (!product) continue;
      const m = explosiveDeckMass(iv.deck, product, h.diameter);
      const len = iv.bottom - iv.top;
      if ((iv.deck.effectiveDiameter ?? h.diameter) < 0.95 * h.diameter) isDecoupled = true;
      mass += m;
      energy += m * product.energy;
      length += len;
      volume += (Math.PI / 4) * h.diameter ** 2 * len;
    }
    if (mass <= 0 || H <= 0) return;
    if (isDecoupled || b / h.diameter < MIN_BURDEN_DIAMETER_RATIO) {
      excluded++;
      return;
    }
    const v = burdenVelocity({
      diameter: h.diameter,
      burden: b,
      explosiveDensity: mass / volume,
      explosiveEnergy: energy / mass,
      chargeRatio: Math.min(1, length / H),
      rockDensity,
      cB: params.cB,
      theta: params.theta,
    });
    const r = rowFromFace(eb.faceDistance[i] ?? Infinity, nominal);
    const vRow = v * params.rowFactor ** (r - 1);
    velocity[i] = v;
    row[i] = r;
    range[i] = ballisticRange(vRow, launchOf(h), H / 2);
  });
  return { velocity, range, row, excluded };
}
