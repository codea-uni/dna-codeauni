import type { PointerEvent as ReactPointerEvent } from 'react';
import { session } from '../session';
import { dragValue, type DragRules } from './dragValue';

export type { DragRules };

/** Píxeles de arrastre antes de empezar: un clic normal sigue enfocando el campo para escribir. */
const THRESHOLD_PX = 3;
/**
 * Confirma valores en vivo como mucho una vez por cuadro (arrastrar despacha muchos cambios y cada
 * uno puede recalcular el diseño). `flush` confirma ya el último pendiente.
 */
export function liveCommit(onCommit: (v: number) => void) {
  let pending: number | null = null;
  let last: number | null = null;
  let frame = 0;
  const run = () => {
    frame = 0;
    if (pending === null || pending === last) return;
    last = pending;
    onCommit(pending);
  };
  return {
    push(v: number) {
      pending = v;
      frame ||= requestAnimationFrame(run);
    },
    flush() {
      if (frame) cancelAnimationFrame(frame);
      run();
    },
  };
}

/**
 * Arrastrar la etiqueta de un campo cambia su valor (como en los programas de diseño). Los
 * listeners van en `window`: el campo se vuelve a montar con cada valor nuevo y el gesto debe
 * seguir. Todo el arrastre es un solo paso de deshacer.
 */
export function startScrub(
  e: ReactPointerEvent,
  rules: DragRules,
  onCommit: (v: number) => void,
): void {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  let dragging = false;
  let endGroup: (() => void) | null = null;
  const live = liveCommit(onCommit);
  const body = document.body;

  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD_PX) return;
      dragging = true;
      endGroup = session.document.beginGroup();
      body.classList.add('scrubbing');
    }
    live.push(dragValue(rules, dx, ev.shiftKey, ev.altKey));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (!dragging) return;
    live.flush();
    endGroup?.();
    body.classList.remove('scrubbing');
    // El clic que sigue al arrastre no debe enfocar el campo (la etiqueta lo haría). Solo ese:
    // si no llega, el bloqueo se quita enseguida y no se traga un clic posterior.
    const swallow = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => {
      window.removeEventListener('click', swallow, { capture: true });
    }, 0);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
