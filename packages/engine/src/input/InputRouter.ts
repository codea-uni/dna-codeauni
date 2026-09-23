import { panBy, zoomAt, type PlanViewState } from '../cameras/planView';
import type { Tool, ToolPointer } from '../tools/types';

const WHEEL_ZOOM_SPEED = 0.0015;

export interface InputHost {
  readonly element: HTMLElement;
  getView(): PlanViewState;
  setView(view: PlanViewState): void;
  getTool(): Tool;
  /** Vista 3D activa: el puntero navega (orbitar/desplazar/acercar) en vez de usar herramientas. */
  is3D(): boolean;
  orbit3d(dx: number, dy: number): void;
  pan3d(dx: number, dy: number): void;
  dolly3d(factor: number): void;
  /** Convierte un evento de puntero a coordenadas de proyecto. */
  toToolPointer(e: PointerEvent | MouseEvent): ToolPointer;
  onPointerDown(p: ToolPointer): void;
  onPointerMove(p: ToolPointer): void;
  onPointerUp(p: ToolPointer): void;
  onDoubleClick(p: ToolPointer): void;
  onPointerLeave(): void;
  onKeyDown(e: KeyboardEvent): boolean;
  onCursorChange(cursor: string): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Enruta la entrada del canvas: el pan (botón medio/derecho, Espacio + arrastre o herramienta
 * Pan) y el zoom con rueda se resuelven aquí; el resto va a la herramienta activa.
 */
export class InputRouter {
  private panPointer: number | null = null;
  private toolPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private spaceHeld = false;
  private drag3d: { pointer: number; mode: 'orbit' | 'pan' } | null = null;

  constructor(private readonly host: InputHost) {
    const el = host.element;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    const el = this.host.element;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('dblclick', this.onDoubleClick);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private wantsPan(e: PointerEvent): boolean {
    if (e.button === 1 || e.button === 2) return true;
    return e.button === 0 && (this.spaceHeld || this.host.getTool().name === 'pan');
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.host.is3D()) {
      if (this.drag3d) return;
      e.preventDefault();
      this.host.element.focus({ preventScroll: true });
      this.host.element.setPointerCapture(e.pointerId);
      const orbit = e.button === 0 && !e.shiftKey && !this.spaceHeld;
      this.drag3d = { pointer: e.pointerId, mode: orbit ? 'orbit' : 'pan' };
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.host.onCursorChange('grabbing');
      return;
    }
    if (this.panPointer !== null || this.toolPointer !== null) return;
    this.host.element.focus({ preventScroll: true });
    this.host.element.setPointerCapture(e.pointerId);
    if (this.wantsPan(e)) {
      e.preventDefault();
      this.panPointer = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.host.onCursorChange('grabbing');
      return;
    }
    this.toolPointer = e.pointerId;
    this.host.onPointerDown(this.host.toToolPointer(e));
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.drag3d) {
      if (e.pointerId !== this.drag3d.pointer) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.drag3d.mode === 'orbit') this.host.orbit3d(dx, dy);
      else this.host.pan3d(dx, dy);
      return;
    }
    if (this.host.is3D()) return;
    if (e.pointerId === this.panPointer) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.host.setView(panBy(this.host.getView(), dx, dy));
      return;
    }
    if (this.toolPointer !== null && e.pointerId !== this.toolPointer) return;
    this.host.onPointerMove(this.host.toToolPointer(e));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.host.element.hasPointerCapture(e.pointerId))
      this.host.element.releasePointerCapture(e.pointerId);
    if (this.drag3d?.pointer === e.pointerId) {
      this.drag3d = null;
      this.host.onCursorChange('grab');
      return;
    }
    if (e.pointerId === this.panPointer) {
      this.panPointer = null;
      this.host.onCursorChange(this.host.getTool().cursor);
      return;
    }
    if (e.pointerId === this.toolPointer) {
      this.toolPointer = null;
      this.host.onPointerUp(this.host.toToolPointer(e));
    }
  };

  private readonly onPointerLeave = (): void => {
    if (this.panPointer === null && this.toolPointer === null) this.host.onPointerLeave();
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    if (this.host.is3D()) return;
    this.host.onDoubleClick(this.host.toToolPointer(e));
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.host.is3D()) {
      const d = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      this.host.dolly3d(Math.exp(d * WHEEL_ZOOM_SPEED));
      return;
    }
    const rect = this.host.element.getBoundingClientRect();
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(delta * WHEEL_ZOOM_SPEED);
    this.host.setView(
      zoomAt(
        this.host.getView(),
        factor,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      ),
    );
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isEditableTarget(e.target)) return;
    if (e.code === 'Space') {
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this.host.onCursorChange('grab');
      }
      e.preventDefault();
      return;
    }
    if (this.host.onKeyDown(e)) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.spaceHeld = false;
      this.host.onCursorChange(this.host.getTool().cursor);
    }
  };

  private readonly onBlur = (): void => {
    this.spaceHeld = false;
  };
}
