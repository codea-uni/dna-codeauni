import type { Meters, Vec2 } from '../model/types';
import { nearestPatternNode } from '../patterns/pattern';
import type { Pattern } from '../model/types';

export interface SnapOptions {
  grid: boolean;
  gridSize: Meters;
  holes: boolean;
  pattern: boolean;
  /** Distancia máxima de captura para taladros y nodos de patrón [m]. */
  tolerance: Meters;
}

export type SnapKind = 'none' | 'grid' | 'hole' | 'pattern';

export interface SnapResult extends Vec2 {
  kind: SnapKind;
}

export interface SnapContext {
  nearestHole: (x: number, y: number, maxDistance: number) => Vec2 | null;
  patterns: readonly Pattern[];
}

/**
 * Ajusta un punto con prioridad: taladro existente > nodo de patrón > grilla.
 * Taladros y nodos solo capturan dentro de la tolerancia; la grilla captura siempre.
 */
export function snapPoint(
  x: number,
  y: number,
  options: SnapOptions,
  ctx: SnapContext,
): SnapResult {
  if (options.holes) {
    const hole = ctx.nearestHole(x, y, options.tolerance);
    if (hole) return { x: hole.x, y: hole.y, kind: 'hole' };
  }
  if (options.pattern) {
    let best: Vec2 | null = null;
    let bestD = options.tolerance * options.tolerance;
    for (const p of ctx.patterns) {
      const node = nearestPatternNode(p, x, y).position;
      const d = (node.x - x) ** 2 + (node.y - y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = node;
      }
    }
    if (best) return { x: best.x, y: best.y, kind: 'pattern' };
  }
  if (options.grid && options.gridSize > 0) {
    return {
      x: Math.round(x / options.gridSize) * options.gridSize,
      y: Math.round(y / options.gridSize) * options.gridSize,
      kind: 'grid',
    };
  }
  return { x, y, kind: 'none' };
}
