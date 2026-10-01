import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useUiStore } from '../stores/uiStore';
import { getEngine } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { DEMO_STEPS } from './tour';
import { TRAILER_STEPS } from './trailer';
import { runStep, stopDemo } from './playback';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Modo demostración para grabar video (tutorial): capítulo numerado, subtítulo y barra de progreso
 * por pasos. Cada paso se ejecuta al entrar (con la vista limpia, así se puede
 * retroceder) y avanza solo al cumplir su duración. Teclas: ← → pasos, espacio pausa, Esc salir.
 */
export function DemoOverlay() {
  const t = useT();
  const step = useUiStore((s) => s.demoStep);
  const tour = useUiStore((s) => s.demoTour);
  const paused = useUiStore((s) => s.demoPaused);
  const ready = useUiStore((s) => s.demoReady);
  const setDemo = useUiStore((s) => s.setDemo);
  const steps = tour === 'trailer' ? TRAILER_STEPS : DEMO_STEPS;
  // Tiempo que le queda al paso actual: la pausa lo congela y al continuar sigue desde ahí.
  const remaining = useRef(0);

  useEffect(() => {
    if (step === null) return;
    const current = steps[step];
    if (!current) {
      stopDemo();
      return;
    }
    remaining.current = current.ms;
    const running = runStep(current);
    void running.done.catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[demo]', err);
      useUiStore.getState().notify(err instanceof Error ? err.message : String(err), 'error');
      stopDemo();
    });
    return running.cancel;
  }, [step, steps]);

  useEffect(() => {
    if (step === null || !steps[step]) return;
    if (paused || !ready) return;
    const start = performance.now();
    const timer = setTimeout(() => {
      setDemo({ demoStep: step + 1 });
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [step, steps, paused, ready, setDemo]);

  useEffect(() => {
    if (step === null) return;
    const engine = getEngine();
    const s = useAnalysisStore.getState();
    if (paused) engine?.pauseSequence();
    else if (s.sequencePlaying && s.analysis) {
      // Reanuda desde el reloj del motor y conserva el final de la maza.
      engine?.resumeSequence();
    }
  }, [paused, step]);

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
  const current = steps[step];
  if (!current) return null;
  const go = (s: number) => {
    setDemo({ demoStep: Math.min(Math.max(0, s), steps.length - 1) });
  };
  const playState = paused ? 'paused' : 'running';

  return (
    <div
      className={`demo-root${tour === 'trailer' ? ' trailer' : ''}`}
      data-step={step}
      data-ready={ready}
    >
      <div className="demo-vignette" />

      <div
        className="demo-progress"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemax={steps.length}
      >
        {steps.map((s, i) => (
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
            {tour === 'trailer'
              ? `Cronos · ${t(current.chapter)}`
              : `${pad(step + 1)} / ${pad(steps.length)} · ${t(current.chapter)}`}
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
