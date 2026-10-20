import { DEFAULT_NEAR_FIELD, holmbergPerssonPpv, type NearFieldParams } from '../energy/energy';
import type { ScalarGrid } from '../energy/contours';
import type { Meters, MetersPerSecond } from '../model/types';

/**
 * Energía y daño en el plano de un frente o de un anillo (Fase 3, S3/S5).
 *
 * Concentración estática de Kleine (JKMRC, base de los contornos de 2DRing/2DFace): cada elemento
 * de carga q·dx se reparte en una esfera de radio r, dP = q·dx/((4/3)·π·r³). Integrando sobre un
 * segmento recto con distancia perpendicular h y coordenadas axiales L1, L2 de sus extremos
 * respecto al pie de la perpendicular:
 *   ∫ dx/(h² + x²)^(3/2) = x/(h²·√(h² + x²))
 *   P = 3q/(4π)·(L2/r2 − L1/r1)/h²  [kg/m³],  r = √(h² + L²).
 * Con q = ρe·π·D²/4 (ρe en kg/m³) queda 3·ρe·D²/16; con ρe en g/cm³, P = 187,5·ρe·D²/h²·(L2/r2 −
 * L1/r1), la forma publicada. Las contribuciones de varios segmentos se suman.
 */

/** Punto del plano local con coordenada w fuera del plano (0 por defecto) [m]. */
export interface UVW {
  u: Meters;
  v: Meters;
  w?: Meters;
}

export interface ChargeSegment {
  a: UVW;
  b: UVW;
  /** Concentración lineal [kg/m]. */
  linearCharge: number;
  /** Radio del taladro [m]: piso de h para evitar la singularidad sobre el eje (0,01 m). */
  radius?: Meters;
}

/** Concentración de Kleine de un segmento en el punto p [kg/m³]. */
export function kleineSegment(p: UVW, s: ChargeSegment): number {
  const ax = s.a.u;
  const ay = s.a.v;
  const az = s.a.w ?? 0;
  const ex = s.b.u - ax;
  const ey = s.b.v - ay;
  const ez = (s.b.w ?? 0) - az;
  const L = Math.hypot(ex, ey, ez);
  if (L <= 0 || s.linearCharge <= 0) return 0;
  const px = p.u - ax;
  const py = p.v - ay;
  const pz = (p.w ?? 0) - az;
  const t = (px * ex + py * ey + pz * ez) / L; // coordenada axial del punto desde a
  const h2raw = px * px + py * py + pz * pz - t * t;
  const hMin = s.radius ?? 0.01;
  const h2 = Math.max(h2raw, hMin * hMin);
  const L1 = -t;
  const L2 = L - t;
  const val = (L2 / Math.sqrt(h2 + L2 * L2) - L1 / Math.sqrt(h2 + L1 * L1)) / h2;
  return ((3 * s.linearCharge) / (4 * Math.PI)) * val;
}

/** Suma de Kleine de todos los segmentos en p [kg/m³]. */
export function kleineConcentration(p: UVW, segments: readonly ChargeSegment[]): number {
  let sum = 0;
  for (const s of segments) sum += kleineSegment(p, s);
  return sum;
}

export interface PlaneGridSpec {
  minU: Meters;
  minV: Meters;
  maxU: Meters;
  maxV: Meters;
  /** Tamaño de celda [m] (`R3` F13: 0,1 m en anillos, 0,02 m en frentes). */
  cellSize: Meters;
  /** Cota del plano evaluado fuera del plano local (w) [m] (0). */
  w?: Meters;
}

/**
 * Grilla de Kleine en el plano local (nodos en minU + i·cellSize, minV + j·cellSize). Se devuelve
 * como `ScalarGrid` (x = u, y = v) para reutilizar contornos y mapa de colores. Es O(nodos·segmentos):
 * en la aplicación corre en un worker (regla de arquitectura 2).
 */
export function kleineGrid(segments: readonly ChargeSegment[], spec: PlaneGridSpec): ScalarGrid {
  const nx = Math.max(1, Math.floor((spec.maxU - spec.minU) / spec.cellSize + 1e-9) + 1);
  const ny = Math.max(1, Math.floor((spec.maxV - spec.minV) / spec.cellSize + 1e-9) + 1);
  const values = new Float32Array(nx * ny);
  const w = spec.w ?? 0;
  for (let j = 0; j < ny; j++) {
    const v = spec.minV + j * spec.cellSize;
    for (let i = 0; i < nx; i++) {
      values[j * nx + i] = kleineConcentration(
        { u: spec.minU + i * spec.cellSize, v, w },
        segments,
      );
    }
  }
  return { originX: spec.minU, originY: spec.minV, cellSize: spec.cellSize, nx, ny, values };
}

/**
 * PPV de Holmberg–Persson a la distancia perpendicular R del punto medio de una columna de largo
 * Lc y concentración q: v = K·[∫ q·dx/(R² + x²)^(β/2α)]^α, x ∈ [−Lc/2, Lc/2] (Holmberg & Persson
 * 1979; Persson, Holmberg & Lee 1994). Reutiliza `DEFAULT_NEAR_FIELD` (K = 0,7 m/s, α = 0,7,
 * β = 1,5) y, si β = 2α, la forma cerrada `holmbergPerssonPpv`; si no, integra por Simpson.
 * Devuelve m/s (unidades de K).
 */
export function contourHolePpv(
  linearCharge: number,
  chargeLength: Meters,
  distance: Meters,
  params: NearFieldParams = DEFAULT_NEAR_FIELD,
): MetersPerSecond {
  const R = Math.max(distance, 1e-6);
  if (Math.abs(params.beta - 2 * params.alpha) < 1e-12) {
    // Forma cerrada con la columna centrada en el punto: fondo a Lc/2 por debajo del punto.
    return holmbergPerssonPpv({
      linearCharge,
      chargeLength,
      chargeBottomDepth: chargeLength / 2,
      distance: R,
      k: params.k,
      alpha: params.alpha,
    });
  }
  const e = params.beta / (2 * params.alpha);
  const m = 400; // par
  const hx = chargeLength / m;
  let sum = 0;
  for (let i = 0; i <= m; i++) {
    const x = -chargeLength / 2 + i * hx;
    const f = 1 / (R * R + x * x) ** e;
    sum += (i === 0 || i === m ? 1 : i % 2 === 1 ? 4 : 2) * f;
  }
  const integral = (linearCharge * hx * sum) / 3;
  return params.k * integral ** params.alpha;
}

/**
 * Radio de daño alrededor de un taladro de contorno: distancia R a la que la PPV de
 * Holmberg–Persson cae al umbral (por ejemplo 0,7 m/s = 700 mm/s). Bisección entre el radio del
 * taladro y 100 m; 0 si ni en la pared del taladro se alcanza el umbral.
 */
export function damageRadius(
  linearCharge: number,
  chargeLength: Meters,
  threshold: MetersPerSecond,
  options: { holeRadius?: Meters; params?: NearFieldParams } = {},
): Meters {
  const params = options.params ?? DEFAULT_NEAR_FIELD;
  let lo = Math.max(options.holeRadius ?? 0.01, 1e-4);
  let hi = 100;
  const f = (r: number): number =>
    contourHolePpv(linearCharge, chargeLength, r, params) - threshold;
  if (f(lo) <= 0) return 0;
  if (f(hi) > 0) return hi;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
