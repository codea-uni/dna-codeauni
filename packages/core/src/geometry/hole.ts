import type { Bench, Hole, Meters, Radians, SubdrillConvention, Vec3 } from '../model/types';

/** Posición del fondo del taladro [m] a partir de boca, longitud, inclinación y azimut. */
export function holeToe(hole: Pick<Hole, 'collar' | 'length' | 'inclination' | 'azimuth'>): Vec3 {
  const horizontal = hole.length * Math.sin(hole.inclination);
  return {
    x: hole.collar.x + horizontal * Math.sin(hole.azimuth),
    y: hole.collar.y + horizontal * Math.cos(hole.azimuth),
    z: hole.collar.z - hole.length * Math.cos(hole.inclination),
  };
}

/**
 * Longitud del taladro desde la boca hasta piso + sobreperforación (P-05, FC-01):
 * - `vertical` (defecto): J medida en vertical bajo el piso, L = (H + J)/cos α (geometría exacta).
 * - `lopezJimeno`: L = H/cos α + (1 − α°/100)·J (López Jimeno; criterio empírico de CR-03).
 * Devuelve 0 si la boca está bajo la cota objetivo.
 */
export function lengthToFloor(
  collarZ: Meters,
  floorElevation: Meters,
  subdrill: Meters,
  inclination: Radians,
  convention: SubdrillConvention = 'vertical',
): Meters {
  const toFloor = collarZ - floorElevation;
  if (convention === 'lopezJimeno') {
    const degrees = (inclination * 180) / Math.PI;
    return Math.max(0, toFloor / Math.cos(inclination) + (1 - degrees / 100) * subdrill);
  }
  const vertical = toFloor + subdrill;
  if (vertical <= 0) return 0;
  return vertical / Math.cos(inclination);
}

/** Cota de la superficie superior del banco (plana mientras no haya topografía). */
export function benchTopElevation(bench: Bench): Meters {
  return bench.floorElevation + bench.height;
}
