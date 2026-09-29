import {
  commands,
  type MonitoringPointId,
  type PpvLimit,
  type VibrationMetric,
} from '@cronos/core';
import { turboCss } from '@cronos/engine';
import { MapPin, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NumberCell, TextCell } from '../components/CellInput';
import { NumberField } from '../components/NumberField';
import { useProject } from '../hooks/useDocument';
import { useFormat, useT, type MessageKey } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';

const dB = (pa: number) => (pa > 0 ? 20 * Math.log10(pa / 20e-6) : 0);

/** Vibración (PPV), sobrepresión y flyrock (Lundborg). */
export function VibrationPanel() {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const project = useProject();
  const s = useAnalysisStore();
  const setTool = useUiStore((st) => st.setTool);
  const tool = useUiStore((st) => st.tool);
  const site = project.siteModels;
  const law = site.vibrationLaws.find((l) => l.id === s.vibLawId) ?? site.vibrationLaws[0];
  const isPpv = s.vibMetric === 'ppv';
  const v = s.vibration;
  const [levelsText, setLevelsText] = useState(s.vibLevels.join('; '));
  const unit = isPpv ? 'mm/s' : 'dB';
  const toUi = (x: number) => (isPpv ? x * 1000 : dB(x));

  const setSite = (patch: Partial<typeof site>, label: string) => {
    session.document.dispatch(commands.setSiteModels({ ...site, ...patch }), label);
  };
  const setLaw = (patch: Partial<NonNullable<typeof law>>) => {
    if (!law) return;
    setSite(
      { vibrationLaws: site.vibrationLaws.map((l) => (l.id === law.id ? { ...l, ...patch } : l)) },
      t('vib.undoLaw'),
    );
  };
  const commitLevels = () => {
    const levels = levelsText
      .split(/[;\s]+/)
      .map((x) => Number(x.replace(',', '.')))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    s.set({ vibLevels: levels });
    setLevelsText(levels.join('; '));
  };

  return (
    <>
      <section className="panel">
        <h2>{t('vib.title')}</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.vibEnabled}
            onChange={(e) => {
              s.set({ vibEnabled: e.target.checked });
            }}
          />
          {t('vib.enabled')}
        </label>
        <div className="segmented" role="radiogroup" aria-label={t('vib.metric')}>
          {(
            [
              ['ppv', 'PPV'],
              ['airblast', t('vib.airblast')],
            ] as [VibrationMetric, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              role="radio"
              aria-checked={s.vibMetric === m}
              className={s.vibMetric === m ? 'active' : ''}
              onClick={() => {
                s.set({ vibMetric: m, vibLevels: [] });
                setLevelsText('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {v && v.nx > 0 && (
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
                  {fmt(toUi(v.colorMin), isPpv ? 0 : 0)} {unit}
                </span>
                <span>
                  {fmt(toUi(v.colorMax), 0)} {unit}
                </span>
              </div>
            </div>
            <table className="kv">
              <tbody>
                <tr>
                  <td title={t('vib.micTitle')}>{t('vib.mic')}</td>
                  <td className="num">{fmt(v.mic)} kg</td>
                </tr>
                {v.micExtended && (
                  <tr>
                    <td title={t('vib.extendedTitle')}>
                      {t('vib.extended', { ms: fmt(v.micExtended.window * 1000, 0) })}
                    </td>
                    <td className={`num${v.micExtended.mic > v.mic ? ' warn' : ''}`}>
                      {fmt(v.micExtended.mic)} kg
                    </td>
                  </tr>
                )}
                {v.notInitiated > 0 && (
                  <tr className="warn">
                    <td>{t('vib.notInitiated')}</td>
                    <td className="num">{v.notInitiated}</td>
                  </tr>
                )}
                <tr>
                  <td>{t('vib.flyrockRange')}</td>
                  <td className="num">
                    {fmt(len.show(v.flyrock.range))} {len.unit}
                  </td>
                </tr>
                <tr>
                  <td>{t('vib.flyrockFragment')}</td>
                  <td className="num">
                    {fmt(len.show(v.flyrock.fragmentSize), 2)} {len.unit}
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="grid-table compact">
              <thead>
                <tr>
                  <th>{unit}</th>
                  <th>{t('vib.distanceMic')}</th>
                </tr>
              </thead>
              <tbody>
                {v.levels.map((l, i) => (
                  <tr key={l}>
                    <td>{fmt(toUi(l), isPpv ? 0 : 0)}</td>
                    <td className="num">
                      {fmt(len.show(v.distanceForLevel[i] ?? 0))} {len.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {s.vibComputing && <p className="muted small">{t('vib.computing')}</p>}
      </section>

      <section className="panel">
        <h2 className="row-title">
          {t('vib.points')}
          <button
            className={`icon-btn${tool === 'monitor' ? ' active' : ''}`}
            title={t('vib.addPoints')}
            onClick={() => {
              setTool('monitor');
            }}
          >
            <MapPin size={15} aria-hidden />
            <kbd>M</kbd>
          </button>
        </h2>
        {(project.monitoringPoints ?? []).length === 0 ? (
          <p className="hint">{t('vib.noPoints')}</p>
        ) : (
          <table className="grid-table compact">
            <thead>
              <tr>
                <th>{t('vib.point')}</th>
                <th>R [{len.unit}]</th>
                <th>mm/s</th>
                <th title={t('vib.limitTitle')}>{t('vib.limit')}</th>
                <th title={t('vib.admissibleTitle')}>{t('vib.admissible')}</th>
                <th>dB</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(project.monitoringPoints ?? []).map((p) => {
                const rec = v?.receivers.find((x) => x.id === p.id);
                return (
                  <tr key={p.id} className={rec?.exceeds ? 'warn' : undefined}>
                    <td>
                      <TextCell
                        value={p.name}
                        onCommit={(name) => {
                          session.document.dispatch(
                            commands.updateMonitoringPoint(session.document, p.id, { name }),
                            t('vib.renamePoint'),
                          );
                        }}
                      />
                    </td>
                    <td className="num">{rec ? fmt(len.show(rec.distance)) : '—'}</td>
                    <td
                      className="num"
                      title={
                        rec?.centroid
                          ? t('vib.centroid', { v: fmt(rec.centroid.ppv * 1000, 1) })
                          : undefined
                      }
                    >
                      {rec ? fmt(rec.ppv * 1000, 1) : '—'}
                    </td>
                    <td className="num" title={rec?.limit?.source}>
                      {rec?.limit ? fmt(rec.limit.ppvMax * 1000, 0) : '—'}
                    </td>
                    <td className="num">
                      {rec?.admissibleCharge != null ? fmt(rec.admissibleCharge) : '—'}
                    </td>
                    <td className="num">{rec ? fmt(rec.airblastDb, 0) : '—'}</td>
                    <td>
                      <button
                        className="icon danger"
                        title={t('vib.removePoint')}
                        onClick={() => {
                          session.document.dispatch(
                            commands.removeMonitoringPoint(session.document, p.id),
                            t('vib.removeNamed', { name: p.name }),
                          );
                        }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!s.vibEnabled && (project.monitoringPoints ?? []).length > 0 && (
          <p className="hint">{t('vib.enableHint')}</p>
        )}
        {(project.monitoringPoints ?? []).length > 0 && <PointSettings />}
      </section>
      <PpvLimitsTable />

      <section className="panel">
        <h2>{t('vib.siteConstants')}</h2>
        {law && (
          <>
            {site.vibrationLaws.length > 1 && (
              <label className="field">
                <span className="field-label">{t('vib.law')}</span>
                <select
                  value={law.id}
                  onChange={(e) => {
                    s.set({ vibLawId: e.target.value });
                  }}
                >
                  {site.vibrationLaws.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="hint">PPV = K · (R / W^{law.scaling === 'square-root' ? '½' : '⅓'})^−β</p>
            <NumberField
              label="K"
              unit="mm/s"
              decimals={0}
              min={1}
              value={law.k * 1000}
              onCommit={(x) => {
                setLaw({ k: x / 1000 });
              }}
            />
            <NumberField
              label="β"
              decimals={3}
              min={0.01}
              value={law.beta}
              onCommit={(x) => {
                setLaw({ beta: x });
              }}
            />
            <label className="field">
              <span className="field-label">{t('vib.scaled')}</span>
              <select
                value={law.scaling}
                onChange={(e) => {
                  setLaw({ scaling: e.target.value as typeof law.scaling });
                }}
              >
                <option value="square-root">{t('vib.squareRoot')}</option>
                <option value="cube-root">{t('vib.cubeRoot')}</option>
              </select>
            </label>
          </>
        )}
        <h3>{t('vib.airblast')} · P = K · (R / W^⅓)^−β</h3>
        <p className="hint">{t('vib.airblastSource')}</p>
        <NumberField
          label="K"
          unit="kPa"
          decimals={0}
          min={1}
          value={site.airblast.k / 1000}
          onCommit={(x) => {
            setSite({ airblast: { ...site.airblast, k: x * 1000 } }, t('vib.airblast'));
          }}
        />
        <NumberField
          label="β"
          decimals={3}
          min={0.01}
          value={site.airblast.beta}
          onCommit={(x) => {
            setSite({ airblast: { ...site.airblast, beta: x } }, t('vib.airblast'));
          }}
        />
        <h3>{t('vib.flyrockTitle')}</h3>
        <NumberField
          label={t('vib.safetyFactor')}
          decimals={2}
          min={0.1}
          value={site.flyrock.safetyFactor}
          onCommit={(x) => {
            setSite({ flyrock: { ...site.flyrock, safetyFactor: x } }, t('vib.flyrockTitle'));
          }}
        />
        <h3>{t('vib.map')}</h3>
        <label className="field">
          <span className="field-label">{t('energy.contours', { unit })}</span>
          <input
            value={levelsText}
            placeholder={isPpv ? '2; 5; 10; 25; 50; 100' : '115; 120; 125; 130; 134'}
            onChange={(e) => {
              setLevelsText(e.target.value);
            }}
            onBlur={commitLevels}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <NumberField
          label={t('vib.mapRadius')}
          unit={len.unit}
          decimals={0}
          min={0}
          value={len.show(s.vibExtent)}
          onCommit={(raw) => {
            const x = len.parse(raw);
            s.set({ vibExtent: x });
          }}
        />
        <div className="checks">
          <label className="check">
            <input
              type="checkbox"
              checked={s.layers.vibration}
              onChange={(e) => {
                s.setLayer('vibration', e.target.checked);
              }}
            />
            {t('vib.map')}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.layers.flyrock}
              onChange={(e) => {
                s.setLayer('flyrock', e.target.checked);
              }}
            />
            {t('vib.flyrockZone')}
          </label>
        </div>
      </section>
    </>
  );
}

/** Estructura, límite propio y K/β propios de cada punto (H-602). Vacío o 0 = el del sitio. */
function PointSettings() {
  const t = useT();
  const project = useProject();
  const update = (
    id: MonitoringPointId,
    patch: commands.MonitoringPointPatch,
    label: MessageKey,
  ) => {
    session.document.dispatch(
      commands.updateMonitoringPoint(session.document, id, patch),
      t(label),
    );
  };
  return (
    <>
      <h3>{t('vib.pointSettings')}</h3>
      <table className="grid-table compact">
        <thead>
          <tr>
            <th>{t('vib.point')}</th>
            <th title={t('vib.structureTitle')}>{t('vib.structure')}</th>
            <th title={t('vib.ownLimitTitle')}>{t('vib.ownLimit')}</th>
            <th title={t('vib.ownKTitle')}>K</th>
            <th title={t('vib.ownBetaTitle')}>β</th>
          </tr>
        </thead>
        <tbody>
          {(project.monitoringPoints ?? []).map((p) => (
            <tr key={p.id}>
              <td className="muted">{p.name}</td>
              <td>
                <TextCell
                  value={p.structure ?? ''}
                  onCommit={(v) => {
                    update(p.id, { structure: v.trim() || undefined }, 'vib.undoStructure');
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={(p.ppvLimit ?? 0) * 1000}
                  decimals={1}
                  min={0}
                  onCommit={(v) => {
                    update(p.id, { ppvLimit: v > 0 ? v / 1000 : undefined }, 'vib.undoLimit');
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={(p.k ?? 0) * 1000}
                  decimals={0}
                  min={0}
                  onCommit={(v) => {
                    update(p.id, { k: v > 0 ? v / 1000 : undefined }, 'vib.undoK');
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={p.beta ?? 0}
                  decimals={2}
                  min={0}
                  onCommit={(v) => {
                    update(p.id, { beta: v > 0 ? v : undefined }, 'vib.undoBeta');
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Tabla de límites de PPV del sitio (RM-21, P-12): por tipo de estructura y distancia, con su
 * fuente (EIA de la operación; USBM RI 8507/OSM o DIN 4150). Los valores iniciales son de curso y
 * están rotulados «por contrastar».
 */
function PpvLimitsTable() {
  const t = useT();
  const project = useProject();
  const limits = project.ppvLimits ?? [];
  const set = (next: PpvLimit[], label: string) => {
    session.document.dispatch({ type: 'project/patch', patch: { ppvLimits: next } }, label);
  };
  const patch = (i: number, p: Partial<PpvLimit>) => {
    set(
      limits.map((l, k) => (k === i ? { ...l, ...p } : l)),
      t('vib.editLimit'),
    );
  };
  return (
    <section className="panel">
      <h2>{t('vib.limits')}</h2>
      <p className="hint">{t('vib.limitsHint')}</p>
      <table className="grid-table compact">
        <thead>
          <tr>
            <th>{t('vib.structure')}</th>
            <th>{t('vib.from')}</th>
            <th>{t('vib.to')}</th>
            <th>mm/s</th>
            <th>{t('vib.source')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {limits.map((l, i) => (
            <tr key={i}>
              <td>
                <TextCell
                  value={l.structure ?? ''}
                  title={t('vib.allStructures')}
                  onCommit={(v) => {
                    const next = { ...l };
                    if (v.trim()) next.structure = v.trim();
                    else delete next.structure;
                    set(
                      limits.map((x, k) => (k === i ? next : x)),
                      t('vib.editLimit'),
                    );
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={l.from}
                  decimals={0}
                  min={0}
                  onCommit={(v) => {
                    patch(i, { from: v });
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={l.to ?? 0}
                  decimals={0}
                  min={0}
                  onCommit={(v) => {
                    const next = { ...l };
                    if (v > 0) next.to = v;
                    else delete next.to;
                    set(
                      limits.map((x, k) => (k === i ? next : x)),
                      t('vib.editLimit'),
                    );
                  }}
                />
              </td>
              <td>
                <NumberCell
                  value={l.ppvMax * 1000}
                  decimals={1}
                  min={0.1}
                  onCommit={(v) => {
                    patch(i, { ppvMax: v / 1000 });
                  }}
                />
              </td>
              <td>
                <TextCell
                  value={l.source}
                  onCommit={(v) => {
                    if (v.trim()) patch(i, { source: v.trim() });
                  }}
                />
              </td>
              <td>
                <button
                  className="icon danger"
                  title={t('vib.removeRow')}
                  onClick={() => {
                    set(
                      limits.filter((_, k) => k !== i),
                      t('vib.removeLimit'),
                    );
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => {
          set(
            [...limits, { from: 0, ppvMax: 0.01, source: t('vib.newSource') }],
            t('vib.addLimit'),
          );
        }}
      >
        {t('vib.addLimitButton')}
      </button>
    </section>
  );
}
