import type { Vec3 } from '@cronos/core';

/**
 * Primer cruce de un rayo con el terreno `height(x, y)` (misma referencia que el rayo; null fuera
 * del terreno). Avanza con pasos que crecen con la distancia (1 %, mínimo `minStep`) y refina por
 * bisección. Sirve para teletransportarse y para apuntar taladros en XR sin rastrear triángulos.
 * `dir` debe ser unitario. Si el origen ya está bajo el terreno no hay cruce.
 */
export function rayGround(
  origin: Vec3,
  dir: Vec3,
  height: (x: number, y: number) => number | null,
  maxDist: number,
  minStep = 0.25,
): { point: Vec3; distance: number } | null {
  const below = (t: number): number | null => {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const h = height(x, y);
    return h !== null && origin.z + dir.z * t <= h ? h : null;
  };
  if (below(0) !== null) return null;
  let t = 0;
  while (t < maxDist) {
    const next = Math.min(maxDist, t + Math.max(minStep, t * 0.01));
    if (below(next) !== null) {
      let lo = t;
      let hi = next;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (below(mid) !== null) hi = mid;
        else lo = mid;
      }
      const x = origin.x + dir.x * hi;
      const y = origin.y + dir.y * hi;
      return { point: { x, y, z: height(x, y) ?? origin.z + dir.z * hi }, distance: hi };
    }
    t = next;
  }
  return null;
}
