/**
 * Cámara orbital con Z arriba (matemática pura, testeable en Node).
 * yaw: rumbo desde el objetivo hacia la cámara, horario desde el Norte; pitch: elevación.
 */
export interface OrbitState {
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  distance: number;
}

export const MIN_PITCH = 0.05;
export const MAX_PITCH = Math.PI / 2 - 0.01;

export function orbitPosition(o: OrbitState): { x: number; y: number; z: number } {
  const c = Math.cos(o.pitch);
  return {
    x: o.targetX + o.distance * c * Math.sin(o.yaw),
    y: o.targetY + o.distance * c * Math.cos(o.yaw),
    z: o.targetZ + o.distance * Math.sin(o.pitch),
  };
}

/** Elevación mínima al mirar libremente (botón derecho): se puede mirar hacia arriba. */
export const MIN_LOOK_PITCH = -1.45;

/**
 * Rotación por arrastre de (dx, dy) píxeles. Si la cámara quedó mirando hacia arriba (tras mirar
 * libremente) no salta: el límite inferior es el menor entre el actual y el de órbita.
 */
export function orbitBy(o: OrbitState, dx: number, dy: number, radPerPixel = 0.006): OrbitState {
  const min = Math.min(MIN_PITCH, o.pitch);
  return {
    ...o,
    yaw: o.yaw - dx * radPerPixel,
    pitch: Math.min(MAX_PITCH, Math.max(min, o.pitch + dy * radPerPixel)),
  };
}

/** Dirección unitaria del objetivo hacia la cámara. */
function backDir(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const c = Math.cos(pitch);
  return { x: c * Math.sin(yaw), y: c * Math.cos(yaw), z: Math.sin(pitch) };
}

/**
 * Cambia el centro de giro a `p` sin mover la cámara (girar alrededor de lo que está bajo el
 * cursor, como en Unity). null si el punto queda sobre la cámara o demasiado cerca.
 */
export function repivotOrbit(
  o: OrbitState,
  p: { x: number; y: number; z: number },
  minDistance = 1,
): OrbitState | null {
  const c = orbitPosition(o);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const dz = c.z - p.z;
  const d = Math.hypot(dx, dy, dz);
  if (!(d >= minDistance)) return null;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dz / d)));
  if (pitch < Math.min(MIN_PITCH, o.pitch) - 1e-6 || pitch > MAX_PITCH) return null;
  return { targetX: p.x, targetY: p.y, targetZ: p.z, yaw: Math.atan2(dx, dy), pitch, distance: d };
}

/**
 * Mirar libremente (botón derecho): la cámara queda en su lugar y gira la vista. Arrastrar a la
 * derecha mira a la derecha; hacia arriba, mira hacia arriba.
 */
export function lookBy(o: OrbitState, dx: number, dy: number, radPerPixel = 0.004): OrbitState {
  const c = orbitPosition(o);
  const yaw = o.yaw + dx * radPerPixel;
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_LOOK_PITCH, o.pitch + dy * radPerPixel));
  const b = backDir(yaw, pitch);
  return {
    targetX: c.x - b.x * o.distance,
    targetY: c.y - b.y * o.distance,
    targetZ: c.z - b.z * o.distance,
    yaw,
    pitch,
    distance: o.distance,
  };
}

/**
 * Vuelo (W A S D Q E): mueve cámara y objetivo juntos [m]. `forward` va hacia donde se mira
 * (también en altura), `right` de costado y `up` en vertical.
 */
export function flyOrbit(o: OrbitState, forward: number, right: number, up: number): OrbitState {
  const b = backDir(o.yaw, o.pitch);
  // Derecha de la vista = adelante × Z, con adelante = −b.
  const rx = -Math.cos(o.yaw);
  const ry = Math.sin(o.yaw);
  return {
    ...o,
    targetX: o.targetX - b.x * forward + rx * right,
    targetY: o.targetY - b.y * forward + ry * right,
    targetZ: o.targetZ - b.z * forward + up,
  };
}

/**
 * Acerca/aleja hacia el punto `p` que está bajo el cursor (el punto queda bajo el cursor). Al
 * llegar a la distancia mínima sigue avanzando (atraviesa), para poder entrar a una labor.
 */
export function dollyToward(
  o: OrbitState,
  factor: number,
  p: { x: number; y: number; z: number } | null,
  min = 2,
  max = 50_000,
): OrbitState {
  const distance = Math.min(max, Math.max(min, o.distance * factor));
  if (factor < 1 && o.distance * factor < min) {
    // Ya en el mínimo: se avanza hacia adelante lo que se habría acercado.
    return flyOrbit({ ...o, distance }, o.distance * (1 - factor) + 0.2, 0, 0);
  }
  if (!p) return { ...o, distance };
  const k = 1 - distance / o.distance;
  return {
    ...o,
    targetX: o.targetX + (p.x - o.targetX) * k,
    targetY: o.targetY + (p.y - o.targetY) * k,
    targetZ: o.targetZ + (p.z - o.targetZ) * k,
    distance,
  };
}

/** Desplaza el objetivo en el plano horizontal siguiendo el arrastre (sensación de "agarrar" el suelo). */
export function panOrbit(
  o: OrbitState,
  dx: number,
  dy: number,
  metersPerPixel: number,
): OrbitState {
  // Ejes de pantalla proyectados al suelo. Cámara en (sin yaw, cos yaw) respecto del objetivo:
  // adelante f = (−sin yaw, −cos yaw); derecha = f × Z = (−cos yaw, sin yaw).
  const rx = -Math.cos(o.yaw);
  const ry = Math.sin(o.yaw);
  const fx = -Math.sin(o.yaw);
  const fy = -Math.cos(o.yaw);
  // El suelo "sigue" al cursor: el objetivo va en sentido contrario al arrastre horizontal
  // y hacia adelante al arrastrar hacia abajo.
  return {
    ...o,
    targetX: o.targetX - dx * metersPerPixel * rx + dy * metersPerPixel * fx,
    targetY: o.targetY - dx * metersPerPixel * ry + dy * metersPerPixel * fy,
  };
}

/** Acerca/aleja (factor < 1 acerca), con límites. */
export function dollyOrbit(o: OrbitState, factor: number, min = 2, max = 50_000): OrbitState {
  return { ...o, distance: Math.min(max, Math.max(min, o.distance * factor)) };
}

/** Vista inicial que encuadra una caja (render) desde el Sur-Este, elevada 35°. */
export function fitOrbit(
  box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
  fovRad: number,
  aspect = 1,
): OrbitState {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const r = Math.max(
    1,
    Math.hypot(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) / 2,
  );
  // En un viewport angosto limita el FOV horizontal, no el vertical.
  const halfFov = Math.atan(Math.tan(fovRad / 2) * Math.min(1, Math.max(0.01, aspect)));
  return {
    targetX: cx,
    targetY: cy,
    targetZ: cz,
    yaw: (150 * Math.PI) / 180,
    pitch: (35 * Math.PI) / 180,
    distance: (r / Math.sin(halfFov)) * 1.05,
  };
}
