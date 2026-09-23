import { panBy, zoomAt, type PlanViewState } from '../cameras/planView';

const WHEEL_ZOOM_SPEED = 0.0015;

/**
 * Pan (arrastre con botón izquierdo o medio) y zoom con rueda anclado al cursor.
 * No conoce Three.js: modifica el estado de vista y notifica.
 */
export class PlanControls {
  private dragPointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly getView: () => PlanViewState,
    private readonly setView: (view: PlanViewState) => void,
  ) {
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    this.dragPointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.setView(panBy(this.getView(), dx, dy));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragPointerId = null;
    if (this.element.hasPointerCapture(e.pointerId)) {
      this.element.releasePointerCapture(e.pointerId);
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.element.getBoundingClientRect();
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(delta * WHEEL_ZOOM_SPEED);
    this.setView(
      zoomAt(
        this.getView(),
        factor,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      ),
    );
  };
}
