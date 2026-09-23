import { boundaryAt, commands, nearestEdge } from '@blastlab/core';
import type { Tool, ToolContext, ToolPointer } from './types';

const EDGE_TOLERANCE_PX = 10;

/**
 * Cara libre. Clic junto a una arista de un perímetro: la marca/desmarca como cara libre (talud);
 * el material se desplaza hacia afuera del perímetro a través de ella.
 * Clic dentro de un perímetro (lejos de sus aristas): lo activa.
 */
export class FreeFaceTool implements Tool {
  readonly name = 'freeFace' as const;
  readonly cursor = 'crosshair';

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    const hit = this.edgeAt(p, ctx);
    const blast = ctx.activeBlast();
    const e =
      hit && blast ? blast.boundaries.find((b) => b.id === hit.boundaryId)?.polygon : undefined;
    if (hit && e) {
      const a = e[hit.edge];
      const b = e[(hit.edge + 1) % e.length];
      ctx.showPolyline(a && b ? [a, b] : null);
    } else ctx.showPolyline(null);
    ctx.invalidate();
  }

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const blast = ctx.activeBlast();
    if (!blast) return;
    const hit = this.edgeAt(p, ctx);
    if (hit) {
      ctx.document.dispatch(
        commands.toggleFreeFaceEdge(ctx.document, blast.id, hit.boundaryId, hit.edge),
        'Cara libre',
      );
      ctx.setActiveBoundary(hit.boundaryId);
      return;
    }
    const inside = boundaryAt(blast.boundaries, p.x, p.y);
    ctx.setActiveBoundary(inside?.id ?? null);
  }

  cancel(ctx: ToolContext): boolean {
    ctx.showPolyline(null);
    ctx.invalidate();
    return false;
  }

  private edgeAt(p: ToolPointer, ctx: ToolContext) {
    const blast = ctx.activeBlast();
    if (!blast) return null;
    const tol = EDGE_TOLERANCE_PX * ctx.metersPerPixel();
    let best: {
      boundaryId: (typeof blast.boundaries)[number]['id'];
      edge: number;
      distance: number;
    } | null = null;
    for (const b of blast.boundaries) {
      const e = nearestEdge(b.polygon, p.x, p.y);
      if (e && e.distance <= tol && (!best || e.distance < best.distance))
        best = { boundaryId: b.id, edge: e.index, distance: e.distance };
    }
    return best;
  }
}
