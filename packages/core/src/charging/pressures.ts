import type { KgPerM3, Meters, MetersPerSecond, Pascals, Ratio } from '../model/types';

/**
 * Presión de detonación PD = ρ·VOD²/(γ + 1) [Pa] (FC-19, DF-02). Con γ = 3 es la forma habitual
 * ρ·VOD²/4 (`docs/theory/02 §2`); ρ es la densidad en el taladro.
 */
export function detonationPressure(
  density: KgPerM3,
  vod: MetersPerSecond,
  gamma: Ratio = 3,
): Pascals {
  return (density * vod * vod) / (gamma + 1);
}

/** Presión de taladro PB ≈ 0,5·PD (rango 30–70 %, `02 §2`); informativa. */
export function boreholePressure(detonation: Pascals, ratio: Ratio = 0.5): Pascals {
  return detonation * ratio;
}

/**
 * VOD según el diámetro de carga (FC-20, `R2` F02): VOD(D) = VOD_ideal·(1 − (D_c/D)²). Por debajo
 * del diámetro crítico no detona de forma estable: 0.
 */
export function vodAtDiameter(
  vodIdeal: MetersPerSecond,
  criticalDiameter: Meters,
  diameter: Meters,
): MetersPerSecond {
  if (diameter <= criticalDiameter) return 0;
  return vodIdeal * (1 - (criticalDiameter / diameter) ** 2);
}
