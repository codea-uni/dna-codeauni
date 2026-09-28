import { Pause, Play, SkipForward, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useUiStore } from '../stores/uiStore';
import { DEMO_STEPS, stopDemo } from './tour';

/**
 * Subtítulo y controles del modo demostración. Cada paso se ejecuta una vez al entrar y avanza
 * solo cuando pasa su duración (pausa: detiene el avance; siguiente: salta).
 */
export function DemoOverlay() {
  const t = useT();
  const step = useUiStore((s) => s.demoStep);
  const paused = useUiStore((s) => s.demoPaused);
  const setDemo = useUiStore((s) => s.setDemo);
  const ran = useRef<number | null>(null);

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
      void Promise.resolve(current.run()).catch((err: unknown) => {
        console.error('[demo]', err);
      });
    }
    if (paused) return;
    const timer = setTimeout(() => {
      setDemo({ demoStep: step + 1 });
    }, current.ms);
    return () => {
      clearTimeout(timer);
    };
  }, [step, paused, setDemo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopDemo();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (step === null) return null;
  const current = DEMO_STEPS[step];
  if (!current) return null;
  return (
    <div className="demo-caption" role="status" aria-live="polite">
      <span className="demo-step">
        {step + 1} / {DEMO_STEPS.length}
      </span>
      <p>{t(current.caption)}</p>
      <div className="demo-controls">
        <button
          className="icon"
          aria-label={paused ? t('demo.resume') : t('demo.pause')}
          title={paused ? t('demo.resume') : t('demo.pause')}
          onClick={() => {
            setDemo({ demoPaused: !paused });
          }}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button
          className="icon"
          aria-label={t('demo.next')}
          title={t('demo.next')}
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
  );
}
