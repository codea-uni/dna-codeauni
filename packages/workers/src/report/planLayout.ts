import type { Vec2 } from '@blastlab/core';

export interface PlanTransform {
  /** Proyecto [m] → página [pt]. */
  toPage: (p: Vec2) => { x: number; y: number };
  /** Puntos por metro. */
  scale: number;
}

/**
 * Encuadra los puntos en una caja de la página conservando la proporción (Norte arriba).
 * `box` en puntos PDF (origen abajo-izquierda).
 */
export function fitPlan(
  points: readonly Vec2[],
  box: { x: number; y: number; w: number; h: number },
  margin = 0.06,
): PlanTransform {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) {
    minX = minY = 0;
    maxX = maxY = 1;
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const usableW = box.w * (1 - 2 * margin);
  const usableH = box.h * (1 - 2 * margin);
  const scale = Math.min(usableW / w, usableH / h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const bx = box.x + box.w / 2;
  const by = box.y + box.h / 2;
  return { scale, toPage: (p) => ({ x: bx + (p.x - cx) * scale, y: by + (p.y - cy) * scale }) };
}

/** Largo "redondo" de barra de escala [m] que ocupe ~`targetPt` puntos. */
export function scaleBarLength(scale: number, targetPt = 100): number {
  const raw = targetPt / scale;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [5, 2, 1]) if (m * pow <= raw) return m * pow;
  return pow;
}
