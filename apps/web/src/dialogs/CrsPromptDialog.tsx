import { permissions } from '@cronos/api';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { CrsPicker, crsDisplayName } from '../components/CrsPicker';
import { t, useT } from '../i18n';
import { api, serverMode } from '../server/api';
import { useProjectSession } from '../server/projectSession';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

/** Importación que espera el sistema de coordenadas (sigue sola al elegirlo). */
export const useCrsPrompt = create<{ pending: (() => void) | null }>(() => ({ pending: null }));

/**
 * Fija el sistema de coordenadas del proyecto (se deshace como cualquier cambio). Si la mina
 * todavía no tiene uno y quien edita la administra, la mina queda con el mismo: así no figura
 * «sin sistema» mientras sus proyectos ya lo tienen, y los proyectos nuevos lo heredan.
 */
export function setProjectCrs(epsg: number): void {
  const doc = session.document;
  const crs = doc.project.coordinateSystem;
  if (crs.epsg === epsg) return;
  doc.dispatch(
    {
      type: 'project/patch',
      patch: { coordinateSystem: { origin: crs.origin, epsg, name: crsDisplayName(epsg) } },
    },
    t('settings.crs'),
  );
  const current = useProjectSession.getState().current;
  if (!serverMode || !current || current.mine.epsg || !permissions.manageMines(current.role))
    return;
  void api.updateMine(current.mine.id, { epsg }).then(
    (mine) => {
      const now = useProjectSession.getState().current;
      if (now?.mine.id === mine.id) useProjectSession.setState({ current: { ...now, mine } });
      useUiStore.getState().notify(t('crs.mineUpdated'));
    },
    () => undefined,
  );
}

/** Pide el sistema de coordenadas antes de importar y continúa la importación con él. */
export function CrsPromptDialog() {
  const tr = useT();
  const pending = useCrsPrompt((s) => s.pending);
  const [epsg, setEpsg] = useState<number | undefined>(
    () => useProjectSession.getState().current?.mine.epsg ?? undefined,
  );
  const close = () => {
    useCrsPrompt.setState({ pending: null });
  };
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCrsPrompt.setState({ pending: null });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [pending]);
  if (!pending) return null;
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr('crs.promptTitle')}
      onClick={close}
    >
      <div
        className="modal dialog-narrow"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{tr('crs.promptTitle')}</h2>
          <button className="icon" onClick={close} aria-label={tr('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <p>{tr('crs.promptHint')}</p>
        <CrsPicker value={epsg} onChange={setEpsg} autoFocus />
        <footer>
          <button onClick={close}>{tr('common.cancel')}</button>
          <button
            className="primary-inline"
            disabled={epsg === undefined}
            onClick={() => {
              if (epsg === undefined) return;
              setProjectCrs(epsg);
              useUiStore.getState().notify(tr('crs.saved', { name: crsDisplayName(epsg) }));
              close();
              // En el mismo clic: abrir el selector de archivos necesita la activación del usuario.
              pending();
            }}
          >
            {tr('crs.continue')}
          </button>
        </footer>
      </div>
    </div>
  );
}
