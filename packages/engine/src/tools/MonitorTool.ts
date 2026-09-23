import { commands } from '@blastlab/core';
import type { Tool, ToolContext, ToolPointer } from './types';

const PICK_PX = 10;

/** Puntos de control: clic agrega uno (con snapping); Ctrl+clic sobre uno lo borra. */
export class MonitorTool implements Tool {
  readonly name = 'monitor' as const;
  readonly cursor = 'crosshair';

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    if (p.buttons !== 0) return;
    ctx.showSnapMarker(ctx.snap(p.x, p.y));
    ctx.invalidate();
  }

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const points = ctx.document.project.monitoringPoints ?? [];
    const tol = PICK_PX * ctx.metersPerPixel();
    const hit = points.find((m) => Math.hypot(m.position.x - p.x, m.position.y - p.y) <= tol);
    if (p.ctrl) {
      if (hit)
        ctx.document.dispatch(
          commands.removeMonitoringPoint(ctx.document, hit.id),
          `Borrar ${hit.name}`,
        );
      return;
    }
    if (hit) return;
    const blast = ctx.activeBlast();
    const s = ctx.snap(p.x, p.y);
    const z = blast ? blast.bench.floorElevation + blast.bench.height : 0;
    const { ops, point } = commands.addMonitoringPoint(ctx.document, { x: s.x, y: s.y, z });
    ctx.document.dispatch(ops, `Agregar ${point.name}`);
  }

  cancel(ctx: ToolContext): boolean {
    ctx.showSnapMarker(null);
    ctx.invalidate();
    return false;
  }
}
