import {
  TYPICAL_WORKING_PROFILES,
  type WorkingProfileGroup,
  type WorkingProfileSpec,
  type WorkingsLayerInfo,
} from '@cronos/core';
import { Spline } from 'lucide-react';
import { useRef, useState } from 'react';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT } from '../i18n';
import { getCompute } from '../session';
import { importWorkingsFiles, WORKINGS_ACCEPT } from '../topography/workings';
import { PROFILE_CHOICES } from '../underground/model';
import { useUndergroundStore } from '../underground/store';

/**
 * Importar labores subterráneas (DXF/Surpac): primero el perfil con el que los ejes se convierten
 * en túnel (por defecto, la sección del frente del panel Subterránea) y dónde está el eje; luego los
 * archivos. Los sólidos (3DFACE, polyface, MESH) se importan tal cual. Si un DXF trae varias capas,
 * se eligen antes cuáles son labores (topografía, hastiales y textos vienen desmarcados).
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
  // Chimeneas y piques con su perfil típico (editable), no el de la galería (A9).
  const [profiles, setProfiles] =
    useState<Record<WorkingProfileGroup, WorkingProfileSpec>>(TYPICAL_WORKING_PROFILES);
  const [axisAt, setAxisAt] = useState<'floor' | 'center'>('floor');
  const fmt = useFormat();
  const [pending, setPending] = useState<{
    files: File[];
    layers: WorkingsLayerInfo[];
    chosen: Set<string>;
  } | null>(null);
  const finish = (files: File[], layers?: string[]) => {
    setOpen(false);
    setPending(null);
    void importWorkingsFiles(files, {
      profile,
      profiles,
      axisAt,
      ...(layers ? { layers } : {}),
    });
  };
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
          <p className="hint">{t('ug.import.byKind')}</p>
          {(['raise', 'shaft'] as const).map((g) => (
            <div key={g} className="row" style={{ flexWrap: 'wrap', gap: '0.3rem' }}>
              <strong className="small">{t(`ug.import.${g}`)}</strong>
              <select
                aria-label={t('topo.workings.profile')}
                value={profiles[g].kind}
                onChange={(e) => {
                  const kind = PROFILE_CHOICES.find((p) => p === e.target.value);
                  if (kind) setProfiles({ ...profiles, [g]: { ...profiles[g], kind } });
                }}
              >
                {PROFILE_CHOICES.map((p) => (
                  <option key={p} value={p}>
                    {t(`ug.profile.${p}`)}
                  </option>
                ))}
              </select>
              <NumberField
                label={t('topo.workings.width')}
                unit={len.unit}
                decimals={2}
                min={0.5}
                value={len.show(profiles[g].width)}
                onCommit={(v) => {
                  setProfiles({ ...profiles, [g]: { ...profiles[g], width: len.parse(v) } });
                }}
              />
              <NumberField
                label={t('topo.workings.height')}
                unit={len.unit}
                decimals={2}
                min={0.5}
                value={len.show(profiles[g].height)}
                onCommit={(v) => {
                  setProfiles({ ...profiles, [g]: { ...profiles[g], height: len.parse(v) } });
                }}
              />
            </div>
          ))}
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
          {pending ? (
            <>
              <strong>{t('topo.workings.layers')}</strong>
              <p className="hint">{t('topo.workings.layersHint')}</p>
              <div className="workings-layers">
                {pending.layers.map((l) => (
                  <label key={l.name} className="check">
                    <input
                      type="checkbox"
                      checked={pending.chosen.has(l.name)}
                      onChange={(e) => {
                        const chosen = new Set(pending.chosen);
                        if (e.target.checked) chosen.add(l.name);
                        else chosen.delete(l.name);
                        setPending({ ...pending, chosen });
                      }}
                    />
                    <span>{l.name}</span>
                    <small className="muted">
                      {[
                        l.axes > 0 ? t('topo.workings.layerAxes', { n: fmt(l.axes, 0) }) : '',
                        l.solids > 0 ? t('topo.workings.layerSolids', { n: fmt(l.solids, 0) }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </label>
                ))}
              </div>
              <div className="row">
                <button
                  className="primary"
                  disabled={pending.chosen.size === 0}
                  onClick={() => {
                    finish(pending.files, [...pending.chosen]);
                  }}
                >
                  {t('topo.workings.importLayers', { n: fmt(pending.chosen.size, 0) })}
                </button>
                <button
                  onClick={() => {
                    setPending(null);
                  }}
                >
                  {t('topo.workings.cancel')}
                </button>
              </div>
            </>
          ) : (
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
          )}
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
          void getCompute()
            .api.inspectWorkings(
              files,
              files.map((f) => f.name),
            )
            .then((layers) => {
              // Una sola capa (o ningún DXF): no hay nada que elegir.
              if (layers.length <= 1) finish(files);
              else
                setPending({
                  files,
                  layers,
                  chosen: new Set(layers.filter((l) => l.suggested).map((l) => l.name)),
                });
            })
            .catch(() => {
              finish(files);
            });
        }}
      />
    </>
  );
}
