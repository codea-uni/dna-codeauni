import type { BlastAnalysis, DesignCheck } from '@blastlab/core';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import * as actions from '../actions';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazy, Suspense, useMemo } from 'react';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';

const Histogram = lazy(() => import('../charts/Histogram'));

const fmt = (v: number, d = 0) =>
  v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

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
  const analysis = useAnalysisStore((s) => s.analysis);
  const computing = useAnalysisStore((s) => s.computing);
  const windowMs = useAnalysisStore((s) => s.coincidenceWindowMs);
  const hist = useMemo(
    () => (analysis && analysis.timing.initiated > 0 ? histogram(analysis, windowMs) : null),
    [analysis, windowMs],
  );

  if (!analysis)
    return (
      <section className="panel">
        <h2>Resultados</h2>
        <p className="muted">{computing ? 'Calculando…' : 'Sin datos'}</p>
      </section>
    );
  const c = analysis.charge;
  const t = analysis.timing;
  const total = c.holeIds.length;
  const selectCoincident = () => {
    session.selection.set(t.coincidentGroups.flat());
  };

  return (
    <>
      <ChecksSection checks={analysis.checks} />
      <section className="panel">
        <h2>
          Carguío y cubicación{' '}
          <span className="muted small">
            {computing ? '· calculando…' : `· ${analysis.elapsedMs.toFixed(0)} ms`}
          </span>
        </h2>
        <table className="kv">
          <tbody>
            <Row
              label="Taladros cargados"
              value={`${c.loadedHoles} / ${total}`}
              warn={c.loadedHoles < total}
            />
            <Row label="Explosivo" value={`${fmt(c.totalExplosive)} kg`} />
            <Row label="Primas" value={`${fmt(c.totalPrimers, 1)} kg`} />
            <Row label="Metros perforados" value={`${fmt(c.drilledLength, 1)} m`} />
            <Row label="Área" value={`${fmt(c.area)} m²`} />
            <Row label="Volumen" value={`${fmt(c.volume)} m³`} />
            <Row label="Tonelaje" value={`${fmt(c.tonnage / 1000)} t`} />
            <Row label="Factor de carga" value={`${fmt(c.powderFactorVolume, 3)} kg/m³`} />
            <Row label="" value={`${fmt(c.powderFactorMass * 1000, 3)} kg/t`} />
            <Row label="Energía" value={`${fmt(c.totalEnergy / 1e6)} MJ`} />
            <Row
              label="Costo de productos"
              value={`${fmt(c.cost)} ${session.document.project.currency}`}
            />
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Tiempos</h2>
        <table className="kv">
          <tbody>
            <Row
              label="Taladros iniciados"
              value={`${t.initiated} / ${total}`}
              warn={t.notInitiated > 0}
            />
            {t.withoutDetonator > 0 && (
              <Row label="Sin detonador en taladro" value={String(t.withoutDetonator)} warn />
            )}
            {t.initiated > 0 && (
              <>
                <Row
                  label="Primer / último"
                  value={`${fmt(t.firstTime * 1000)} / ${fmt(t.lastTime * 1000)} ms`}
                />
                <Row label="Duración" value={`${fmt((t.lastTime - t.firstTime) * 1000)} ms`} />
                <Row
                  label={`Máx. taladros en ${windowMs} ms`}
                  value={String(t.maxHolesPerWindow)}
                />
                <Row
                  label={`Máx. kg en ${windowMs} ms`}
                  value={`${fmt(t.maxChargePerWindow)} kg @ ${fmt(t.maxChargeWindowStart * 1000)} ms`}
                />
                <Row label="Grupos coincidentes" value={String(t.coincidentGroups.length)} />
              </>
            )}
          </tbody>
        </table>
        {t.coincidentGroups.length > 0 && (
          <button onClick={selectCoincident}>
            Seleccionar taladros coincidentes ({t.coincidentGroups.flat().length})
          </button>
        )}
        {hist && (
          <ErrorBoundary>
            <Suspense fallback={<div className="chart muted">Cargando gráfico…</div>}>
              <Histogram starts={hist.starts} holes={hist.holes} kg={hist.kg} binMs={windowMs} />
            </Suspense>
          </ErrorBoundary>
        )}
        {t.interRowDelays.length > 0 && (
          <>
            <h3>Retardo entre filas</h3>
            <table className="grid-table compact">
              <thead>
                <tr>
                  <th>Filas</th>
                  <th>mín</th>
                  <th>máx</th>
                  <th>media [ms]</th>
                </tr>
              </thead>
              <tbody>
                {t.interRowDelays.slice(0, 40).map((r) => (
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
  error: { icon: CircleX, cls: 'sev-error', label: 'Error' },
  warning: { icon: TriangleAlert, cls: 'sev-warning', label: 'Advertencia' },
  info: { icon: Info, cls: 'sev-info', label: 'Aviso' },
} as const;

/** Revisión del diseño: cada alerta selecciona y encuadra sus taladros. */
function ChecksSection({ checks }: { checks: DesignCheck[] }) {
  return (
    <section className="panel">
      <h2>Revisión del diseño</h2>
      {checks.length === 0 ? (
        <p className="check-ok">
          <CircleCheck size={15} aria-hidden /> Sin observaciones
        </p>
      ) : (
        <ul className="checks-list">
          {checks.map((c) => {
            const sev = SEVERITY[c.severity];
            return (
              <li key={c.id}>
                <button
                  className={sev.cls}
                  title={`${sev.label}: ${c.detail}\nClic: seleccionar y encuadrar`}
                  onClick={() => {
                    actions.focusHoles(c.holes);
                  }}
                >
                  <sev.icon size={15} aria-hidden />
                  <span>{c.title}</span>
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
