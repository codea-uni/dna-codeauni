import {
  choiceModel,
  fragmentationHeadline,
  METHOD_CHOICES,
  type CalcParams,
  type KuzRamInputs,
} from '@cronos/core';
import { MethodDetail } from '../methods/MethodDetail';
import { RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazy, Suspense } from 'react';
import { NumberField } from '../components/NumberField';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUnits } from '../hooks/useUnits';
import { useActiveBlast } from '../hooks/useDocument';
import { useFormat, useT, type MessageKey } from '../i18n';
import { session } from '../session';
import { Floatable } from '../components/Floatable';
import { useProjectKind } from '../product/product';
import { ShotPicker, useShot } from '../underground/shots';
import { RING_TAG } from '../underground/send';

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
  // Metodología elegida (guardada en la voladura): variante de Kuz-Ram y curva informada.
  const method: NonNullable<CalcParams['fragmentation']> = blast?.calcParams.fragmentation ?? {
    model: 'cunningham1987',
    curve: 'swebrec',
  };
  const setMethod = (patch: Partial<typeof method>) => {
    if (!blast) return;
    const next = { ...method, ...patch };
    session.document.dispatch(
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { calcParams: { ...blast.calcParams, fragmentation: next } },
      },
      t('md.methodology'),
    );
    // Recalcula ya (también con las entradas editadas a mano).
    if (inputs && patch.model) s.set({ fragInputs: { ...inputs, variant: patch.model } });
  };
  const h = r ? fragmentationHeadline(r, method.curve) : null;
  // Subterránea (A8): se calcula sobre un disparo (frente o abanicos) y con nombres de labor.
  const underground = useProjectKind() === 'underground';
  const shot = useShot();
  const ringShot = underground && (shot.tag ?? shot.single) === RING_TAG;
  const fieldLabel = (key: NumKey, label: MessageKey): MessageKey =>
    !underground
      ? label
      : key === 'benchHeight'
        ? 'uga.frag.holeLength'
        : ringShot && key === 'burden'
          ? 'uga.frag.ringBurden'
          : ringShot && key === 'spacing'
            ? 'uga.frag.toeSpacing'
            : label;
  const kr = choiceModel('fragmentationModel', method.model);
  const curveModel = choiceModel('fragmentationCurve', method.curve);

  return (
    <>
      <section className="panel">
        <Floatable id="frag" title={t('frag.title')} width={760}>
          <ShotPicker />
          <MethodDetail
            id={kr}
            note={underground ? t(ringShot ? 'uga.frag.noteRing' : 'uga.frag.noteFace') : undefined}
            choice={{
              label: t('md.methodology'),
              value: method.model,
              options: METHOD_CHOICES.fragmentationModel,
              disabled: !blast || session.document.readOnly,
              onChange: (value) => {
                const o = METHOD_CHOICES.fragmentationModel.find((x) => x.value === value);
                if (o) setMethod({ model: o.value });
              },
            }}
            values={
              inputs
                ? {
                    a: inputs.rockFactor,
                    k: inputs.loadingFactor,
                    q: inputs.chargePerHole,
                    rws: inputs.rws * 100,
                    b: inputs.burden,
                    s: inputs.spacing,
                    d: inputs.diameter * 1000,
                    w: inputs.drillDeviation,
                    c: 1,
                    x50: r ? r.x50 * 100 : undefined,
                    n: r?.n,
                  }
                : undefined
            }
          />
          <MethodDetail
            id={curveModel}
            choice={{
              label: t('md.curve'),
              value: method.curve,
              options: METHOD_CHOICES.fragmentationCurve,
              disabled: !blast || session.document.readOnly,
              onChange: (value) => {
                const o = METHOD_CHOICES.fragmentationCurve.find((x) => x.value === value);
                if (o) setMethod({ curve: o.value });
              },
            }}
            values={
              r
                ? {
                    x50: r.x50 * 100,
                    xmax: r.xmax * 100,
                    b: r.b,
                    xc: r.xc * 100,
                    n: r.n,
                    p80: (h?.p80 ?? 0) * 100,
                  }
                : undefined
            }
          />
          {!r || !h ? (
            <p className="hint">{t('frag.needCharge')}</p>
          ) : (
            <>
              <div className="kpis">
                <div className="kpi">
                  <span>P50</span>
                  <strong>{cm(h.p50)}</strong>
                  <small>cm</small>
                </div>
                <div className="kpi">
                  <span>P80</span>
                  <strong>{cm(h.p80)}</strong>
                  <small>cm</small>
                </div>
                <div className="kpi" title={t('frag.oversizeTitle', { size: cm(r.oversize.size) })}>
                  <span>&gt; {cm(r.oversize.size)} cm</span>
                  <strong>{fmt(h.oversize * 100)}</strong>
                  <small>%</small>
                </div>
                <div className="kpi" title={t('frag.finesTitle', { size: cm(r.fines.size) })}>
                  <span>&lt; {cm(r.fines.size)} cm</span>
                  <strong>{fmt(h.fines * 100)}</strong>
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
                    <th className="num">P20</th>
                    <th className="num">P50</th>
                    <th className="num">P80</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={method.curve === 'swebrec' ? 'selected' : undefined}>
                    <td>Swebrec</td>
                    <td className="num">{cm(r.p20.swebrec)}</td>
                    <td className="num">{cm(r.p50.swebrec)}</td>
                    <td className="num">{cm(r.p80.swebrec)}</td>
                  </tr>
                  <tr className={method.curve === 'rosinRammler' ? 'selected' : undefined}>
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
        </Floatable>
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
                label={t(fieldLabel(key, label))}
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
