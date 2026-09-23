import type { Bench, Hole, Meters, Radians, Vec3 } from '../model/types';

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
 * Longitud necesaria para que el fondo quede `subdrill` metros (en vertical) bajo el piso.
 * Devuelve 0 si la boca está bajo la cota objetivo.
 */
export function lengthToFloor(
  collarZ: Meters,
  floorElevation: Meters,
  subdrill: Meters,
  inclination: Radians,
): Meters {
  const vertical = collarZ - (floorElevation - subdrill);
  if (vertical <= 0) return 0;
  return vertical / Math.cos(inclination);
}

/** Cota de la superficie superior del banco (plana mientras no haya topografía). */
export function benchTopElevation(bench: Bench): Meters {
  return bench.floorElevation + bench.height;
}
