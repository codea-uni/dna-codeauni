import { panBy, zoomAt, type PlanViewState } from '../cameras/planView';
import type { Tool, ToolPointer } from '../tools/types';

const WHEEL_ZOOM_SPEED = 0.0015;
/** Teclas de vuelo (por posición física: sirven en teclados QWERTY y AZERTY de la misma forma). */
const FLY_CODES: Record<string, string> = {
  KeyW: 'f',
  KeyS: 'b',
  KeyA: 'l',
  KeyD: 'r',
  KeyE: 'u',
  KeyQ: 'd',
  ArrowUp: 'f',
  ArrowDown: 'b',
  ArrowLeft: 'l',
  ArrowRight: 'r',
};
/** Movimiento máximo [px] para que soltar en 3D cuente como clic. */
const CLICK_3D_PX = 4;

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
  /** Mirar libremente (botón derecho): gira la vista sin mover la cámara. */
  look3d?(dx: number, dy: number): void;
  /** Al empezar a orbitar: el centro de giro pasa al punto bajo el cursor (px CSS del canvas). */
  pivot3d?(sx: number, sy: number): void;
  /** Rueda: acerca/aleja hacia el punto bajo el cursor. */
  dolly3dAt?(factor: number, sx: number, sy: number): void;
  /** Vuelo con teclado mientras se mantiene el botón derecho: ejes en [-1, 1], `dt` en s. */
  fly3d?(axes: { forward: number; right: number; up: number }, dt: number, boost: boolean): void;
  /** Rueda durante el vuelo: multiplica la velocidad de vuelo. */
  flySpeed3d?(factor: number): void;
  /** Doble clic en la vista 3D: centra la vista en ese punto. */
  dblclick3d?(sx: number, sy: number): void;
  /** Clic (sin arrastre) en la vista 3D, en px CSS del canvas; `additive` con Shift o Ctrl. */
  click3d?(sx: number, sy: number, additive: boolean): void;
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
 * Pan) y el zoom con rueda se resuelven aquí; el resto va a la herramienta activa. En 3D, la
 * navegación es como la vista de escena de Unity (girar, mirar, volar con W A S D, rueda al cursor).
 */
export class InputRouter {
  private panPointer: number | null = null;
  private toolPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private spaceHeld = false;
  private drag3d: { pointer: number; mode: 'orbit' | 'pan' | 'look'; pivoted: boolean } | null =
    null;
  /** Teclas de vuelo apretadas (W A S D Q E) mientras se mira con el botón derecho. */
  private readonly flyKeys = new Set<string>();
  private flyBoost = false;
  private flyFrame = 0;
  private flyLast = 0;
  /** Dónde empezó el arrastre 3D y cuánto se movió (para distinguir un clic). */
  private down3d: { x: number; y: number; moved: number } | null = null;
  /** Modificadores al apretar (Shift/Ctrl suman a la selección al hacer clic). */
  private downMods = { additive: false };

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
    // En captura: durante el vuelo las letras no llegan a los atajos de la aplicación.
    window.addEventListener('keydown', this.onFlyKeyDown, { capture: true });
    window.addEventListener('keyup', this.onFlyKeyUp, { capture: true });
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
    window.removeEventListener('keydown', this.onFlyKeyDown, { capture: true });
    window.removeEventListener('keyup', this.onFlyKeyUp, { capture: true });
    window.removeEventListener('blur', this.onBlur);
    this.stopFly();
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
      // Como en Unity: izquierdo (o Alt + izquierdo) gira, derecho mira y vuela con W A S D,
      // medio (o Shift / Espacio + izquierdo) desplaza.
      const look = e.button === 2 && this.host.look3d !== undefined;
      const orbit = e.button === 0 && !e.shiftKey && !this.spaceHeld;
      this.drag3d = {
        pointer: e.pointerId,
        mode: look ? 'look' : orbit ? 'orbit' : 'pan',
        pivoted: false,
      };
      // Un clic sin arrastre (también con Shift, que suma a la selección) selecciona.
      this.down3d = e.button === 0 ? { x: e.clientX, y: e.clientY, moved: 0 } : null;
      this.downMods = { additive: e.shiftKey || e.ctrlKey || e.metaKey };
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
      if (this.down3d)
        this.down3d.moved = Math.max(
          this.down3d.moved,
          Math.hypot(e.clientX - this.down3d.x, e.clientY - this.down3d.y),
        );
      // Un clic con temblor no gira la vista (con herramientas 3D, p. ej. puntos de control).
      if (this.down3d && this.down3d.moved < CLICK_3D_PX && this.host.getTool().onClick3d) return;
      if (this.drag3d.mode === 'orbit') {
        if (!this.drag3d.pivoted && this.down3d && this.host.pivot3d) {
          // Gira alrededor de lo que estaba bajo el cursor al apretar.
          const rect = this.host.element.getBoundingClientRect();
          this.host.pivot3d(this.down3d.x - rect.left, this.down3d.y - rect.top);
        }
        this.drag3d.pivoted = true;
        this.host.orbit3d(dx, dy);
      } else if (this.drag3d.mode === 'look') this.host.look3d?.(dx, dy);
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
      if (this.drag3d.mode === 'look') this.stopFly();
      this.drag3d = null;
      const down = this.down3d;
      this.down3d = null;
      if (down && down.moved < CLICK_3D_PX && e.button === 0 && this.host.click3d) {
        const rect = this.host.element.getBoundingClientRect();
        this.host.click3d(e.clientX - rect.left, e.clientY - rect.top, this.downMods.additive);
      }
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
    if (this.host.is3D()) {
      const rect = this.host.element.getBoundingClientRect();
      this.host.dblclick3d?.(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    this.host.onDoubleClick(this.host.toToolPointer(e));
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.host.is3D()) {
      const d = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      // Volando (botón derecho apretado), la rueda cambia la velocidad como en Unity.
      if (this.drag3d?.mode === 'look' && this.host.flySpeed3d) {
        this.host.flySpeed3d(d < 0 ? 1.25 : 0.8);
        return;
      }
      const factor = Math.exp(d * WHEEL_ZOOM_SPEED);
      if (this.host.dolly3dAt) {
        const rect = this.host.element.getBoundingClientRect();
        this.host.dolly3dAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      } else this.host.dolly3d(factor);
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
    this.stopFly();
  };

  /** Teclas de vuelo: solo mientras se mira con el botón derecho (como en Unity). */
  private readonly onFlyKeyDown = (e: KeyboardEvent): void => {
    if (this.drag3d?.mode !== 'look' || !this.host.fly3d) return;
    if (e.key === 'Shift') {
      this.flyBoost = true;
      return;
    }
    const code = FLY_CODES[e.code];
    if (!code || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.flyKeys.add(code);
    if (!this.flyFrame) {
      this.flyLast = performance.now();
      this.flyFrame = requestAnimationFrame(this.flyTick);
    }
  };

  private readonly onFlyKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.flyBoost = false;
    const code = FLY_CODES[e.code];
    if (!code || !this.flyKeys.has(code)) return;
    e.stopImmediatePropagation();
    this.flyKeys.delete(code);
  };

  private readonly flyTick = (now: number): void => {
    this.flyFrame = 0;
    if (this.flyKeys.size === 0 || this.drag3d?.mode !== 'look') return;
    const dt = Math.min(0.1, Math.max(0, (now - this.flyLast) / 1000));
    this.flyLast = now;
    const k = this.flyKeys;
    const axis = (plus: string, minus: string) => (k.has(plus) ? 1 : 0) - (k.has(minus) ? 1 : 0);
    this.host.fly3d?.(
      { forward: axis('f', 'b'), right: axis('r', 'l'), up: axis('u', 'd') },
      dt,
      this.flyBoost,
    );
    this.flyFrame = requestAnimationFrame(this.flyTick);
  };

  private stopFly(): void {
    this.flyKeys.clear();
    this.flyBoost = false;
    if (this.flyFrame) cancelAnimationFrame(this.flyFrame);
    this.flyFrame = 0;
  }
}
