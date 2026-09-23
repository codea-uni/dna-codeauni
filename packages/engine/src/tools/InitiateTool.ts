import { commands } from '@blastlab/core';
import type { Tool, ToolContext, ToolPointer } from './types';

/** Clic en un taladro: agrega o quita un punto de inicio. */
export class InitiateTool implements Tool {
  readonly name = 'initiate' as const;
  readonly cursor = 'crosshair';

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const blast = ctx.activeBlast();
    const hit = ctx.pickHole(p.x, p.y);
    if (!blast || !hit) return;
    ctx.document.dispatch(
      commands.toggleInitiationPoint(ctx.document, blast.id, hit),
      'Punto de inicio',
    );
  }
}
