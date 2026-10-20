import {
  commands,
  fitByZone,
  lawFromFit,
  parseSeismographCsv,
  recordDistance,
  uuidv7,
  type LawScaling,
  type SeismographRecord,
  type VibrationFit,
  type ZoneFit,
} from '@cronos/core';
import { Trash2, Upload } from 'lucide-react';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { NumberCell, TextCell } from '../components/CellInput';
import { Floatable } from '../components/Floatable';
import { useProject } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import {
  deleteRecord,
  saveRecords,
  toggleContextProject,
  unsharePoint,
  useMineVibration,
} from './mineStore';
import { contextKey, kindLabelKey, Semaphore } from './vibrationUi';

const LawFitChart = lazy(() => import('../charts/LawFitChart'));

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Lo compartido por la mina en el panel de vibración: puntos de la mina, labores y diseños de otros
 * proyectos (contexto 3D) y calibración de la ley con mediciones de sismógrafo.
 */
export function MineVibrationSection() {
  const t = useT();
  const mine = useMineVibration();
  if (!mine.mineId) return null;
  return (
    <>
      <MinePoints />
      <section className="panel">
        <h2>{t('mv.context')}</h2>
        <p className="hint">{t('mv.contextHint')}</p>
        {mine.projects.length === 0 ? (
          <p className="muted small">{t('mv.noOtherProjects')}</p>
        ) : (
          <div className="checks">
            {mine.projects.map((p) => {
              const c = mine.context[p.id];
              return (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    checked={!!c}
                    onChange={(e) => {
                      void toggleContextProject(p.id, e.target.checked);
                    }}
                  />
                  {p.name}
                  {c && (
                    <span className="muted small">
                      {' '}
                      {c.status === 'loading'
                        ? t('vib.computing')
                        : c.status === 'error'
                          ? t('mv.contextError')
                          : t('mv.contextCounts', { w: c.workings.length, h: c.holes })}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </section>
      <Calibration />
    </>
  );
}

function MinePoints() {
  const t = useT();
  const fmt = useFormat();
  const mine = useMineVibration();
  const v = useAnalysisStore((s) => s.vibration);
  const notify = useUiStore((s) => s.notify);
  return (
    <section className="panel">
      <h2>{t('mv.minePoints')}</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={mine.useMinePoints}
          onChange={(e) => {
            mine.set({ useMinePoints: e.target.checked });
          }}
        />
        {t('mv.useMinePoints')}
      </label>
      {mine.points.length === 0 ? (
        <p className="hint">{t('mv.noMinePoints')}</p>
      ) : (
        <table className="grid-table compact">
          <thead>
            <tr>
              <th>{t('vib.point')}</th>
              <th>{t('mv.kind')}</th>
              <th>Z</th>
              <th>mm/s</th>
              <th>{t('vib.limit')}</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {mine.points.map((mp) => {
              const p = mp.point;
              const rec = v?.receivers.find((x) => x.id === p.id);
              return (
                <tr key={p.id} className={rec?.exceeds ? 'warn' : undefined}>
                  <td title={mp.sourceProjectName ?? undefined}>{p.name}</td>
                  <td className="muted">{t(kindLabelKey(p.kind))}</td>
                  <td className="num">{fmt(p.position.z, 1)}</td>
                  <td className="num">{rec ? fmt(rec.ppv * 1000, 1) : '—'}</td>
                  <td className="num" title={rec?.limit?.source}>
                    {rec?.limit ? fmt(rec.limit.ppvMax * 1000, 0) : '—'}
                  </td>
                  <td>
                    <Semaphore rec={rec} />
                  </td>
                  <td>
                    {mine.canEdit && (
                      <button
                        className="icon danger"
                        title={t('mv.unshare')}
                        onClick={() => {
                          unsharePoint(p.id).catch((err: unknown) => {
                            notify(errorText(err), 'error');
                          });
                        }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Calibración

function Calibration() {
  const t = useT();
  const fmt = useFormat();
  const project = useProject();
  const mine = useMineVibration();
  const notify = useUiStore((s) => s.notify);
  const setAnalysis = useAnalysisStore((s) => s.set);
  const [scaling, setScaling] = useState<LawScaling>('square-root');
  const [selected, setSelected] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const fits = useMemo(() => fitByZone(mine.records), [mine.records]);
  const keyOf = (f: ZoneFit) => `${f.context}|${f.zone}`;
  const current = fits.find((f) => keyOf(f) === selected) ?? fits[0];
  const fitOf = (f: ZoneFit | undefined): VibrationFit | null =>
    f ? (scaling === 'square-root' ? f.squareRoot : f.cubeRoot) : null;
  const shown = fitOf(current);

  const save = (records: SeismographRecord[]) => {
    saveRecords(records).catch((err: unknown) => {
      notify(errorText(err), 'error');
    });
  };
  const importCsv = async (f: File) => {
    const parsed = parseSeismographCsv(await f.text());
    if (parsed.records.length > 0) {
      await saveRecords(parsed.records);
      notify(t('mv.imported', { n: parsed.records.length, bad: parsed.errors.length }));
    } else notify(parsed.errors[0]?.reason ?? t('mv.importEmpty'), 'error');
  };
  const applyLaw = (f: ZoneFit, fit: VibrationFit, level: 50 | 95) => {
    const law = lawFromFit(fit, { zone: f.zone, context: f.context, level });
    const site = project.siteModels;
    // Recalibrar reemplaza la ley de la misma zona y tipo.
    const others = site.vibrationLaws.filter(
      (l) => !(l.fit?.zone === f.zone && (l.context ?? 'surface') === f.context),
    );
    session.document.dispatch(
      commands.setSiteModels({ ...site, vibrationLaws: [...others, law] }),
      t('mv.useLawUndo'),
    );
    setAnalysis({ vibLawId: law.id });
    notify(t('mv.lawApplied', { name: law.name }));
  };
  const addRow = () => {
    const last = mine.records[mine.records.length - 1];
    save([
      {
        id: uuidv7(),
        date: new Date().toISOString().slice(0, 10),
        zone: last?.zone ?? '',
        context: last?.context ?? 'surface',
        charge: last?.charge ?? 10,
        distance: 100,
        ppv: 0.005,
      },
    ]);
  };

  return (
    <section className="panel">
      <h2>{t('mv.calibration')}</h2>
      <p className="hint">{t('mv.calibrationHint')}</p>
      <div className="segmented" role="radiogroup" aria-label={t('vib.scaled')}>
        {(
          [
            ['square-root', t('vib.squareRoot')],
            ['cube-root', t('vib.cubeRoot')],
          ] as [LawScaling, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            role="radio"
            aria-checked={scaling === m}
            className={scaling === m ? 'active' : ''}
            onClick={() => {
              setScaling(m);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {fits.length === 0 ? (
        <p className="muted small">{t('mv.noRecords')}</p>
      ) : (
        <table className="grid-table compact">
          <thead>
            <tr>
              <th>{t('mv.zone')}</th>
              <th>n</th>
              <th title={t('mv.k50Title')}>K50</th>
              <th>β</th>
              <th>R²</th>
              <th title={t('mv.k95Title')}>K95</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fits.map((f) => {
              const fit = fitOf(f);
              const k = keyOf(f);
              return (
                <tr
                  key={k}
                  className={k === (current ? keyOf(current) : '') ? 'selected' : undefined}
                  onClick={() => {
                    setSelected(k);
                  }}
                >
                  <td>
                    {f.zone || t('mv.allZones')}
                    <span className="muted small"> · {t(contextKey(f.context))}</span>
                  </td>
                  <td className="num">{f.n}</td>
                  <td className="num">{fit ? fmt(fit.k * 1000, 0) : '—'}</td>
                  <td className="num">{fit ? fmt(fit.beta, 2) : '—'}</td>
                  <td className="num">{fit ? fmt(fit.r2, 2) : '—'}</td>
                  <td className="num">{fit ? fmt(fit.k95 * 1000, 0) : '—'}</td>
                  <td>
                    {fit && (
                      <span className="row-actions">
                        <button
                          className="small"
                          title={t('mv.useLawTitle', { level: 95 })}
                          disabled={session.document.readOnly}
                          onClick={(e) => {
                            e.stopPropagation();
                            applyLaw(f, fit, 95);
                          }}
                        >
                          {t('mv.useLaw95')}
                        </button>
                        <button
                          className="small"
                          title={t('mv.useLawTitle', { level: 50 })}
                          disabled={session.document.readOnly}
                          onClick={(e) => {
                            e.stopPropagation();
                            applyLaw(f, fit, 50);
                          }}
                        >
                          50 %
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {shown && (
        <Suspense fallback={<div className="chart tall muted">…</div>}>
          <LawFitChart fit={shown} />
        </Suspense>
      )}
      {current && !shown && <p className="hint">{t('mv.fewRecords')}</p>}
      <Floatable id="mv.records" title={t('mv.records', { n: mine.records.length })} width={760}>
        <p className="hint">{t('mv.csvHint')}</p>
        {mine.canEdit && (
          <div className="row-actions">
            <button
              onClick={() => {
                file.current?.click();
              }}
            >
              <Upload size={13} aria-hidden /> {t('mv.importCsv')}
            </button>
            <button onClick={addRow}>{t('mv.addRecord')}</button>
            <input
              ref={file}
              type="file"
              accept=".csv,.txt,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f)
                  importCsv(f).catch((err: unknown) => {
                    notify(errorText(err), 'error');
                  });
              }}
            />
          </div>
        )}
        <table className="grid-table compact">
          <thead>
            <tr>
              <th>{t('mv.date')}</th>
              <th>{t('mv.zone')}</th>
              <th>{t('mv.type')}</th>
              <th>kg/ret.</th>
              <th>R [m]</th>
              <th>mm/s</th>
              <th>Hz</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mine.records.map((r) => {
              const patch = (p: Partial<SeismographRecord>) => {
                save([{ ...r, ...p }]);
              };
              const d = recordDistance(r);
              return (
                <tr key={r.id}>
                  <td>
                    <TextCell
                      value={r.date}
                      onCommit={(date) => {
                        patch({ date });
                      }}
                    />
                  </td>
                  <td>
                    <TextCell
                      value={r.zone}
                      onCommit={(zone) => {
                        patch({ zone: zone.trim() });
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={r.context}
                      disabled={!mine.canEdit}
                      onChange={(e) => {
                        patch({ context: e.target.value as SeismographRecord['context'] });
                      }}
                    >
                      <option value="surface">{t('mv.context.surface')}</option>
                      <option value="underground">{t('mv.context.underground')}</option>
                    </select>
                  </td>
                  <td>
                    <NumberCell
                      value={r.charge}
                      decimals={1}
                      min={0.001}
                      onCommit={(charge) => {
                        if (charge > 0) patch({ charge });
                      }}
                    />
                  </td>
                  <td>
                    <NumberCell
                      value={d ?? 0}
                      decimals={1}
                      min={0.1}
                      {...(r.blastPosition ? { title: t('mv.distance3d') } : {})}
                      onCommit={(distance) => {
                        if (distance > 0) patch({ distance });
                      }}
                    />
                  </td>
                  <td>
                    <NumberCell
                      value={r.ppv * 1000}
                      decimals={2}
                      min={0.001}
                      onCommit={(ppv) => {
                        if (ppv > 0) patch({ ppv: ppv / 1000 });
                      }}
                    />
                  </td>
                  <td>
                    <NumberCell
                      value={r.frequency ?? 0}
                      decimals={0}
                      min={0}
                      onCommit={(f) => {
                        const next = { ...r };
                        if (f > 0) next.frequency = f;
                        else delete next.frequency;
                        save([next]);
                      }}
                    />
                  </td>
                  <td>
                    {mine.canEdit && (
                      <button
                        className="icon danger"
                        title={t('vib.removeRow')}
                        onClick={() => {
                          deleteRecord(r.id).catch((err: unknown) => {
                            notify(errorText(err), 'error');
                          });
                        }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Floatable>
    </section>
  );
}
