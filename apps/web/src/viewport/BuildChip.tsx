import type { Engine } from '@cronos/engine';
import { create } from 'zustand';
import { t } from '../i18n';
import { getEngine } from '../session';

const FOLLOW_KEY = 'cronos.build.follow';

function loadFollow(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== '0';
  } catch {
    return true;
  }
}

interface BuildState {
  building: boolean;
  follow: boolean;
}

const useBuildStore = create<BuildState>(() => ({ building: false, follow: loadFollow() }));

/** Conecta el pintado en vivo del engine con el aviso (lo llama el Viewport al crear el engine). */
export function bindBuild(engine: Engine): () => void {
  engine.setBuildFollow(useBuildStore.getState().follow);
  const off = engine.on('building', (building) => {
    useBuildStore.setState({ building });
  });
  const unsubscribe = useBuildStore.subscribe((s, prev) => {
    if (s.follow !== prev.follow) engine.setBuildFollow(s.follow);
  });
  return () => {
    off();
    unsubscribe();
    useBuildStore.setState({ building: false });
  };
}

/**
 * Aviso mientras el asistente dibuja el diseño en vivo: la cámara lo sigue (se puede soltar) y se
 * puede saltar al resultado.
 */
export function BuildChip() {
  const building = useBuildStore((s) => s.building);
  const follow = useBuildStore((s) => s.follow);
  if (!building) return null;
  const toggleFollow = () => {
    const next = !follow;
    useBuildStore.setState({ follow: next });
    try {
      localStorage.setItem(FOLLOW_KEY, next ? '1' : '0');
    } catch {
      // sin almacenamiento: solo esta sesión
    }
  };
  return (
    <div className="build-chip" role="status">
      <span className="build-chip-dot" />
      <span>{t('ai.build.drawing')}</span>
      <button type="button" className={follow ? 'on' : ''} onClick={toggleFollow}>
        {t(follow ? 'ai.build.following' : 'ai.build.follow')}
      </button>
      <button type="button" onClick={() => getEngine()?.finishBuild()}>
        {t('ai.build.skip')}
      </button>
    </div>
  );
}
