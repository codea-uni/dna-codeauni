import type { Vec2 } from '@blastlab/core';
import type { Tool, ToolContext, ToolPointer } from './types';

/**
 * Regla: clic en el origen y clic en el destino (con snapping a taladros, malla o grilla).
 * Muestra distancia, azimut y ΔE/ΔN; la medición queda fija hasta el siguiente clic. Esc la borra.
 */
export class MeasureTool implements Tool {
  readonly name = 'measure' as const;
  readonly cursor = 'crosshair';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private fixed = false;

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const s = ctx.snap(p.x, p.y);
    if (!this.a || this.fixed) {
      this.a = { x: s.x, y: s.y };
      this.b = null;
      this.fixed = false;
    } else {
      this.b = { x: s.x, y: s.y };
      this.fixed = true;
    }
    this.draw(ctx);
  }

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    const s = ctx.snap(p.x, p.y);
    ctx.showSnapMarker(s);
    if (this.a && !this.fixed) this.b = { x: s.x, y: s.y };
    this.draw(ctx);
  }

  cancel(ctx: ToolContext): boolean {
    const active = this.a !== null;
    this.a = null;
    this.b = null;
    this.fixed = false;
    ctx.showPolyline(null);
    ctx.showSnapMarker(null);
    ctx.showMeasure(null, null);
    ctx.invalidate();
    return active;
  }

  private draw(ctx: ToolContext): void {
    ctx.showPolyline(this.a && this.b ? [this.a, this.b] : null);
    ctx.showMeasure(this.a, this.b);
    ctx.invalidate();
  }
}
