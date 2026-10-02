import type { PointerEvent as ReactPointerEvent } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useT } from '../i18n';

/** Arrastrador de ancho de panel que no interfiere con el contenido del visor. */
export function SidebarResizeHandle({ side }: { side: 'right' }) {
  const t = useT();
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const app = event.currentTarget.closest<HTMLElement>('.app');
    if (!app) return;
    const bounds = app.getBoundingClientRect();
    const update = (clientX: number) => {
      const width = bounds.right - clientX;
      app.style.setProperty(`--${side}-sidebar-width`, `${Math.max(240, Math.min(520, width))}px`);
    };
    const move = (e: PointerEvent) => {
      update(e.clientX);
    };
    const up = (e: PointerEvent) => {
      update(e.clientX);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const px = getComputedStyle(app).getPropertyValue(`--${side}-sidebar-width`);
      const width = Number.parseFloat(px);
      if (Number.isFinite(width)) useUiStore.getState().setSidebarWidth(width);
      app.style.setProperty(`--${side}-sidebar-width`, `${width}px`);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      className={`sidebar-resize ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('sidebar.resizeRight')}
      title={t('sidebar.resizeHint')}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 16 : -16;
        const current = useUiStore.getState().rightWidth;
        useUiStore.getState().setSidebarWidth(current - delta);
      }}
      tabIndex={0}
    />
  );
}
