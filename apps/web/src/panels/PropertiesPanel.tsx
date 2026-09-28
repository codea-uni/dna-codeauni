import {
  commands,
  degToRad,
  holeToe,
  radToDeg,
  type Hole,
  type HoleEdit,
  type HoleWater,
} from '@cronos/core';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { DeckEditor } from './DeckEditor';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT } from '../i18n';
import { useAnalysisStore } from '../stores/analysisStore';

/** Valor común de una propiedad en la selección, o null si difiere. */
function common(holes: readonly Hole[], get: (h: Hole) => number): number | null {
  const first = holes[0];
  if (!first) return null;
  const v = get(first);
  for (let i = 1; i < holes.length; i++) {
    const h = holes[i];
    if (h && Math.abs(get(h) - v) > 1e-9) return null;
  }
  return v;
}

function map(v: number | null, f: (x: number) => number): number | null {
  return v === null ? null : f(v);
}

export function PropertiesPanel() {
  const t = useT();
  const fmt = useFormat();
  const analysis = useAnalysisStore((st) => st.analysis);
  const { len, dia } = useUnits();
  // Suscripciones: re-render cuando cambian el documento o la selección.
  useProject();
  const ids = useSelectionIds();
  const holes: Hole[] = [];
  for (const id of ids) {
    const h = session.document.findHole(id)?.hole;
    if (h) holes.push(h);
  }

  if (holes.length === 0) {
    const [before, after] = t('props.hint').split('{key}');
    return (
      <section className="panel">
        <h2>{t('props.title')}</h2>
        <p className="muted">{t('props.noSelection')}</p>
        <p className="hint">
          {before}
          <kbd>V</kbd>
          {after}
        </p>
      </section>
    );
  }

  const single = holes.length === 1 ? holes[0] : undefined;
  const edit = (change: HoleEdit, label: string) => {
    const n = holes.length;
    session.document.dispatch(
      commands.editHoles(
        session.document,
        holes.map((h) => h.id),
        change,
      ),
      n === 1 ? label : t('props.multiLabel', { label, n }),
    );
  };
  const toe = single ? holeToe(single) : undefined;
  // Resultado del worker para el taladro seleccionado (tiempo relativo y burden efectivo, G5).
  const k = single && analysis ? analysis.charge.holeIds.indexOf(single.id) : -1;
  const seq =
    analysis && k >= 0
      ? {
          t: (analysis.timing.fireTime[k] ?? NaN) - analysis.timing.firstTime,
          eff: analysis.effectiveBurden.effective[k] ?? NaN,
          nom: analysis.effectiveBurden.nominal[k] ?? NaN,
        }
      : null;

  return (
    <>
      <section className="panel">
        <h2>{t('props.title')}</h2>
        <p className="muted">
          {single
            ? t('props.hole', { label: single.label })
            : t('props.selected', { n: holes.length })}
          {single?.row !== undefined &&
            single.col !== undefined &&
            ` · ${t('props.rowCol', { row: single.row + 1, col: single.col + 1 })}`}
        </p>
        {single && (
          <label className="field">
            <span className="field-label">{t('props.label')}</span>
            <input
              key={single.id + single.label}
              defaultValue={single.label}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (label && label !== single.label) edit({ label }, t('props.rename'));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
        )}
        <NumberField
          label={t('props.east')}
          unit={len.unit}
          value={map(
            common(holes, (h) => h.collar.x),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ x: v }, t('props.editX'));
          }}
        />
        <NumberField
          label={t('props.north')}
          unit={len.unit}
          value={map(
            common(holes, (h) => h.collar.y),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ y: v }, t('props.editY'));
          }}
        />
        <NumberField
          label={t('props.collarZ')}
          unit={len.unit}
          value={map(
            common(holes, (h) => h.collar.z),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ z: v }, t('props.editZ'));
          }}
        />
        <NumberField
          label={t('props.diameter')}
          unit={dia.unit}
          decimals={dia.unit === 'in' ? 3 : 1}
          min={0.001}
          value={map(
            common(holes, (h) => h.diameter),
            dia.show,
          )}
          onCommit={(v) => {
            edit({ diameter: dia.parse(v) }, t('props.editDiameter'));
          }}
        />
        <NumberField
          label={t('props.length')}
          unit={len.unit}
          decimals={2}
          min={0}
          value={map(
            common(holes, (h) => h.length),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ length: v }, t('props.editLength'));
          }}
        />
        <NumberField
          label={t('props.inclination')}
          unit="°"
          decimals={2}
          min={0}
          max={89}
          value={map(
            common(holes, (h) => h.inclination),
            radToDeg,
          )}
          onCommit={(v) => {
            edit({ inclination: degToRad(v) }, t('props.editInclination'));
          }}
        />
        <NumberField
          label={t('props.azimuth')}
          unit="°"
          decimals={2}
          min={0}
          max={360}
          value={map(
            common(holes, (h) => h.azimuth),
            radToDeg,
          )}
          onCommit={(v) => {
            edit({ azimuth: degToRad(v) }, t('props.editAzimuth'));
          }}
        />
        <NumberField
          label={t('props.subdrill')}
          unit={len.unit}
          decimals={2}
          value={map(
            common(holes, (h) => h.subdrill),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ subdrill: v }, t('props.editSubdrill'));
          }}
        />
        <p className="hint">{t('props.geometryHint')}</p>
        <label className="field">
          <span className="field-label">{t('props.water')}</span>
          <select
            value={
              new Set(holes.map((h) => h.water ?? 'unknown')).size === 1
                ? (holes[0]?.water ?? 'unknown')
                : 'mixed'
            }
            onChange={(e) => {
              const value = e.target.value as HoleWater | 'unknown';
              const blast = session.document.project.blasts[0];
              if (!blast) return;
              const next = holes.map((h) => {
                const copy = { ...h };
                if (value === 'unknown') delete copy.water;
                else copy.water = value;
                return copy;
              });
              session.document.dispatch(
                { type: 'holes/replace', blastId: blast.id, holes: next },
                holes.length === 1
                  ? t('props.waterState')
                  : t('props.multiLabel', { label: t('props.waterState'), n: holes.length }),
              );
            }}
          >
            <option value="mixed" disabled>
              {t('props.water.mixed')}
            </option>
            <option value="unknown">{t('props.water.unknown')}</option>
            <option value="dry">{t('props.water.dry')}</option>
            <option value="static">{t('props.water.static')}</option>
            <option value="dynamic">{t('props.water.dynamic')}</option>
          </select>
        </label>
        <p className="hint">{t('props.waterHint')}</p>
        {seq && Number.isFinite(seq.t) && (
          <p className="muted">
            {t('props.firesAt', { t: fmt(seq.t * 1000) })}
            {Number.isFinite(seq.eff)
              ? ` · ${t('props.effectiveBurden', { b: `${fmt(len.show(seq.eff), 2)} ${len.unit}` })}`
              : seq.eff === Infinity
                ? ` · ${t('props.noFreeFace')}`
                : ''}
            {Number.isFinite(seq.nom) &&
              ` ${t('props.nominal', { b: `${fmt(len.show(seq.nom), 2)} ${len.unit}` })}`}
          </p>
        )}
        {toe && (
          <p className="muted mono">
            {t('props.toe', { x: fmt(toe.x, 2), y: fmt(toe.y, 2), z: fmt(toe.z, 2) })}
          </p>
        )}
        <div className="row">
          <button
            onClick={() => {
              actions.zoomToFit(true);
            }}
          >
            {t('props.fit')}
          </button>
          <button className="danger" onClick={actions.deleteSelection}>
            {t('props.delete')}
          </button>
        </div>
      </section>
      {single && <DeckEditor hole={single} />}
    </>
  );
}
