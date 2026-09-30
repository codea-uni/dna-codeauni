import type { Blast, BlastAnalysis } from '@cronos/core';
import { turboCss } from '@cronos/engine';
import { colorRange, sequenceTimes, SDOB_COLORS } from '../analysis/visualize';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { getEngine, session } from '../session';
import { useAnalysisStore, type ColorBy, type LabelBy } from '../stores/analysisStore';

const SPEEDS = [
  { value: 0.02, label: '1/50×' },
  { value: 0.05, label: '1/20×' },
  { value: 0.1, label: '1/10×' },
  { value: 0.25, label: '1/4×' },
  { value: 1, label: '1×' },
];

function formatValue(v: number, mode: ColorBy): string {
  if (mode === 'time') return `${(v * 1000).toFixed(0)} ms`;
  if (mode === 'kg') return `${v.toFixed(0)} kg`;
  if (mode === 'effectiveBurden') return `${v.toFixed(1)} m`;
  return `${v.toFixed(2)} kg/m³`;
}

const SDOB_BANDS = [
  'view.sdob.crater',
  'view.sdob.uncontrolled',
  'view.sdob.controlled',
  'view.sdob.veryControlled',
  'view.sdob.minimal',
] as const;

/** Opciones de visualización del diseño y animación de la secuencia. */
export function ViewPanel() {
  const t = useT();
  const s = useAnalysisStore();
  const blast = useActiveBlast();
  const hasTopography = useProject().topography.length > 0;
  const { analysis } = s;
  const range = analysis ? colorRange(analysis, s.colorBy) : null;
  const timing = analysis?.timing;
  const hasTimes = timing !== undefined && timing.initiated > 0;

  const play = () => {
    const engine = getEngine();
    if (!engine || !analysis) return;
    engine.playSequence(sequenceTimes(analysis), s.sequenceSpeed);
    s.set({ sequencePlaying: true });
  };
  const pause = () => {
    getEngine()?.pauseSequence();
    s.set({ sequencePlaying: false });
  };
  const stop = () => {
    getEngine()?.stopSequence();
    s.set({ sequencePlaying: false, sequenceTime: null });
  };

  return (
    <section className="panel">
      <h2>{t('view.title')}</h2>
      <label className="field">
        <span className="field-label">{t('view.colorBy')}</span>
        <select
          value={s.colorBy}
          onChange={(e) => {
            s.set({ colorBy: e.target.value as ColorBy });
          }}
        >
          <option value="none">{t('view.color.none')}</option>
          <option value="time">{t('view.color.time')}</option>
          <option value="kg">{t('view.color.kg')}</option>
          <option value="powderFactor">{t('view.color.powderFactor')}</option>
          <option value="effectiveBurden">{t('view.color.effectiveBurden')}</option>
          <option value="sdob">{t('view.color.sdob')}</option>
          <option value="group">{t('view.color.group')}</option>
        </select>
      </label>
      {s.colorBy === 'sdob' && blast && (
        <div className="legend-row">
          {SDOB_BANDS.map((key, i) => (
            <span key={key} className="legend-chip">
              <i style={{ background: SDOB_COLORS[i], height: 10, width: 10 }} /> {t(key)}
            </span>
          ))}
          <span className="muted">
            {t('view.sdobCuts', { cuts: blast.calcParams.sdobBands.join(' · ') })}
          </span>
        </div>
      )}
      {s.colorBy === 'group' && blast && (
        <div className="legend-row">
          {blast.groups.length === 0 && <span className="muted">{t('view.noGroups')}</span>}
          {blast.groups.map((g) => (
            <span key={g.id} className="legend-chip">
              <i style={{ background: g.color, height: 10, width: 10 }} /> {g.name}
            </span>
          ))}
        </div>
      )}
      {range && (
        <div className="legend">
          <div
            className="gradient"
            style={{
              background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => turboCss(t)).join(',')})`,
            }}
          />
          <div className="legend-labels">
            <span>{formatValue(range[0], s.colorBy)}</span>
            <span>{formatValue(range[1], s.colorBy)}</span>
          </div>
        </div>
      )}
      <label className="field">
        <span className="field-label">{t('view.labels')}</span>
        <select
          value={s.labelBy}
          onChange={(e) => {
            s.set({ labelBy: e.target.value as LabelBy });
          }}
        >
          <option value="label">{t('view.label.name')}</option>
          <option value="time">{t('view.label.time')}</option>
          <option value="kg">kg</option>
        </select>
      </label>
      <div className="checks">
        {(
          [
            ['connections', 'view.layer.connections'],
            ['isochrones', 'view.layer.isochrones'],
            ['labels', 'view.labels'],
            ['traces', 'view.layer.traces'],
            ['displacement', 'view.layer.displacement'],
          ] as const
        ).map(([layer, label]) => (
          <label key={layer} className="check">
            <input
              type="checkbox"
              checked={s.layers[layer]}
              onChange={(e) => {
                s.setLayer(layer, e.target.checked);
              }}
            />
            {t(label)}
          </label>
        ))}
      </div>
      {s.layers.displacement && blast && analysis && (
        <DisplacementParams blast={blast} analysis={analysis} />
      )}
      {hasTopography && <TopographyView />}
      <label className="field">
        <span className="field-label">{t('view.isochroneInterval')}</span>
        <span className="field-input">
          <input
            type="number"
            min={0}
            step={5}
            value={s.isochroneIntervalMs}
            title={t('view.autoZero')}
            onChange={(e) => {
              s.set({ isochroneIntervalMs: Math.max(0, Number(e.target.value)) });
            }}
          />
          <span className="field-unit">ms</span>
        </span>
      </label>
      {blast && (
        <NumberField
          label={t('view.micWindow')}
          unit="ms"
          decimals={1}
          min={0.1}
          value={blast.calcParams.micWindow * 1000}
          onCommit={(ms) => {
            session.document.dispatch(
              {
                type: 'blast/patch',
                blastId: blast.id,
                patch: { calcParams: { ...blast.calcParams, micWindow: ms / 1000 } },
              },
              t('view.micWindow'),
            );
          }}
        />
      )}

      <h3>{t('view.sequence')}</h3>
      {!hasTimes ? (
        <p className="hint">{t('view.noTimes')}</p>
      ) : (
        <>
          <div className="row">
            {s.sequencePlaying ? (
              <button onClick={pause}>⏸ {t('view.pause')}</button>
            ) : (
              <button onClick={play}>▶ {t('view.play')}</button>
            )}
            <button onClick={stop} disabled={s.sequenceTime === null}>
              ⏹
            </button>
            <select
              value={s.sequenceSpeed}
              onChange={(e) => {
                const v = Number(e.target.value);
                s.set({ sequenceSpeed: v });
                getEngine()?.setSequenceSpeed(v);
              }}
            >
              {SPEEDS.map((sp) => (
                <option key={sp.value} value={sp.value}>
                  {sp.label}
                </option>
              ))}
            </select>
          </div>
          <input
            className="slider"
            type="range"
            min={(timing.firstTime - 0.02) * 1000}
            max={(timing.lastTime + 0.02) * 1000}
            step={1}
            value={(s.sequenceTime ?? timing.firstTime - 0.02) * 1000}
            onChange={(e) => {
              if (!analysis) return;
              getEngine()?.seekSequence(sequenceTimes(analysis), Number(e.target.value) / 1000);
              s.set({ sequencePlaying: false });
            }}
          />
          <p className="muted mono">
            t = {s.sequenceTime === null ? '—' : `${(s.sequenceTime * 1000).toFixed(0)} ms`}
          </p>
        </>
      )}
    </section>
  );
}

/** Parámetros y resumen del desplazamiento (A5, Zhang et al. 2021; P-21). */
function DisplacementParams({ blast, analysis }: { blast: Blast; analysis: BlastAnalysis }) {
  const t = useT();
  const fmt = useFormat();
  const dp = blast.calcParams.displacement;
  const set = (patch: Partial<typeof dp>, label: string) => {
    session.document.dispatch(
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { calcParams: { ...blast.calcParams, displacement: { ...dp, ...patch } } },
      },
      label,
    );
  };
  const { velocity, range, excluded } = analysis.displacement;
  const finite = (a: Float64Array) => [...a].filter((v) => Number.isFinite(v));
  const vMax = Math.max(0, ...finite(velocity));
  const rMax = Math.max(0, ...finite(range));
  return (
    <>
      <NumberField
        label={t('view.disp.cB')}
        decimals={2}
        min={0.01}
        max={1}
        value={dp.cB}
        onCommit={(v) => {
          set({ cB: v }, t('view.disp.cB'));
        }}
      />
      <NumberField
        label={t('view.disp.rowFactor')}
        decimals={2}
        min={0.1}
        max={1}
        value={dp.rowFactor}
        onCommit={(v) => {
          set({ rowFactor: v }, t('view.disp.rowFactor'));
        }}
      />
      <p className="hint">
        {t('view.disp.summary', { v: fmt(vMax, 1), r: fmt(rMax, 1) })}
        {excluded > 0 && ` ${t('view.disp.excluded', { n: excluded })}`}
      </p>
      <p className="hint">{t('view.disp.source')}</p>
    </>
  );
}

/** Capas de la topografía, intervalo de curvas y opacidad del relieve. */
function TopographyView() {
  const t = useT();
  const s = useAnalysisStore();
  return (
    <>
      <h3>{t('topo.section')}</h3>
      <div className="checks">
        {(
          [
            ['topoImage', 'topo.layer.image'],
            ['topoShade', 'topo.layer.shade'],
            ['topoContours', 'topo.layer.contours'],
            ['topoLines', 'topo.layer.lines'],
          ] as const
        ).map(([layer, label]) => (
          <label key={layer} className="check">
            <input
              type="checkbox"
              checked={s.layers[layer]}
              onChange={(e) => {
                s.setLayer(layer, e.target.checked);
              }}
            />
            {t(label)}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field-label">{t('topo.contourInterval')}</span>
        <span className="field-input">
          <input
            type="number"
            min={0}
            step={0.5}
            value={s.topoContourInterval}
            title={t('view.autoZero')}
            onChange={(e) => {
              s.set({ topoContourInterval: Math.max(0, Number(e.target.value)) });
            }}
          />
          <span className="field-unit">m</span>
        </span>
      </label>
      <label className="field">
        <span className="field-label">{t('topo.shadeOpacity')}</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={s.topoShadeOpacity}
          onChange={(e) => {
            s.set({ topoShadeOpacity: Number(e.target.value) });
          }}
        />
      </label>
    </>
  );
}
