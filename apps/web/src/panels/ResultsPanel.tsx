import type { BlastAnalysis, DesignCheck } from '@cronos/core';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import * as actions from '../actions';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazy, Suspense, useMemo } from 'react';
import { useActiveBlast } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { checkText } from '../i18n/coreText';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUnits } from '../hooks/useUnits';

const Histogram = lazy(() => import('../charts/Histogram'));

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <tr className={warn ? 'warn' : undefined}>
      <td>{label}</td>
      <td className="num">{value}</td>
    </tr>
  );
}

function histogram(a: BlastAnalysis, binMs: number) {
  const { fireTime } = a.timing;
  const first = a.timing.firstTime * 1000;
  const n = Math.max(1, Math.ceil((a.timing.lastTime * 1000 - first + 1e-6) / binMs));
  if (!Number.isFinite(n) || n > 5000) return null;
  const holes = new Array<number>(n).fill(0);
  const kg = new Array<number>(n).fill(0);
  fireTime.forEach((t, i) => {
    if (!Number.isFinite(t)) return;
    const b = Math.min(n - 1, Math.floor((t * 1000 - first) / binMs));
    holes[b] = (holes[b] ?? 0) + 1;
    kg[b] = (kg[b] ?? 0) + (a.charge.perHole[i] ?? 0);
  });
  return {
    starts: holes.map((_, i) => first + i * binMs),
    holes,
    kg: kg.map((v) => Math.round(v)),
  };
}

export function ResultsPanel() {
  const t = useT();
  const fmt = useFormat();
  const { len, area, volume } = useUnits();
  const analysis = useAnalysisStore((s) => s.analysis);
  const computing = useAnalysisStore((s) => s.computing);
  const windowMs = (useActiveBlast()?.calcParams.micWindow ?? 0.008) * 1000;
  const hist = useMemo(
    () => (analysis && analysis.timing.initiated > 0 ? histogram(analysis, windowMs) : null),
    [analysis, windowMs],
  );

  if (!analysis)
    return (
      <section className="panel">
        <h2>{t('results.title')}</h2>
        <p className="muted">{computing ? t('results.computing') : t('results.noData')}</p>
      </section>
    );
  const c = analysis.charge;
  const tm = analysis.timing;
  const total = c.holeIds.length;
  const selectCoincident = () => {
    session.selection.set(tm.coincidentGroups.flat());
  };

  return (
    <>
      <ChecksSection checks={analysis.checks} />
      <section className="panel">
        <h2>
          {t('results.charge')}{' '}
          <span className="muted small">
            {computing ? t('results.computingSuffix') : `· ${analysis.elapsedMs.toFixed(0)} ms`}
          </span>
        </h2>
        <table className="kv">
          <tbody>
            <Row
              label={t('results.loadedHoles')}
              value={`${c.loadedHoles} / ${total}`}
              warn={c.loadedHoles < total}
            />
            <Row label={t('results.explosive')} value={`${fmt(c.totalExplosive)} kg`} />
            <Row label={t('results.primers')} value={`${fmt(c.totalPrimers, 1)} kg`} />
            <Row
              label={t('results.drilled')}
              value={`${fmt(len.show(c.drilledLength), 1)} ${len.unit}`}
            />
            <Row label={t('results.area')} value={`${fmt(area.show(c.area))} ${area.unit}`} />
            <Row
              label={t('results.volume')}
              value={`${fmt(volume.show(c.volume))} ${volume.unit}`}
            />
            <Row label={t('results.tonnage')} value={`${fmt(c.tonnage / 1000)} t`} />
            <Row label={t('results.loadingFactor')} value={`${fmt(c.loadingFactor, 3)} kg/m³`} />
            <Row
              label={t('results.powderFactor')}
              value={`${fmt(c.powderFactor * 1000, 3)} kg/t`}
            />
            <Row label={t('results.energy')} value={`${fmt(c.totalEnergy / 1e6)} MJ`} />
            <Row
              label={t('results.cost')}
              value={`${fmt(c.cost)} ${session.document.project.currency}`}
            />
          </tbody>
        </table>
        {c.nominal.volume > 0 && <DesignFactors charge={c} />}
        {c.byGroup.some((g) => g.groupId !== null) && <GroupTable charge={c} />}
      </section>
      <section className="panel">
        <h2>{t('results.timing')}</h2>
        <table className="kv">
          <tbody>
            <Row
              label={t('results.initiated')}
              value={`${tm.initiated} / ${total}`}
              warn={tm.notInitiated > 0}
            />
            {tm.withoutDetonator > 0 && (
              <Row label={t('results.noDetonator')} value={String(tm.withoutDetonator)} warn />
            )}
            {tm.initiated > 0 && (
              <>
                <Row
                  label={t('results.firstLast')}
                  value={`${fmt(tm.firstTime * 1000)} / ${fmt(tm.lastTime * 1000)} ms`}
                />
                <Row
                  label={t('results.duration')}
                  value={`${fmt((tm.lastTime - tm.firstTime) * 1000)} ms`}
                />
                <Row
                  label={t('results.maxHoles', { ms: windowMs })}
                  value={String(tm.maxHolesPerWindow)}
                />
                <Row
                  label={t('results.maxKg', { ms: windowMs })}
                  value={`${fmt(tm.maxChargePerWindow)} kg @ ${fmt(tm.maxChargeWindowStart * 1000)} ms`}
                />
                <Row label={t('results.coincident')} value={String(tm.coincidentGroups.length)} />
              </>
            )}
          </tbody>
        </table>
        {tm.coincidentGroups.length > 0 && (
          <button onClick={selectCoincident}>
            {t('results.selectCoincident', { n: tm.coincidentGroups.flat().length })}
          </button>
        )}
        {hist && (
          <ErrorBoundary>
            <Suspense fallback={<div className="chart muted">{t('results.loadingChart')}</div>}>
              <Histogram starts={hist.starts} holes={hist.holes} kg={hist.kg} binMs={windowMs} />
            </Suspense>
          </ErrorBoundary>
        )}
        {tm.interRowDelays.length > 0 && (
          <>
            <h3>{t('results.interRow')}</h3>
            <table className="grid-table compact">
              <thead>
                <tr>
                  <th>{t('results.rows')}</th>
                  <th>{t('results.min')}</th>
                  <th>{t('results.max')}</th>
                  <th>{t('results.meanMs')}</th>
                </tr>
              </thead>
              <tbody>
                {tm.interRowDelays.slice(0, 40).map((r) => (
                  <tr key={`${r.patternId ?? ''}-${r.rowA}`}>
                    <td>
                      {r.rowA + 1}→{r.rowB + 1}
                    </td>
                    <td className="num">{fmt(r.min * 1000)}</td>
                    <td className="num">{fmt(r.max * 1000)}</td>
                    <td className="num">{fmt(r.mean * 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </>
  );
}

const SEVERITY = {
  error: { icon: CircleX, cls: 'sev-error', label: 'common.error' },
  warning: { icon: TriangleAlert, cls: 'sev-warning', label: 'common.warning' },
  info: { icon: Info, cls: 'sev-info', label: 'results.sevInfo' },
} as const;

/** Revisión del diseño: cada alerta selecciona y encuadra sus taladros. */
/**
 * Indicadores de diseño con el volumen nominal B·S·H (P-06; nombres de `02 §0` y D-10): factor de
 * carga, de potencia y de energía, y rendimiento m³/m (FC-13 a FC-16).
 */
function DesignFactors({ charge: c }: { charge: BlastAnalysis['charge'] }) {
  const t = useT();
  const fmt = useFormat();
  const { len, volume } = useUnits();
  const project = session.document.project;
  const blast = project.blasts[0];
  const rho = project.rockMasses.find((r) => r.id === blast?.rockMassId)?.density ?? 0;
  const n = c.nominal;
  const tonnes = n.volume * rho;
  return (
    <>
      <h3>{t('results.design')}</h3>
      <table className="kv">
        <tbody>
          <Row
            label={t('results.nominalVolume')}
            value={`${fmt(volume.show(n.volume))} ${volume.unit}`}
          />
          <Row label={t('results.nominalTonnage')} value={`${fmt(tonnes / 1000)} t`} />
          <Row label="loading_factor" value={`${fmt(n.explosive / n.volume, 3)} kg/m³`} />
          <Row
            label="powder_factor"
            value={tonnes > 0 ? `${fmt((n.explosive / tonnes) * 1000, 3)} kg/t` : '—'}
          />
          <Row
            label="energy_factor"
            value={tonnes > 0 ? `${fmt(n.energy / 1e6 / (tonnes / 1000), 3)} MJ/t` : '—'}
          />
          <Row
            label={t('results.yield')}
            value={
              n.drilledLength > 0
                ? `${fmt(volume.show(n.volume) / len.show(n.drilledLength), 2)} ${volume.unit}/${len.unit}`
                : '—'
            }
          />
        </tbody>
      </table>
    </>
  );
}

/** Carga por grupo (RM-18): taladros, kg y factor de carga de diseño. */
function GroupTable({ charge: c }: { charge: BlastAnalysis['charge'] }) {
  const t = useT();
  const fmt = useFormat();
  const blast = session.document.project.blasts[0];
  const name = new Map(blast?.groups.map((g) => [g.id, g.name]));
  return (
    <>
      <h3>{t('results.byGroup')}</h3>
      <table className="grid-table compact">
        <thead>
          <tr>
            <th>{t('results.group')}</th>
            <th>{t('results.holes')}</th>
            <th>kg</th>
            <th>{t('results.kgm3Design')}</th>
          </tr>
        </thead>
        <tbody>
          {c.byGroup.map((g) => (
            <tr key={g.groupId ?? 'none'}>
              <td>{g.groupId ? (name.get(g.groupId) ?? '—') : t('results.noGroup')}</td>
              <td className="num">{g.holes}</td>
              <td className="num">{fmt(g.explosive)}</td>
              <td className="num">
                {g.nominalVolume > 0 ? fmt(g.explosive / g.nominalVolume, 3) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ChecksSection({ checks }: { checks: DesignCheck[] }) {
  const t = useT();
  return (
    <section className="panel">
      <h2>{t('results.checks')}</h2>
      {checks.length === 0 ? (
        <p className="check-ok">
          <CircleCheck size={15} aria-hidden /> {t('results.noIssues')}
        </p>
      ) : (
        <ul className="checks-list">
          {checks.map((c) => {
            const sev = SEVERITY[c.severity];
            const text = checkText(c);
            return (
              <li key={c.id}>
                <button
                  className={sev.cls}
                  title={`${t(sev.label)}: ${text.detail}\n${t('results.checkClick')}`}
                  onClick={() => {
                    actions.focusHoles(c.holes);
                  }}
                >
                  <sev.icon size={15} aria-hidden />
                  <span>{text.title}</span>
                  <em>{c.holes.length}</em>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
