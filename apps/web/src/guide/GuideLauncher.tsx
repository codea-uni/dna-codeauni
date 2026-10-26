import { Compass, Lightbulb, MessageSquareWarning, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useProject } from '../hooks/useDocument';
import { useT } from '../i18n';
import { useProjectKind } from '../product/product';
import { useProjectSession } from '../server/projectSession';
import { useUiStore } from '../stores/uiStore';
import { GuideChat } from './GuideOverlay';
import { useGuideStore } from './store';
import { startTour, suggestedTour, tourTitle, toursFor } from './tours';

/**
 * Botón «Guía» (siempre a mano) y la bienvenida «¿Qué quieres hacer hoy?»: el siguiente paso
 * sugerido según cómo va el proyecto, las demás tareas de esta herramienta y una caja para
 * preguntar con palabras propias. Se abre sola al entrar a un proyecto (se puede apagar).
 */

const OFF_KEY = 'cronos.guide.welcomeOff';
const SEEN_KEY = 'cronos.guide.welcomeSeen';

function readFlag(key: string, storage: () => Storage): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string | null, storage: () => Storage): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado): solo no se recuerda.
  }
}

export function GuideLauncher() {
  const t = useT();
  const welcome = useGuideStore((s) => s.welcome);
  const guiding = useGuideStore((s) => s.steps.length > 0);
  const setWelcome = useGuideStore((s) => s.setWelcome);
  const demoOn = useUiStore((s) => s.demoStep !== null);
  const projectId = useProjectSession((s) => s.current?.projectId) ?? 'local';
  const [attention, setAttention] = useState(false);

  // Al entrar a un proyecto, la bienvenida una vez por sesión del navegador (salvo que se apague).
  useEffect(() => {
    if (demoOn || readFlag(OFF_KEY, () => localStorage)) return;
    const seen = readFlag(SEEN_KEY, () => sessionStorage)?.split(',') ?? [];
    const again = seen.includes(projectId);
    // Deja que el editor termine de montar (ventanas que se abren solas al entrar; el id cambia
    // mientras carga). Si ya la vio, solo un saludo del botón.
    const id = setTimeout(() => {
      if (again) {
        setAttention(true);
        return;
      }
      writeFlag(SEEN_KEY, [...seen, projectId].join(','), () => sessionStorage);
      useGuideStore.getState().setWelcome(true);
    }, 1500);
    return () => {
      clearTimeout(id);
    };
  }, [projectId, demoOn]);

  if (demoOn) return null;
  return (
    <>
      {!guiding && (
        <button
          type="button"
          className={`guide-launcher${attention && !welcome ? ' attention' : ''}`}
          data-guide-ui
          title={t('guide.launcherHint')}
          aria-expanded={welcome}
          onClick={() => {
            setAttention(false);
            setWelcome(!welcome);
          }}
        >
          <Compass size={18} aria-hidden />
          <span>{t('guide.launcher')}</span>
        </button>
      )}
      {welcome && !guiding && <Welcome />}
    </>
  );
}

function Welcome() {
  const t = useT();
  const kind = useProjectKind();
  // Se recalcula con cada cambio del proyecto: la sugerencia sigue al avance.
  useProject();
  const setWelcome = useGuideStore((s) => s.setWelcome);
  const setFeedbackOpen = useGuideStore((s) => s.setFeedbackOpen);
  const [off, setOff] = useState(() => readFlag(OFF_KEY, () => localStorage) !== null);
  const suggested = suggestedTour();
  const others = toursFor(kind).filter((id) => id !== suggested);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWelcome(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [setWelcome]);

  return (
    <section className="guide-welcome" data-guide-ui aria-label={t('guide.welcome.title')}>
      <header className="guide-head">
        <h2>
          <Compass size={19} aria-hidden /> {t('guide.welcome.title')}
        </h2>
        <span className="grow" style={{ flex: 1 }} />
        <button
          type="button"
          className="guide-x"
          onClick={() => {
            setWelcome(false);
          }}
          aria-label={t('guide.close')}
        >
          <X size={16} />
        </button>
      </header>
      <p>{t('guide.welcome.sub')}</p>
      <h3>{t('guide.welcome.next')}</h3>
      <button
        type="button"
        className="guide-suggest"
        onClick={() => {
          startTour(suggested);
        }}
      >
        <Play size={16} aria-hidden /> {tourTitle(suggested)}
      </button>
      <h3>{t('guide.welcome.more')}</h3>
      <div className="guide-chips">
        {others.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              startTour(id);
            }}
          >
            {tourTitle(id)}
          </button>
        ))}
      </div>
      <h3>
        <Lightbulb size={12} aria-hidden /> {t('guide.welcome.ask')}
      </h3>
      <GuideChat report={false} />
      <div className="guide-welcome-foot">
        <button
          type="button"
          className="link"
          onClick={() => {
            setFeedbackOpen(true);
          }}
        >
          <MessageSquareWarning size={13} aria-hidden /> {t('guide.welcome.feedback')}
        </button>
        <label>
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => {
              setOff(e.target.checked);
              writeFlag(OFF_KEY, e.target.checked ? '1' : null, () => localStorage);
            }}
          />
          {t('guide.welcome.dontShow')}
        </label>
      </div>
    </section>
  );
}
