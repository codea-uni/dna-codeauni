/**
 * Correlaciones geotécnicas para completar las propiedades que un modelo de bloques no trae
 * (registradas en `docs/RULES.md`, GE-01 a GE-08). Unidades: UCS y tracción [MPa], módulos [GPa],
 * densidad [t/m³], Vp [m/s].
 */

/** GE-01 · RMR desde Q (Bieniawski 1976): RMR = 9·ln Q + 44. */
export const rmrFromQ = (q: number): number => clamp(9 * Math.log(q) + 44, 0, 100);

/** GE-01 · Q desde RMR (inversa de Bieniawski 1976). */
export const qFromRmr = (rmr: number): number => Math.exp((rmr - 44) / 9);

/** GE-02 · GSI ≈ RMR₈₉ − 5 (Hoek, Kaiser y Bawden 1995), para RMR₈₉ > 23. */
export const gsiFromRmr = (rmr: number): number => clamp(rmr - 5, 0, 100);
export const rmrFromGsi = (gsi: number): number => clamp(gsi + 5, 0, 100);

/**
 * GE-03 · Módulo de roca intacta desde UCS con la razón de módulo de Deere (1968):
 * Ei = MR·UCS; MR ≈ 350 como valor medio (Hoek y Diederichs 2006 dan 200–1000 por litología).
 */
export const intactModulusFromUcs = (ucsMPa: number, mr = 350): number => (mr * ucsMPa) / 1000;

/**
 * GE-04 · Módulo de deformación del macizo (Hoek y Diederichs 2006, ecuación simplificada):
 * Em = Ei · (0,02 + (1 − D/2) / (1 + e^((60 + 15·D − GSI)/11))), D = 0 (sin daño por voladura).
 */
export function rockMassModulus(eiGpa: number, gsi: number, d = 0): number {
  return eiGpa * (0.02 + (1 - d / 2) / (1 + Math.exp((60 + 15 * d - gsi) / 11)));
}

/**
 * GE-05 · Vp del macizo desde Q y UCS (Barton 2002, IJRMMS 39): Vp ≈ 3,5 + log₁₀ Qc [km/s] con
 * Qc = Q·UCS/100. Se acota a 1–7 km/s.
 */
export function vpFromQ(q: number, ucsMPa: number): number {
  const qc = (q * ucsMPa) / 100;
  return clamp((3.5 + Math.log10(Math.max(qc, 1e-4))) * 1000, 1000, 7000);
}

/**
 * GE-06 · Vp elástica desde módulo y densidad (medio isótropo, ν = 0,25):
 * Vp = √(E·(1−ν) / (ρ·(1+ν)·(1−2ν))) = √(1,2·E/ρ).
 */
export function vpFromModulus(eGpa: number, densityT: number, nu = 0.25): number {
  const m = (1 - nu) / ((1 + nu) * (1 - 2 * nu));
  return clamp(Math.sqrt((m * eGpa * 1e9) / (densityT * 1000)), 300, 7500);
}

/**
 * GE-07 · Tracción desde UCS: σt ≈ UCS/12 (razón σc/σt de 8 a 15 en roca frágil; Sheorey 1997,
 * Cai 2010). Se toma el medio del rango.
 */
export const tensileFromUcs = (ucsMPa: number): number => ucsMPa / 12;

/**
 * GE-08 · Descripción del macizo (RMD + JF) de Cunningham (1987) aproximada desde el RMR, sin
 * mapeo de diaclasas: interpolación lineal entre pulverulento (10, RMR ≤ 20) y masivo (50,
 * RMR ≥ 80). Es una aproximación (R0) a calibrar con el P80 medido.
 */
export const cunninghamDescriptionFromRmr = (rmr: number): number =>
  10 + 40 * clamp((rmr - 20) / 60, 0, 1);

/** Clases de competencia por RMR (Bieniawski 1989): I muy buena … V muy mala. */
export const RMR_CLASSES = [
  { id: 'I', min: 81, max: 100 },
  { id: 'II', min: 61, max: 80 },
  { id: 'III', min: 41, max: 60 },
  { id: 'IV', min: 21, max: 40 },
  { id: 'V', min: 0, max: 20 },
] as const;

/** Clases de resistencia por UCS (ISRM 1981): R6 extremadamente dura … R1 muy blanda [MPa]. */
export const UCS_CLASSES = [
  { id: 'R6', min: 250, max: Infinity },
  { id: 'R5', min: 100, max: 250 },
  { id: 'R4', min: 50, max: 100 },
  { id: 'R3', min: 25, max: 50 },
  { id: 'R2', min: 5, max: 25 },
  { id: 'R1', min: 0, max: 5 },
] as const;

/** Índice de la clase (0 = la más dura) por RMR o UCS; −1 sin dato. */
export function competenceClass(by: 'rmr' | 'ucs', value: number): number {
  if (!Number.isFinite(value)) return -1;
  const classes = by === 'rmr' ? RMR_CLASSES : UCS_CLASSES;
  const i = classes.findIndex((c) => value >= c.min);
  return i < 0 ? classes.length - 1 : i;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
