import {
  commands,
  defaultKindPpvLimits,
  defaultVibrationLaw,
  excavationCenter,
  isUncalibratedLaw,
  MONITORING_POINT_KINDS,
  type MonitoringPoint,
  type MonitoringPointId,
  type MonitoringPointKind,
  type PpvLimit,
  type VibrationMetric,
  choiceModel,
  METHOD_CHOICES,
} from '@cronos/core';
import { turboCss } from '@cronos/engine';
import { MapPin, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MethodDetail } from '../methods/MethodDetail';
import { NumberCell, TextCell } from '../components/CellInput';
import { NumberField } from '../components/NumberField';
import { useProject } from '../hooks/useDocument';
import { useFormat, useT, type MessageKey } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';
import { Floatable } from '../components/Floatable';
import { namedWorkings, sharePoint, useMineVibration } from '../vibration/mineStore';
import { MineVibrationSection } from '../vibration/MineVibrationSection';
import { CrossingWarnings, kindLabelKey, Semaphore } from '../vibration/vibrationUi';

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
  // Sin elección, la ley del tipo de voladura (subterránea para taladros ug-*).
  const law =
    site.vibrationLaws.find((l) => l.id === s.vibLawId) ??
    defaultVibrationLaw(project, project.blasts[0]) ??
    undefined;
  const canShare = useMineVibration((m) => m.mineId !== null && m.canEdit);
  const minePoints = useMineVibration((m) => m.points);
  const sharedIds = new Set(minePoints.map((p) => p.point.id));
  const notify = useUiStore((st) => st.notify);
  const share = (p: MonitoringPoint) => {
    sharePoint(p)
      .then(() => {
        notify(t('mv.shared', { name: p.name }));
      })
      .catch((err: unknown) => {
        notify(err instanceof Error ? err.message : String(err), 'error');
      });
  };
  const isPpv = s.vibMetric === 'ppv';
  const v = s.vibration;
  // Ejemplo del «Detalle»: el punto con mayor PPV (el que gobierna el diseño).
  const governing = v?.receivers.reduce<(typeof v.receivers)[number] | null>(
    (best, r) => (r.law && (!best || r.ppv > best.ppv) ? r : best),
    null,
  );
  const maxDiameter = Math.max(0, ...(project.blasts[0]?.holes.map((h) => h.diameter) ?? []));
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
                <th>{t('mv.kind')}</th>
                <th title={t('mv.distance3dTitle')}>R [{len.unit}]</th>
                <th title={t('mv.chargeTitle')}>kg</th>
                <th>mm/s</th>
                <th title={t('vib.limitTitle')}>{t('vib.limit')}</th>
                <th />
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
                    <td>
                      <KindSelect
                        value={p.kind}
                        onChange={(kind) => {
                          session.document.dispatch(
                            commands.updateMonitoringPoint(session.document, p.id, { kind }),
                            t('mv.undoKind'),
                          );
                        }}
                      />
                    </td>
                    <td className="num">{rec ? fmt(len.show(rec.distance)) : '—'}</td>
                    <td className="num">{rec ? fmt(rec.charge, 1) : '—'}</td>
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
                    <td>
                      <Semaphore rec={rec} />
                    </td>
                    <td className="num">
                      {rec?.admissibleCharge != null ? fmt(rec.admissibleCharge) : '—'}
                    </td>
                    <td className="num">{rec ? fmt(rec.airblastDb, 0) : '—'}</td>
                    <td className="row-actions">
                      {canShare && (
                        <button
                          className={`icon${sharedIds.has(p.id) ? ' active' : ''}`}
                          title={t(sharedIds.has(p.id) ? 'mv.updateShared' : 'mv.share')}
                          onClick={() => {
                            share(p);
                          }}
                        >
                          <Share2 size={13} aria-hidden />
                        </button>
                      )}
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
        {v && <CrossingWarnings receivers={v.receivers} underground={v.underground} />}
        <p className="hint">{t('mv.hint3d')}</p>
        <AddPointByCoordinates />
        {!s.vibEnabled && (project.monitoringPoints ?? []).length > 0 && (
          <p className="hint">{t('vib.enableHint')}</p>
        )}
        {(project.monitoringPoints ?? []).length > 0 && <PointSettings />}
      </section>
      <PpvLimitsTable />
      <MineVibrationSection />

      <section className="panel">
        <h2>{t('vib.siteConstants')}</h2>
        {law && (
          <>
            <MethodDetail
              id={choiceModel('vibrationLaw', law.scaling)}
              choice={{
                label: t('md.law'),
                value: law.scaling,
                options: METHOD_CHOICES.vibrationLaw,
                disabled: session.document.readOnly,
                onChange: (value) => {
                  const next = METHOD_CHOICES.vibrationLaw.find((o) => o.value === value);
                  if (next) setLaw({ scaling: next.value });
                },
              }}
              values={{
                k: law.k * 1000,
                beta: law.beta,
                q: v?.mic,
                r: governing?.distance,
                ppv: governing ? governing.ppv * 1000 : undefined,
              }}
              note={governing ? t('vib.detailExample', { name: governing.name }) : undefined}
            />
            {isUncalibratedLaw(law) ? (
              <p className="warn" title={t('mv.uncalibratedTitle')}>
                {t('mv.uncalibrated', { name: law.name })}
              </p>
            ) : (
              law.fit && (
                <p className="hint">
                  {t('mv.calibrated', {
                    zone: law.fit.zone || t('mv.allZones'),
                    n: law.fit.n,
                    r2: fmt(law.fit.r2, 2),
                  })}
                </p>
              )
            )}
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
          </>
        )}
        <h3>{t('vib.airblast')} · P = K · (R / W^⅓)^−β</h3>
        <p className="hint">{t('vib.airblastSource')}</p>
        <MethodDetail
          id="flyrock.airblast"
          values={{ k: site.airblast.k / 1000, beta: site.airblast.beta }}
        />
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
        <MethodDetail
          id="flyrock.lundborg"
          values={{
            d: maxDiameter > 0 ? maxDiameter * 1000 : undefined,
            sf: site.flyrock.safetyFactor,
            range: v?.flyrock.range,
          }}
        />
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
      <Floatable id="vib.points" title={t('vib.pointSettings')} width={820}>
        <table className="grid-table compact">
          <thead>
            <tr>
              <th>{t('vib.point')}</th>
              <th title={t('vib.structureTitle')}>{t('vib.structure')}</th>
              <th title={t('vib.ownLimitTitle')}>{t('vib.ownLimit')}</th>
              <th title={t('vib.ownKTitle')}>K</th>
              <th title={t('vib.ownBetaTitle')}>β</th>
              <th title={t('mv.zTitle')}>Z [m]</th>
              <th title={t('mv.workingTitle')}>{t('mv.working')}</th>
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
                <td>
                  <NumberCell
                    value={p.position.z}
                    decimals={2}
                    onCommit={(z) => {
                      update(p.id, { position: { ...p.position, z } }, 'mv.undoZ');
                    }}
                  />
                </td>
                <td>
                  <TextCell
                    value={p.working ?? ''}
                    onCommit={(w) => {
                      update(p.id, { working: w.trim() || undefined }, 'mv.undoWorking');
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Floatable>
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
  const vibration = useAnalysisStore((st) => st.vibration);
  const worst = vibration?.receivers.reduce<(typeof vibration.receivers)[number] | null>(
    (best, r) =>
      r.limit && (!best?.limit || r.ppv / r.limit.ppvMax > best.ppv / best.limit.ppvMax) ? r : best,
    null,
  );
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
      <Floatable id="vib.limits" title={t('vib.limits')} width={640}>
        <p className="hint">{t('vib.limitsHint')}</p>
        <MethodDetail
          id="vibration.damage"
          values={{
            limit: worst?.limit ? worst.limit.ppvMax * 1000 : undefined,
            ppv: worst ? worst.ppv * 1000 : undefined,
          }}
          note={worst ? t('vib.detailExample', { name: worst.name }) : undefined}
        />
        <table className="grid-table compact">
          <thead>
            <tr>
              <th title={t('mv.limitKindTitle')}>{t('mv.kind')}</th>
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
                  <select
                    value={l.kind ?? ''}
                    onChange={(e) => {
                      const next = { ...l };
                      if (e.target.value) next.kind = e.target.value as MonitoringPointKind;
                      else delete next.kind;
                      set(
                        limits.map((x, k) => (k === i ? next : x)),
                        t('vib.editLimit'),
                      );
                    }}
                  >
                    <option value="">{t('mv.kind.surfaceRows')}</option>
                    {MONITORING_POINT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(kindLabelKey(k))}
                      </option>
                    ))}
                  </select>
                </td>
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
        </button>{' '}
        <button
          title={t('mv.defaultLimitsTitle')}
          onClick={() => {
            const have = new Set(limits.map((l) => l.kind).filter(Boolean));
            set(
              [...limits, ...defaultKindPpvLimits().filter((l) => !have.has(l.kind))],
              t('vib.addLimit'),
            );
          }}
        >
          {t('mv.defaultLimits')}
        </button>
      </Floatable>
    </section>
  );
}

/** Tipo de punto de control (sin tipo = superficie, como los de siempre). */
function KindSelect({
  value,
  onChange,
}: {
  value: MonitoringPointKind | undefined;
  onChange: (kind: MonitoringPointKind | undefined) => void;
}) {
  const t = useT();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        onChange((e.target.value || undefined) as MonitoringPointKind | undefined);
      }}
    >
      <option value="">{t('mv.kind.none')}</option>
      {MONITORING_POINT_KINDS.map((k) => (
        <option key={k} value={k}>
          {t(kindLabelKey(k))}
        </option>
      ))}
    </select>
  );
}

/**
 * Punto de control con cota libre: por coordenadas X, Y, Z o en una labor (excavación de este
 * proyecto o de otro de la mina mostrado como contexto), que pone el punto en su centro.
 */
function AddPointByCoordinates() {
  const t = useT();
  const fmt = useFormat();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MonitoringPointKind | undefined>('underground-working');
  // Por defecto, 50 m bajo el centro de la voladura (una labor debajo del tajo).
  const [pos, setPos] = useState(() => {
    const holes = session.document.project.blasts[0]?.holes ?? [];
    if (holes.length === 0) return { x: 0, y: 0, z: 0 };
    const avg = (f: (h: (typeof holes)[number]) => number) =>
      Math.round(holes.reduce((a, h) => a + f(h), 0) / holes.length);
    return { x: avg((h) => h.collar.x), y: avg((h) => h.collar.y), z: avg((h) => h.collar.z) - 50 };
  });
  const [working, setWorking] = useState('');
  useMineVibration((m) => m.context);
  const workings = namedWorkings();
  const add = () => {
    const { ops, point } = commands.addMonitoringPoint(
      session.document,
      pos,
      name.trim() || undefined,
      {
        ...(kind ? { kind } : {}),
        ...(working ? { working } : {}),
      },
    );
    session.document.dispatch(ops, t('vib.addPoints'));
    useAnalysisStore.getState().set({ vibEnabled: true });
    setName('');
    useUiStore.getState().notify(t('mv.added', { name: point.name }));
  };
  return (
    <details>
      <summary>{t('mv.addByCoordinates')}</summary>
      {workings.length > 0 && (
        <label className="field">
          <span className="field-label">{t('mv.inWorking')}</span>
          <select
            value={working}
            onChange={(e) => {
              setWorking(e.target.value);
              const w = workings.find((x) => x.name === e.target.value);
              const c = w ? excavationCenter(w.sections) : null;
              if (c) {
                setPos(c);
                setKind('underground-working');
                if (!name) setName(w?.name ?? '');
              }
            }}
          >
            <option value="">—</option>
            {workings.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label">{t('vib.point')}</span>
        <input
          value={name}
          placeholder="PC…"
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="field-label">{t('mv.kind')}</span>
        <KindSelect value={kind} onChange={setKind} />
      </label>
      {(['x', 'y', 'z'] as const).map((c) => (
        <NumberField
          key={c}
          label={c.toUpperCase()}
          unit="m"
          decimals={2}
          value={pos[c]}
          onCommit={(v) => {
            setPos((p) => ({ ...p, [c]: v }));
          }}
        />
      ))}
      <button onClick={add}>{t('mv.addPoint', { z: fmt(pos.z, 1) })}</button>
    </details>
  );
}
