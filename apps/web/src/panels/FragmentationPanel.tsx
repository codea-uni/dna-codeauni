import type { KuzRamInputs } from '@cronos/core';
import { RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazy, Suspense } from 'react';
import { NumberField } from '../components/NumberField';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUnits } from '../hooks/useUnits';
import { useActiveBlast } from '../hooks/useDocument';
import { useFormat, useT, type MessageKey } from '../i18n';
import { session } from '../session';

const SizeCurve = lazy(() => import('../charts/SizeCurve'));

type NumKey = {
  [K in keyof KuzRamInputs]-?: KuzRamInputs[K] extends number ? K : never;
}[keyof KuzRamInputs];

/** Campos de entrada: [clave, etiqueta, unidad, factor SI → UI, decimales]. */
const FIELDS: [NumKey, MessageKey, string, number, number][] = [
  ['rockFactor', 'frag.field.rockFactor', '', 1, 2],
  ['loadingFactor', 'frag.field.loadingFactor', 'kg/m³', 1, 3],
  ['chargePerHole', 'frag.field.chargePerHole', 'kg', 1, 1],
  ['rws', 'frag.field.rws', '%', 100, 0],
  ['burden', 'frag.field.burden', 'm', 1, 2],
  ['spacing', 'frag.field.spacing', 'm', 1, 2],
  ['diameter', 'frag.field.diameter', 'mm', 1000, 0],
  ['drillDeviation', 'frag.field.drillDeviation', 'm', 1, 2],
  ['chargeLength', 'frag.field.chargeLength', 'm', 1, 2],
  ['bottomChargeLength', 'frag.field.bottomChargeLength', 'm', 1, 2],
  ['columnChargeLength', 'frag.field.columnChargeLength', 'm', 1, 2],
  ['benchHeight', 'frag.field.benchHeight', 'm', 1, 2],
  ['patternFactor', 'frag.field.patternFactor', '', 1, 2],
];

/** Fragmentación: Kuz-Ram (x50, n) y Swebrec (KCO), P20/P50/P80, sobretamaño y finos. */
export function FragmentationPanel() {
  const t = useT();
  const format = useFormat();
  const fmt = (v: number, d = 1) => format(v, d);
  const cm = (m: number) => fmt(m * 100, 1);
  const { len, dia } = useUnits();
  const blast = useActiveBlast();
  const s = useAnalysisStore();
  const inputs = s.fragInputs;
  const r = s.frag;
  const edit = (patch: Partial<KuzRamInputs>) => {
    if (!inputs) return;
    // La desviación de perforación se guarda en la voladura (CT-08, parámetro del proyecto).
    if (patch.drillDeviation !== undefined && blast)
      session.document.dispatch(
        {
          type: 'blast/patch',
          blastId: blast.id,
          patch: { calcParams: { ...blast.calcParams, drillDeviation: patch.drillDeviation } },
        },
        t('frag.field.drillDeviation'),
      );
    s.set({ fragAuto: false, fragInputs: { ...inputs, ...patch } });
  };
  const nRange = blast?.calcParams.checks.uniformityRange;

  return (
    <>
      <section className="panel">
        <h2>{t('frag.title')}</h2>
        {!r ? (
          <p className="hint">{t('frag.needCharge')}</p>
        ) : (
          <>
            <div className="kpis">
              <div className="kpi">
                <span>P50</span>
                <strong>{cm(r.p50.swebrec)}</strong>
                <small>cm</small>
              </div>
              <div className="kpi">
                <span>P80</span>
                <strong>{cm(r.p80.swebrec)}</strong>
                <small>cm</small>
              </div>
              <div className="kpi" title={t('frag.oversizeTitle', { size: cm(r.oversize.size) })}>
                <span>&gt; {cm(r.oversize.size)} cm</span>
                <strong>{fmt(r.oversize.swebrec * 100)}</strong>
                <small>%</small>
              </div>
              <div className="kpi" title={t('frag.finesTitle', { size: cm(r.fines.size) })}>
                <span>&lt; {cm(r.fines.size)} cm</span>
                <strong>{fmt(r.fines.swebrec * 100)}</strong>
                <small>%</small>
              </div>
            </div>
            <ErrorBoundary>
              <Suspense fallback={<div className="chart tall muted">…</div>}>
                <SizeCurve result={r} />
              </Suspense>
            </ErrorBoundary>
            <table className="grid-table compact">
              <thead>
                <tr>
                  <th>cm</th>
                  <th>P20</th>
                  <th>P50</th>
                  <th>P80</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Swebrec</td>
                  <td className="num">{cm(r.p20.swebrec)}</td>
                  <td className="num">{cm(r.p50.swebrec)}</td>
                  <td className="num">{cm(r.p80.swebrec)}</td>
                </tr>
                <tr>
                  <td>Rosin-Rammler</td>
                  <td className="num">{cm(r.p20.rosinRammler)}</td>
                  <td className="num">{cm(r.p50.rosinRammler)}</td>
                  <td className="num">{cm(r.p80.rosinRammler)}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">
              n = {fmt(r.n, 2)} · b = {fmt(r.b, 2)} · x<sub>max</sub> = {cm(r.xmax)} cm
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="row-title">
          {t('frag.params')}
          <button
            className={`icon-btn${s.fragAuto ? ' active' : ''}`}
            title={t('frag.auto')}
            aria-pressed={s.fragAuto}
            onClick={() => {
              s.set({ fragAuto: true });
            }}
          >
            <RefreshCw size={15} aria-hidden />
          </button>
        </h2>
        {!inputs ? (
          <p className="hint">{t('frag.noLoaded')}</p>
        ) : (
          FIELDS.map(([key, label, unit, k, d]) => {
            // Longitudes y diámetro en las unidades del proyecto (H-104); el resto con su factor.
            const conv =
              unit === 'm'
                ? len
                : unit === 'mm'
                  ? dia
                  : { unit, show: (x: number) => x * k, parse: (x: number) => x / k };
            return (
              <NumberField
                key={key}
                label={t(label)}
                unit={conv.unit}
                decimals={unit === 'mm' && dia.unit === 'in' ? 2 : d}
                min={0}
                value={conv.show(inputs[key])}
                onCommit={(v) => {
                  edit({ [key]: conv.parse(v) });
                }}
              />
            );
          })
        )}
        {inputs &&
          blast &&
          (inputs.rockFactor < blast.calcParams.checks.rockFactorRange.min ||
            inputs.rockFactor > blast.calcParams.checks.rockFactorRange.max) && (
            <p className="warn">
              {t('frag.rockFactorOut', {
                a: inputs.rockFactor.toFixed(2),
                min: blast.calcParams.checks.rockFactorRange.min,
                max: blast.calcParams.checks.rockFactorRange.max,
              })}
            </p>
          )}
        {r && nRange && (r.n < nRange.min || r.n > nRange.max) && (
          <p className="warn">
            {t('frag.nOut', { n: fmt(r.n, 2), min: nRange.min, max: nRange.max })}
          </p>
        )}
        <p className="hint">{t('frag.status')}</p>
        <h3>{t('frag.curve')}</h3>
        <NumberField
          label={t('frag.xmax')}
          unit="cm"
          decimals={0}
          min={1}
          value={(s.fragXmax ?? r?.xmax ?? 0) * 100}
          onCommit={(v) => {
            s.set({ fragXmax: v / 100 });
          }}
        />
        <NumberField
          label={t('frag.oversize')}
          unit="cm"
          decimals={0}
          min={1}
          value={s.fragOversize * 100}
          onCommit={(v) => {
            s.set({ fragOversize: v / 100 });
          }}
        />
        <NumberField
          label={t('frag.fines')}
          unit="cm"
          decimals={1}
          min={0.1}
          value={s.fragFines * 100}
          onCommit={(v) => {
            s.set({ fragFines: v / 100 });
          }}
        />
      </section>
    </>
  );
}
