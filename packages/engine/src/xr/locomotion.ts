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

/** Velocidad de salida del arco de teletransporte [m/s] y gravedad del arco [m/s²]. */
export const ARC_SPEED = 26;
export const ARC_GRAVITY = 9.81;
/** Stick hacia adelante que arma el arco y vuelta al centro que lo suelta (con histéresis). */
export const ARC_ON = 0.6;
export const ARC_OFF = 0.3;

/**
 * Arco parabólico del teletransporte (coordenadas del modelo, Z arriba): sale de `origin` en la
 * dirección unitaria `dir` y cae con la gravedad hasta tocar el terreno `height(x, y)` (null fuera
 * del terreno: sigue cayendo). Devuelve los puntos del arco para dibujarlo y el punto de llegada
 * (refinado por bisección), o null si no toca el terreno en `maxSteps` pasos.
 */
export function teleportArc(
  origin: Vec3,
  dir: Vec3,
  height: (x: number, y: number) => number | null,
  speed = ARC_SPEED,
  gravity = ARC_GRAVITY,
  step = 0.05,
  maxSteps = 120,
): { points: Vec3[]; hit: Vec3 | null } {
  const at = (t: number): Vec3 => ({
    x: origin.x + dir.x * speed * t,
    y: origin.y + dir.y * speed * t,
    z: origin.z + dir.z * speed * t - 0.5 * gravity * t * t,
  });
  const under = (t: number): boolean => {
    const p = at(t);
    const h = height(p.x, p.y);
    return h !== null && p.z <= h;
  };
  const points: Vec3[] = [origin];
  if (under(0)) return { points, hit: null };
  for (let i = 1; i <= maxSteps; i++) {
    const t = i * step;
    if (under(t)) {
      let lo = t - step;
      let hi = t;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (under(mid)) hi = mid;
        else lo = mid;
      }
      const p = at(hi);
      const hit = { x: p.x, y: p.y, z: height(p.x, p.y) ?? p.z };
      points.push(hit);
      return { points, hit };
    }
    points.push(at(t));
  }
  return { points, hit: null };
}
