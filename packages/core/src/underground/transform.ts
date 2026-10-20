import type { Meters, Radians, Vec3 } from '../model/types';
import type { UV } from './profiles';

/**
 * Paso del plano local (frente o anillo) a coordenadas de proyecto (X = Este, Y = Norte, Z arriba)
 * y a la convención de `Hole`: inclinación desde la vertical hacia abajo (horizontal = π/2,
 * ascendente > π/2) y azimut horario desde el Norte.
 *
 * Marco: avance f = (sin A·cos g, cos A·cos g, sin g) con A el azimut de la galería y g la
 * pendiente (positiva hacia arriba); eje u = derecha horizontal r = (cos A, −sin A, 0); eje v =
 * r × f (arriba). En un anillo con «dump» δ el eje v se inclina hacia el avance:
 * v' = cos δ·v + sin δ·f, y la normal del plano pasa a ser f' = cos δ·f − sin δ·v.
 */

export interface PlaneFrameInput {
  /** Origen: centro del piso del frente o punto de referencia del anillo [m]. */
  origin: Vec3;
  /** Azimut de avance de la galería [rad]. */
  azimuth: Radians;
  /** Pendiente de la galería [rad] (0). */
  gradient?: Radians;
  /** Inclinación del plano del anillo hacia el avance [rad] (0 = plano vertical). */
  dump?: Radians;
}

export interface PlaneFrame {
  origin: Vec3;
  /** Eje u (derecha). */
  right: Vec3;
  /** Eje v (arriba en el plano). */
  up: Vec3;
  /** Normal del plano hacia el avance (eje de los taladros de un frente). */
  forward: Vec3;
}

export function planeFrame(input: PlaneFrameInput): PlaneFrame {
  const A = input.azimuth;
  const g = input.gradient ?? 0;
  const dump = input.dump ?? 0;
  const f = { x: Math.sin(A) * Math.cos(g), y: Math.cos(A) * Math.cos(g), z: Math.sin(g) };
  const r = { x: Math.cos(A), y: -Math.sin(A), z: 0 };
  // r × f
  const v = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const cd = Math.cos(dump);
  const sd = Math.sin(dump);
  return {
    origin: { ...input.origin },
    right: r,
    up: { x: cd * v.x + sd * f.x, y: cd * v.y + sd * f.y, z: cd * v.z + sd * f.z },
    forward: { x: cd * f.x - sd * v.x, y: cd * f.y - sd * v.y, z: cd * f.z - sd * v.z },
  };
}

/** Punto local (u, v) a una distancia `along` sobre la normal del plano → coordenadas de proyecto. */
export function localToWorld(frame: PlaneFrame, p: UV, along: Meters = 0): Vec3 {
  const { origin: o, right: r, up: v, forward: f } = frame;
  return {
    x: o.x + p.u * r.x + p.v * v.x + along * f.x,
    y: o.y + p.u * r.y + p.v * v.y + along * f.y,
    z: o.z + p.u * r.z + p.v * v.z + along * f.z,
  };
}

/** Desplaza el marco a lo largo de su normal (réplica de anillos cada burden). */
export function offsetFrame(frame: PlaneFrame, distance: Meters): PlaneFrame {
  return { ...frame, origin: localToWorld(frame, { u: 0, v: 0 }, distance) };
}

export interface WorldHole {
  collar: Vec3;
  toe: Vec3;
  length: Meters;
  /** Desde la vertical hacia abajo [rad], 0–π. */
  inclination: Radians;
  /** Horario desde el Norte [rad], [0, 2π). */
  azimuth: Radians;
}

/** Inclinación y azimut de la convención de `Hole` para el vector collar → fondo. */
export function directionToHoleAngles(
  dx: number,
  dy: number,
  dz: number,
  fallbackAzimuth: Radians = 0,
): { inclination: Radians; azimuth: Radians; length: Meters } {
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return { inclination: 0, azimuth: fallbackAzimuth, length };
  const inclination = Math.acos(Math.max(-1, Math.min(1, -dz / length)));
  const horiz = Math.hypot(dx, dy);
  let azimuth = horiz < 1e-12 * length ? fallbackAzimuth : Math.atan2(dx, dy);
  if (azimuth < 0) azimuth += 2 * Math.PI;
  return { inclination, azimuth, length };
}

function toWorld(collar: Vec3, toe: Vec3, fallback: Radians): WorldHole {
  const a = directionToHoleAngles(toe.x - collar.x, toe.y - collar.y, toe.z - collar.z, fallback);
  return { collar, toe, length: a.length, inclination: a.inclination, azimuth: a.azimuth };
}

function frameAzimuth(frame: PlaneFrame): Radians {
  const a = Math.atan2(frame.forward.x, frame.forward.y);
  return a < 0 ? a + 2 * Math.PI : a;
}

/** Taladro de frente: boca en el plano del frente (along = 0) y fondo a `depth` sobre el eje. */
export function faceHoleToWorld(
  frame: PlaneFrame,
  hole: { collar: UV; toe: UV; depth: Meters },
): WorldHole {
  return toWorld(
    localToWorld(frame, hole.collar, 0),
    localToWorld(frame, hole.toe, hole.depth),
    frameAzimuth(frame),
  );
}

/** Taladro de anillo: boca y fondo en el plano del anillo. */
export function ringHoleToWorld(frame: PlaneFrame, hole: { collar: UV; toe: UV }): WorldHole {
  return toWorld(
    localToWorld(frame, hole.collar),
    localToWorld(frame, hole.toe),
    frameAzimuth(frame),
  );
}
