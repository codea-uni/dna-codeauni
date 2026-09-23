import type { KuzRamInputs } from '@blastlab/core';
import { RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazy, Suspense } from 'react';
import { NumberField } from '../components/NumberField';
import { useAnalysisStore } from '../stores/analysisStore';

const SizeCurve = lazy(() => import('../charts/SizeCurve'));
const fmt = (v: number, d = 1) =>
  v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const cm = (m: number) => fmt(m * 100, 1);

type NumKey = {
  [K in keyof KuzRamInputs]: KuzRamInputs[K] extends number ? K : never;
}[keyof KuzRamInputs];

/** Campos de entrada: [clave, etiqueta, unidad, factor SI → UI, decimales]. */
const FIELDS: [NumKey, string, string, number, number][] = [
  ['rockFactor', 'Factor de roca A', '', 1, 2],
  ['powderFactor', 'Factor de carga', 'kg/m³', 1, 3],
  ['chargePerHole', 'Carga por taladro', 'kg', 1, 1],
  ['rws', 'RWS (ANFO = 100)', '%', 100, 0],
  ['burden', 'Burden', 'm', 1, 2],
  ['spacing', 'Espaciamiento', 'm', 1, 2],
  ['diameter', 'Diámetro', 'mm', 1000, 0],
  ['drillDeviation', 'Desviación perforación', 'm', 1, 2],
  ['chargeLength', 'Largo de carga', 'm', 1, 2],
  ['bottomChargeLength', 'Carga de fondo', 'm', 1, 2],
  ['columnChargeLength', 'Carga de columna', 'm', 1, 2],
  ['benchHeight', 'Altura de banco', 'm', 1, 2],
];

/** Fragmentación: Kuz-Ram (x50, n) y Swebrec (KCO), P20/P50/P80, sobretamaño y finos. */
export function FragmentationPanel() {
  const s = useAnalysisStore();
  const inputs = s.fragInputs;
  const r = s.frag;
  const edit = (patch: Partial<KuzRamInputs>) => {
    if (inputs) s.set({ fragAuto: false, fragInputs: { ...inputs, ...patch } });
  };

  return (
    <>
      <section className="panel">
        <h2>Fragmentación</h2>
        {!r ? (
          <p className="hint">
            Carga los taladros (pestaña Carguío) para estimar la fragmentación.
          </p>
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
              <div className="kpi" title={`Fracción mayor a ${cm(r.oversize.size)} cm`}>
                <span>&gt; {cm(r.oversize.size)} cm</span>
                <strong>{fmt(r.oversize.swebrec * 100)}</strong>
                <small>%</small>
              </div>
              <div className="kpi" title={`Fracción menor a ${cm(r.fines.size)} cm`}>
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
          Parámetros
          <button
            className={`icon-btn${s.fragAuto ? ' active' : ''}`}
            title="Tomar de la voladura (se actualiza con cada cambio)"
            aria-pressed={s.fragAuto}
            onClick={() => {
              s.set({ fragAuto: true });
            }}
          >
            <RefreshCw size={15} aria-hidden />
          </button>
        </h2>
        {!inputs ? (
          <p className="hint">Sin taladros cargados.</p>
        ) : (
          FIELDS.map(([key, label, unit, k, d]) => (
            <NumberField
              key={key}
              label={label}
              unit={unit}
              decimals={d}
              min={0}
              value={inputs[key] * k}
              onCommit={(v) => {
                edit({ [key]: v / k });
              }}
            />
          ))
        )}
        <h3>Curva</h3>
        <NumberField
          label="Tamaño máximo (Swebrec)"
          unit="cm"
          decimals={0}
          min={1}
          value={(s.fragXmax ?? r?.xmax ?? 0) * 100}
          onCommit={(v) => {
            s.set({ fragXmax: v / 100 });
          }}
        />
        <NumberField
          label="Sobretamaño sobre"
          unit="cm"
          decimals={0}
          min={1}
          value={s.fragOversize * 100}
          onCommit={(v) => {
            s.set({ fragOversize: v / 100 });
          }}
        />
        <NumberField
          label="Finos bajo"
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
