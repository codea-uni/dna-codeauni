import type { WorkingProfileSpec } from '@cronos/core';
import { Spline } from 'lucide-react';
import { useRef, useState } from 'react';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useUnits } from '../hooks/useUnits';
import { useT } from '../i18n';
import { importWorkingsFiles, WORKINGS_ACCEPT } from '../topography/workings';
import { PROFILE_CHOICES } from '../underground/model';
import { useUndergroundStore } from '../underground/store';

/**
 * Importar labores subterráneas (DXF/Surpac): primero el perfil con el que los ejes se convierten
 * en túnel (por defecto, la sección del frente del panel Subterránea) y dónde está el eje; luego los
 * archivos. Los sólidos (3DFACE, polyface) se importan tal cual.
 */
export function WorkingsImport() {
  const t = useT();
  const { len } = useUnits();
  const input = useRef<HTMLInputElement>(null);
  const face = useUndergroundStore((s) => s.face);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<WorkingProfileSpec>({
    kind: face.profile,
    width: face.width,
    height: face.height,
  });
  const [axisAt, setAxisAt] = useState<'floor' | 'center'>('floor');
  return (
    <>
      <button
        className="topo-import-btn"
        title={t('topo.workings.importHint')}
        aria-expanded={open}
        onClick={() => {
          if (!open && !actions.requireCrs()) return;
          setOpen(!open);
        }}
      >
        <Spline size={18} aria-hidden />
        <strong>{t('topo.workings.import')}</strong>
        <small>{t('topo.importHint.workings')}</small>
      </button>
      {open && (
        <div className="model3d-controls small">
          <p className="hint">{t('topo.workings.importHint')}</p>
          <label className="field">
            <span className="field-label">{t('topo.workings.profile')}</span>
            <select
              value={profile.kind}
              onChange={(e) => {
                const kind = PROFILE_CHOICES.find((p) => p === e.target.value);
                if (kind) setProfile({ ...profile, kind });
              }}
            >
              {PROFILE_CHOICES.map((p) => (
                <option key={p} value={p}>
                  {t(`ug.profile.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label={t('topo.workings.width')}
            unit={len.unit}
            decimals={2}
            min={0.5}
            value={len.show(profile.width)}
            onCommit={(v) => {
              setProfile({ ...profile, width: len.parse(v) });
            }}
          />
          <NumberField
            label={t('topo.workings.height')}
            unit={len.unit}
            decimals={2}
            min={0.5}
            value={len.show(profile.height)}
            onCommit={(v) => {
              setProfile({ ...profile, height: len.parse(v) });
            }}
          />
          <label className="field">
            <span className="field-label">{t('topo.workings.axisAt')}</span>
            <select
              value={axisAt}
              onChange={(e) => {
                setAxisAt(e.target.value === 'center' ? 'center' : 'floor');
              }}
            >
              <option value="floor">{t('topo.workings.axisFloor')}</option>
              <option value="center">{t('topo.workings.axisCenter')}</option>
            </select>
          </label>
          <div className="row">
            <button className="primary" onClick={() => input.current?.click()}>
              {t('topo.workings.choose')}
            </button>
            <button
              onClick={() => {
                setOpen(false);
              }}
            >
              {t('topo.workings.cancel')}
            </button>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={WORKINGS_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length === 0) return;
          setOpen(false);
          void importWorkingsFiles(files, { profile, axisAt });
        }}
      />
    </>
  );
}
