import { commands, DEFAULT_NEAR_FIELD, type EnergyMetric } from '@cronos/core';
import { turboCss } from '@cronos/engine';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUnits } from '../hooks/useUnits';

/** Energía: PPV de campo cercano (Holmberg–Persson) o densidad de carga en un plano horizontal. */
export function EnergyPanel() {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const project = useProject();
  const blast = useActiveBlast();
  const s = useAnalysisStore();
  const nf = project.siteModels.nearField ?? DEFAULT_NEAR_FIELD;
  const isPpv = s.energyMetric === 'nearFieldPpv';
  const unit = isPpv ? 'mm/s' : 'kg/m³';
  const toUi = isPpv ? 1000 : 1;
  const midBench = blast ? blast.bench.floorElevation + blast.bench.height / 2 : 0;
  const [levelsText, setLevelsText] = useState(s.energyLevels.join('; '));
  const e = s.energy;

  const setNearField = (patch: Partial<typeof nf>) => {
    session.document.dispatch(
      commands.setSiteModels({ ...project.siteModels, nearField: { ...nf, ...patch } }),
      t('energy.undoNearField'),
    );
  };
  const commitLevels = () => {
    const levels = levelsText
      .split(/[;\s]+/)
      .map((x) => Number(x.replace(',', '.')))
      .filter((v) => Number.isFinite(v) && v > 0);
    s.set({ energyLevels: levels });
    setLevelsText(levels.join('; '));
  };

  return (
    <>
      <section className="panel">
        <h2>{t('energy.title')}</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.energyEnabled}
            onChange={(ev) => {
              s.set({ energyEnabled: ev.target.checked });
            }}
          />
          {t('energy.enabled')}
        </label>
        <label className="field">
          <span className="field-label">{t('energy.metric')}</span>
          <select
            value={s.energyMetric}
            onChange={(ev) => {
              s.set({ energyMetric: ev.target.value as EnergyMetric, energyLevels: [] });
              setLevelsText('');
            }}
          >
            <option value="nearFieldPpv">{t('energy.metric.ppv')}</option>
            <option value="chargeDensity">{t('energy.metric.density')}</option>
          </select>
        </label>
        <NumberField
          label={t('energy.elevation')}
          unit={len.unit}
          decimals={2}
          value={len.show(s.energyElevation ?? midBench)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            s.set({ energyElevation: v });
          }}
        />
        <button
          disabled={s.energyElevation === null}
          onClick={() => {
            s.set({ energyElevation: null });
          }}
        >
          {t('energy.midBench', { v: fmt(len.show(midBench), 1), unit: len.unit })}
        </button>
        <NumberField
          label={t('energy.cellSize')}
          unit={len.unit}
          decimals={2}
          min={0}
          value={len.show(s.energyCellSize)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            s.set({ energyCellSize: v });
          }}
        />
        <NumberField
          label={t('energy.cutoff')}
          unit={len.unit}
          decimals={1}
          min={0}
          value={len.show(s.energyCutoff)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            s.set({ energyCutoff: v });
          }}
        />
        <p className="hint">{t('energy.autoHint')}</p>
        {isPpv ? (
          <>
            <h3>{t('energy.siteConstants')}</h3>
            <p className="hint">{t('energy.formulaHint')}</p>
            <NumberField
              label="K"
              unit="mm/s"
              decimals={0}
              min={1}
              value={nf.k * 1000}
              onCommit={(v) => {
                setNearField({ k: v / 1000 });
              }}
            />
            <NumberField
              label="α"
              decimals={3}
              min={0.01}
              value={nf.alpha}
              onCommit={(v) => {
                setNearField({ alpha: v });
              }}
            />
            <NumberField
              label="β"
              decimals={3}
              min={0.01}
              value={nf.beta}
              onCommit={(v) => {
                setNearField({ beta: v });
              }}
            />
          </>
        ) : (
          <NumberField
            label={t('energy.sigma')}
            unit={len.unit}
            decimals={2}
            min={0.1}
            value={len.show(s.energySigma)}
            onCommit={(raw) => {
              const v = len.parse(raw);
              s.set({ energySigma: v });
            }}
          />
        )}
        <label className="field">
          <span className="field-label">{t('energy.contours', { unit })}</span>
          <input
            value={levelsText}
            placeholder={t('energy.autoPlaceholder')}
            onChange={(ev) => {
              setLevelsText(ev.target.value);
            }}
            onBlur={commitLevels}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') ev.currentTarget.blur();
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('energy.opacity')}</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={s.energyOpacity}
            onChange={(ev) => {
              s.set({ energyOpacity: Number(ev.target.value) });
            }}
          />
        </label>
      </section>

      {s.energyEnabled && (
        <section className="panel">
          <h2>
            {t('energy.result')}{' '}
            <span className="muted small">
              {s.energyComputing
                ? t('results.computingSuffix')
                : e
                  ? `· ${fmt(e.elapsedMs)} ms`
                  : ''}
            </span>
          </h2>
          {!e || e.nx === 0 ? (
            <p className="hint">{t('energy.noLoaded')}</p>
          ) : (
            <>
              <div className="legend">
                <div
                  className="gradient"
                  style={{
                    background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => turboCss(t)).join(',')})`,
                  }}
                />
                <div className="legend-labels">
                  <span>
                    {fmt(e.colorMin * toUi, isPpv ? 0 : 2)} {unit}
                  </span>
                  <span>{e.colorLog ? t('energy.logScale') : ''}</span>
                  <span>
                    {fmt(e.colorMax * toUi, isPpv ? 0 : 2)} {unit}
                  </span>
                </div>
              </div>
              <table className="kv">
                <tbody>
                  <tr>
                    <td>{t('energy.max')}</td>
                    <td className="num">
                      {fmt(e.max * toUi, isPpv ? 0 : 2)} {unit}
                    </td>
                  </tr>
                  <tr>
                    <td>{t('energy.grid')}</td>
                    <td className="num">
                      {t('energy.gridValue', {
                        nx: e.nx,
                        ny: e.ny,
                        cell: fmt(len.show(e.cellSize), 2),
                        unit: len.unit,
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
              <h3>{t('energy.areaAbove')}</h3>
              <table className="grid-table compact">
                <thead>
                  <tr>
                    <th>≥ {unit}</th>
                    <th>m²</th>
                  </tr>
                </thead>
                <tbody>
                  {e.contourLevels.map((l, i) => (
                    <tr key={l}>
                      <td>{fmt(l * toUi, isPpv ? 0 : 3)}</td>
                      <td className="num">{fmt(e.areaAbove[i] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.layers.energy}
                  onChange={(ev) => {
                    s.setLayer('energy', ev.target.checked);
                  }}
                />
                {t('energy.showOnMap')}
              </label>
            </>
          )}
        </section>
      )}
    </>
  );
}
