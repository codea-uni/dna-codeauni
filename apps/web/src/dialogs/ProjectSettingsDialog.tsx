import type { DisplayUnits } from '@cronos/core';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { CrsPicker } from '../components/CrsPicker';
import { useProject } from '../hooks/useDocument';
import { useLocale, useT, type Locale } from '../i18n';
import { session } from '../session';
import { setProjectCrs } from './CrsPromptDialog';

/** Ajustes del proyecto: sistema de coordenadas (H-101), unidades de visualización (H-104) e idioma (R-26). */
export function ProjectSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useProject();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const crs = project.coordinateSystem;

  const setUnits = (patch: Partial<DisplayUnits>) => {
    session.document.dispatch(
      { type: 'project/patch', patch: { displayUnits: { ...project.displayUnits, ...patch } } },
      t('settings.units'),
    );
  };
  // Escape cierra los ajustes, también desde un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{t('settings.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <label className="field">
          <span className="field-label">{t('settings.name')}</span>
          <input
            defaultValue={project.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== project.name)
                session.document.dispatch(
                  { type: 'project/patch', patch: { name } },
                  t('settings.name'),
                );
            }}
          />
        </label>

        <h3>{t('crs.title')}</h3>
        <CrsPicker value={crs.epsg} onChange={setProjectCrs} />

        <h3>{t('settings.units')}</h3>
        <label className="field">
          <span className="field-label">{t('settings.length')}</span>
          <select
            value={project.displayUnits.length}
            onChange={(e) => {
              setUnits({ length: e.target.value as DisplayUnits['length'] });
            }}
          >
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('settings.diameter')}</span>
          <select
            value={project.displayUnits.diameter}
            onChange={(e) => {
              setUnits({ diameter: e.target.value as DisplayUnits['diameter'] });
            }}
          >
            <option value="mm">mm</option>
            <option value="in">{t('units.inches')}</option>
          </select>
        </label>
        <p className="hint">{t('settings.unitsHint')}</p>

        <h3>{t('settings.language')}</h3>
        <label className="field">
          <span className="field-label">{t('settings.language')}</span>
          <select
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value as Locale);
            }}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </div>
  );
}
