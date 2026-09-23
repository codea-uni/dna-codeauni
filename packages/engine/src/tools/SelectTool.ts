import { commands, type HoleId, type Vec2, type Vec3 } from '@blastlab/core';
import {
  DRAG_THRESHOLD_PX,
  screenDistance,
  type Tool,
  type ToolContext,
  type ToolPointer,
} from './types';

type State =
  | { kind: 'idle' }
  | { kind: 'pressHole'; start: ToolPointer; anchor: Vec3 }
  | { kind: 'moving'; start: ToolPointer; anchor: Vec3; ids: HoleId[]; dx: number; dy: number }
  | { kind: 'pressEmpty'; start: ToolPointer }
  | { kind: 'box'; start: ToolPointer; end: ToolPointer }
  | { kind: 'lasso'; start: ToolPointer; points: Vec2[]; last: ToolPointer };

/**
 * Selección y movimiento.
 * - Clic en taladro: selecciona (Shift agrega, Ctrl alterna). Arrastrar mueve la selección con snapping.
 * - Arrastre en vacío: caja (modo 'box') o lazo (modo 'lasso'). Shift agrega, Ctrl/Alt quita.
 * - Clic en vacío sin modificadores: limpia la selección.
 */
export class SelectTool implements Tool {
  readonly name;
  readonly cursor = 'default';
  private state: State = { kind: 'idle' };

  constructor(private readonly mode: 'box' | 'lasso') {
    this.name = mode === 'box' ? ('select' as const) : ('lasso' as const);
  }

  onPointerDown(p: ToolPointer, ctx: ToolContext): void {
    if (p.button !== 0) return;
    const hit = ctx.pickHole(p.x, p.y);
    if (hit) {
      if (p.ctrl) {
        ctx.selection.toggle([hit]);
        this.state = { kind: 'idle' };
        return;
      }
      if (p.shift) ctx.selection.add([hit]);
      else if (!ctx.selection.has(hit)) ctx.selection.set([hit]);
      const loc = ctx.document.findHole(hit);
      if (!loc) return;
      this.state = { kind: 'pressHole', start: p, anchor: loc.hole.collar };
    } else {
      this.state = { kind: 'pressEmpty', start: p };
    }
  }

  onPointerMove(p: ToolPointer, ctx: ToolContext): void {
    const s = this.state;
    switch (s.kind) {
      case 'idle':
        return;
      case 'pressHole':
        if (screenDistance(s.start, p) < DRAG_THRESHOLD_PX) return;
        this.state = {
          kind: 'moving',
          start: s.start,
          anchor: s.anchor,
          ids: [...ctx.selection.ids],
          dx: 0,
          dy: 0,
        };
        this.updateMove(p, ctx);
        return;
      case 'moving':
        this.updateMove(p, ctx);
        return;
      case 'pressEmpty':
        if (screenDistance(s.start, p) < DRAG_THRESHOLD_PX) return;
        this.state =
          this.mode === 'box'
            ? { kind: 'box', start: s.start, end: p }
            : {
                kind: 'lasso',
                start: s.start,
                points: [
                  { x: s.start.x, y: s.start.y },
                  { x: p.x, y: p.y },
                ],
                last: p,
              };
        this.drawRegion(ctx);
        return;
      case 'box':
        s.end = p;
        this.drawRegion(ctx);
        return;
      case 'lasso':
        if (screenDistance(s.last, p) >= 3) {
          s.points.push({ x: p.x, y: p.y });
          s.last = p;
          this.drawRegion(ctx);
        }
        return;
    }
  }

  onPointerUp(p: ToolPointer, ctx: ToolContext): void {
    const s = this.state;
    this.state = { kind: 'idle' };
    switch (s.kind) {
      case 'moving': {
        ctx.clearPreviewMove();
        ctx.showSnapMarker(null);
        if (s.dx !== 0 || s.dy !== 0) {
          const n = s.ids.length;
          ctx.document.dispatch(
            commands.moveHoles(ctx.document, s.ids, s.dx, s.dy),
            n === 1 ? 'Mover taladro' : `Mover ${n} taladros`,
          );
        }
        ctx.invalidate();
        return;
      }
      case 'pressEmpty':
        if (!p.shift && !p.ctrl && !p.alt) ctx.selection.clear();
        return;
      case 'box': {
        const ids = ctx.holesInBox(
          Math.min(s.start.x, p.x),
          Math.min(s.start.y, p.y),
          Math.max(s.start.x, p.x),
          Math.max(s.start.y, p.y),
        );
        this.applyRegion(ids, p, ctx);
        return;
      }
      case 'lasso':
        s.points.push({ x: p.x, y: p.y });
        this.applyRegion(ctx.holesInPolygon(s.points), p, ctx);
        return;
      default:
        return;
    }
  }

  cancel(ctx: ToolContext): boolean {
    const active = this.state.kind !== 'idle';
    if (this.state.kind === 'moving') ctx.clearPreviewMove();
    this.state = { kind: 'idle' };
    ctx.showPolyline(null);
    ctx.showPolygon(null);
    ctx.showSnapMarker(null);
    ctx.invalidate();
    return active;
  }

  private updateMove(p: ToolPointer, ctx: ToolContext): void {
    const s = this.state;
    if (s.kind !== 'moving') return;
    const target = ctx.snap(s.anchor.x + (p.x - s.start.x), s.anchor.y + (p.y - s.start.y), {
      ignoreHoles: true,
    });
    s.dx = target.x - s.anchor.x;
    s.dy = target.y - s.anchor.y;
    ctx.previewMove(s.ids, s.dx, s.dy);
    ctx.showSnapMarker(target.kind === 'none' ? null : target);
    ctx.invalidate();
  }

  private drawRegion(ctx: ToolContext): void {
    const s = this.state;
    if (s.kind === 'box') {
      ctx.showPolygon([
        { x: s.start.x, y: s.start.y },
        { x: s.end.x, y: s.start.y },
        { x: s.end.x, y: s.end.y },
        { x: s.start.x, y: s.end.y },
      ]);
    } else if (s.kind === 'lasso') {
      ctx.showPolyline([...s.points, s.points[0] ?? { x: s.start.x, y: s.start.y }]);
    }
    ctx.invalidate();
  }

  private applyRegion(ids: HoleId[], p: ToolPointer, ctx: ToolContext): void {
    if (p.shift) ctx.selection.add(ids);
    else if (p.ctrl || p.alt) ctx.selection.remove(ids);
    else ctx.selection.set(ids);
    ctx.showPolyline(null);
    ctx.showPolygon(null);
    ctx.invalidate();
  }
}
