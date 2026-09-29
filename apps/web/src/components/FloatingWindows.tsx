import { PictureInPicture2, X } from 'lucide-react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import { PANEL_TABS, PanelContent } from '../panels/registry';
import { useUiStore, type FloatingPanel } from '../stores/uiStore';
import { ErrorBoundary } from './ErrorBoundary';

const MIN_W = 320;
const MIN_H = 200;

/**
 * Paneles abiertos como ventanas flotantes (como en una aplicación de escritorio): se arrastran
 * por el título, se redimensionan desde la esquina y se traen al frente con un clic. Son los mismos
 * componentes de las barras laterales, sin cálculo extra.
 */
export function FloatingWindows() {
  const floating = useUiStore((s) => s.floating);
  // Durante la demostración los paneles vuelven a las barras para que el video se vea como siempre.
  const demo = useUiStore((s) => s.demoStep !== null);
  if (demo) return null;
  return (
    <>
      {floating.map((f, i) => (
        <FloatingWindow key={f.id} win={f} z={60 + i} />
      ))}
    </>
  );
}

function FloatingWindow({ win, z }: { win: FloatingPanel; z: number }) {
  const t = useT();
  const { dockPanel, updateFloating, raiseFloating } = useUiStore.getState();
  const ref = useRef<HTMLDivElement>(null);
  const tab = PANEL_TABS.find((x) => x.id === win.id);
  // Siempre visible aunque la pantalla se haya achicado desde la última vez.
  const x = Math.min(Math.max(0, win.x), Math.max(0, window.innerWidth - 120));
  const y = Math.min(Math.max(0, win.y), Math.max(0, window.innerHeight - 60));

  // Guarda el tamaño al terminar de redimensionar desde la esquina (CSS resize).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const w = Math.max(MIN_W, el.offsetWidth);
        const h = Math.max(MIN_H, el.offsetHeight);
        const cur = useUiStore.getState().floating.find((f) => f.id === win.id);
        if (cur && (cur.w !== w || cur.h !== h)) updateFloating(win.id, { w, h });
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
      // Se mueve el elemento directamente y se guarda al soltar: no re-renderiza el panel.
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
      className="floating-window"
      role="dialog"
      aria-label={tab ? t(tab.label) : win.id}
      style={{ left: x, top: y, width: win.w, height: win.h, zIndex: z }}
      onPointerDown={() => {
        raiseFloating(win.id);
      }}
    >
      <header className="floating-header" onPointerDown={startDrag}>
        {tab && <tab.icon size={15} strokeWidth={1.8} aria-hidden />}
        <strong>{tab ? t(tab.label) : win.id}</strong>
        <span className="floating-spacer" />
        <button
          className="icon"
          title={t('float.dock')}
          aria-label={t('float.dock')}
          onClick={() => {
            dockPanel(win.id);
          }}
        >
          <X size={15} />
        </button>
      </header>
      <div className="floating-body">
        <ErrorBoundary>
          <PanelContent id={win.id} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/** Botón de la barra de pestañas que abre el panel actual en una ventana flotante. */
export function PopOutButton({ id }: { id: FloatingPanel['id'] }) {
  const t = useT();
  const floatPanel = useUiStore((s) => s.floatPanel);
  return (
    <button
      className="icon tab-popout"
      title={t('float.open')}
      aria-label={t('float.open')}
      onClick={() => {
        floatPanel(id);
      }}
    >
      <PictureInPicture2 size={15} strokeWidth={1.8} />
    </button>
  );
}

/** Contenido de la pestaña en la barra, o un aviso si está abierta en una ventana. */
export function SidebarBody({ id }: { id: FloatingPanel['id'] }) {
  const t = useT();
  const floating = useUiStore((s) => s.demoStep === null && s.floating.some((f) => f.id === id));
  const { dockPanel, raiseFloating } = useUiStore.getState();
  if (!floating) return <PanelContent id={id} />;
  return (
    <section className="panel floating-placeholder">
      <p className="hint">{t('float.placeholder')}</p>
      <div className="row">
        <button
          onClick={() => {
            raiseFloating(id);
          }}
        >
          {t('float.show')}
        </button>
        <button
          onClick={() => {
            dockPanel(id);
          }}
        >
          {t('float.dock')}
        </button>
      </div>
    </section>
  );
}
