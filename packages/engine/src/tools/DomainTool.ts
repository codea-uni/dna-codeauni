import { newId, type BlastDomain, type Vec2 } from '@cronos/core';
import type { Tool, ToolContext, ToolPointer } from './types';

const CLOSE_TOLERANCE_PX = 10;
/** Colores de los dominios nuevos (se pueden cambiar en el panel). */
const DOMAIN_COLORS = ['#d4a017', '#8b5a2b', '#2e86ab', '#a23b72', '#3f7d20', '#c73e1d'];

/**
 * Dibuja un dominio de material o ley (A7, dilución) en la voladura activa: clic agrega vértice;
 * se cierra con clic en el primero, doble clic o Enter. Retroceso quita el último; Esc cancela.
 */
export class DomainTool implements Tool {
  readonly name = 'domain' as const;
  readonly cursor = 'crosshair';
  private points: Vec2[] = [];
  private cursorPoint: Vec2 | null = null;

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const first = this.points[0];
    if (first && this.points.length >= 3) {
      const d = Math.hypot(first.x - p.x, first.y - p.y) / ctx.metersPerPixel();
      if (d <= CLOSE_TOLERANCE_PX) {
        this.finish(ctx);
        return;
      }
    }
    const s = ctx.snap(p.x, p.y);
    const last = this.points.at(-1);
    if (last?.x !== s.x || last.y !== s.y) this.points.push({ x: s.x, y: s.y });
    this.draw(ctx);
  }

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    const s = ctx.snap(p.x, p.y);
    this.cursorPoint = { x: s.x, y: s.y };
    ctx.showSnapMarker(s);
    this.draw(ctx);
  }

  onDoubleClick(_p: ToolPointer, ctx: ToolContext): void {
    this.finish(ctx);
  }

  onKeyDown(e: KeyboardEvent, ctx: ToolContext): boolean {
    if (e.key === 'Enter') {
      this.finish(ctx);
      return true;
    }
    if (e.key === 'Backspace' && this.points.length > 0) {
      this.points.pop();
      this.draw(ctx);
      return true;
    }
    return false;
  }

  cancel(ctx: ToolContext): boolean {
    const active = this.points.length > 0;
    this.points = [];
    this.cursorPoint = null;
    ctx.showPolyline(null);
    ctx.showSnapMarker(null);
    ctx.invalidate();
    return active;
  }

  private finish(ctx: ToolContext): void {
    const blast = ctx.activeBlast();
    if (blast && this.points.length >= 3) {
      const domains = blast.domains ?? [];
      const n = domains.length + 1;
      const domain: BlastDomain = {
        id: newId<'Domain'>(),
        name: ctx.text('domain.defaultName', { n }),
        polygon: this.points,
        material: ctx.text('domain.defaultName', { n }),
        color: DOMAIN_COLORS[(n - 1) % DOMAIN_COLORS.length] ?? '#d4a017',
      };
      ctx.document.dispatch(
        { type: 'blast/patch', blastId: blast.id, patch: { domains: [...domains, domain] } },
        ctx.text('undo.drawNamed', { name: domain.name }),
      );
    }
    this.cancel(ctx);
  }

  private draw(ctx: ToolContext): void {
    const pts = this.cursorPoint ? [...this.points, this.cursorPoint] : this.points;
    ctx.showPolyline(pts.length >= 2 ? pts : null);
    ctx.invalidate();
  }
}
