import {
  ArrowLeft,
  ArrowRight,
  Check,
  MessageSquareWarning,
  Send,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useT } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { askGuide } from './ask';
import { isShown, queryGuide, revealTarget } from './reveal';
import { findGuideTarget } from './targets';
import { useGuideStore, type GuideStep } from './store';
import './guide.css';

/**
 * Capa del agente guía: oscurece la pantalla salvo el control señalado (sin bloquear nada: se
 * puede seguir usando todo), una mano que viaja hasta él y «toca», y la burbuja con el paso, los
 * botones y una caja para preguntar. Con un ancla en la escena la burbuja sigue al objeto 3D.
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
/** Última posición de la mano: al cambiar de paso viaja desde ahí. */
let lastHand: { x: number; y: number } | null = null;
const MOBILE = 700;

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5
  );
}

/** Dónde está el paso ahora (control o punto de la escena), en px de la ventana. */
function locate(step: GuideStep, el: HTMLElement | null): Box | null {
  if (step.world) {
    const engine = getEngine();
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.viewport');
    if (!engine || !canvas) return null;
    const p = engine.worldToScreen(step.world.at);
    if (!p.visible) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + p.x - 28, y: r.top + p.y - 28, w: 56, h: 56 };
  }
  if (!el?.isConnected || !isShown(el)) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** El control se ve entero: dentro de la pantalla y de la zona con scroll que lo contiene. */
function inView(el: HTMLElement, b: Box): boolean {
  const scroller = el.closest<HTMLElement>('.floating-body');
  const area = scroller?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
  // La ventana entera (o algo más grande que su zona) no se puede ver completa: no insiste.
  if (b.h > area.bottom - area.top || b.w > window.innerWidth) return true;
  return (
    b.y >= Math.max(0, area.top) - 1 &&
    b.y + b.h <= Math.min(window.innerHeight, area.bottom) + 1 &&
    b.x >= -1 &&
    b.x + b.w <= window.innerWidth + 1
  );
}

/**
 * Lugar de la burbuja: junto al objetivo (debajo, arriba, a un lado) sin taparlo, y si el control
 * está dentro de una ventana, mejor fuera de ella para no tapar el formulario que se está llenando.
 */
function placeBubble(box: Box | null, avoid: Box | null, bw: number, bh: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < MOBILE) return {};
  if (!box) return { left: (vw - bw) / 2, top: Math.max(80, (vh - bh) / 2) };
  const gap = 18;
  const clampX = (x: number) => Math.min(Math.max(12, x), vw - bw - 12);
  const clampY = (y: number) => Math.min(Math.max(12, y), vh - bh - 12);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const candidates: { left: number; top: number }[] = [];
  if (avoid) {
    candidates.push({ left: avoid.x + avoid.w + gap, top: clampY(cy - bh / 2) });
    candidates.push({ left: avoid.x - gap - bw, top: clampY(cy - bh / 2) });
  }
  candidates.push(
    { left: clampX(cx - bw / 2), top: box.y + box.h + gap },
    { left: clampX(cx - bw / 2), top: box.y - gap - bh },
    { left: box.x + box.w + gap, top: clampY(cy - bh / 2) },
    { left: box.x - gap - bw, top: clampY(cy - bh / 2) },
  );
  const overlap = (a: Box, b: { left: number; top: number }) =>
    Math.max(0, Math.min(a.x + a.w, b.left + bw) - Math.max(a.x, b.left)) *
    Math.max(0, Math.min(a.y + a.h, b.top + bh) - Math.max(a.y, b.top));
  const fits = (c: { left: number; top: number }) =>
    c.left >= 8 && c.top >= 8 && c.left + bw <= vw - 8 && c.top + bh <= vh - 8;
  let best = candidates[candidates.length - 1] ?? { left: 12, top: 12 };
  let bestCost = Infinity;
  for (const c of candidates) {
    if (!fits(c)) continue;
    // Tapar el control señalado es lo peor; tapar su ventana, casi.
    const cost = overlap(box, c) * 10 + (avoid ? overlap(avoid, c) : 0);
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
    }
  }
  return { left: clampX(best.left), top: clampY(best.top) };
}

export function GuideOverlay() {
  const steps = useGuideStore((s) => s.steps);
  const index = useGuideStore((s) => s.index);
  const run = useGuideStore((s) => s.run);
  const finished = useGuideStore((s) => s.finished);
  const step = steps[index];
  if (step) return <Spotlight key={`${run}.${index}`} step={step} />;
  if (finished) return <Finished title={finished} />;
  return null;
}

function Spotlight({ step }: { step: GuideStep }) {
  const t = useT();
  const steps = useGuideStore((s) => s.steps);
  const index = useGuideStore((s) => s.index);
  const title = useGuideStore((s) => s.title);
  const source = useGuideStore((s) => s.source);
  const chatMark = useGuideStore((s) => s.chatMark);
  const next = useGuideStore((s) => s.next);
  const back = useGuideStore((s) => s.back);
  const stop = useGuideStore((s) => s.stop);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [searching, setSearching] = useState(!step.world);
  const [box, setBox] = useState<Box | null>(null);
  const [avoid, setAvoid] = useState<Box | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ w: 340, h: 180 });
  const bubble = useRef<HTMLDivElement>(null);
  const hasTarget = Boolean(step.target ?? step.label ?? step.world);
  const waiting = !!step.done;

  // Al entrar: si ya está hecho, sigue; si no, deja el control a la vista.
  useEffect(() => {
    if (step.done?.()) {
      next();
      return;
    }
    if (step.world || (!step.target && !step.label)) return;
    let alive = true;
    void revealTarget(step.target, step.label).then((found) => {
      if (!alive) return;
      setEl(found);
      setSearching(false);
    });
    return () => {
      alive = false;
    };
  }, [step, next]);

  // Sigue al objetivo (ventanas que se mueven, scroll, cámara 3D) en cada cuadro.
  useEffect(() => {
    let raf = 0;
    let last: Box | null = null;
    let scrolled = 0;
    const tick = () => {
      // Si el control se volvió a montar (React lo reemplazó), se busca otra vez por su id.
      let target = el;
      if (step.target && (!target?.isConnected || !isShown(target))) {
        const again = queryGuide(step.target);
        if (again && isShown(again)) {
          target = again;
          setEl(again);
        }
      }
      const b = locate(step, target);
      // Fuera de la parte visible de su ventana o de la pantalla (el contenido cambió después
      // de traerlo): se vuelve a traer, sin insistir en cada cuadro.
      if (b && target && performance.now() - scrolled > 800 && !inView(target, b)) {
        scrolled = performance.now();
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }
      if (!sameBox(b, last)) {
        last = b;
        setBox(b);
        // La ventana flotante que lo contiene (si no es la propia ventana señalada).
        const win = target?.closest<HTMLElement>('.floating-window');
        const r = win && win !== target ? win.getBoundingClientRect() : null;
        setAvoid(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [step, el]);

  // Objeto de la escena: las ventanas que lo tapan se corren a un lado (y vuelven al terminar).
  useEffect(() => {
    if (!step.world) return;
    const moved: { id: string; x: number; y: number; w: number }[] = [];
    // Después del vuelo de la cámara (~1 s), cuando el objeto ya está en su lugar.
    const id = setTimeout(() => {
      const p = locate(step, null);
      if (!p) return;
      const px = p.x + p.w / 2;
      const py = p.y + p.h / 2;
      const ui = useUiStore.getState();
      const vw = window.innerWidth;
      const margin = 150;
      for (const win of ui.floating) {
        const el = document.querySelector<HTMLElement>(
          `.floating-window[data-guide="window.${win.id.replace(/^workspace\./, '')}"]`,
        );
        const r = el?.getBoundingClientRect();
        if (!r || px < r.left - margin || px > r.right + margin || py < r.top || py > r.bottom)
          continue;
        const left = { x: 12, w: px - margin - 12 };
        const right = { x: px + margin, w: vw - px - margin - 12 };
        const side = left.w >= right.w ? left : right;
        moved.push({ id: win.id, x: win.x, y: win.y, w: win.w });
        ui.updateFloating(win.id, { x: Math.round(side.x), w: Math.round(Math.max(320, Math.min(win.w, side.w))) });
      }
    }, 1100);
    return () => {
      clearTimeout(id);
      const ui = useUiStore.getState();
      for (const m of moved)
        if (ui.floating.some((f) => f.id === m.id)) ui.updateFloating(m.id, { x: m.x, y: m.y, w: m.w });
    };
  }, [step]);

  // Avanza solo cuando el paso se cumple (cambios del documento, ventanas, pestañas).
  useEffect(() => {
    if (!step.done) return;
    const check = () => {
      if (step.done?.()) next();
    };
    const id = setInterval(check, 300);
    const unsub = session.document.subscribe(check);
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [step, next]);

  // O al tocar el control señalado.
  useEffect(() => {
    if (step.done || step.advanceOnClick === false || !el) return;
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) setTimeout(next, 350);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
    };
  }, [step, el, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [stop]);

  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b) return;
    const ro = new ResizeObserver(() => {
      setBubbleSize({ w: b.offsetWidth, h: b.offsetHeight });
    });
    ro.observe(b);
    return () => {
      ro.disconnect();
    };
  }, []);

  const notFound = hasTarget && !searching && !box && !step.world;
  const targetName = step.target
    ? (findGuideTarget(step.target)?.name() ?? step.target)
    : step.label;
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const hole = box
    ? { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 }
    : null;
  const isLast = index === steps.length - 1;
  const handAt = box ? { x: box.x + Math.min(box.w / 2, 60), y: box.y + box.h / 2 } : null;
  const [hand, setHand] = useState(lastHand);
  const hx = handAt?.x;
  const hy = handAt?.y;
  useEffect(() => {
    if (hx === undefined || hy === undefined) return;
    // Un cuadro en la posición anterior y luego al objetivo: la transición CSS hace el viaje.
    const id = requestAnimationFrame(() => {
      lastHand = { x: hx, y: hy };
      setHand(lastHand);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [hx, hy]);

  return (
    <div className="guide-layer" data-guide-ui>
      {hole && (
        <svg className="guide-dim" width={vw} height={vh} aria-hidden>
          <defs>
            <mask id="guide-hole">
              <rect width={vw} height={vh} fill="white" />
              {step.world ? (
                <circle cx={hole.x + hole.w / 2} cy={hole.y + hole.h / 2} r={hole.w} fill="black" />
              ) : (
                <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={10} fill="black" />
              )}
            </mask>
          </defs>
          <rect width={vw} height={vh} mask="url(#guide-hole)" />
        </svg>
      )}
      {hole && (
        <div
          className={step.world ? 'guide-ring guide-ring-world' : 'guide-ring'}
          style={
            step.world
              ? { left: hole.x + hole.w / 2, top: hole.y + hole.h / 2 }
              : { left: hole.x, top: hole.y, width: hole.w, height: hole.h }
          }
        />
      )}
      {handAt && hand && !step.world && (
        <div className="guide-hand" style={{ left: hand.x, top: hand.y }} aria-hidden>
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path
              d="M6.5 2.5l12 9.2-5.6.9 3.3 6.7-2.9 1.4-3.3-6.8-3.9 4z"
              fill="white"
              stroke="#111"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          <span className="guide-tap" />
        </div>
      )}
      <div
        ref={bubble}
        className={`guide-bubble${vw < MOBILE ? ` guide-sheet${box && box.y + box.h / 2 > vh * 0.5 ? ' guide-sheet-top' : ''}` : ''}`}
        style={placeBubble(box, avoid, bubbleSize.w, bubbleSize.h)}
        role="dialog"
        aria-live="polite"
        aria-label={title ?? step.title ?? t('guide.launcher')}
      >
        <header className="guide-head">
          <Sparkles size={15} aria-hidden className="guide-spark" />
          <div className="guide-titles">
            {steps.length > 1 && (
              <small>{t('guide.step', { n: index + 1, total: steps.length })}</small>
            )}
            {(step.title ?? title) && <strong>{step.title ?? title}</strong>}
          </div>
          <button type="button" className="guide-x" onClick={stop} aria-label={t('guide.close')}>
            <X size={15} />
          </button>
        </header>
        {steps.length > 1 && (
          <div className="guide-progress" aria-hidden>
            <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
        )}
        <p className="guide-text">{step.text}</p>
        {notFound && (
          <p className="guide-missing">
            {t('guide.notFound', { name: targetName ?? '' })} {t('guide.notFoundHint')}
          </p>
        )}
        {waiting && !notFound && (
          <p className="guide-wait">
            <span className="guide-dot" /> {t('guide.waiting')}
          </p>
        )}
        <div className="guide-actions">
          {index > 0 && (
            <button type="button" onClick={back}>
              <ArrowLeft size={14} aria-hidden /> {t('guide.back')}
            </button>
          )}
          <span className="grow" />
          {step.doIt && (
            <button
              type="button"
              onClick={() => {
                void Promise.resolve(step.doIt?.()).then(() => {
                  if (!step.done) next();
                });
              }}
            >
              <Wand2 size={14} aria-hidden /> {t('guide.doIt')}
            </button>
          )}
          <button type="button" className="primary" onClick={next}>
            {isLast ? (
              <>
                <Check size={14} aria-hidden /> {t('guide.done')}
              </>
            ) : (
              <>
                {t('guide.next')} <ArrowRight size={14} aria-hidden />
              </>
            )}
          </button>
        </div>
        <GuideChat compact={source === 'tour'} since={chatMark} />
      </div>
    </div>
  );
}

/** Conversación corta dentro de la burbuja: la última respuesta y una caja para preguntar. */
export function GuideChat({
  compact = false,
  report = true,
  since = 0,
}: {
  compact?: boolean;
  /**
   * Mostrar respuestas solo si el usuario preguntó desde aquí (índice de la conversación): la
   * respuesta del turno que armó los pasos repite lo que ya dicen.
   */
  since?: number;
  /** Enlace «Enviar al equipo» (la bienvenida ya tiene el suyo). */
  report?: boolean;
}) {
  const t = useT();
  const chat = useGuideStore((s) => s.chat);
  const busy = useGuideStore((s) => s.busy);
  const setFeedbackOpen = useGuideStore((s) => s.setFeedbackOpen);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(!compact);
  const asked = chat.slice(since).some((m) => m.role === 'user');
  const last = asked ? [...chat].reverse().find((m) => m.role === 'guide') : undefined;
  const send = () => {
    const q = text.trim();
    if (!q) return;
    setText('');
    void askGuide(q);
  };
  return (
    <div className="guide-chat">
      {busy && asked && <p className="guide-answer guide-busy">{t('guide.thinking')}</p>}
      {!busy && last && <p className="guide-answer">{last.text}</p>}
      {open ? (
        <form
          className="guide-ask"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            placeholder={t('guide.askPlaceholder')}
            aria-label={t('guide.askPlaceholder')}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label={t('guide.welcome.send')}
          >
            <Send size={14} />
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="link guide-open-ask"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t('guide.askPlaceholder')}
        </button>
      )}
      {report && (
        <button
          type="button"
          className="link guide-report"
          onClick={() => {
            setFeedbackOpen(true);
          }}
        >
          <MessageSquareWarning size={13} aria-hidden /> {t('guide.report')}
        </button>
      )}
    </div>
  );
}

function Finished({ title }: { title: string }) {
  const t = useT();
  useEffect(() => {
    const id = setTimeout(() => {
      useGuideStore.setState({ finished: null });
    }, 7000);
    return () => {
      clearTimeout(id);
    };
  }, [title]);
  return (
    <div className="guide-layer" data-guide-ui>
      <div className="guide-finished" role="status">
        <Check size={18} aria-hidden />
        <div>
          <strong>{t('guide.finished', { title })}</strong>
          <button
            type="button"
            className="link"
            onClick={() => {
              useGuideStore.getState().setWelcome(true);
            }}
          >
            {t('guide.finishedSub')}
          </button>
        </div>
      </div>
    </div>
  );
}
