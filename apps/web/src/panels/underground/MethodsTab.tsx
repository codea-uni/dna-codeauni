import {
  designByMethod,
  methodParams,
  miningMethod,
  type MethodDesign,
  type MethodParamKey,
  type MethodParams,
  type MethodWarning,
  type MiningMethodId,
} from '@cronos/core';
import { useMemo } from 'react';
import { NumberField } from '../../components/NumberField';
import { useActiveBlast, useProject } from '../../hooks/useDocument';
import { useUnits } from '../../hooks/useUnits';
import { useFormat, useT, type MessageKey } from '../../i18n';
import {
  defaultMethodPlacement,
  methodContourExplosive,
  methodExplosive,
  openInClassicTab,
  sendMethod,
} from '../../underground/methodSend';
import { useMethodStore } from '../../underground/methodStore';
import { faceWarningText } from '../../underground/warnings';
import { defaultPlacements, type Placement } from '../../underground/send';
import { MethodDrawing, METHOD_ROLE_COLORS } from './MethodDrawing';
import { MethodPicker } from './MethodPicker';
import './methods.css';

/**
 * Pestaña «Método de minado»: catálogo de plantillas y, al elegir una, sus parámetros (rellenos con
 * los valores por defecto del método), el dibujo en sección/planta/perfil, los indicadores y el
 * envío al 3D con su propia marca y ubicación.
 */

const DEG = Math.PI / 180;

type FieldKind =
  'len' | 'dia' | 'deg' | 'count' | 'ms' | 'ratio' | 'rock' | 'kgm3' | 'pct' | 'profile' | 'bool';

const KIND: Record<MethodParamKey, FieldKind> = {
  profile: 'profile',
  width: 'len',
  height: 'len',
  thickness: 'len',
  holeDiameter: 'dia',
  reliefDiameter: 'dia',
  reliefCount: 'count',
  cartridgeDiameter: 'dia',
  length: 'len',
  dip: 'deg',
  subdrill: 'len',
  burden: 'len',
  spacing: 'len',
  spacingRatio: 'ratio',
  rows: 'count',
  wallOffset: 'len',
  stemming: 'len',
  driveWidth: 'len',
  driveHeight: 'len',
  pivotHeight: 'len',
  toeSpacing: 'len',
  standOff: 'len',
  deadZone: 'deg',
  dump: 'deg',
  stopeBottom: 'len',
  stopeTop: 'len',
  collarLongK: 'ratio',
  collarShortK: 'ratio',
  liftHeight: 'len',
  burialDepth: 'len',
  chargeDiameters: 'ratio',
  bottomPlug: 'len',
  rockConstant: 'rock',
  fixation: 'ratio',
  rockDensity: 'kgm3',
  deviation: 'pct',
  collaringError: 'len',
  holeInterval: 'ms',
  rowInterval: 'ms',
  smooth: 'bool',
};

/** Límites razonables por parámetro (unidades SI del núcleo). */
const LIMITS: Partial<Record<MethodParamKey, [number, number]>> = {
  reliefCount: [1, 6],
  rows: [1, 40],
  dip: [30 * DEG, 90 * DEG],
  deadZone: [0, 170 * DEG],
  dump: [0, 30 * DEG],
};

type Outcome = { ok: true; design: MethodDesign } | { ok: false; message: string };

export function MethodsTab() {
  const id = useMethodStore((s) => s.methodId);
  const choose = useMethodStore((s) => s.choose);
  if (!id) return <MethodPicker onPick={choose} />;
  return <MethodEditor id={id} />;
}

function ParamField({
  id,
  k,
  value,
}: {
  id: MiningMethodId;
  k: MethodParamKey;
  value: MethodParams;
}) {
  const t = useT();
  const { len, dia } = useUnits();
  const patch = useMethodStore((s) => s.patch);
  const label = t(`ugm.p.${k}`);
  const set = (v: Partial<MethodParams>) => {
    patch(id, v);
  };
  const kind = KIND[k];
  if (kind === 'profile')
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <select
          value={value.profile}
          onChange={(e) => {
            set({ profile: e.target.value === 'rectangular' ? 'rectangular' : 'arched' });
          }}
        >
          <option value="arched">{t('ugm.p.profile.arched')}</option>
          <option value="rectangular">{t('ugm.p.profile.rectangular')}</option>
        </select>
      </label>
    );
  if (kind === 'bool')
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={value.smooth}
          onChange={(e) => {
            set({ smooth: e.target.checked });
          }}
        />
        {label}
      </label>
    );
  const raw = value[k];
  if (typeof raw !== 'number') return null;
  const lim = LIMITS[k];
  const conv: Record<
    Exclude<FieldKind, 'profile' | 'bool'>,
    { unit?: string; show: (x: number) => number; parse: (x: number) => number; d: number }
  > = {
    len: { unit: len.unit, show: len.show, parse: len.parse, d: 2 },
    dia: { unit: dia.unit, show: dia.show, parse: dia.parse, d: dia.unit === 'in' ? 3 : 1 },
    deg: { unit: '°', show: (x) => x / DEG, parse: (x) => x * DEG, d: 1 },
    count: { show: (x) => x, parse: (x) => Math.round(x), d: 0 },
    ms: { unit: 'ms', show: (x) => x * 1000, parse: (x) => x / 1000, d: 0 },
    ratio: { show: (x) => x, parse: (x) => x, d: 2 },
    rock: { unit: 'kg/m³', show: (x) => x, parse: (x) => x, d: 2 },
    kgm3: { unit: 'kg/m³', show: (x) => x, parse: (x) => x, d: 0 },
    pct: { unit: '%', show: (x) => x * 100, parse: (x) => x / 100, d: 2 },
  };
  const c = conv[kind];
  return (
    <NumberField
      label={label}
      {...(c.unit ? { unit: c.unit } : {})}
      decimals={c.d}
      {...(kind === 'count' ? { integer: true } : {})}
      {...(lim ? { min: c.show(lim[0]), max: c.show(lim[1]) } : {})}
      value={c.show(raw)}
      onCommit={(v) => {
        set({ [k]: c.parse(v) });
      }}
    />
  );
}

function Kpi({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: string;
}) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ''}`} title={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

function warningText(
  w: MethodWarning,
  t: ReturnType<typeof useT>,
  fmt: ReturnType<typeof useFormat>,
): string {
  const params = Object.fromEntries(
    Object.entries(w.params ?? {}).map(([k, v]) => [k, fmt(v, k === 'count' ? 0 : 2)]),
  );
  return t(`ugm.warn.${w.code}`, params);
}

function MethodEditor({ id }: { id: MiningMethodId }) {
  const t = useT();
  const fmt = useFormat();
  const project = useProject();
  const lib = project.library;
  const blast = useActiveBlast();
  const m = miningMethod(id);
  const choose = useMethodStore((s) => s.choose);
  const patchStore = useMethodStore((s) => s.patch);
  const reset = useMethodStore((s) => s.reset);
  const patch = useMethodStore((s) => s.patches[id]);
  const explosiveId = useMethodStore((s) => s.explosives[id]);
  const setExplosive = useMethodStore((s) => s.setExplosive);
  const stored = useMethodStore((s) => s.placements[id]);
  const setPlacement = useMethodStore((s) => s.setPlacement);
  const params = useMemo(() => methodParams(id, patch ?? {}), [id, patch]);
  const explosive = methodExplosive(lib, id, explosiveId, params.holeDiameter);
  const outcome = useMemo<Outcome | null>(() => {
    if (!explosive) return null;
    try {
      return { ok: true, design: designByMethod(id, patch ?? {}, explosive) };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }, [id, patch, explosive]);
  const design = outcome?.ok ? outcome.design : null;
  const placement = stored ?? defaultMethodPlacement(project, id);
  const previous = blast?.holes.filter((h) => h.tags?.includes(m.tag)).length ?? 0;
  const contour =
    explosive && m.contourExplosive ? methodContourExplosive(lib, id, explosive) : null;
  const k = design?.kpis;
  const perTonne = m.powderFactor.unit === 'kg/t';
  const pf = k ? (perTonne ? k.chargePerTonne : k.powderFactor) : 0;
  const pfUnit = perTonne ? 'kg/t' : 'kg/m³';
  const roles = [...new Set(design?.holes.map((h) => h.role))];
  const roleLabel = (r: string): string =>
    r in { relief: 1, cut: 1, stoping: 1, wall: 1, roof: 1, contour: 1, lifter: 1 }
      ? t(`ug.role.${r}` as MessageKey)
      : t(`ugm.role.${r}` as MessageKey);

  return (
    <div className="ug-layout">
      <div className="ug-inputs">
        <button
          type="button"
          className="link ugm-back"
          onClick={() => {
            choose(null);
          }}
        >
          ← {t('ugm.back')}
        </button>
        <h3>
          <span className="ugm-code">{m.code}</span> {t(`ugm.m.${id}.name`)}
        </h3>
        <p className="hint">{t(`ugm.m.${id}.use`)}</p>
        {m.presets && m.presets.length > 0 && (
          <div className="ugm-presets" aria-label={t('ugm.presets')}>
            {m.presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="chip"
                onClick={() => {
                  patchStore(id, p.values);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <h3>{t('ugm.params')}</h3>
        {m.params.map((key) => (
          <ParamField key={key} id={id} k={key} value={params} />
        ))}
        <h3>{t('ugm.explosive')}</h3>
        {lib.explosives.length === 0 ? (
          <p className="hint warn">{t('ug.noExplosive')}</p>
        ) : (
          <label className="field">
            <span className="field-label">{t('ug.explosive')}</span>
            <select
              value={explosive?.id ?? ''}
              onChange={(e) => {
                setExplosive(id, e.target.value);
              }}
            >
              {lib.explosives.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="hint">{t('ugm.explosiveSuggested', { text: t(`ugm.m.${id}.exp`) })}</p>
        {contour && contour.id !== explosive?.id && (
          <p className="hint">{t('ugm.contourExplosive', { name: contour.name })}</p>
        )}
        <div className="row">
          <button
            type="button"
            onClick={() => {
              reset(id);
            }}
          >
            {t('ugm.reset')}
          </button>
          {explosive &&
            (m.generator === 'face' || (m.generator === 'ring' && m.ringShape === 'rect')) && (
              <button
                type="button"
                onClick={() => {
                  openInClassicTab(id, explosive);
                }}
              >
                {t(m.generator === 'face' ? 'ugm.editIn.face' : 'ugm.editIn.ring')}
              </button>
            )}
        </div>
        <MethodSendBox
          placement={placement}
          previous={previous}
          disabled={!design || !explosive || design.holes.length === 0}
          onChange={(p) => {
            setPlacement(id, p);
          }}
          onReset={() => {
            const o = defaultPlacements(project).face;
            const d = defaultMethodPlacement(project, id);
            setPlacement(id, { ...d, z: o.z });
          }}
          onSend={() => {
            if (design && explosive) sendMethod(id, design, explosive, placement);
          }}
        />
      </div>

      <div className="ug-results">
        {outcome && !outcome.ok && (
          <p className="warn">{t('ug.error', { message: outcome.message })}</p>
        )}
        {design && k && (
          <>
            <MethodDrawing design={design} />
            <div className="ug-legend" aria-label={t('ug.legend')}>
              {roles.map((r) => (
                <span key={r}>
                  <i
                    className={r === 'relief' ? 'ug-swatch hollow' : 'ug-swatch'}
                    style={
                      r === 'relief'
                        ? { borderColor: METHOD_ROLE_COLORS[r] }
                        : { background: METHOD_ROLE_COLORS[r] }
                    }
                  />
                  {roleLabel(r)}
                </span>
              ))}
              <span>
                <i className="ug-swatch" style={{ background: '#ff8a4c', borderRadius: 1 }} />
                {t('ugm.legend.charge')}
              </span>
            </div>
            <div className="kpis ug-kpis">
              <Kpi
                label={t('ug.kpi.holes')}
                value={fmt(k.holes)}
                unit={t('ug.kpi.holesDetail', { charged: k.chargedHoles, relief: k.reliefHoles })}
              />
              <Kpi label={t('ug.kpi.drilled')} value={fmt(k.drilledMeters, 1)} unit="m" />
              <Kpi label={t('ug.kpi.charge')} value={fmt(k.totalCharge, 1)} unit="kg" />
              <Kpi
                label={t('ug.kpi.powderFactor')}
                value={fmt(pf, perTonne ? 2 : 2)}
                unit={`${pfUnit} · ${t(`ugm.pf.${design.powderFactorStatus}`)}`}
                tone={design.powderFactorStatus === 'ok' ? 'ok' : 'warn'}
              />
              <Kpi
                label={perTonne ? t('ug.kpi.tonnes') : t('ugm.kpi.volume')}
                value={fmt(perTonne ? k.tonnes : k.volume, 0)}
                unit={perTonne ? 't' : 'm³'}
              />
              {k.advance !== undefined && (
                <Kpi label={t('ug.kpi.advance')} value={fmt(k.advance, 2)} unit="m" />
              )}
              <Kpi
                label={perTonne ? t('ug.kpi.powderFactor') : t('ug.kpi.chargePerTonne')}
                value={fmt(perTonne ? k.powderFactor : k.chargePerTonne, 2)}
                unit={perTonne ? 'kg/m³' : 'kg/t'}
              />
              <Kpi label={t('ugm.kpi.maxPerDelay')} value={fmt(k.maxChargePerDelay, 1)} unit="kg" />
              {design.rules && (
                <>
                  <Kpi
                    label={design.ring ? t('ugm.kpi.toeSpacing') : t('ugm.kpi.burden')}
                    value={`${fmt(design.rules.burden, 2)} × ${fmt(design.rules.spacing, 2)}`}
                    unit={design.rules.auto ? `m · ${t('ugm.kpi.auto')}` : 'm'}
                  />
                  <Kpi
                    label={t('ugm.kpi.langefors')}
                    value={fmt(design.rules.langeforsPractical, 2)}
                    unit={`m · ${t('ugm.kpi.empirical')} ${fmt(design.rules.empiricalMin, 1)}–${fmt(design.rules.empiricalMax, 1)}`}
                  />
                </>
              )}
            </div>
            <p className="hint">
              {t('ugm.pfTarget', {
                min: fmt(m.powderFactor.min, 2),
                max: fmt(m.powderFactor.max, 2),
                unit: pfUnit,
              })}
            </p>
            {(design.warnings.length > 0 || design.faceWarnings.length > 0) && (
              <ul className="ug-warnings">
                {design.warnings.map((w, i) => (
                  <li key={`m${String(i)}`} className="warn">
                    {warningText(w, t, fmt)}
                  </li>
                ))}
                {design.faceWarnings
                  .filter((w) => w.code !== 'depthLimited')
                  .map((w, i) => (
                    <li key={`f${String(i)}`} className="warn">
                      {faceWarningText(w, t, fmt)}
                    </li>
                  ))}
              </ul>
            )}
            <details className="ug-fold" open>
              <summary>{t('ugm.sequence')}</summary>
              <p className="hint">{t(`ugm.m.${id}.seq`)}</p>
              <p className="hint">
                {t('ugm.reference')}: {m.reference}. {t('ugm.defaultsNote')}
              </p>
            </details>
            <details className="ug-fold">
              <summary>{t('ugm.table', { n: design.holes.length })}</summary>
              <div className="table-scroll">
                <table className="grid-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('ug.table.role')}</th>
                      <th className="num">{t('ug.table.length')} [m]</th>
                      <th className="num">{t('ug.kpi.chargedMeters')} [m]</th>
                      <th className="num">{t('ug.table.kg')}</th>
                      <th className="num">{t('ugm.table.ms')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {design.holes.map((h) => (
                      <tr key={h.index}>
                        <td>{h.index}</td>
                        <td>
                          <i
                            className="ug-swatch"
                            style={{ background: METHOD_ROLE_COLORS[h.role] }}
                          />{' '}
                          {roleLabel(h.role)}
                        </td>
                        <td className="num">{fmt(h.length, 2)}</td>
                        <td className="num">
                          {fmt(
                            h.decks.reduce((s, d) => s + (d.kind === 'charge' ? d.length : 0), 0),
                            2,
                          )}
                        </td>
                        <td className="num">{h.mass > 0 ? fmt(h.mass, 1) : '—'}</td>
                        <td className="num">{h.delay === null ? '—' : fmt(h.delay * 1000, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function MethodSendBox({
  placement,
  previous,
  disabled,
  onChange,
  onReset,
  onSend,
}: {
  placement: Placement;
  previous: number;
  disabled: boolean;
  onChange: (p: Placement) => void;
  onReset: () => void;
  onSend: () => void;
}) {
  const t = useT();
  const { len } = useUnits();
  const set = (p: Partial<Placement>) => {
    onChange({ ...placement, ...p });
  };
  const coord = (key: 'x' | 'y' | 'z', label: MessageKey) => (
    <NumberField
      label={t(label)}
      unit={len.unit}
      decimals={2}
      value={len.show(placement[key])}
      onCommit={(v) => {
        set({ [key]: len.parse(v) });
      }}
    />
  );
  return (
    <div className="ug-send">
      <h3>{t('ugm.send')}</h3>
      <p className="hint">{t('ugm.sendHint')}</p>
      {coord('x', 'ug.originX')}
      {coord('y', 'ug.originY')}
      {coord('z', 'ug.originZ')}
      <NumberField
        label={t('ug.azimuth')}
        unit="°"
        decimals={1}
        min={0}
        max={360}
        value={placement.azimuthDeg}
        onCommit={(v) => {
          set({ azimuthDeg: v % 360 });
        }}
      />
      <NumberField
        label={t('ug.gradient')}
        unit="%"
        decimals={1}
        min={-30}
        max={30}
        value={placement.gradientPct}
        onCommit={(v) => {
          set({ gradientPct: v });
        }}
      />
      <div className="row">
        <button type="button" onClick={onReset}>
          {t('ug.originFromSurvey')}
        </button>
      </div>
      {previous > 0 && <p className="hint">{t('ugm.sendReplace', { n: previous })}</p>}
      <button type="button" className="primary" disabled={disabled} onClick={onSend}>
        {t('ugm.send')}
      </button>
    </div>
  );
}
