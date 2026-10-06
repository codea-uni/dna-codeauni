import type { Vec3 } from '@cronos/core';

// Comodidad de la navegación en XR (D-19). No son constantes mineras: son parámetros de interfaz
// (anotados como supuestos editables en QUESTIONS §2).

/** Zona muerta de los sticks. */
export const DEADZONE = 0.15;
/** Giro por saltos [rad]: evita el mareo del giro continuo. */
export const SNAP_ANGLE = Math.PI / 6;
const SNAP_FIRE = 0.7;
const SNAP_REARM = 0.3;
/** Altura mínima de la cabeza sobre el terreno a escala real [m]. */
export const MIN_CLEARANCE = 1;

/** Valor del eje sin la zona muerta, reescalado a [−1, 1]. */
export function axis(v: number): number {
  const a = Math.abs(v);
  return a < DEADZONE ? 0 : (Math.sign(v) * (a - DEADZONE)) / (1 - DEADZONE);
}

/**
 * Velocidad del vuelo [m/s del usuario]: a escala real crece con la altura sobre el terreno (rápido
 * para cruzar el tajo, lento cerca de los taladros); en la maqueta es constante.
 */
export function flySpeed(heightAboveGround: number, scale: number): number {
  if (scale < 1) return 0.6;
  return Math.min(250, Math.max(4, 4 + 0.6 * Math.max(0, heightAboveGround)));
}

/**
 * Velocidad en el espacio XR a partir de los sticks. `move` = stick izquierdo (y negativo =
 * adelante, como en los gamepads); `lift` = stick derecho vertical (negativo = subir). La dirección
 * sigue el rumbo de la cabeza en el plano horizontal.
 */
export function flyVelocity(
  move: { x: number; y: number },
  lift: number,
  heading: number,
  speed: number,
): Vec3 {
  const f = -axis(move.y);
  const r = axis(move.x);
  const u = -axis(lift);
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  // adelante = (−sin, 0, −cos), derecha = (cos, 0, −sin)
  return { x: (-s * f + c * r) * speed, y: u * speed, z: (-c * f - s * r) * speed };
}

/**
 * Giro por saltos: dispara una vez al pasar SNAP_FIRE y se rearma al volver al centro.
 * `angle` es el giro del usuario (positivo a la izquierda), 0 si no hubo salto.
 */
export function snapTurn(armed: boolean, x: number): { armed: boolean; angle: number } {
  if (armed && Math.abs(x) > SNAP_FIRE) return { armed: false, angle: -Math.sign(x) * SNAP_ANGLE };
  if (!armed && Math.abs(x) < SNAP_REARM) return { armed: true, angle: 0 };
  return { armed, angle: 0 };
}
