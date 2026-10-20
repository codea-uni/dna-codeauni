import {
  rockFactor,
  rosinRammlerPassing,
  swebrecB,
  swebrecPassing,
  type FragmentationCurvePoint,
} from '../fragmentation/fragmentation';
import type { Kilograms, Meters, RockMass } from '../model/types';
import type { FaceDesignResult, FaceHoleRole } from './faceDesign';
import type { RingDesignResult } from './ringDesign';

/**
 * Fragmentación en subterránea (Kuz-Ram + Swebrec, KCO) con entradas adaptadas al frente y a los
 * abanicos. La de banco (`fragmentation/fragmentation.ts`) no cambia.
 *
 * - X50 [cm] = A·K^−0,8·Q^(1/6)·(115/RWS)^e·C, e = 19/20 (Cunningham 2005) o 19/30 (1983/1987).
 * - n = ns·√(2 − 30·B/d)·√((1 + S/B)/2)·(1 − W/B)·(|BCL − CCL|/L + 0,1)^0,1·(L/H) (2005; en 1987
 *   el primer factor es 2,2 − 14·B/d). En subterránea no hay banco: H = largo del taladro.
 * - Swebrec con xmax = min(S, bloque in situ) y b = 2·ln2·ln(xmax/X50)·n (Ouchterlony 2005).
 * - Frente: una curva por zona del método sueco (arranque, ayudas, contorno, zapateras) con su K
 *   (kg/m³ de su volumen tributario), Q, B y S, mezcladas por masa: P(x) = Σ (m_z/M)·P_z(x) [P].
 * - Abanicos: equivalencias de diseño B_eq = burden entre anillos, S_eq = espaciamiento de fondos y
 *   K = carga del anillo / (B·A_anillo) (Oñederra & Chitombo 2007) [CG]; tiende a subestimar X50
 *   en roca dura: calibrar con C.
 */

export type KuzRamVariant = 'cunningham2005' | 'cunningham1987';

export interface UgFragmentationZone {
  /** Nombre de la zona (`cut`, `stoping`, `contour`, `lifter`, `ring`). */
  zone: string;
  /** Masa de explosivo de la zona [kg] (peso de su curva en la mezcla). */
  mass: Kilograms;
  /** Factor de carga de la zona K [kg/m³]. */
  loadingFactor: number;
  /** Carga por taladro Q [kg]. */
  chargePerHole: Kilograms;
  burden: Meters;
  spacing: Meters;
  diameter: Meters;
  /** Largo cargado L y largo del taladro H [m]. */
  chargeLength: Meters;
  holeLength: Meters;
  bottomChargeLength: Meters;
  columnChargeLength: Meters;
}

export interface UgFragmentationOptions {
  /** Factor de roca A; por defecto `rockFactor(rock)` (Cunningham/Lilly). */
  rockFactor?: number;
  /** Potencia relativa en peso vs ANFO (ANFO = 1). */
  rws: number;
  /** Desviación de perforación W [m]. */
  drillDeviation: Meters;
  variant?: KuzRamVariant;
  /** Factor de tiempos ns (1 = desconocido). */
  timingFactor?: number;
  /** Calibración del sitio C sobre X50 (1). */
  calibration?: number;
  /** Bloque in situ [m] (espaciamiento de diaclasas) para xmax; sin él, xmax = S. */
  inSituBlock?: Meters;
}

export interface UgZoneResult extends UgFragmentationZone {
  x50: Meters;
  n: number;
  xmax: Meters;
  b: number;
}

export interface UgFragmentationResult {
  zones: UgZoneResult[];
  rockFactor: number;
  p50: { rosinRammler: Meters; swebrec: Meters };
  p80: { rosinRammler: Meters; swebrec: Meters };
  /** % pasante de la mezcla (escala log), como `FragmentationResult.curve`. */
  curve: FragmentationCurvePoint[];
}

/** X50 [m] y n de Kuz-Ram para una zona. */
export function undergroundKuzRam(
  z: UgFragmentationZone,
  a: number,
  o: Pick<
    UgFragmentationOptions,
    'rws' | 'drillDeviation' | 'variant' | 'timingFactor' | 'calibration'
  >,
): { x50: Meters; n: number } {
  const v2005 = (o.variant ?? 'cunningham2005') === 'cunningham2005';
  const x50cm =
    a *
    Math.pow(Math.max(z.loadingFactor, 1e-6), -0.8) *
    Math.pow(Math.max(z.chargePerHole, 1e-6), 1 / 6) *
    Math.pow(115 / (o.rws * 100), v2005 ? 19 / 20 : 19 / 30) *
    (o.calibration ?? 1);
  const dMm = z.diameter * 1000;
  const B = Math.max(z.burden, 1e-3);
  const L = Math.max(z.chargeLength, 1e-6);
  const first = v2005 ? Math.sqrt(Math.max(2 - (30 * B) / dMm, 0)) : 2.2 - (14 * B) / dMm;
  let n =
    (o.timingFactor ?? 1) *
    first *
    Math.sqrt((1 + z.spacing / B) / 2) *
    (1 - o.drillDeviation / B) *
    Math.pow(Math.abs(z.bottomChargeLength - z.columnChargeLength) / L + 0.1, 0.1) *
    Math.min(1, L / Math.max(z.holeLength, 1e-6));
  // Guarda numérica como en banco (n ≤ 0 no define una curva).
  n = Math.max(n, 0.3);
  return { x50: x50cm / 100, n };
}

/** Kuz-Ram + Swebrec por zona y mezcla por masa; P50 y P80 por bisección sobre la mezcla. */
export function undergroundFragmentation(
  zones: readonly UgFragmentationZone[],
  rock: Pick<RockMass, 'density' | 'ucs' | 'youngModulus' | 'blastability' | 'rockFactor'>,
  options: UgFragmentationOptions,
): UgFragmentationResult | null {
  const used = zones.filter((z) => z.mass > 0 && z.loadingFactor > 0 && z.chargePerHole > 0);
  if (used.length === 0) return null;
  const a = options.rockFactor ?? rockFactor(rock);
  const total = used.reduce((s, z) => s + z.mass, 0);
  const res: UgZoneResult[] = used.map((z) => {
    const kr = undergroundKuzRam(z, a, options);
    const xmax = Math.max(Math.min(z.spacing, options.inSituBlock ?? Infinity), kr.x50 * 1.05);
    return { ...z, ...kr, xmax, b: swebrecB(kr.x50, xmax, kr.n) };
  });
  const sw = (x: number) =>
    res.reduce((s, z) => s + (z.mass / total) * swebrecPassing(x, z.x50, z.xmax, z.b), 0);
  const rr = (x: number) =>
    res.reduce(
      (s, z) =>
        s + (z.mass / total) * rosinRammlerPassing(x, z.x50 / Math.pow(Math.LN2, 1 / z.n), z.n),
      0,
    );
  const hi = Math.max(...res.map((z) => Math.max(z.xmax, z.x50 * 20)));
  const size = (f: (x: number) => number, p: number) => {
    let lo = Math.log(1e-5);
    let up = Math.log(hi * 10);
    for (let k = 0; k < 80; k++) {
      const mid = (lo + up) / 2;
      if (f(Math.exp(mid)) < p) lo = mid;
      else up = mid;
    }
    return Math.exp((lo + up) / 2);
  };
  const curve: FragmentationCurvePoint[] = [];
  const l0 = Math.log(0.001);
  const l1 = Math.log(hi);
  for (let k = 0; k <= 80; k++) {
    const x = Math.exp(l0 + ((l1 - l0) * k) / 80);
    curve.push({ size: x, rosinRammler: rr(x), swebrec: sw(x) });
  }
  return {
    zones: res,
    rockFactor: a,
    p50: { rosinRammler: size(rr, 0.5), swebrec: size(sw, 0.5) },
    p80: { rosinRammler: size(rr, 0.8), swebrec: size(sw, 0.8) },
    curve,
  };
}

const ZONE_OF: Record<FaceHoleRole, string | null> = {
  relief: null,
  cut: 'cut',
  stoping: 'stoping',
  wall: 'contour',
  roof: 'contour',
  contour: 'contour',
  lifter: 'lifter',
};

const mean = (xs: readonly number[]) =>
  xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

/**
 * Zonas del frente para `undergroundFragmentation`. Área tributaria: arranque = lado² de su última
 * sección; el resto, Σ B·S por taladro reescalado para que todo sume el área del perfil. K_z =
 * m_z/(A_z·avance). S por zona: el espaciamiento de diseño del grupo (arranque: lado medio).
 */
export function faceFragmentationZones(
  design: Pick<FaceDesignResult, 'holes' | 'squares' | 'groupSpacing'>,
  profileArea: number,
  advance: Meters,
): UgFragmentationZone[] {
  const gs = design.groupSpacing;
  const spacingOf: Record<string, number> = {
    cut: mean(design.squares.map((s) => s.side)),
    stoping: mean([gs.stopingUp, gs.stopingDown].filter((x) => x > 0)),
    contour: mean([gs.contour, gs.roof, gs.wall].filter((x) => x > 0)),
    lifter: gs.lifter,
  };
  const groups = new Map<string, FaceDesignResult['holes']>();
  for (const h of design.holes) {
    const z = ZONE_OF[h.role];
    if (!z || !h.charge) continue;
    groups.set(z, [...(groups.get(z) ?? []), h]);
  }
  const cutSide = design.squares.at(-1)?.side ?? 0;
  const cutArea = groups.has('cut') ? Math.min(cutSide * cutSide, profileArea) : 0;
  const raw = new Map<string, number>();
  for (const [z, hs] of groups)
    if (z !== 'cut')
      raw.set(
        z,
        hs.reduce((s, h) => s + Math.max(h.burden, 0.05) * (spacingOf[z] || h.burden), 0),
      );
  const rawTotal = [...raw.values()].reduce((s, x) => s + x, 0);
  const scale = rawTotal > 0 ? Math.max(0, profileArea - cutArea) / rawTotal : 0;
  const out: UgFragmentationZone[] = [];
  for (const [z, hs] of groups) {
    const area = z === 'cut' ? cutArea : (raw.get(z) ?? 0) * scale;
    const mass = hs.reduce((s, h) => s + (h.charge?.mass ?? 0), 0);
    const vol = area * advance;
    out.push({
      zone: z,
      mass,
      loadingFactor: vol > 0 ? mass / vol : 0,
      chargePerHole: mass / hs.length,
      burden: mean(hs.map((h) => h.burden)),
      spacing: spacingOf[z] || mean(hs.map((h) => h.burden)),
      diameter: mean(hs.map((h) => h.diameter)),
      chargeLength: mean(
        hs.map((h) => (h.charge?.bottom.length ?? 0) + (h.charge?.column.length ?? 0)),
      ),
      holeLength: mean(hs.map((h) => h.length)),
      bottomChargeLength: mean(hs.map((h) => h.charge?.bottom.length ?? 0)),
      columnChargeLength: mean(hs.map((h) => h.charge?.column.length ?? 0)),
    });
  }
  const order = ['cut', 'stoping', 'contour', 'lifter'];
  return out.sort((x, y) => order.indexOf(x.zone) - order.indexOf(y.zone));
}

/**
 * Zona única de un abanico con las equivalencias de diseño: B = burden entre anillos, S =
 * espaciamiento medio entre fondos contiguos, K = carga del anillo / (B·A_anillo).
 */
export function ringFragmentationZone(
  ring: Pick<RingDesignResult, 'holes' | 'kpis'>,
  burden: Meters,
): UgFragmentationZone | null {
  const charged = ring.holes.filter((h) => h.chargedLength > 0);
  if (charged.length === 0 || !(burden > 0)) return null;
  const toes: number[] = [];
  for (let i = 1; i < ring.holes.length; i++) {
    const a = ring.holes[i - 1];
    const b = ring.holes[i];
    if (a && b) toes.push(Math.hypot(a.toe.u - b.toe.u, a.toe.v - b.toe.v));
  }
  const mass = charged.reduce((s, h) => s + h.mass, 0);
  const vol = burden * ring.kpis.area;
  const L = mean(charged.map((h) => h.chargedLength));
  return {
    zone: 'ring',
    mass,
    loadingFactor: vol > 0 ? mass / vol : 0,
    chargePerHole: mass / charged.length,
    burden,
    spacing: mean(toes) || burden,
    diameter: mean(charged.map((h) => h.diameter)),
    chargeLength: L,
    holeLength: mean(charged.map((h) => h.length)),
    // Columna simple: BCL = L, CCL = 0.
    bottomChargeLength: L,
    columnChargeLength: 0,
  };
}
