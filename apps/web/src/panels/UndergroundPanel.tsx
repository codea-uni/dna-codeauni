import { useEffect, useMemo, type ReactNode } from 'react';
import type { FaceWarning, ProductLibrary } from '@cronos/core';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT, type MessageKey } from '../i18n';
import { FaceDrawing, RingDrawing, ROLE_COLORS, ROLE_ORDER } from '../underground/drawings';
import {
  computeFace,
  computeRing,
  pickExplosive,
  PROFILE_CHOICES,
  type FaceComputation,
  type RingComputation,
} from '../underground/model';
import {
  defaultOrigin,
  FACE_TAG,
  RING_TAG,
  sendFace,
  sendRings,
  taggedHoles,
  type Placement,
} from '../underground/send';
import { useUndergroundStore } from '../underground/store';

const DEG = Math.PI / 180;

/** Resultado o mensaje de error del cálculo (datos fuera de rango). */
type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

function attempt<T>(fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Herramienta subterránea (Fase 3): ronda de un frente de túnel por el método sueco y abanicos de
 * tajeo. El cálculo es puro y en vivo; «Llevar al diseño 3D» crea los taladros en la voladura
 * activa con un solo comando deshacible.
 */
export function UndergroundPanel() {
  const t = useT();
  const tab = useUndergroundStore((s) => s.tab);
  const setTab = useUndergroundStore((s) => s.setTab);
  const project = useProject();
  const placement = useUndergroundStore((s) => s.placement);
  const setPlacement = useUndergroundStore((s) => s.setPlacement);
  useEffect(() => {
    if (placement) return;
    const o = defaultOrigin(project);
    setPlacement({ x: o.x, y: o.y, z: o.z, azimuthDeg: 0, gradientPct: 0 });
  }, [placement, project, setPlacement]);

  return (
    <section className="panel ug">
      <div className="segmented" role="tablist">
        {(['face', 'ring'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
            }}
          >
            {t(id === 'face' ? 'ug.tab.face' : 'ug.tab.ring')}
          </button>
        ))}
      </div>
      {tab === 'face' ? <FaceTab /> : <RingTab />}
    </section>
  );
}

function ExplosiveSelect({
  label,
  library,
  value,
  onChange,
}: {
  label: string;
  library: ProductLibrary;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const current = pickExplosive(library, value);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={current?.id ?? ''}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {library.explosives.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="kpi" title={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="ug-fold">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

// ------------------------------------------------------------------ Frente

function warningText(
  w: FaceWarning,
  t: ReturnType<typeof useT>,
  fmt: (v: number, d?: number) => string,
): string {
  const p = w.params ?? {};
  const v = (k: string, d = 2) => fmt(p[k] ?? NaN, d);
  switch (w.code) {
    case 'reliefNotLarger':
      return t('ug.warn.reliefNotLarger', {
        relief: fmt((p.reliefDiameter ?? NaN) * 1000, 0),
        hole: fmt((p.holeDiameter ?? NaN) * 1000, 0),
      });
    case 'firstBurdenNonPositive':
      return t('ug.warn.firstBurdenNonPositive', { f: v('drillingError') });
    case 'cutChargeBelowRequired':
      return t('ug.warn.cutChargeBelowRequired', {
        required: v('required', 3),
        available: v('available', 3),
      });
    case 'cutBurdenLimited':
      return t('ug.warn.cutBurdenLimited', { square: v('square', 0) });
    case 'depthLimited':
      return t('ug.warn.depthLimited', { relief: v('depthFromRelief'), depth: v('depth') });
    case 'lifterBurdenOver06L':
      return t('ug.warn.lifterBurdenOver06L', { burden: v('burden'), limit: v('limit') });
    case 'holesOutsideProfile':
      return t('ug.warn.holesOutsideProfile', { count: v('count', 0) });
    case 'cutOutsideProfile':
      return t('ug.warn.cutOutsideProfile');
    case 'contourChargeExceedsExplosive':
      return t('ug.warn.contourChargeExceedsExplosive', {
        required: v('required', 3),
        available: v('available', 3),
      });
    case 'singleCutSquare':
      return t('ug.warn.singleCutSquare');
  }
}

const GROUP_LABELS = [
  ['lifter', 'ug.role.lifter'],
  ['wall', 'ug.role.wall'],
  ['roof', 'ug.role.roof'],
  ['stopingUp', 'ug.role.stoping'],
  ['contour', 'ug.role.contour'],
] as const satisfies readonly (readonly [string, MessageKey])[];

function FaceTab() {
  const t = useT();
  const fmt = useFormat();
  const { len, dia } = useUnits();
  const library = useProject().library;
  const blast = useActiveBlast();
  const form = useUndergroundStore((s) => s.face);
  const patch = useUndergroundStore((s) => s.patchFace);
  const placement = useUndergroundStore((s) => s.placement);
  const explosive = pickExplosive(library, form.explosiveId);
  const result = useMemo<Outcome<FaceComputation> | null>(
    () => (explosive ? attempt(() => computeFace(form, explosive)) : null),
    [form, explosive],
  );
  const face = result?.ok ? result.value : null;
  const design = face?.design;
  const k = design?.kpis;
  const previous = taggedHoles(blast, FACE_TAG).length;
  const roles = new Set(design?.holes.map((h) => h.role));

  return (
    <div className="ug-layout">
      <div className="ug-inputs">
        <h3>{t('ug.section.geometry')}</h3>
        <label className="field">
          <span className="field-label">{t('ug.profile')}</span>
          <select
            value={form.profile}
            onChange={(e) => {
              const profile = PROFILE_CHOICES.find((p) => p === e.target.value);
              if (profile) patch({ profile });
            }}
          >
            {PROFILE_CHOICES.map((p) => (
              <option key={p} value={p}>
                {t(`ug.profile.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label={t('ug.width')}
          unit={len.unit}
          decimals={2}
          min={0.5}
          value={len.show(form.width)}
          onCommit={(v) => {
            patch({ width: len.parse(v) });
          }}
        />
        <NumberField
          label={t('ug.height')}
          unit={len.unit}
          decimals={2}
          min={0.5}
          disabled={form.profile === 'circular'}
          value={len.show(form.profile === 'circular' ? form.width : form.height)}
          onCommit={(v) => {
            patch({ height: len.parse(v) });
          }}
        />
        {form.profile === 'circular' && <p className="hint">{t('ug.heightCircular')}</p>}

        <h3>{t('ug.section.drilling')}</h3>
        <NumberField
          label={t('ug.drillDiameter')}
          unit={dia.unit}
          decimals={dia.unit === 'in' ? 3 : 1}
          min={0.001}
          value={dia.show(form.holeDiameter)}
          onCommit={(v) => {
            patch({ holeDiameter: dia.parse(v) });
          }}
        />
        <NumberField
          label={t('ug.reliefDiameter')}
          unit={dia.unit}
          decimals={dia.unit === 'in' ? 3 : 1}
          min={0.001}
          value={dia.show(form.reliefDiameter)}
          onCommit={(v) => {
            patch({ reliefDiameter: dia.parse(v) });
          }}
        />
        <NumberField
          label={t('ug.reliefCount')}
          integer
          min={1}
          max={6}
          decimals={0}
          value={form.reliefCount}
          onCommit={(v) => {
            patch({ reliefCount: v });
          }}
        />
        <NumberField
          label={t('ug.maxDrill')}
          unit={len.unit}
          decimals={2}
          min={0.5}
          value={len.show(form.maxDrill)}
          onCommit={(v) => {
            patch({ maxDrill: len.parse(v) });
          }}
        />
        <NumberField
          label={t('ug.rockConstant')}
          unit="kg/m³"
          decimals={2}
          min={0.1}
          max={2}
          value={form.rockConstant}
          onCommit={(v) => {
            patch({ rockConstant: v });
          }}
        />

        <h3>{t('ug.section.explosive')}</h3>
        {library.explosives.length === 0 ? (
          <p className="hint warn">{t('ug.noExplosive')}</p>
        ) : (
          <>
            <ExplosiveSelect
              label={t('ug.explosive')}
              library={library}
              value={form.explosiveId}
              onChange={(explosiveId) => {
                patch({ explosiveId });
              }}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={form.smooth}
                onChange={(e) => {
                  patch({ smooth: e.target.checked });
                }}
              />
              {t('ug.smooth')}
            </label>
            {form.smooth && (
              <ExplosiveSelect
                label={t('ug.contourExplosive')}
                library={library}
                value={form.contourExplosiveId ?? explosive?.id ?? null}
                onChange={(contourExplosiveId) => {
                  patch({ contourExplosiveId });
                }}
              />
            )}
          </>
        )}

        <h3>{t('ug.section.sequence')}</h3>
        <NumberField
          label={t('ug.delayInterval')}
          unit="ms"
          decimals={0}
          min={1}
          value={form.delayInterval * 1000}
          onCommit={(v) => {
            patch({ delayInterval: v / 1000 });
          }}
        />

        <SendBox
          previous={previous}
          disabled={!face}
          onSend={(p) => {
            if (face) sendFace(form, face, p);
          }}
          placement={placement}
        />
      </div>

      <div className="ug-results">
        {result && !result.ok && (
          <p className="warn">{t('ug.error', { message: result.message })}</p>
        )}
        {face && design && k && (
          <>
            <div className="ug-drawing">
              <FaceDrawing face={face} />
            </div>
            <div className="ug-legend" aria-label={t('ug.legend')}>
              {ROLE_ORDER.filter((r) => roles.has(r)).map((r) => (
                <span key={r}>
                  <i
                    className={r === 'relief' ? 'ug-swatch hollow' : 'ug-swatch'}
                    style={
                      r === 'relief'
                        ? { borderColor: ROLE_COLORS[r] }
                        : { background: ROLE_COLORS[r] }
                    }
                  />
                  {t(`ug.role.${r}`)}
                </span>
              ))}
              <span>
                <i className="ug-swatch square" style={{ borderColor: ROLE_COLORS.cut }} />
                {t('ug.cutSquares')}
              </span>
            </div>
            <div className="kpis ug-kpis">
              <Kpi
                label={t('ug.kpi.holes')}
                value={fmt(k.chargedHoles + k.reliefHoles)}
                unit={t('ug.kpi.holesDetail', { charged: k.chargedHoles, relief: k.reliefHoles })}
              />
              <Kpi
                label={t('ug.kpi.depth')}
                value={fmt(len.show(design.depth), 2)}
                unit={len.unit}
              />
              <Kpi
                label={t('ug.kpi.advance')}
                value={fmt(len.show(k.advance), 2)}
                unit={len.unit}
              />
              <Kpi
                label={t('ug.kpi.drilled')}
                value={fmt(len.show(k.drilledMeters), 1)}
                unit={len.unit}
              />
              <Kpi label={t('ug.kpi.charge')} value={fmt(k.totalCharge, 1)} unit="kg" />
              <Kpi label={t('ug.kpi.powderFactor')} value={fmt(k.powderFactor, 2)} unit="kg/m³" />
              <Kpi
                label={t('ug.kpi.chargePerAdvance')}
                value={fmt(k.chargePerAdvance, 1)}
                unit="kg/m"
              />
              <Kpi
                label={t('ug.kpi.drilledPerVolume')}
                value={fmt(k.drilledPerVolume, 2)}
                unit="m/m³"
              />
              <Kpi
                label={t('ug.kpi.empirical')}
                value={fmt(k.empiricalHoleCount, 0)}
                unit={t('ug.kpi.empiricalDetail')}
              />
              <Kpi label={t('ug.kpi.area')} value={fmt(face.profile.area, 1)} unit="m²" />
            </div>
            {design.warnings.length > 0 && (
              <ul className="ug-warnings">
                {design.warnings.map((w, i) => (
                  <li key={`${w.code}${String(i)}`} className="warn">
                    {warningText(w, t, fmt)}
                  </li>
                ))}
              </ul>
            )}
            <Fold title={t('ug.holmberg')}>
              <table className="kv">
                <tbody>
                  <KvRow
                    label={t('ug.holmberg.phi')}
                    value={`${fmt(design.equivalentReliefDiameter * 1000, 0)} mm`}
                  />
                  <KvRow
                    label={t('ug.holmberg.depthRelief')}
                    value={`${fmt(design.depthFromRelief, 2)} m`}
                  />
                  <KvRow
                    label={t('ug.holmberg.drillingError')}
                    value={`${fmt(design.drillingError, 3)} m`}
                  />
                  <KvRow
                    label={t('ug.holmberg.linearCharge')}
                    value={`${fmt(design.linearCharge, 3)} kg/m`}
                  />
                  <KvRow
                    label={t('ug.holmberg.l1')}
                    value={`${fmt(design.firstSquareRequiredCharge, 3)} kg/m`}
                  />
                </tbody>
              </table>
              <table className="grid-table compact">
                <thead>
                  <tr>
                    <th>{t('ug.holmberg.square')}</th>
                    <th className="num">{t('ug.holmberg.burden')} [m]</th>
                    <th className="num">{t('ug.holmberg.practical')} [m]</th>
                    <th className="num">{t('ug.holmberg.side')} [m]</th>
                    <th className="num">{t('ug.holmberg.charge')} [kg/m]</th>
                  </tr>
                </thead>
                <tbody>
                  {design.squares.map((s) => (
                    <tr key={s.index}>
                      <td>{s.index}</td>
                      <td className="num">{fmt(s.burden, 3)}</td>
                      <td className="num">{fmt(s.practicalBurden, 3)}</td>
                      <td className="num">{fmt(s.side, 3)}</td>
                      <td className="num">{fmt(s.linearCharge, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                {t('ug.holmberg.groups')}:{' '}
                {GROUP_LABELS.map(
                  ([g, key]) => `${t(key)} ${fmt(design.groupBurden[g], 2)} m`,
                ).join(' · ')}
              </p>
            </Fold>
            <Fold title={t('ug.table', { n: design.holes.length })}>
              <div className="table-scroll">
                <table className="grid-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('ug.table.role')}</th>
                      <th className="num">{t('ug.table.delay')}</th>
                      <th className="num">
                        {t('ug.table.length')} [{len.unit}]
                      </th>
                      <th className="num">{t('ug.table.kg')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {design.holes.map((h) => (
                      <tr key={h.index}>
                        <td>F-{h.index}</td>
                        <td>
                          <i className="ug-swatch" style={{ background: ROLE_COLORS[h.role] }} />{' '}
                          {t(`ug.role.${h.role}`)}
                        </td>
                        <td className="num">{h.delay ?? '—'}</td>
                        <td className="num">{fmt(len.show(h.length), 2)}</td>
                        <td className="num">{h.charge ? fmt(h.charge.mass, 2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Fold>
          </>
        )}
      </div>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="muted">{label}</td>
      <td className="num">{value}</td>
    </tr>
  );
}

// ------------------------------------------------------------------ Envío al 3D

function SendBox({
  placement,
  previous,
  disabled,
  onSend,
}: {
  placement: Placement | null;
  previous: number;
  disabled: boolean;
  onSend: (p: Placement) => void;
}) {
  const t = useT();
  const { len } = useUnits();
  const project = useProject();
  const setPlacement = useUndergroundStore((s) => s.setPlacement);
  if (!placement) return null;
  const set = (p: Partial<Placement>) => {
    setPlacement({ ...placement, ...p });
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
      <h3>{t('ug.section.send')}</h3>
      <p className="hint">{t('ug.originHint')}</p>
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
        <button
          onClick={() => {
            const o = defaultOrigin(project);
            set({ x: o.x, y: o.y, z: o.z });
          }}
        >
          {t('ug.originFromSurvey')}
        </button>
      </div>
      {previous > 0 && <p className="hint">{t('ug.sendReplace', { n: previous })}</p>}
      <button
        className="primary"
        disabled={disabled}
        onClick={() => {
          onSend(placement);
        }}
      >
        {t('ug.send')}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Abanicos

type RingLengthKey =
  | 'driveWidth'
  | 'driveHeight'
  | 'stopeWidth'
  | 'stopeBottom'
  | 'stopeTop'
  | 'stopeOffset'
  | 'pivotHeight'
  | 'pivotOffset'
  | 'toeSpacing'
  | 'standOff'
  | 'maxLength'
  | 'burden';

function RingTab() {
  const t = useT();
  const fmt = useFormat();
  const { len, dia } = useUnits();
  const library = useProject().library;
  const blast = useActiveBlast();
  const form = useUndergroundStore((s) => s.ring);
  const patch = useUndergroundStore((s) => s.patchRing);
  const placement = useUndergroundStore((s) => s.placement);
  const explosive = pickExplosive(library, form.explosiveId);
  const result = useMemo<Outcome<RingComputation> | null>(
    () => (explosive ? attempt(() => computeRing(form, explosive)) : null),
    [form, explosive],
  );
  const ring = result?.ok ? result.value : null;
  const k = ring?.ring.kpis;
  const n = Math.max(1, form.rings);
  const previous = taggedHoles(blast, RING_TAG).length;
  const truncated = ring?.ring.holes.filter((h) => h.truncated).length ?? 0;
  const ms = (s: number) => fmt(s * 1000, 0);
  const lenField = (key: RingLengthKey, label: MessageKey, min?: number) => (
    <NumberField
      label={t(label)}
      unit={len.unit}
      decimals={2}
      {...(min !== undefined ? { min } : {})}
      value={len.show(form[key])}
      onCommit={(v) => {
        patch({ [key]: len.parse(v) });
      }}
    />
  );

  return (
    <div className="ug-layout">
      <div className="ug-inputs">
        <h3>{t('ug.section.geometry')}</h3>
        {lenField('driveWidth', 'ug.driveWidth', 1)}
        {lenField('driveHeight', 'ug.driveHeight', 1)}
        <h3>{t('ug.section.stope')}</h3>
        {lenField('stopeWidth', 'ug.stopeWidth', 1)}
        {lenField('stopeBottom', 'ug.stopeBottom')}
        {lenField('stopeTop', 'ug.stopeTop')}
        {lenField('stopeOffset', 'ug.stopeOffset')}
        {lenField('pivotHeight', 'ug.pivotHeight', 0.1)}
        {lenField('pivotOffset', 'ug.pivotOffset')}
        <label className="field">
          <span className="field-label">{t('ug.mode')}</span>
          <select
            value={form.mode}
            onChange={(e) => {
              patch({ mode: e.target.value === 'angle' ? 'angle' : 'toeSpacing' });
            }}
          >
            <option value="toeSpacing">{t('ug.mode.toeSpacing')}</option>
            <option value="angle">{t('ug.mode.angle')}</option>
          </select>
        </label>
        {form.mode === 'toeSpacing' ? (
          lenField('toeSpacing', 'ug.toeSpacing', 0.2)
        ) : (
          <NumberField
            label={t('ug.angleStep')}
            unit="°"
            decimals={1}
            min={0.5}
            max={45}
            value={form.angleStep / DEG}
            onCommit={(v) => {
              patch({ angleStep: v * DEG });
            }}
          />
        )}
        {lenField('standOff', 'ug.standOff', 0)}
        {lenField('maxLength', 'ug.maxLength', 1)}
        <NumberField
          label={t('ug.deadZone')}
          unit="°"
          decimals={0}
          min={0}
          max={90}
          value={form.deadZone / DEG}
          onCommit={(v) => {
            patch({ deadZone: v * DEG });
          }}
        />

        <h3>{t('ug.section.drilling')}</h3>
        <NumberField
          label={t('ug.holeDiameter')}
          unit={dia.unit}
          decimals={dia.unit === 'in' ? 3 : 1}
          min={0.001}
          value={dia.show(form.holeDiameter)}
          onCommit={(v) => {
            patch({ holeDiameter: dia.parse(v) });
          }}
        />
        {library.explosives.length === 0 ? (
          <p className="hint warn">{t('ug.noExplosive')}</p>
        ) : (
          <ExplosiveSelect
            label={t('ug.explosive')}
            library={library}
            value={form.explosiveId}
            onChange={(explosiveId) => {
              patch({ explosiveId });
            }}
          />
        )}
        {lenField('burden', 'ug.burden', 0.3)}
        <NumberField
          label={t('ug.rockDensity')}
          unit="kg/m³"
          decimals={0}
          min={1000}
          max={6000}
          value={form.rockDensity}
          onCommit={(v) => {
            patch({ rockDensity: v });
          }}
        />
        <NumberField
          label={t('ug.rings')}
          integer
          decimals={0}
          min={1}
          max={50}
          value={form.rings}
          onCommit={(v) => {
            patch({ rings: v });
          }}
        />
        <h3>{t('ug.section.sequence')}</h3>
        <NumberField
          label={t('ug.holeInterval')}
          unit="ms"
          decimals={0}
          min={0}
          value={form.holeInterval * 1000}
          onCommit={(v) => {
            patch({ holeInterval: v / 1000 });
          }}
        />
        <NumberField
          label={t('ug.ringInterval')}
          unit="ms"
          decimals={0}
          min={0}
          value={form.ringInterval * 1000}
          onCommit={(v) => {
            patch({ ringInterval: v / 1000 });
          }}
        />
        <SendBox
          previous={previous}
          disabled={!ring || ring.ring.holes.length === 0}
          onSend={(p) => {
            if (ring) sendRings(form, ring, p);
          }}
          placement={placement}
        />
      </div>

      <div className="ug-results">
        {result && !result.ok && (
          <p className="warn">{t('ug.error', { message: result.message })}</p>
        )}
        {ring && k && (
          <>
            <div className="ug-drawing tall">
              <RingDrawing ring={ring} ms={ms} />
            </div>
            {ring.ring.holes.length === 0 && <p className="warn">{t('ug.noRingHoles')}</p>}
            {truncated > 0 && <p className="hint warn">{t('ug.truncated', { n: truncated })}</p>}
            <table className="grid-table compact ug-ring-kpis">
              <thead>
                <tr>
                  <th />
                  <th className="num">{t('ug.perRing')}</th>
                  <th className="num">{t('ug.allRings', { n })}</th>
                </tr>
              </thead>
              <tbody>
                <RingRow
                  label={t('ug.ringHoles')}
                  unit=""
                  one={ring.ring.holes.length}
                  n={n}
                  d={0}
                />
                <RingRow label={t('ug.kpi.drilled')} unit="m" one={k.drilledMeters} n={n} d={1} />
                <RingRow
                  label={t('ug.kpi.chargedMeters')}
                  unit="m"
                  one={k.chargedMeters}
                  n={n}
                  d={1}
                />
                <RingRow label={t('ug.kpi.charge')} unit="kg" one={k.totalCharge} n={n} d={1} />
                <RingRow label={t('ug.kpi.tonnes')} unit="t" one={k.tonnes} n={n} d={0} />
                <RingRow
                  label={t('ug.kpi.chargePerTonne')}
                  unit="kg/t"
                  one={k.chargePerTonne}
                  d={3}
                />
                <RingRow label={t('ug.kpi.powderFactor')} unit="kg/m³" one={k.powderFactor} d={2} />
                <RingRow
                  label={t('ug.kpi.drilledPerTonne')}
                  unit="m/t"
                  one={k.drilledPerTonne}
                  d={3}
                />
                <RingRow label={t('ug.kpi.area')} unit="m²" one={k.area} d={1} />
              </tbody>
            </table>
            <Fold title={t('ug.table', { n: ring.ring.holes.length })}>
              <div className="table-scroll">
                <table className="grid-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="num">θ [°]</th>
                      <th className="num">{t('ug.table.length')} [m]</th>
                      <th className="num">{t('ug.kpi.chargedMeters')} [m]</th>
                      <th className="num">{t('ug.table.kg')}</th>
                      <th className="num">{t('ug.table.delay')} [ms]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ring.ring.holes.map((h) => (
                      <tr key={h.index} className={h.truncated ? 'warn' : ''}>
                        <td>{h.index}</td>
                        <td className="num">{fmt(h.angle / DEG, 1)}</td>
                        <td className="num">{fmt(h.length, 2)}</td>
                        <td className="num">{fmt(h.chargedLength, 2)}</td>
                        <td className="num">{fmt(h.mass, 1)}</td>
                        <td className="num">{ms(h.delay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Fold>
          </>
        )}
      </div>
    </div>
  );
}

function RingRow({
  label,
  unit,
  one,
  n,
  d,
}: {
  label: string;
  unit: string;
  one: number;
  /** Multiplica por N anillos; sin él, el indicador es una razón (igual para N anillos). */
  n?: number;
  d: number;
}) {
  const fmt = useFormat();
  return (
    <tr>
      <td>
        {label} {unit && <span className="muted">[{unit}]</span>}
      </td>
      <td className="num">{fmt(one, d)}</td>
      <td className="num">{fmt(n === undefined ? one : one * n, d)}</td>
    </tr>
  );
}

export default UndergroundPanel;
