import type { Displacement } from '../analysis/displacement';
import type { MuckpileParams } from '../model/types';

/** Lo que una estrategia de velocidad sabe de cada taladro. */
export interface HoleVelocityInput {
  /** Índice del taladro en `blast.holes`. */
  index: number;
  /** Explosivo del taladro [kg]. */
  charge: number;
  /** Largo de la columna explosiva [m]. */
  chargeLength: number;
  /** Burden efectivo al detonar [m] (FC-22). */
  effectiveBurden: number;
}

/**
 * Estrategia de velocidad inicial por taladro [m/s] (A7): intercambiable para calibrar o
 * cambiar el modelo empírico sin tocar el resto de la cinemática. NaN = el material no vuela.
 */
export interface VelocityStrategy {
  readonly id: MuckpileParams['velocityModel'];
  holeVelocity(hole: HoleVelocityInput): number;
}

/**
 * Zhang, Chi & Yi (2021) con el burden efectivo (FC-36, R3): la misma velocidad de burden que A5
 * (`computeDisplacement`), sin la reducción por fila (la aplica la cinemática para las dos
 * estrategias). NaN fuera de la validez del modelo (carga desacoplada o B/Ø < 7).
 */
export function zhangStrategy(displacement: Pick<Displacement, 'velocity'>): VelocityStrategy {
  return {
    id: 'zhang',
    holeVelocity: ({ index }) => displacement.velocity[index] ?? NaN,
  };
}

/**
 * Ley de potencia de la distancia escalada al burden (FC-40, R0): v0 = k·(Q^⅓/B)^n con Q en kg y
 * B = burden efectivo en m. Sin fuente publicada para k y n: son constantes de calibración del sitio.
 */
export function scaledBurdenStrategy(k: number, n: number): VelocityStrategy {
  return {
    id: 'scaledBurden',
    holeVelocity: ({ charge, effectiveBurden }) =>
      charge > 0 && Number.isFinite(effectiveBurden) && effectiveBurden > 0
        ? k * Math.pow(Math.cbrt(charge) / effectiveBurden, n)
        : NaN,
  };
}

/**
 * Velocidad de cara de Richards & Moore (2004, «Flyrock control – by chance or design», 30th ISEE
 * Conf., ec. 6; FC-45, R1): V0 = k·(√m/B)^1,3 con m = carga por metro [kg/m] y B = burden [m];
 * k = 13,5 en rocas competentes blandas y 27 en duras (regresión de Workman & Calder 1994; rango
 * 15–37). Es una calibración de proyección desde la cara: aquí se usa con el burden efectivo.
 */
export function richardsMooreStrategy(k: number, n: number): VelocityStrategy {
  return {
    id: 'richardsMoore',
    holeVelocity: ({ charge, chargeLength, effectiveBurden }) =>
      charge > 0 && chargeLength > 0 && Number.isFinite(effectiveBurden) && effectiveBurden > 0
        ? k * Math.pow(Math.sqrt(charge / chargeLength) / effectiveBurden, n)
        : NaN,
  };
}

/** Parámetros por defecto de cada ley de potencia (al cambiar de modelo en la interfaz). */
export const POWER_LAW_DEFAULTS = {
  scaledBurden: { k: 10, n: 1 },
  richardsMoore: { k: 27, n: 1.3 },
} as const;

export function velocityStrategy(
  params: Pick<MuckpileParams, 'velocityModel' | 'k' | 'n'>,
  displacement: Pick<Displacement, 'velocity'>,
): VelocityStrategy {
  switch (params.velocityModel) {
    case 'scaledBurden':
      return scaledBurdenStrategy(params.k, params.n);
    case 'richardsMoore':
      return richardsMooreStrategy(params.k, params.n);
    case 'zhang':
      return zhangStrategy(displacement);
  }
}

/**
 * Factor de atenuación de un bloque (FC-43, R0; supuesto S-21): taco (sobre la carga), capa del
 * piso y distancia en planta al eje del taladro, v·exp(−λ·r/B).
 */
export function blockVelocityFactor(
  p: Pick<MuckpileParams, 'stemmingFactor' | 'floorFactor' | 'distanceDecay'>,
  b: { aboveCharge: boolean; floorLayer: boolean; distance: number; burden: number },
): number {
  let f = 1;
  if (b.aboveCharge) f *= p.stemmingFactor;
  if (b.floorLayer) f *= p.floorFactor;
  if (b.burden > 0 && Number.isFinite(b.burden))
    f *= Math.exp((-p.distanceDecay * b.distance) / b.burden);
  return f;
}

/**
 * Ángulo de lanzamiento a la altura relativa z ∈ [0, 1] del banco (FC-43): lineal del pie a la
 * cresta. Con `launchFromFace` (A7b), el ángulo medio es el de la normal a la cara, 90° − β (FC-37),
 * y los de pie y cresta solo fijan cuánto cambia con la altura.
 */
export function launchAngle(
  p: Pick<MuckpileParams, 'launchAngleFloor' | 'launchAngleCrest'> &
    Partial<Pick<MuckpileParams, 'launchFromFace'>>,
  relativeHeight: number,
  faceAngle?: number,
): number {
  const z = Math.min(1, Math.max(0, relativeHeight));
  const spread = p.launchAngleCrest - p.launchAngleFloor;
  if (p.launchFromFace && faceAngle !== undefined && Number.isFinite(faceAngle)) {
    const mid = Math.PI / 2 - faceAngle;
    return Math.min(Math.PI / 2 - 1e-3, Math.max(0, mid + (z - 0.5) * spread));
  }
  return p.launchAngleFloor + spread * z;
}

/**
 * Exponente de la velocidad respecto del burden en cada estrategia: Zhang v ∝ d/B (1); las leyes
 * de potencia v ∝ B^(−n). Sirve para llevar la velocidad del taladro al burden de cada bloque.
 */
export function burdenExponent(p: Pick<MuckpileParams, 'velocityModel' | 'n'>): number {
  return p.velocityModel === 'zhang' ? 1 : p.n;
}
