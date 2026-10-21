import {
  DEVIATION_HIGH,
  drillDeviationReport,
  hasSurvey,
  type HoleId,
  type ToePair,
} from '@cronos/core';
import { Crosshair, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import * as actions from '../actions';
import { NumberCell } from '../components/CellInput';
import { Floatable } from '../components/Floatable';
import { IconButton } from '../components/IconButton';
import { useActiveBlast } from '../hooks/useDocument';
import { useFormat, useT, type MessageKey } from '../i18n';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const TABLE_ROWS = 12;

/** Rumbo [rad] → punto cardinal de 8 (N, NE, …). */
function cardinal(direction: number): (typeof DIRS)[number] {
  const i = Math.round(((direction * 180) / Math.PI / 45) % 8);
  return DIRS[(i + 8) % 8] ?? 'N';
}

/**
 * Perforación real: importa la sonda de desviación, resume cuánto se corrieron los fondos (parte
 * repetida y al azar), cómo quedó la malla al fondo y permite simular con los taladros reales.
 */
export function DrillSurveyPanel() {
  const t = useT();
  const fmt = useFormat();
  const blast = useActiveBlast();
  const input = useRef<HTMLInputElement>(null);
  const [all, setAll] = useState(false);
  const report = useMemo(() => (blast ? drillDeviationReport(blast) : null), [blast]);
  if (!blast) return null;
  const info = blast.drillSurvey;
  const measured = blast.holes.filter(hasSurvey).length;
  const dir = (rad: number) => t(`drill.dir.${cardinal(rad)}` as MessageKey);
  const pct = (r: number) => `${fmt(r * 100, 1)} %`;
  const pick = () => {
    input.current?.click();
  };
  const focus = (ids: HoleId[]) => {
    actions.focusHoles(ids);
  };
  const pairText = (p: ToePair) =>
    t('drill.toe.pair', {
      a: p.labelA,
      b: p.labelB,
      actual: fmt(p.actual, 2),
      design: fmt(p.design, 2),
    });
  const rows = report ? [...report.holes].sort((a, b) => b.offset - a.offset) : [];

  return (
    <section className="panel">
      <Floatable id="drillSurvey" title={t('drill.title')} width={640}>
        <p className="hint">{t('drill.hint')}</p>
        <input
          ref={input}
          type="file"
          accept=".phd,.csv,.txt,.tsv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.openDrillSurvey(file);
            e.target.value = '';
          }}
        />
        {!info || !report ? (
          <>
            <div className="row">
              <button className="primary" onClick={pick}>
                <Upload size={14} aria-hidden /> {t('drill.import')}
              </button>
            </div>
            <p className="muted small">{t('drill.formats')}</p>
          </>
        ) : (
          <>
            <div className="drill-source">
              <span className="muted small">
                {t('drill.source', { file: info.source, n: measured, total: blast.holes.length })}
              </span>
              <span>
                <button onClick={pick}>{t('drill.importAgain')}</button>
                <IconButton
                  icon={Trash2}
                  label={t('drill.remove')}
                  onClick={() => {
                    actions.removeDrillSurvey();
                  }}
                />
              </span>
            </div>
            <label className="check" title={t('drill.useInCalcHint')}>
              <input
                type="checkbox"
                checked={info.useInCalc}
                onChange={(e) => {
                  const on = e.target.checked;
                  actions.setDrillSurvey(
                    { useInCalc: on },
                    t(on ? 'drill.useInCalcUndo' : 'drill.useDesignUndo'),
                  );
                }}
              />
              {t('drill.useInCalc')}
            </label>
            <p className="muted small">{t('drill.useInCalcHint')}</p>
            <label className="field" title={t('drill.correctionTitle')}>
              <span className="field-label">{t('drill.correction')}</span>
              <NumberCell
                value={(info.azimuthCorrection * 180) / Math.PI}
                decimals={2}
                onCommit={(v) => {
                  actions.setDrillSurvey(
                    { azimuthCorrection: (v * Math.PI) / 180 },
                    t('drill.correctionUndo'),
                  );
                }}
              />
            </label>

            <table className="kv">
              <tbody>
                <tr>
                  <td>{t('drill.kpi.mean')}</td>
                  <td className="num">
                    {fmt(report.meanOffset, 2)} m · {t('drill.kpi.max')} {fmt(report.maxOffset, 2)}{' '}
                    m
                  </td>
                </tr>
                <tr>
                  <td title={t('drill.kpi.ratioTitle')}>{t('drill.kpi.ratio')}</td>
                  <td className={`num ${report.meanRatio > DEVIATION_HIGH ? 'warn' : ''}`}>
                    {pct(report.meanRatio)}
                  </td>
                </tr>
                <tr>
                  <td>{t('drill.kpi.high')}</td>
                  <td className={`num ${report.highCount > 0 ? 'warn' : ''}`}>
                    {report.highCount} / {report.holes.length}
                  </td>
                </tr>
                <tr>
                  <td title={t('drill.kpi.systematicTitle')}>{t('drill.kpi.systematic')}</td>
                  <td className="num">
                    {t('drill.toward', {
                      m: fmt(report.systematic.offset, 2),
                      dir: dir(report.systematic.direction),
                    })}
                  </td>
                </tr>
                <tr>
                  <td title={t('drill.kpi.randomTitle')}>{t('drill.kpi.random')}</td>
                  <td className="num">± {fmt(report.random, 2)} m</td>
                </tr>
                <tr>
                  <td title={t('drill.kpi.wTitle')}>{t('drill.kpi.w')}</td>
                  <td className="num">{fmt(report.rmsOffset, 2)} m</td>
                </tr>
              </tbody>
            </table>

            <h3>{t('drill.toe.title')}</h3>
            {Number.isFinite(report.toeSpacing.min) && (
              <p className="small">
                {t('drill.toe.spacing', {
                  min: fmt(report.toeSpacing.min, 2),
                  mean: fmt(report.toeSpacing.mean, 2),
                  design: fmt(report.toeSpacing.design, 2),
                })}
              </p>
            )}
            {report.close.length + report.far.length === 0 && (
              <p className="muted small">{t('drill.toe.none')}</p>
            )}
            {(
              [
                ['close', report.close, 'drill.toe.close', 'drill.toe.closeHint'],
                ['far', report.far, 'drill.toe.far', 'drill.toe.farHint'],
              ] as const
            ).map(
              ([key, pairs, title, hint]) =>
                pairs.length > 0 && (
                  <div key={key}>
                    <div className="drill-pairs-head">
                      <span className={key === 'close' ? 'warn' : ''}>
                        {t(title, { n: pairs.length })}
                      </span>
                      <IconButton
                        icon={Crosshair}
                        label={t('drill.select')}
                        onClick={() => {
                          focus(pairs.flatMap((p) => [p.a, p.b]));
                        }}
                      />
                    </div>
                    <p className="muted small">{t(hint)}</p>
                    <ul className="small">
                      {pairs.slice(0, 6).map((p) => (
                        <li key={`${p.a}|${p.b}`}>
                          <button
                            className="link-button"
                            onClick={() => {
                              focus([p.a, p.b]);
                            }}
                          >
                            {pairText(p)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}

            <h3>{t('drill.table.title')}</h3>
            <table className="grid-table compact drill-table">
              <thead>
                <tr>
                  <th>{t('drill.col.hole')}</th>
                  <th className="num">{t('drill.col.length')}</th>
                  <th className="num">{t('drill.col.offset')}</th>
                  <th className="num">{t('drill.col.ratio')}</th>
                  <th>{t('drill.col.dir')}</th>
                  <th className="num">{t('drill.col.spacing')}</th>
                </tr>
              </thead>
              <tbody>
                {(all ? rows : rows.slice(0, TABLE_ROWS)).map((h) => (
                  <tr
                    key={h.holeId}
                    title={t('drill.select')}
                    onClick={() => {
                      focus([h.holeId]);
                    }}
                  >
                    <td>{h.label}</td>
                    <td className="num">{fmt(h.length, 1)}</td>
                    <td className="num">{fmt(h.offset, 2)}</td>
                    <td className={`num ${h.ratio > DEVIATION_HIGH ? 'warn' : ''}`}>
                      {pct(h.ratio)}
                    </td>
                    <td>{dir(h.direction)}</td>
                    <td className="num">{fmt(h.toeSpacing, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!all && rows.length > TABLE_ROWS && (
              <button
                className="link-button"
                onClick={() => {
                  setAll(true);
                }}
              >
                {t('drill.showAll', { n: rows.length })}
              </button>
            )}
          </>
        )}
      </Floatable>
    </section>
  );
}
