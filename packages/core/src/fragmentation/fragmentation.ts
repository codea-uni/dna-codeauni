import { deckIntervals } from '../charging/charge';
import type { ChargeResult } from '../charging/chargeAnalysis';
import type { Blast, Meters, ProductLibrary, RockMass } from '../model/types';

/**
 * Factor de roca A de Cunningham (1987): A = 0.06 · (RMD + JF + RDI + HF).
 * - RMD: descripción del macizo: pulverulento/friable 10, diaclasado vertical = JF, masivo 50.
 * - JF = JPS + JPA (espaciamiento y orientación de diaclasas) — solo si está diaclasado.
 * - RDI = 0.025 · ρ[kg/m³] − 50.
 * - HF = E/3 si E < 50 GPa; si no, UCS/5 (E en GPa, UCS en MPa).
 * `rockFactor` en el macizo prevalece; sin `blastability` se asume macizo masivo (RMD = 50).
 */
export function rockFactor(
  rock: Pick<RockMass, 'density' | 'ucs' | 'youngModulus' | 'blastability' | 'rockFactor'>,
): number {
  if (rock.rockFactor !== undefined) return rock.rockFactor;
  const rdi = rock.blastability?.rdi ?? 0.025 * rock.density - 50;
  const eGpa = rock.youngModulus / 1e9;
  const hf = rock.blastability?.hf ?? (eGpa < 50 ? eGpa / 3 : rock.ucs / 1e6 / 5);
  const b = rock.blastability;
  const description = b ? b.rmd + b.jps + b.jpa : 50;
  return 0.06 * (description + rdi + hf);
}

/** Entradas de Kuz-Ram (unidades SI salvo donde se indica). */
export interface KuzRamInputs {
  /** Factor de roca A (adimensional). */
  rockFactor: number;
  /** Factor de carga [kg/m³]. */
  powderFactor: number;
  /** Explosivo por taladro [kg]. */
  chargePerHole: number;
  /** Potencia relativa en peso vs ANFO (ANFO = 1). */
  rws: number;
  burden: Meters;
  spacing: Meters;
  diameter: Meters;
  /** Desviación estándar de la perforación [m]. */
  drillDeviation: Meters;
  /** Largo de carga sobre el piso [m]. */
  chargeLength: Meters;
  /** Largos de carga de fondo y de columna [m] (columna simple: BCL = carga, CCL = 0). */
  bottomChargeLength: Meters;
  columnChargeLength: Meters;
  benchHeight: Meters;
  /** Malla en tresbolillo multiplica n por 1.1 (Cunningham 1987). */
  staggered: boolean;
}

export interface KuzRamResult {
  /** Tamaño medio [m]. */
  x50: Meters;
  /** Índice de uniformidad (Rosin-Rammler). */
  n: number;
  /** Tamaño característico [m]: P(xc) = 63.2 %. */
  xc: Meters;
}

/**
 * Kuz-Ram (Cunningham 1983/1987):
 *   x50[cm] = A · K^−0.8 · Q^(1/6) · (115 / RWS)^(19/30)       (RWS con ANFO = 100)
 *   n = (2.2 − 14 B/d) · √((1 + S/B)/2) · (1 − W/B) · (|BCL − CCL|/L + 0.1)^0.1 · (L/H)   (d en mm)
 */
export function kuzRam(i: KuzRamInputs): KuzRamResult {
  const x50cm =
    i.rockFactor *
    Math.pow(i.powderFactor, -0.8) *
    Math.pow(i.chargePerHole, 1 / 6) *
    Math.pow(115 / (i.rws * 100), 19 / 30);
  const dMm = i.diameter * 1000;
  const L = Math.max(i.chargeLength, 1e-6);
  let n =
    (2.2 - (14 * i.burden) / dMm) *
    Math.sqrt((1 + i.spacing / i.burden) / 2) *
    (1 - i.drillDeviation / i.burden) *
    Math.pow(Math.abs(i.bottomChargeLength - i.columnChargeLength) / L + 0.1, 0.1) *
    (L / i.benchHeight);
  if (i.staggered) n *= 1.1;
  n = Math.max(0.3, n);
  const x50 = x50cm / 100;
  return { x50, n, xc: x50 / Math.pow(Math.LN2, 1 / n) };
}

/** Rosin-Rammler: P(x) = 1 − exp(−(x/xc)^n). */
export function rosinRammlerPassing(x: Meters, xc: Meters, n: number): number {
  return x <= 0 ? 0 : 1 - Math.exp(-Math.pow(x / xc, n));
}

/** Tamaño con fracción pasante P (0 < P < 1) según Rosin-Rammler. */
export function rosinRammlerSize(p: number, xc: Meters, n: number): Meters {
  return xc * Math.pow(-Math.log(1 - p), 1 / n);
}

/**
 * Swebrec (Ouchterlony 2005): P(x) = 1 / (1 + [ln(xmax/x) / ln(xmax/x50)]^b), x < xmax.
 * KCO: x50 de Kuz-Ram y b = 2·ln2·ln(xmax/x50)·n (misma pendiente que Rosin-Rammler en x50).
 */
export function swebrecB(x50: Meters, xmax: Meters, n: number): number {
  return 2 * Math.LN2 * Math.log(xmax / x50) * n;
}

export function swebrecPassing(x: Meters, x50: Meters, xmax: Meters, b: number): number {
  if (x <= 0) return 0;
  if (x >= xmax) return 1;
  return 1 / (1 + Math.pow(Math.log(xmax / x) / Math.log(xmax / x50), b));
}

export function swebrecSize(p: number, x50: Meters, xmax: Meters, b: number): Meters {
  const f = (1 - p) / p;
  return xmax * Math.exp(-Math.pow(f, 1 / b) * Math.log(xmax / x50));
}

export interface FragmentationCurvePoint {
  size: Meters;
  rosinRammler: number;
  swebrec: number;
}

export interface FragmentationResult extends KuzRamResult {
  /** Tamaño máximo (bloque in situ o menor de B y S) [m]. */
  xmax: Meters;
  /** Exponente de Swebrec. */
  b: number;
  p20: { rosinRammler: Meters; swebrec: Meters };
  p50: { rosinRammler: Meters; swebrec: Meters };
  p80: { rosinRammler: Meters; swebrec: Meters };
  /** % pasante por tamaño (escala log). */
  curve: FragmentationCurvePoint[];
  /** Fracción sobre el tamaño de sobretamaño y bajo el de finos (ambos modelos). */
  oversize: { size: Meters; rosinRammler: number; swebrec: number };
  fines: { size: Meters; rosinRammler: number; swebrec: number };
}

export interface FragmentationOptions {
  /** Tamaño máximo para Swebrec [m]; por defecto min(B, S). */
  xmax?: Meters;
  oversizeSize: Meters;
  finesSize: Meters;
}

/** Kuz-Ram + Swebrec (KCO) con curvas y percentiles. */
export function fragmentation(
  inputs: KuzRamInputs,
  options: FragmentationOptions,
): FragmentationResult {
  const kr = kuzRam(inputs);
  const xmax = Math.max(options.xmax ?? Math.min(inputs.burden, inputs.spacing), kr.x50 * 1.05);
  const b = swebrecB(kr.x50, xmax, kr.n);
  const both = (p: number) => ({
    rosinRammler: rosinRammlerSize(p, kr.xc, kr.n),
    swebrec: swebrecSize(p, kr.x50, xmax, b),
  });
  const curve: FragmentationCurvePoint[] = [];
  const lo = Math.log(0.001);
  const hi = Math.log(Math.max(xmax, rosinRammlerSize(0.999, kr.xc, kr.n)));
  for (let k = 0; k <= 80; k++) {
    const size = Math.exp(lo + ((hi - lo) * k) / 80);
    curve.push({
      size,
      rosinRammler: rosinRammlerPassing(size, kr.xc, kr.n),
      swebrec: swebrecPassing(size, kr.x50, xmax, b),
    });
  }
  return {
    ...kr,
    xmax,
    b,
    p20: both(0.2),
    p50: both(0.5),
    p80: both(0.8),
    curve,
    oversize: {
      size: options.oversizeSize,
      rosinRammler: 1 - rosinRammlerPassing(options.oversizeSize, kr.xc, kr.n),
      swebrec: 1 - swebrecPassing(options.oversizeSize, kr.x50, xmax, b),
    },
    fines: {
      size: options.finesSize,
      rosinRammler: rosinRammlerPassing(options.finesSize, kr.xc, kr.n),
      swebrec: swebrecPassing(options.finesSize, kr.x50, xmax, b),
    },
  };
}

/**
 * Entradas de Kuz-Ram por defecto a partir de la voladura: malla (del patrón indicado o el primero),
 * y promedios de los taladros cargados (kg, largo de carga, RWS ponderado por masa).
 */
export function kuzRamInputsFromBlast(
  blast: Blast,
  library: ProductLibrary,
  charge: Pick<ChargeResult, 'perHole' | 'powderFactorVolume' | 'holeIds'>,
  rock: Pick<RockMass, 'density' | 'ucs' | 'youngModulus' | 'blastability' | 'rockFactor'>,
  patternId?: string,
): KuzRamInputs | null {
  const pattern = blast.patterns.find((p) => p.id === patternId) ?? blast.patterns[0];
  const loaded = blast.holes
    .map((h, i) => ({ h, kg: charge.perHole[i] ?? 0 }))
    .filter((x) => x.kg > 0);
  if (loaded.length === 0) return null;
  const explosives = new Map(library.explosives.map((e) => [e.id, e]));
  let kg = 0;
  let chargeLength = 0;
  let bottom = 0;
  let column = 0;
  let diameter = 0;
  let rwsMass = 0;
  let massForRws = 0;
  for (const { h, kg: m } of loaded) {
    kg += m;
    diameter += h.diameter;
    const explosiveDecks = deckIntervals(h).filter((d) => d.deck.kind === 'explosive');
    const len = explosiveDecks.reduce((s, d) => s + (d.bottom - Math.max(0, d.top)), 0);
    chargeLength += len;
    // Carga de fondo = deck explosivo más profundo; el resto es columna.
    const deepest = explosiveDecks[0];
    const bcl = deepest ? deepest.bottom - Math.max(0, deepest.top) : 0;
    bottom += bcl;
    column += len - bcl;
    for (const d of explosiveDecks) {
      if (d.deck.kind !== 'explosive') continue;
      const e = explosives.get(d.deck.explosiveId);
      if (!e) continue;
      rwsMass += e.rws * d.deck.length;
      massForRws += d.deck.length;
    }
  }
  const n = loaded.length;
  const spacingGuess = Math.sqrt(
    charge.powderFactorVolume > 0 ? kg / n / charge.powderFactorVolume / blast.bench.height : 25,
  );
  return {
    rockFactor: rockFactor(rock),
    powderFactor: charge.powderFactorVolume,
    chargePerHole: kg / n,
    rws: massForRws > 0 ? rwsMass / massForRws : 1,
    burden: pattern?.burden ?? spacingGuess,
    spacing: pattern?.spacing ?? spacingGuess,
    diameter: diameter / n,
    drillDeviation: 0.1,
    chargeLength: chargeLength / n,
    bottomChargeLength: bottom / n,
    columnChargeLength: column / n,
    benchHeight: blast.bench.height,
    staggered: pattern?.kind === 'staggered',
  };
}
