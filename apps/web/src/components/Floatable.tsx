import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { useUiStore, type FloatingPanel } from '../stores/uiStore';

const MIN_W = 320;
const MIN_H = 180;

/**
 * Módulo de un panel (tabla o grupo de campos apretado) que se puede abrir en una ventana flotante,
 * movible y redimensionable, como en una aplicación de escritorio. Las barras laterales no cambian:
 * solo este bloque se muestra afuera, con su mismo componente (mismo estado, sin cálculo extra),
 * mediante un portal. Durante la demostración siempre se muestra en la barra.
 */
export function Floatable({
  id,
  title,
  width = 720,
  children,
}: {
  id: string;
  title: string;
  /** Ancho inicial de la ventana [px]. */
  width?: number;
  children: ReactNode;
}) {
  const t = useT();
  const win = useUiStore((s) =>
    s.demoStep === null ? s.floating.find((f) => f.id === id) : undefined,
  );
  const { floatPanel, dockPanel, raiseFloating } = useUiStore.getState();
  return (
    <>
      <h2 className="floatable-title">
        <span>{title}</span>
        <button
          className="icon floatable-open"
          title={t(win ? 'float.show' : 'float.open')}
          aria-label={t(win ? 'float.show' : 'float.open')}
          onClick={() => {
            if (win) raiseFloating(id);
            else floatPanel(id, width);
          }}
        >
          <Maximize2 size={13} />
        </button>
      </h2>
      {win ? (
        <>
          <p className="hint floatable-placeholder">
            {t('float.placeholder')}{' '}
            <button
              className="link"
              onClick={() => {
                dockPanel(id);
              }}
            >
              {t('float.dock')}
            </button>
          </p>
          {createPortal(
            <FloatingWindow win={win} title={title}>
              {children}
            </FloatingWindow>,
            document.body,
          )}
        </>
      ) : (
        children
      )}
    </>
  );
}

export function FloatingWindow({
  win,
  title,
  children,
  closeLabel,
  className,
}: {
  closeLabel?: string;
  className?: string;
  win: FloatingPanel;
  title: string;
  children: ReactNode;
}) {
  const t = useT();
  const z = useUiStore((s) => 60 + s.floating.findIndex((f) => f.id === win.id));
  const { dockPanel, updateFloating, raiseFloating } = useUiStore.getState();
  const ref = useRef<HTMLDivElement>(null);
  // Siempre visible aunque la pantalla se haya achicado desde la última vez.
  const x = Math.min(Math.max(0, win.x), Math.max(0, window.innerWidth - 120));
  const y = Math.min(Math.max(0, win.y), Math.max(0, window.innerHeight - 60));

  // Tamaño elegido por el usuario al redimensionar desde la esquina (CSS resize). Con
  // box-sizing: border-box el tamaño medido es el mismo que se aplica, así no crece solo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const w = Math.max(MIN_W, Math.round(el.getBoundingClientRect().width));
        const h = Math.max(MIN_H, Math.round(el.getBoundingClientRect().height));
        const cur = useUiStore.getState().floating.find((f) => f.id === win.id);
        if (cur && (Math.abs(cur.w - w) > 1 || Math.abs(cur.h - h) > 1))
          updateFloating(win.id, { w, h });
      }, 250);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [win.id, updateFloating]);

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = ref.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    const move = (ev: PointerEvent) => {
      // Se mueve el elemento directamente y se guarda al soltar: no re-renderiza el contenido.
      el.style.left = `${String(Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 120))}px`;
      el.style.top = `${String(Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40))}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      updateFloating(win.id, { x: el.offsetLeft, y: el.offsetTop });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      className={`floating-window${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label={title}
      style={{ left: x, top: y, width: win.w, height: win.h, zIndex: z }}
      onPointerDown={() => {
        raiseFloating(win.id);
      }}
    >
      <header className="floating-header" onPointerDown={startDrag}>
        <strong>{title}</strong>
        <span className="floating-spacer" />
        <button
          className="icon"
          title={closeLabel ?? t('float.dock')}
          aria-label={closeLabel ?? t('float.dock')}
          onClick={() => {
            dockPanel(win.id);
          }}
        >
          <X size={15} />
        </button>
      </header>
      <div className="floating-body">
        <section className="panel">{children}</section>
      </div>
    </div>
  );
}
