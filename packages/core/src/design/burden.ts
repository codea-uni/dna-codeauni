import type { KgPerM3, Meters, Radians, Ratio, SubdrillConvention } from '../model/types';

/**
 * Burden teórico y reglas de malla (`docs/theory/02 §1`; fichas F03, F04 y F09 de R1). Son una
 * referencia para que el usuario elija el burden operativo: no bloquean (reglas R1–R2 en
 * `docs/reglas.md`). Todo en SI; las fórmulas de la fuente en ft/in se reescriben sin cambiar su
 * valor (1 ft = 12 in).
 */

/**
 * Ash: B[ft] = Kb·Ø[in]/12, es decir B = Kb·Ø en las mismas unidades. Kb = 25 roca media con
 * explosivo de baja densidad-potencia, 30 estándar (FC-06). CR-03 usa B = 35·Ø (roca dura).
 */
export function ashBurden(diameter: Meters, kb: Ratio): Meters {
  return kb * diameter;
}

/**
 * Konya–Walter: B[ft] = (2·ρe/ρr + 1,5)·Ø[in]·Kd·Ks (FC-07). Como Ø[in] = 12·Ø[ft], en SI
 * B = 12·(2·ρe/ρr + 1,5)·Ø·Kd·Ks. Kd (estratificación) y Ks (estructura) se toman de las tablas de
 * Konya & Walter (1990); aquí son parámetros del usuario.
 */
export function konyaWalterBurden(
  diameter: Meters,
  explosiveDensity: KgPerM3,
  rockDensity: KgPerM3,
  kd: Ratio,
  ks: Ratio,
): Meters {
  return 12 * ((2 * explosiveDensity) / rockDensity + 1.5) * diameter * kd * ks;
}

const M_PER_FT = 0.3048;
const M_PER_IN = 0.0254;

/** Andersen: B[ft] = √(Ø[in]·L[ft]), con L la longitud del taladro (FC-08). */
export function andersenBurden(diameter: Meters, holeLength: Meters): Meters {
  return M_PER_FT * Math.sqrt((diameter / M_PER_IN) * (holeLength / M_PER_FT));
}

/** Rigidez del burden H/B (Konya, FC-04). */
export function stiffnessRatio(benchHeight: Meters, burden: Meters): Ratio {
  return benchHeight / burden;
}

export type StiffnessRating = 'poor' | 'fair' | 'good' | 'excellent';

/** Tabla de Konya: H/B = 1 pobre, 2 regular, 3 bueno, 4 excelente (valores intermedios, hacia abajo). */
export function stiffnessRating(ratio: Ratio): StiffnessRating {
  return ratio < 2 ? 'poor' : ratio < 3 ? 'fair' : ratio < 4 ? 'good' : 'excellent';
}

/**
 * Espaciamiento sugerido (FC-09, DF-10): S = (H + 7B)/8 si H/B < umbral; 1,4·B si no. El umbral
 * de rigidez es configurable (las fuentes usan 3 y 4; defecto 4).
 */
export function suggestedSpacing(
  benchHeight: Meters,
  burden: Meters,
  stiffnessThreshold: Ratio = 4,
): Meters {
  return benchHeight / burden < stiffnessThreshold ? (benchHeight + 7 * burden) / 8 : 1.4 * burden;
}

/** Tres bolillos equilátero: S = 2B/√3 = 1,1547·B (`02 §1`). */
export function equilateralSpacing(burden: Meters): Meters {
  return (2 * burden) / Math.sqrt(3);
}

/**
 * Volumen de influencia nominal B·S·H (FC-02). H es vertical: el volumen roto no depende de la
 * inclinación (P-06). Con la convención de López Jimeno (P-05) se usa B·S·H/cos α, la fórmula con
 * la que se construyó CR-03.
 */
export function nominalVolume(
  burden: Meters,
  spacing: Meters,
  benchHeight: Meters,
  inclination: Radians = 0,
  convention: SubdrillConvention = 'vertical',
): number {
  const v = burden * spacing * benchHeight;
  return convention === 'lopezJimeno' ? v / Math.cos(inclination) : v;
}

/** Taco y sobreperforación por defecto: T = 0,7·B (DF-09) y J = 0,3·B (DF-06); parámetros. */
export const DEFAULT_STEMMING_RATIO: Ratio = 0.7;
export const DEFAULT_SUBDRILL_RATIO: Ratio = 0.3;
