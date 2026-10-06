import type { Vec3 } from '@cronos/core';

/**
 * Ubicación del modelo en el espacio de la sesión XR (D-19). El modelo usa Z arriba y coordenadas
 * de render (relativas al origen); WebXR usa Y arriba, −Z hacia adelante y metros del usuario.
 *
 * xr = offset + Ry(yaw) · scale · Rx(−π/2) · modelo, es decir (x, y, z) → (x, z, −y) antes de girar:
 * el Este queda a la derecha (+X), el Norte adelante (−Z) y la cota arriba (+Y).
 *
 * El vuelo a 1:1, la maqueta y la colocación en AR son la misma operación: cambiar esta ubicación;
 * la escena no se toca. El usuario no se mueve: se mueve el mundo en sentido contrario.
 */
export interface XrPlacement {
  /** Metros del usuario por metro del modelo (1 = escala real; 1/1000 = maqueta 1:1000). */
  scale: number;
  /** Giro alrededor de la vertical del usuario (+Y) [rad]. */
  yaw: number;
  /** Posición del origen de render en el espacio XR [m]. */
  offset: Vec3;
}

/** Punto del modelo (render, Z arriba) → espacio XR. */
export function toXr(p: XrPlacement, v: Vec3): Vec3 {
  const ax = v.x * p.scale;
  const ay = v.z * p.scale;
  const az = -v.y * p.scale;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return { x: p.offset.x + ax * c + az * s, y: p.offset.y + ay, z: p.offset.z - ax * s + az * c };
}

/** Punto del espacio XR → modelo (render, Z arriba). */
export function toModel(p: XrPlacement, v: Vec3): Vec3 {
  const dx = v.x - p.offset.x;
  const dy = v.y - p.offset.y;
  const dz = v.z - p.offset.z;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const ax = (dx * c - dz * s) / p.scale;
  const az = (dx * s + dz * c) / p.scale;
  return { x: ax, y: -az, z: dy / p.scale };
}

/** Dirección del espacio XR → modelo (sin traslación; conserva la escala del modelo). */
export function dirToModel(p: XrPlacement, d: Vec3): Vec3 {
  const o = toModel(p, { x: 0, y: 0, z: 0 });
  const e = toModel(p, d);
  return { x: e.x - o.x, y: e.y - o.y, z: e.z - o.z };
}

/** El usuario se desplaza `d` (espacio XR): el mundo se mueve −d. */
export function moveBy(p: XrPlacement, d: Vec3): XrPlacement {
  return { ...p, offset: { x: p.offset.x - d.x, y: p.offset.y - d.y, z: p.offset.z - d.z } };
}

/**
 * El usuario gira `angle` [rad, positivo a la izquierda] alrededor de la vertical que pasa por
 * `pivot` (espacio XR, normalmente la cabeza): el mundo gira −angle alrededor del mismo eje.
 */
export function turnAbout(p: XrPlacement, pivot: Vec3, angle: number): XrPlacement {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const dx = p.offset.x - pivot.x;
  const dz = p.offset.z - pivot.z;
  return {
    ...p,
    yaw: p.yaw - angle,
    offset: { x: pivot.x + dx * c + dz * s, y: p.offset.y, z: pivot.z - dx * s + dz * c },
  };
}

/** Ubicación en la que el punto `model` cae en `at` (espacio XR), con el giro y la escala dados. */
export function placeAt(model: Vec3, at: Vec3, yaw: number, scale: number): XrPlacement {
  const q = toXr({ scale, yaw, offset: { x: 0, y: 0, z: 0 } }, model);
  return { scale, yaw, offset: { x: at.x - q.x, y: at.y - q.y, z: at.z - q.z } };
}

/** Rumbo de la cabeza alrededor de +Y [rad] a partir de su vector adelante (espacio XR). */
export function headingOf(forward: Vec3): number {
  return Math.atan2(-forward.x, -forward.z);
}
