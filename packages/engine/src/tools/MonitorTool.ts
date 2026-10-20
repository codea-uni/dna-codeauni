import { commands } from '@cronos/core';
import type { Pick3dHit } from '../layers/TunnelLayer';
import type { Tool, ToolContext, ToolPointer } from './types';

const PICK_PX = 10;

/**
 * Puntos de control: clic agrega uno (con snapping, apoyado en el terreno); Ctrl+clic sobre uno lo
 * borra. En 3D, clic sobre una labor (excavación), una nube o el terreno lo pone en ese punto 3D.
 */
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
          ctx.text('undo.deleteNamed', { name: hit.name }),
        );
      return;
    }
    if (hit) return;
    const blast = ctx.activeBlast();
    const s = ctx.snap(p.x, p.y);
    const z =
      ctx.groundAt(s.x, s.y) ?? (blast ? blast.bench.floorElevation + blast.bench.height : 0);
    const { ops, point } = commands.addMonitoringPoint(ctx.document, { x: s.x, y: s.y, z });
    ctx.document.dispatch(ops, ctx.text('undo.addNamed', { name: point.name }));
  }

  onClick3d(hit: Pick3dHit, ctx: ToolContext): void {
    // En una labor o bajo el terreno (nube de una galería): punto subterráneo.
    const ground = ctx.groundAt(hit.point.x, hit.point.y);
    const underground =
      hit.target === 'working' ||
      (hit.target === 'model' && (ground === null || hit.point.z < ground - 2));
    const { ops, point } = commands.addMonitoringPoint(ctx.document, hit.point, undefined, {
      ...(underground ? { kind: 'underground-working' as const } : {}),
      ...(hit.name ? { working: hit.name } : {}),
    });
    ctx.document.dispatch(ops, ctx.text('undo.addNamed', { name: point.name }));
  }

  cancel(ctx: ToolContext): boolean {
    ctx.showSnapMarker(null);
    ctx.invalidate();
    return false;
  }
}
