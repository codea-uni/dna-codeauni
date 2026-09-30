import type { Vec2 } from '@cronos/core';
import type { Tool, ToolContext, ToolPointer } from './types';

/**
 * Sección de la pila (A7): clic en un extremo y clic en el otro (con ajuste del cursor). Al fijar
 * el segundo extremo el engine emite la sección y la app muestra el perfil antes y después.
 */
export class SectionTool implements Tool {
  readonly name = 'section' as const;
  readonly cursor = 'crosshair';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const s = ctx.snap(p.x, p.y);
    if (!this.a) {
      this.a = { x: s.x, y: s.y };
      this.b = null;
      this.draw(ctx);
      return;
    }
    const b = { x: s.x, y: s.y };
    if (Math.hypot(b.x - this.a.x, b.y - this.a.y) < 1e-6) return;
    ctx.setSection(this.a, b);
    this.a = null;
    this.b = null;
    ctx.showPolyline(null);
    ctx.invalidate();
  }

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    const s = ctx.snap(p.x, p.y);
    ctx.showSnapMarker(s);
    if (this.a) {
      this.b = { x: s.x, y: s.y };
      this.draw(ctx);
    }
  }

  cancel(ctx: ToolContext): boolean {
    const active = this.a !== null;
    this.a = null;
    this.b = null;
    ctx.showPolyline(null);
    ctx.showSnapMarker(null);
    ctx.invalidate();
    return active;
  }

  private draw(ctx: ToolContext): void {
    ctx.showPolyline(this.a && this.b ? [this.a, this.b] : null);
    ctx.invalidate();
  }
}
