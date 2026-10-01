import {
  degToRad,
  POWER_LAW_DEFAULTS,
  radToDeg,
  type Blast,
  type BlastDomain,
  type MuckpileParams,
  type MuckpileResult,
  type MuckpileWarning,
  type TopographySurveyId,
} from '@cronos/core';
import { turboCss } from '@cronos/engine';
import { lazy, Suspense, useState } from 'react';
import {
  calibrateMuckpileParams,
  compareMuckpile,
  exportMuckpile,
  requestMuckpile,
  simulateMuckpilePhysics,
} from '../analysis/muckpileActions';
import { errorScale, FRAGMENT_CLASS_COLORS, muckpileRange } from '../analysis/muckpileColors';
import { muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT, type MessageKey } from '../i18n';
import { getEngine, session } from '../session';
import { useAnalysisStore, type MuckpileColorBy } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';

const ProfileChart = lazy(() => import('../charts/ProfileChart'));

/** Velocidades del reproductor: segundos de secuencia por segundo real (0,1× a 2×). */
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];

const WARNINGS: Record<MuckpileWarning['id'], MessageKey> = {
  'muckpile.noFootprint': 'muckpile.warn.noFootprint',
  'muckpile.unblastedBoundaries': 'muckpile.warn.unblastedBoundaries',
  'muckpile.noChargedHoles': 'muckpile.warn.noChargedHoles',
  'muckpile.staticBlocks': 'muckpile.warn.staticBlocks',
  'muckpile.powerLawR0': 'muckpile.warn.powerLawR0',
  'muckpile.faceVelocityFlyrock': 'muckpile.warn.faceVelocityFlyrock',
  'muckpile.clipped': 'muckpile.warn.clipped',
  'muckpile.gridLimit': 'muckpile.warn.gridLimit',
};

/**
 * Desplazamiento de material y formación de la pila (A7): parámetros del modelo cinemático,
 * cálculo en el worker, resultados, capas, animación (rápida o física), sección, exportación,
 * dominios de material (dilución) y calibración contra un levantamiento post-voladura.
 */
export function MuckpilePanel() {
  const t = useT();
  const blast = useActiveBlast();
  const s = useAnalysisStore();
  const version = useAnalysisStore((x) => x.muckpileVersion);
  if (!blast) return null;
  const r = s.muckpile;
  const stale = r !== null && version !== session.document.version;
  return (
    <>
      <section className="panel">
        <h2>{t('muckpile.title')}</h2>
        <p className="hint">{t('muckpile.intro')}</p>
        <MuckpileParamsForm blast={blast} />
        <button
          className="primary"
          disabled={s.muckpileComputing}
          onClick={() => {
            requestMuckpile();
          }}
        >
          {s.muckpileComputing ? t('muckpile.computing') : t('muckpile.compute')}
        </button>
        {stale && <p className="hint warn">{t('muckpile.stale')}</p>}
      </section>
      {r && <MuckpileResults r={r} blast={blast} />}
      <DomainsSection blast={blast} />
      {r && <CalibrationSection blast={blast} />}
    </>
  );
}

function MuckpileParamsForm({ blast }: { blast: Blast }) {
  const t = useT();
  const { len } = useUnits();
  const p = blast.calcParams.muckpile;
  const set = (patch: Partial<MuckpileParams>, label: string) => {
    session.document.dispatch(
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { calcParams: { ...blast.calcParams, muckpile: { ...p, ...patch } } },
      },
      label,
    );
  };
  const deg = (key: 'launchAngleFloor' | 'launchAngleCrest' | 'reposeAngle', label: MessageKey) => (
    <NumberField
      label={t(label)}
      unit="°"
      decimals={1}
      min={0}
      max={89}
      value={radToDeg(p[key])}
      onCommit={(v) => {
        set({ [key]: degToRad(v) }, t(label));
      }}
    />
  );
  return (
    <>
      <label className="field">
        <span className="field-label">{t('muckpile.velocityModel')}</span>
        <select
          value={p.velocityModel}
          onChange={(e) => {
            const model = e.target.value as MuckpileParams['velocityModel'];
            set(
              model === 'zhang'
                ? { velocityModel: model }
                : { velocityModel: model, ...POWER_LAW_DEFAULTS[model] },
              t('muckpile.velocityModel'),
            );
          }}
        >
          <option value="zhang">{t('muckpile.model.zhang')}</option>
          <option value="scaledBurden">{t('muckpile.model.scaledBurden')}</option>
          <option value="richardsMoore">{t('muckpile.model.richardsMoore')}</option>
        </select>
      </label>
      <p className="hint">{t(`muckpile.model.${p.velocityModel}.hint`)}</p>
      {p.velocityModel !== 'zhang' && (
        <>
          <NumberField
            label="k"
            unit="m/s"
            decimals={2}
            min={0.01}
            value={p.k}
            onCommit={(v) => {
              set({ k: v }, 'k');
            }}
          />
          <NumberField
            label="n"
            decimals={2}
            min={0.01}
            value={p.n}
            onCommit={(v) => {
              set({ n: v }, 'n');
            }}
          />
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={p.launchFromFace}
          onChange={(e) => {
            set({ launchFromFace: e.target.checked }, t('muckpile.launchFromFace'));
          }}
        />
        {t('muckpile.launchFromFace')}
      </label>
      {deg('launchAngleFloor', 'muckpile.launchFloor')}
      {deg('launchAngleCrest', 'muckpile.launchCrest')}
      <p className="hint">
        {p.launchFromFace
          ? t('muckpile.launchFromFaceHint', {
              mid: Math.round(90 - radToDeg(blast.bench.faceAngle)),
              spread: Math.round(radToDeg(p.launchAngleCrest - p.launchAngleFloor)),
            })
          : t('muckpile.launchFixedHint')}
      </p>
      <NumberField
        label={t('muckpile.swell')}
        decimals={2}
        min={1}
        max={3}
        value={p.swell}
        onCommit={(v) => {
          set({ swell: v }, t('muckpile.swell'));
        }}
      />
      {deg('reposeAngle', 'muckpile.repose')}
      <NumberField
        label={t('muckpile.blockSize')}
        unit={len.unit}
        decimals={2}
        min={0.25}
        value={len.show(p.blockSize)}
        onCommit={(raw) => {
          set({ blockSize: len.parse(raw) }, t('muckpile.blockSize'));
        }}
      />
      <details>
        <summary>{t('muckpile.advanced')}</summary>
        <p className="hint">{t('muckpile.advancedHint')}</p>
        <NumberField
          label={t('muckpile.stemmingFactor')}
          decimals={2}
          min={0}
          max={1}
          value={p.stemmingFactor}
          onCommit={(v) => {
            set({ stemmingFactor: v }, t('muckpile.stemmingFactor'));
          }}
        />
        <NumberField
          label={t('muckpile.floorFactor')}
          decimals={2}
          min={0}
          max={1}
          value={p.floorFactor}
          onCommit={(v) => {
            set({ floorFactor: v }, t('muckpile.floorFactor'));
          }}
        />
        <NumberField
          label={t('muckpile.distanceDecay')}
          decimals={2}
          min={0}
          value={p.distanceDecay}
          onCommit={(v) => {
            set({ distanceDecay: v }, t('muckpile.distanceDecay'));
          }}
        />
        <p className="hint">
          {t('muckpile.rowFactorHint', { k: blast.calcParams.displacement.rowFactor })}
        </p>
      </details>
    </>
  );
}

function warningText(t: ReturnType<typeof useT>, w: MuckpileWarning): string {
  return 'params' in w ? t(WARNINGS[w.id], w.params) : t(WARNINGS[w.id]);
}

function MuckpileResults({ r, blast }: { r: MuckpileResult; blast: Blast }) {
  const t = useT();
  const fmt = useFormat();
  const { len, volume } = useUnits();
  const s = useAnalysisStore();
  const st = r.stats;
  const m = (v: number, d = 1) => `${fmt(len.show(v), d)} ${len.unit}`;
  const ui = useUiStore();
  const cuts = r.sizeClasses.slice(0, -1).map((c) => c.upper);
  const cumulative = r.sizeClasses.map((_, i) =>
    r.sizeClasses.slice(0, i + 1).reduce((sum, c) => sum + c.fraction, 0),
  );
  const range = muckpileRange(r, s.muckpileColorBy);
  const analysis = s.analysis;
  const end = muckpileEnd(r, s.muckpileMode === 'physics' ? s.muckpileFrames : null);
  const first = (Number.isFinite(st.firstLaunch) ? st.firstLaunch : 0) - 0.05;

  const play = () => {
    const engine = getEngine();
    if (!engine || !analysis) return;
    if (ui.viewMode !== '3d') ui.setViewMode('3d');
    s.setLayer('muckpileBlocks', true);
    engine.playSequence(sequenceTimes(analysis), s.sequenceSpeed, undefined, end);
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
    <>
      <section className="panel">
        <h2>
          {t('muckpile.results')}{' '}
          <span className="muted small">
            · {t('muckpile.blocksMs', { n: st.blocks, ms: fmt(r.elapsedMs) })}
          </span>
        </h2>
        {r.warnings.length > 0 && (
          <ul className="warnings">
            {r.warnings.map((w) => (
              <li key={w.id} className="hint warn">
                {warningText(t, w)}
              </li>
            ))}
          </ul>
        )}
        <table className="kv">
          <tbody>
            <tr>
              <td title={t('muckpile.throwHint')}>{t('muckpile.throw')}</td>
              <td className="num">{m(st.throw)}</td>
            </tr>
            <tr>
              <td>{t('muckpile.displacement')}</td>
              <td className="num">
                {m(st.meanDisplacement)} · {t('muckpile.max')} {m(st.maxDisplacement)}
              </td>
            </tr>
            <tr>
              <td title={t('muckpile.dropHint')}>{t('muckpile.drop')}</td>
              <td className="num">
                {m(st.meanDrop)} · {t('muckpile.max')} {m(st.maxDrop)}
              </td>
            </tr>
            <tr>
              <td>{t('muckpile.lateral')}</td>
              <td className="num">{m(st.lateralSpread)}</td>
            </tr>
            <tr>
              <td>{t('muckpile.maxHeight')}</td>
              <td className="num">{m(st.maxHeight)}</td>
            </tr>
            <tr>
              <td>{t('muckpile.inSitu')}</td>
              <td className="num">
                {fmt(volume.show(st.inSituVolume))} {volume.unit}
              </td>
            </tr>
            <tr>
              <td>{t('muckpile.swollen')}</td>
              <td className="num">
                {fmt(volume.show(st.pileVolume))} {volume.unit} (
                {t('muckpile.volumeCheck', { e: fmt(st.volumeError * 100, 2) })})
              </td>
            </tr>
          </tbody>
        </table>

        <label className="field">
          <span className="field-label">{t('muckpile.colorBy')}</span>
          <select
            value={s.muckpileColorBy}
            onChange={(e) => {
              s.set({ muckpileColorBy: e.target.value as MuckpileColorBy });
            }}
          >
            <option value="fragment">{t('muckpile.color.fragment')}</option>
            <option value="displacement">{t('muckpile.color.displacement')}</option>
            <option value="domain">{t('muckpile.color.domain')}</option>
            <option value="launch">{t('muckpile.color.launch')}</option>
            {s.muckpileCompare && <option value="error">{t('muckpile.color.error')}</option>}
          </select>
        </label>
        {(s.muckpileColorBy === 'displacement' || s.muckpileColorBy === 'launch') && (
          <div className="legend">
            <div
              className="gradient"
              style={{
                background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((x) => turboCss(x)).join(',')})`,
              }}
            />
            <div className="legend-labels">
              <span>
                {s.muckpileColorBy === 'launch' ? `${fmt(range[0] * 1000)} ms` : m(range[0])}
              </span>
              <span>
                {s.muckpileColorBy === 'launch' ? `${fmt(range[1] * 1000)} ms` : m(range[1])}
              </span>
            </div>
          </div>
        )}
        {s.muckpileColorBy === 'error' && s.muckpileCompare && (
          <div className="legend">
            <div
              className="gradient"
              style={{ background: 'linear-gradient(to right, #2166ac, #f0f0f0, #b2182b)' }}
            />
            <div className="legend-labels">
              <span>−{m(errorScale(s.muckpileCompare), 2)}</span>
              <span>0</span>
              <span>+{m(errorScale(s.muckpileCompare), 2)}</span>
            </div>
          </div>
        )}
        {s.muckpileColorBy === 'domain' && (
          <div className="legend-row">
            {(blast.domains ?? []).length === 0 && (
              <span className="muted">{t('muckpile.noDomains')}</span>
            )}
            {(blast.domains ?? []).map((d) => (
              <span key={d.id} className="legend-chip">
                <i style={{ background: d.color, height: 10, width: 10 }} /> {d.name}
              </span>
            ))}
          </div>
        )}
        <h3>{t('muckpile.sizeClasses')}</h3>
        <p className="hint">{t('muckpile.sizeClassesHint')}</p>
        <table className="grid-table compact">
          <thead>
            <tr>
              <th>{t('muckpile.class')}</th>
              <th>%</th>
              <th>{t('muckpile.cumulative')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {r.sizeClasses.map((c, i) => {
              const lower = i === 0 ? 0 : (cuts[i - 1] ?? 0);
              return (
                <tr key={c.upper}>
                  <td>
                    {Number.isFinite(c.upper)
                      ? `${fmt(lower * 1000)}–${fmt(c.upper * 1000)} mm`
                      : `> ${fmt(lower * 1000)} mm`}
                  </td>
                  <td className="num">{fmt(c.fraction * 100, 1)}</td>
                  <td className="num">{fmt((cumulative[i] ?? 0) * 100, 1)}</td>
                  <td>
                    <i
                      className="swatch"
                      style={{
                        background:
                          FRAGMENT_CLASS_COLORS[Math.min(i, FRAGMENT_CLASS_COLORS.length - 1)],
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>{t('muckpile.layers')}</h2>
        <div className="checks">
          {(
            [
              ['muckpile', 'muckpile.layer.surface'],
              ['muckpileBefore', 'muckpile.layer.before'],
              ['muckpileVectors', 'muckpile.layer.vectors'],
              ['muckpileBlocks', 'muckpile.layer.blocks'],
              ['domains', 'muckpile.layer.domains'],
              ['faces', 'muckpile.layer.faces'],
              ['benchPlanes', 'muckpile.layer.benchPlanes'],
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
          <span className="field-label">{t('muckpile.opacity')}</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={s.muckpileOpacity}
            onChange={(e) => {
              s.set({ muckpileOpacity: Number(e.target.value) });
            }}
          />
        </label>
        <p className="hint">{t('muckpile.layersHint')}</p>
      </section>

      <section className="panel">
        <h2>{t('muckpile.animation')}</h2>
        <label className="field">
          <span className="field-label">{t('muckpile.mode')}</span>
          <select
            value={s.muckpileMode}
            onChange={(e) => {
              s.set({ muckpileMode: e.target.value as 'fast' | 'physics' });
            }}
          >
            <option value="fast">{t('muckpile.mode.fast')}</option>
            <option value="physics" disabled={!s.muckpileFrames}>
              {t('muckpile.mode.physics')}
            </option>
          </select>
        </label>
        <p className="hint">{t('muckpile.modeHint')}</p>
        <button
          disabled={s.muckpilePhysicsProgress !== null}
          onClick={() => {
            void simulateMuckpilePhysics(3000);
          }}
        >
          {s.muckpilePhysicsProgress !== null
            ? t('muckpile.physics.running', { p: fmt(s.muckpilePhysicsProgress * 100) })
            : t('muckpile.physics.run')}
        </button>
        {!analysis || analysis.timing.initiated === 0 ? (
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
                title={t('muckpile.speed')}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  s.set({ sequenceSpeed: v });
                  getEngine()?.setSequenceSpeed(v);
                }}
              >
                {!SPEEDS.includes(s.sequenceSpeed) && (
                  <option value={s.sequenceSpeed}>{fmt(s.sequenceSpeed, 2)}×</option>
                )}
                {SPEEDS.map((v) => (
                  <option key={v} value={v}>
                    {fmt(v, v < 1 ? 2 : 0)}×
                  </option>
                ))}
              </select>
            </div>
            <input
              className="slider"
              type="range"
              min={first * 1000}
              max={end * 1000}
              step={1}
              value={(s.sequenceTime ?? first) * 1000}
              onChange={(e) => {
                if (ui.viewMode !== '3d') ui.setViewMode('3d');
                getEngine()?.seekSequence(sequenceTimes(analysis), Number(e.target.value) / 1000);
                s.set({ sequencePlaying: false });
              }}
            />
            <p className="muted mono">
              t = {s.sequenceTime === null ? '—' : `${fmt(s.sequenceTime * 1000)} ms`} ·{' '}
              {t('muckpile.lastImpact', { ms: fmt(st.lastImpact * 1000) })}
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>{t('muckpile.section')}</h2>
        <div className="row">
          <button
            className={ui.tool === 'section' ? 'active' : ''}
            onClick={() => {
              if (ui.viewMode !== 'plan') ui.setViewMode('plan');
              ui.setTool('section');
            }}
          >
            {t('muckpile.drawSection')}
          </button>
          <button
            disabled={!s.muckpileSection}
            onClick={() => {
              s.set({ muckpileSection: null });
            }}
          >
            {t('muckpile.clearSection')}
          </button>
        </div>
        <p className="hint">{t('muckpile.sectionHint')}</p>
        {s.muckpileProfile && (
          <>
            <Suspense fallback={<p className="hint">…</p>}>
              <ProfileChart profile={s.muckpileProfile} toUi={len.show} unit={len.unit} />
            </Suspense>
            <table className="kv">
              <tbody>
                <tr>
                  <td>{t('muckpile.section.throw')}</td>
                  <td className="num">{m(s.muckpileProfile.throw.value)}</td>
                </tr>
                <tr>
                  <td>{t('muckpile.section.drop')}</td>
                  <td className="num">{m(s.muckpileProfile.maxDrop.value, 2)}</td>
                </tr>
                <tr>
                  <td>{t('muckpile.section.rise')}</td>
                  <td className="num">{m(s.muckpileProfile.maxRise.value, 2)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h2>{t('muckpile.export')}</h2>
        <div className="button-grid">
          <button onClick={() => void exportMuckpile('xyz')}>{t('muckpile.export.xyz')}</button>
          <button onClick={() => void exportMuckpile('obj')}>OBJ</button>
          <button onClick={() => void exportMuckpile('stl')}>STL</button>
          <button onClick={() => void exportMuckpile('vectors')}>
            {t('muckpile.export.vectors')}
          </button>
        </div>
        <p className="hint">{t('muckpile.exportHint')}</p>
      </section>
    </>
  );
}

function DomainsSection({ blast }: { blast: Blast }) {
  const t = useT();
  const ui = useUiStore();
  const domains = blast.domains ?? [];
  const setDomains = (next: BlastDomain[], label: string) => {
    session.document.dispatch(
      { type: 'blast/patch', blastId: blast.id, patch: { domains: next } },
      label,
    );
  };
  const replace = (d: BlastDomain, next: BlastDomain, label: string) => {
    setDomains(
      domains.map((x) => (x.id === d.id ? next : x)),
      label,
    );
  };
  const edit = (d: BlastDomain, patch: Partial<BlastDomain>, label: string) => {
    replace(d, { ...d, ...patch }, label);
  };
  const clearGrade = (d: BlastDomain) => {
    const next = { ...d };
    delete next.grade;
    replace(d, next, t('muckpile.domain.grade'));
  };
  return (
    <section className="panel">
      <h2>{t('muckpile.domains')}</h2>
      <p className="hint">{t('muckpile.domainsHint')}</p>
      <button
        className={ui.tool === 'domain' ? 'active' : ''}
        onClick={() => {
          if (ui.viewMode !== 'plan') ui.setViewMode('plan');
          ui.setTool('domain');
        }}
      >
        {t('muckpile.drawDomain')}
      </button>
      {domains.length > 0 && (
        <table className="grid-table compact">
          <thead>
            <tr>
              <th />
              <th>{t('muckpile.domain.name')}</th>
              <th>{t('muckpile.domain.material')}</th>
              <th>{t('muckpile.domain.grade')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id}>
                <td>
                  <input
                    type="color"
                    value={d.color}
                    aria-label={t('muckpile.domain.color')}
                    onChange={(e) => {
                      edit(d, { color: e.target.value }, t('muckpile.domain.color'));
                    }}
                  />
                </td>
                <td>
                  <input
                    defaultValue={d.name}
                    onBlur={(e) => {
                      if (e.target.value !== d.name)
                        edit(d, { name: e.target.value }, t('muckpile.domain.name'));
                    }}
                  />
                </td>
                <td>
                  <input
                    defaultValue={d.material}
                    onBlur={(e) => {
                      if (e.target.value !== d.material)
                        edit(d, { material: e.target.value }, t('muckpile.domain.material'));
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    defaultValue={d.grade ?? ''}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const v = Number(raw.replace(',', '.'));
                      if (raw === '') {
                        if (d.grade !== undefined) clearGrade(d);
                      } else if (Number.isFinite(v) && v !== d.grade)
                        edit(d, { grade: v }, t('muckpile.domain.grade'));
                    }}
                  />
                </td>
                <td>
                  <button
                    title={t('muckpile.domain.delete')}
                    onClick={() => {
                      setDomains(
                        domains.filter((x) => x.id !== d.id),
                        t('muckpile.domain.delete'),
                      );
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CalibrationSection({ blast }: { blast: Blast }) {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const project = useProject();
  const s = useAnalysisStore();
  const surveys = project.topography.filter((x) => x.id !== blast.bench.topographyId);
  const [surveyId, setSurveyId] = useState<TopographySurveyId | ''>(surveys[0]?.id ?? '');
  const p = blast.calcParams.muckpile;
  const k0 = p.velocityModel === 'zhang' ? POWER_LAW_DEFAULTS.scaledBurden : p;
  const [ranges, setRanges] = useState({
    kMin: Math.max(0.5, k0.k * 0.5),
    kMax: k0.k * 1.5,
    kSteps: 7,
    nMin: Math.max(0.2, k0.n - 0.4),
    nMax: k0.n + 0.4,
    nSteps: 5,
  });
  const c = s.muckpileCompare;
  const cal = s.muckpileCalibration;
  const m = (v: number) => `${fmt(len.show(v), 2)} ${len.unit}`;
  const apply = () => {
    if (!cal?.best) return;
    session.document.dispatch(
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: {
          calcParams: {
            ...blast.calcParams,
            muckpile: { ...p, velocityModel: cal.velocityModel, k: cal.best.k, n: cal.best.n },
          },
        },
      },
      t('muckpile.cal.apply'),
    );
  };
  return (
    <section className="panel">
      <h2>{t('muckpile.calibration')}</h2>
      <p className="hint">{t('muckpile.calHint')}</p>
      {surveys.length === 0 ? (
        <p className="hint">{t('muckpile.cal.noSurvey')}</p>
      ) : (
        <>
          <label className="field">
            <span className="field-label">{t('muckpile.cal.survey')}</span>
            <select
              value={surveyId}
              onChange={(e) => {
                setSurveyId(e.target.value as TopographySurveyId);
              }}
            >
              {surveys.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.surveyDate}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!surveyId}
            onClick={() => {
              if (!surveyId) return;
              void compareMuckpile(surveyId).then(() => {
                useAnalysisStore.getState().set({ muckpileColorBy: 'error' });
              });
            }}
          >
            {t('muckpile.cal.compare')}
          </button>
          {c && (
            <table className="kv">
              <tbody>
                <tr>
                  <td>RMSE</td>
                  <td className="num">{m(c.rmse)}</td>
                </tr>
                <tr>
                  <td>{t('muckpile.cal.bias')}</td>
                  <td className="num">{m(c.meanError)}</td>
                </tr>
                <tr>
                  <td>{t('muckpile.cal.maxAbs')}</td>
                  <td className="num">{m(c.maxAbsError)}</td>
                </tr>
                <tr>
                  <td>{t('muckpile.cal.cells')}</td>
                  <td className="num">{fmt(c.cells)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <h3>{t('muckpile.cal.grid')}</h3>
          <p className="hint">{t('muckpile.cal.gridHint')}</p>
          <NumberField
            label="k min"
            decimals={2}
            min={0.01}
            value={ranges.kMin}
            onCommit={(v) => {
              setRanges({ ...ranges, kMin: v });
            }}
          />
          <NumberField
            label="k max"
            decimals={2}
            min={0.01}
            value={ranges.kMax}
            onCommit={(v) => {
              setRanges({ ...ranges, kMax: v });
            }}
          />
          <NumberField
            label={t('muckpile.cal.steps')}
            decimals={0}
            integer
            min={1}
            max={25}
            value={ranges.kSteps}
            onCommit={(v) => {
              setRanges({ ...ranges, kSteps: v });
            }}
          />
          <NumberField
            label="n min"
            decimals={2}
            min={0.01}
            value={ranges.nMin}
            onCommit={(v) => {
              setRanges({ ...ranges, nMin: v });
            }}
          />
          <NumberField
            label="n max"
            decimals={2}
            min={0.01}
            value={ranges.nMax}
            onCommit={(v) => {
              setRanges({ ...ranges, nMax: v });
            }}
          />
          <NumberField
            label={t('muckpile.cal.steps')}
            decimals={0}
            integer
            min={1}
            max={25}
            value={ranges.nSteps}
            onCommit={(v) => {
              setRanges({ ...ranges, nSteps: v });
            }}
          />
          <button
            disabled={!surveyId || s.muckpileCalibrating !== null}
            onClick={() => {
              if (!surveyId) return;
              void calibrateMuckpileParams(surveyId, {
                k: { min: ranges.kMin, max: ranges.kMax, steps: ranges.kSteps },
                n: { min: ranges.nMin, max: ranges.nMax, steps: ranges.nSteps },
              });
            }}
          >
            {s.muckpileCalibrating !== null
              ? t('muckpile.cal.running', { p: fmt(s.muckpileCalibrating * 100) })
              : t('muckpile.cal.run', { n: ranges.kSteps * ranges.nSteps })}
          </button>
          {cal?.best && (
            <>
              <p className="hint">
                {t('muckpile.cal.best', {
                  model: t(`muckpile.model.${cal.velocityModel}`),
                  k: fmt(cal.best.k, 2),
                  n: fmt(cal.best.n, 2),
                  rmse: m(cal.best.rmse),
                  s: fmt(cal.elapsedMs / 1000, 1),
                })}
              </p>
              <button onClick={apply}>{t('muckpile.cal.apply')}</button>
            </>
          )}
        </>
      )}
    </section>
  );
}
