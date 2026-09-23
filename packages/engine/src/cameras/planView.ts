/**
 * Estado de la vista en planta (cámara ortográfica mirando hacia -Z, Norte arriba).
 * Matemática pura, sin Three.js, para poder testearla en Node.
 * Coordenadas en metros relativas al origen local de render.
 */
export interface PlanViewState {
  /** Centro de la vista [m]. */
  centerX: number;
  centerY: number;
  /** Escala: metros por píxel CSS. */
  metersPerPixel: number;
}

export const MIN_METERS_PER_PIXEL = 0.001;
export const MAX_METERS_PER_PIXEL = 1000;

/** Píxel CSS (origen arriba-izquierda) → punto del mundo. */
export function screenToWorld(
  view: PlanViewState,
  px: number,
  py: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: view.centerX + (px - width / 2) * view.metersPerPixel,
    y: view.centerY - (py - height / 2) * view.metersPerPixel,
  };
}

/** Desplaza la vista siguiendo un arrastre de (dx, dy) píxeles. */
export function panBy(view: PlanViewState, dx: number, dy: number): PlanViewState {
  return {
    ...view,
    centerX: view.centerX - dx * view.metersPerPixel,
    centerY: view.centerY + dy * view.metersPerPixel,
  };
}

/** Zoom por un factor (>1 aleja) manteniendo fijo el punto del mundo bajo el cursor. */
export function zoomAt(
  view: PlanViewState,
  factor: number,
  px: number,
  py: number,
  width: number,
  height: number,
): PlanViewState {
  const anchor = screenToWorld(view, px, py, width, height);
  const mpp = Math.min(
    MAX_METERS_PER_PIXEL,
    Math.max(MIN_METERS_PER_PIXEL, view.metersPerPixel * factor),
  );
  return {
    metersPerPixel: mpp,
    centerX: anchor.x - (px - width / 2) * mpp,
    centerY: anchor.y + (py - height / 2) * mpp,
  };
}

/** Vista que encuadra un rectángulo del mundo dejando un margen relativo. */
export function fitBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  margin = 0.1,
): PlanViewState {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const usable = Math.max(1 - 2 * margin, 0.1);
  const mpp = Math.min(
    MAX_METERS_PER_PIXEL,
    Math.max(MIN_METERS_PER_PIXEL, Math.max(w / (width * usable), h / (height * usable))),
  );
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    metersPerPixel: mpp,
  };
}
