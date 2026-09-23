import type { Vec2 } from '../model/types';
import { unitToAzimuth } from './vec';

export interface Measurement {
  /** Distancia horizontal [m]. */
  distance: number;
  /** Azimut de A hacia B [rad], horario desde el Norte. */
  azimuth: number;
  dx: number;
  dy: number;
}

/** Distancia, azimut y diferencias entre dos puntos en planta. */
export function measure(a: Vec2, b: Vec2): Measurement {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    distance: Math.hypot(dx, dy),
    azimuth: dx === 0 && dy === 0 ? 0 : unitToAzimuth(dx, dy),
    dx,
    dy,
  };
}

/** Rumbo cardinal (N, NE, E, …) de un azimut [rad]. */
export function cardinal(azimuth: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const a = ((azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return names[Math.round(a / (Math.PI / 4)) % 8] ?? 'N';
}
