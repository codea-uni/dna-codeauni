import type { Meters, Radians, Vec2 } from '../model/types';

/** Vector unitario horizontal para un azimut (horario desde el Norte = +Y). */
export function azimuthToUnit(azimuth: Radians): Vec2 {
  return { x: Math.sin(azimuth), y: Math.cos(azimuth) };
}

/** Azimut [0, 2π) de un vector horizontal. */
export function unitToAzimuth(dx: number, dy: number): Radians {
  const a = Math.atan2(dx, dy);
  return a < 0 ? a + 2 * Math.PI : a;
}

export function distance2(ax: Meters, ay: Meters, bx: Meters, by: Meters): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
