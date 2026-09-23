import { commands, type HoleId } from '@blastlab/core';
import type { Tool, ToolContext, ToolPointer } from './types';

/**
 * Amarre de superficie. Clic en un taladro inicia la cadena; cada clic en otro taladro crea la
 * conexión desde el anterior con el conector actual y continúa desde el nuevo.
 * Clic en vacío o Esc termina la cadena. Ctrl+clic sobre una conexión la borra.
 */
export class TieTool implements Tool {
  readonly name = 'tie' as const;
  readonly cursor = 'crosshair';
  private from: HoleId | null = null;

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const blast = ctx.activeBlast();
    if (!blast) return;
    if (p.ctrl) {
      const conn = ctx.pickConnection(p.x, p.y);
      if (conn)
        ctx.document.dispatch(
          commands.removeConnections(ctx.document, blast.id, [conn]),
          'Borrar conexión',
        );
      return;
    }
    const hit = ctx.pickHole(p.x, p.y);
    if (!hit) {
      this.cancel(ctx);
      return;
    }
    const connector = ctx.tieConnector();
    if (this.from && this.from !== hit && connector) {
      ctx.document.dispatch(
        commands.addConnection(ctx.document, blast.id, this.from, hit, connector),
        'Conectar taladros',
      );
    }
    this.from = hit;
    this.draw(p, ctx);
  }

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    this.draw(p, ctx);
  }

  cancel(ctx: ToolContext): boolean {
    const active = this.from !== null;
    this.from = null;
    ctx.showPolyline(null);
    ctx.invalidate();
    return active;
  }

  private draw(p: ToolPointer, ctx: ToolContext): void {
    const start = this.from ? ctx.document.findHole(this.from)?.hole.collar : undefined;
    ctx.showPolyline(start ? [start, { x: p.x, y: p.y }] : null);
    ctx.invalidate();
  }
}
