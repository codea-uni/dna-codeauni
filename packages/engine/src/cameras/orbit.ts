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

/** Rotación por arrastre de (dx, dy) píxeles. */
export function orbitBy(o: OrbitState, dx: number, dy: number, radPerPixel = 0.006): OrbitState {
  return {
    ...o,
    yaw: o.yaw - dx * radPerPixel,
    pitch: Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + dy * radPerPixel)),
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
): OrbitState {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const r = Math.max(
    1,
    Math.hypot(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) / 2,
  );
  return {
    targetX: cx,
    targetY: cy,
    targetZ: cz,
    yaw: (150 * Math.PI) / 180,
    pitch: (35 * Math.PI) / 180,
    distance: (r / Math.sin(fovRad / 2)) * 1.05,
  };
}
