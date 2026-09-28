import type { DisplayUnits } from '@cronos/core';
import { X } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import { useProject } from '../hooks/useDocument';
import { useLocale, useT, type Locale } from '../i18n';
import { session } from '../session';

/** Zonas UTM WGS 84 del hemisferio sur que cubren Perú (sugerencias; se acepta cualquier EPSG). */
const EPSG_SUGGESTIONS: [number, string][] = [
  [32717, 'WGS 84 / UTM 17S'],
  [32718, 'WGS 84 / UTM 18S'],
  [32719, 'WGS 84 / UTM 19S'],
];

/** Ajustes del proyecto: CRS (H-101), unidades de visualización (H-104) e idioma (R-26). */
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
  const setEpsg = (epsg: number) => {
    const name = EPSG_SUGGESTIONS.find(([code]) => code === epsg)?.[1];
    // El nombre anterior correspondía a otro código: solo se conserva el de una sugerencia.
    session.document.dispatch(
      {
        type: 'project/patch',
        patch: { coordinateSystem: { origin: crs.origin, epsg, ...(name ? { name } : {}) } },
      },
      t('settings.crs'),
    );
  };

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

        <h3>{t('settings.crs')}</h3>
        <NumberField
          label={t('settings.epsg')}
          value={crs.epsg ?? null}
          integer
          min={1024}
          max={32767}
          decimals={0}
          onCommit={setEpsg}
        />
        <p className="hint">{t('settings.epsgHint')}</p>
        <div className="row">
          {EPSG_SUGGESTIONS.map(([code, name]) => (
            <button
              key={code}
              className={crs.epsg === code ? 'active' : ''}
              onClick={() => {
                setEpsg(code);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {crs.name && <p className="muted">{crs.name}</p>}

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
            <option value="in">in</option>
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
