import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Teclado de un diálogo o ventana (WCAG 2.2, cronos-ux-interfaz): al abrirse lleva el foco adentro
 * (primer campo, si no el primer botón), Esc cierra, al cerrarse devuelve el foco a quien lo abrió
 * y, si es modal, Tab no se escapa. Una ventana que reaparece al cargar la página (foco en el body)
 * no roba el foco.
 *
 * Devuelve el `onKeyDown` para el contenedor: como manejador de React corre después del de los
 * campos, así Esc en un campo con borrador primero revierte (el campo hace `preventDefault`).
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { modal = true }: { modal?: boolean } = {},
): (e: KeyboardEvent<HTMLElement>) => void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const userOpened = modal || (opener !== null && opener !== document.body);
    if (userOpened && !root.contains(document.activeElement)) {
      const items = focusables(root);
      const first =
        root.querySelector<HTMLElement>('[autofocus]') ??
        items.find((el) => el.matches('input, select, textarea')) ??
        items.find((el) => !el.closest('header')) ??
        items[0];
      if (first) first.focus();
      else {
        root.tabIndex = -1;
        root.focus();
      }
    }

    return () => {
      if (userOpened && opener?.isConnected) opener.focus();
    };
  }, [ref, modal]);

  return (e) => {
    const root = ref.current;
    if (!root) return;
    if (e.key === 'Escape') {
      // Un campo con borrador ya usó este Esc para revertir.
      if (e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    } else if (e.key === 'Tab' && modal) {
      const items = focusables(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
}
