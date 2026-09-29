import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useUiStore } from '../stores/uiStore';
import { DEMO_STEPS, runStep, stopDemo } from './tour';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Modo demostración para grabar video (tutorial): capítulo numerado, subtítulo y barra de progreso
 * por pasos. Cada paso se ejecuta al entrar (con la vista limpia, así se puede
 * retroceder) y avanza solo al cumplir su duración. Teclas: ← → pasos, espacio pausa, Esc salir.
 */
export function DemoOverlay() {
  const t = useT();
  const step = useUiStore((s) => s.demoStep);
  const paused = useUiStore((s) => s.demoPaused);
  const setDemo = useUiStore((s) => s.setDemo);
  const ran = useRef<number | null>(null);
  // Tiempo que le queda al paso actual: la pausa lo congela y al continuar sigue desde ahí.
  const remaining = useRef(0);

  useEffect(() => {
    if (step === null) {
      ran.current = null;
      return;
    }
    const current = DEMO_STEPS[step];
    if (!current) {
      stopDemo();
      return;
    }
    if (ran.current !== step) {
      ran.current = step;
      remaining.current = current.ms;
      void runStep(current).catch((err: unknown) => {
        console.error('[demo]', err);
      });
    }
    if (paused) return;
    const start = performance.now();
    const timer = setTimeout(() => {
      setDemo({ demoStep: step + 1 });
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [step, paused, setDemo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { demoStep, demoPaused } = useUiStore.getState();
      if (demoStep === null) return;
      if (e.key === 'Escape') stopDemo();
      else if (e.key === 'ArrowRight') setDemo({ demoStep: demoStep + 1 });
      else if (e.key === 'ArrowLeft') setDemo({ demoStep: Math.max(0, demoStep - 1) });
      else if (e.key === ' ') setDemo({ demoPaused: !demoPaused });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [setDemo]);

  if (step === null) return null;
  const current = DEMO_STEPS[step];
  if (!current) return null;
  const go = (s: number) => {
    setDemo({ demoStep: Math.min(Math.max(0, s), DEMO_STEPS.length - 1) });
  };
  const playState = paused ? 'paused' : 'running';

  return (
    <div className="demo-root">
      <div className="demo-vignette" />

      <div
        className="demo-progress"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemax={DEMO_STEPS.length}
      >
        {DEMO_STEPS.map((s, i) => (
          <button
            key={s.chapter}
            className={`demo-seg${i < step ? ' done' : ''}`}
            title={`${pad(i + 1)} · ${t(s.chapter)}`}
            aria-label={t(s.chapter)}
            onClick={() => {
              go(i);
            }}
          >
            {i === step && (
              <i
                key={step}
                style={{ animationDuration: `${String(s.ms)}ms`, animationPlayState: playState }}
              />
            )}
          </button>
        ))}
      </div>

      <div key={`chapter-${String(step)}`} className="demo-chapter">
        <span className="demo-chapter-num">{pad(step + 1)}</span>
        <span className="demo-chapter-title">{t(current.chapter)}</span>
      </div>

      <div className="demo-caption" role="status" aria-live="polite">
        <div key={`text-${String(step)}`} className="demo-caption-text">
          <span className="demo-kicker">
            {pad(step + 1)} / {pad(DEMO_STEPS.length)} · {t(current.chapter)}
          </span>
          <p>{t(current.caption)}</p>
        </div>
        <div className="demo-controls">
          <button
            className="icon"
            aria-label={t('demo.prev')}
            title={`${t('demo.prev')} (←)`}
            disabled={step === 0}
            onClick={() => {
              go(step - 1);
            }}
          >
            <SkipBack size={16} />
          </button>
          <button
            className="icon"
            aria-label={paused ? t('demo.resume') : t('demo.pause')}
            title={`${paused ? t('demo.resume') : t('demo.pause')} (␣)`}
            onClick={() => {
              setDemo({ demoPaused: !paused });
            }}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            className="icon"
            aria-label={t('demo.next')}
            title={`${t('demo.next')} (→)`}
            onClick={() => {
              setDemo({ demoStep: step + 1 });
            }}
          >
            <SkipForward size={16} />
          </button>
          <button
            className="icon"
            aria-label={t('demo.exit')}
            title={t('demo.exit')}
            onClick={stopDemo}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
