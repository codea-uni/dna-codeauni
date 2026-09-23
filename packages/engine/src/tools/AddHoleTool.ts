import { commands, createHole, nextHoleNumber } from '@blastlab/core';
import type { Tool, ToolContext, ToolPointer } from './types';

/** Agrega un taladro con la plantilla actual en el punto (ajustado por snapping). */
export class AddHoleTool implements Tool {
  readonly name = 'add' as const;
  readonly cursor = 'crosshair';

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    if (p.buttons !== 0) return;
    ctx.showSnapMarker(ctx.snap(p.x, p.y));
    ctx.invalidate();
  }

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const blast = ctx.activeBlast();
    if (!blast) return;
    const at = ctx.snap(p.x, p.y);
    const hole = createHole({
      position: { x: at.x, y: at.y },
      template: ctx.holeTemplate(),
      bench: blast.bench,
      label: String(nextHoleNumber(blast.holes)),
    });
    ctx.document.dispatch(commands.addHoles(blast.id, [hole]), 'Agregar taladro');
    ctx.selection.set([hole.id]);
  }

  cancel(ctx: ToolContext): boolean {
    ctx.showSnapMarker(null);
    ctx.invalidate();
    return false;
  }
}
