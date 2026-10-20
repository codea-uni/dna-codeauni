import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { ProductLibrary } from '@cronos/core';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT, type MessageKey } from '../i18n';
import {
  FaceDrawing,
  RingDrawing,
  ROLE_COLORS,
  ROLE_ORDER,
  SECTION_COLOR,
} from '../underground/drawings';
import {
  computeFace,
  computeRing,
  pickExplosive,
  pickFaceExplosive,
  cartridgeTooLarge,
  PROFILE_CHOICES,
  type FaceComputation,
  type RingComputation,
} from '../underground/model';
import {
  defaultPlacements,
  FACE_TAG,
  RING_TAG,
  sendFace,
  sendRings,
  taggedHoles,
  type Placement,
} from '../underground/send';
import {
  applyLocation,
  cancelPickLocation,
  pickLocation,
  sectionOf,
  showSection,
  viewFront,
  workingTargets,
  type WorkingTarget,
} from '../underground/location';
import { onTopographyChange } from '../topography/session';
import { useUndergroundStore, type UndergroundTab } from '../underground/store';
import { faceWarningText } from '../underground/warnings';
import { useUgAnalysisStore } from '../underground/analysisStore';
import { UndergroundAnalysis } from '../underground/UndergroundAnalysis';
import { useMethodStore } from '../underground/methodStore';
import { MethodsTab } from './underground/MethodsTab';

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
  // Pestaña «Análisis» (componente aparte): su estado vive en `useUgAnalysisStore`.
  const analysisOpen = useUgAnalysisStore((s) => s.open);
  const setAnalysis = useUgAnalysisStore((s) => s.set);
  const project = useProject();
  const placements = useUndergroundStore((s) => s.placements);
  const setPlacements = useUndergroundStore((s) => s.setPlacements);
  useEffect(() => {
    if (!placements) setPlacements(defaultPlacements(project));
  }, [placements, project, setPlacements]);

  // Pestaña «Método de minado» (plantillas por método): estado propio para no tocar `tab`.
  const methods = useMethodStore((s) => s.active);
  const setMethods = useMethodStore((s) => s.setActive);
  const current = methods ? 'methods' : tab;

  return (
    <section className="panel ug">
      <div className="segmented" role="tablist">
        {(['methods', 'face', 'ring'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={!analysisOpen && current === id}
            className={!analysisOpen && current === id ? 'active' : ''}
            onClick={() => {
              setAnalysis({ open: false });
              setMethods(id === 'methods');
              if (id !== 'methods') setTab(id);
            }}
          >
            {t(id === 'methods' ? 'ugm.tab' : id === 'face' ? 'ug.tab.face' : 'ug.tab.ring')}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={analysisOpen}
          className={analysisOpen ? 'active' : ''}
          onClick={() => {
            setAnalysis({ open: true });
          }}
        >
          {t('uga.tab')}
        </button>
      </div>
      {analysisOpen ? (
        <UndergroundAnalysis />
      ) : current === 'methods' ? (
        <MethodsTab />
      ) : current === 'face' ? (
        <FaceTab />
      ) : (
        <RingTab />
      )}
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
  const placement = useUndergroundStore((s) => s.placements?.face ?? null);
  const explosive = pickFaceExplosive(library, form);
  const tooLarge = !!explosive && cartridgeTooLarge(form, explosive);
  const result = useMemo<Outcome<FaceComputation> | null>(
    () => (explosive ? attempt(() => computeFace(form, explosive)) : null),
    [form, explosive],
  );
  const face = result?.ok ? result.value : null;
  const design = face?.design;
  const k = design?.kpis;
  const previous = taggedHoles(blast, FACE_TAG).length;
  const roles = new Set(design?.holes.map((h) => h.role));
  const section = useWorkingSection('face', placement, Math.max(form.width, form.height));

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
              value={form.explosiveId ?? explosive?.id ?? null}
              onChange={(explosiveId) => {
                patch({ explosiveId });
              }}
            />
            <NumberField
              label={t('ug.cartridge')}
              unit={dia.unit}
              decimals={dia.unit === 'in' ? 3 : 1}
              min={0}
              value={dia.show(form.cartridgeDiameter)}
              onCommit={(v) => {
                patch({ cartridgeDiameter: dia.parse(v) });
              }}
            />
            <p className="hint">{t('ug.cartridgeHint')}</p>
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
            <label className="check" title={t('ug.alternateHint')}>
              <input
                type="checkbox"
                checked={form.alternateContour}
                onChange={(e) => {
                  patch({ alternateContour: e.target.checked });
                }}
              />
              {t('ug.alternate')}
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
        <NumberField
          label={t('uga.holeInterval')}
          unit="ms"
          decimals={0}
          min={0}
          value={form.holeInterval * 1000}
          onCommit={(v) => {
            patch({ holeInterval: v / 1000 });
          }}
        />
        <p className="hint">{t('uga.holeIntervalHint')}</p>

        <SendBox
          previous={previous}
          disabled={!face}
          onSend={(p) => {
            if (face) sendFace(form, face, p);
          }}
          which="face"
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
              <FaceDrawing face={face} contour={section?.uv ?? null} />
            </div>
            <div className="ug-legend" aria-label={t('ug.legend')}>
              {section && section.uv.length > 0 && (
                <span>
                  <i className="ug-swatch square" style={{ borderColor: SECTION_COLOR }} />
                  {t('ug.loc.contour')}
                </span>
              )}
              {k.guideHoles > 0 && (
                <span>
                  <i className="ug-swatch hollow" style={{ borderColor: ROLE_COLORS.contour }} />
                  {t('ug.role.guide')}
                </span>
              )}
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
                value={fmt(design.holes.length)}
                unit={
                  k.guideHoles > 0
                    ? t('ug.kpi.holesDetailGuides', {
                        charged: k.chargedHoles,
                        relief: k.reliefHoles,
                        guides: k.guideHoles,
                      })
                    : t('ug.kpi.holesDetail', { charged: k.chargedHoles, relief: k.reliefHoles })
                }
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
            {(design.warnings.length > 0 || tooLarge) && (
              <ul className="ug-warnings">
                {tooLarge && explosive.cartridge && (
                  <li className="warn">
                    {t('ug.warn.cartridgeTooLarge', {
                      name: explosive.name,
                      cartridge: fmt(explosive.cartridge.diameter * 1000, 0),
                      hole: fmt(form.holeDiameter * 1000, 0),
                    })}
                  </li>
                )}
                {design.warnings.map((w, i) => (
                  <li key={`${w.code}${String(i)}`} className="warn">
                    {faceWarningText(w, t, fmt)}
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
                          {h.guide && ` · ${t('ug.role.guide')}`}
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
  which,
  placement,
  previous,
  disabled,
  onSend,
}: {
  which: UndergroundTab;
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
    setPlacement(which, { ...placement, ...p });
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
      <LocationBox which={which} placement={placement} />
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
            const o = defaultPlacements(project)[which];
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
  const placement = useUndergroundStore((s) => s.placements?.ring ?? null);
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
  useWorkingSection('ring', placement, Math.max(form.driveWidth, form.driveHeight));
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
          which="ring"
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

// ------------------------------------------------------------------ Ubicación sobre una labor

/** Labores elegibles; se recalculan cuando termina de cargarse una topografía. */
function useWorkingTargets(): WorkingTarget[] {
  const project = useProject();
  const [version, refresh] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onTopographyChange(refresh), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` cambia al cargar labores
  return useMemo(() => workingTargets(project), [project, version]);
}

/**
 * Contorno real de la labor elegida en el plano del frente: se marca en el visor mientras el panel
 * está abierto y se devuelve en (u, v) para el dibujo.
 */
function useWorkingSection(which: UndergroundTab, placement: Placement | null, size: number) {
  const targets = useWorkingTargets();
  const loc = useUndergroundStore((s) => s.locations[which]);
  const target = loc ? targets.find((x) => x.id === loc.targetId) : undefined;
  const section = useMemo(
    () => (target && placement ? sectionOf(target, placement, Math.max(3, size * 1.5)) : null),
    [target, placement, size],
  );
  useEffect(() => {
    showSection(section?.world ?? null);
  }, [section]);
  useEffect(
    () => () => {
      showSection(null);
      cancelPickLocation();
    },
    [],
  );
  return section;
}

function LocationBox({ which, placement }: { which: UndergroundTab; placement: Placement }) {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const targets = useWorkingTargets();
  const loc = useUndergroundStore((s) => s.locations[which]);
  const setLocation = useUndergroundStore((s) => s.setLocation);
  const face = useUndergroundStore((s) => s.face);
  const ring = useUndergroundStore((s) => s.ring);
  const [picking, setPicking] = useState(false);
  const target = loc ? targets.find((x) => x.id === loc.targetId) : undefined;
  const groups = [...new Set(targets.map((x) => x.group))];
  const dims =
    which === 'face'
      ? { w: face.width, h: face.profile === 'circular' ? face.width : face.height }
      : { w: ring.driveWidth, h: ring.driveHeight };
  const move = (patch: Partial<{ station: number; reverse: boolean }>) => {
    if (!target || !loc) return;
    applyLocation(which, target, { ...loc, ...patch }, false);
  };
  return (
    <div className="ug-location">
      <label className="field">
        <span className="field-label">{t('ug.loc.title')}</span>
        <select
          value={target ? target.id : ''}
          onChange={(e) => {
            const next = targets.find((x) => x.id === e.target.value);
            if (!next) {
              setLocation(which, null);
              return;
            }
            // Por defecto el frente está al final del eje (lo último excavado) y avanza.
            applyLocation(
              which,
              next,
              { targetId: next.id, station: which === 'face' ? next.length : 0, reverse: false },
              true,
            );
          }}
        >
          <option value="">{t('ug.loc.manual')}</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {targets
                .filter((x) => x.group === g)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.name} · ${fmt(x.length, 0)} m`}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {targets.length === 0 && <p className="hint">{t('ug.loc.none')}</p>}
      {target && loc && (
        <>
          <label className="field ug-station">
            <span className="field-label">{t('ug.loc.station')}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, target.length)}
              step={0.1}
              value={loc.station}
              onChange={(e) => {
                move({ station: Number(e.target.value) });
              }}
            />
          </label>
          <NumberField
            label={t('ug.loc.stationValue')}
            unit={len.unit}
            decimals={1}
            min={0}
            max={len.show(target.length)}
            value={len.show(loc.station)}
            onCommit={(v) => {
              move({ station: len.parse(v) });
            }}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={loc.reverse}
              onChange={(e) => {
                move({ reverse: e.target.checked });
              }}
            />
            {t('ug.loc.reverse')}
          </label>
          <p className="hint">
            {t('ug.loc.info', {
              station: fmt(len.show(loc.station), 1),
              length: fmt(len.show(target.length), 1),
              unit: len.unit,
              azimuth: fmt(placement.azimuthDeg, 1),
              gradient: fmt(placement.gradientPct, 1),
            })}
            {target.profile &&
              ` · ${t(target.estimated ? 'ug.loc.measured' : 'ug.loc.profile', {
                width: fmt(target.profile.width, 2),
                height: fmt(target.profile.height, 2),
              })}`}
          </p>
        </>
      )}
      <div className="row">
        {targets.length > 0 && (
          <button
            className={picking ? 'active' : undefined}
            title={t('ug.loc.pickTitle')}
            onClick={() => {
              if (picking) {
                cancelPickLocation();
                setPicking(false);
                return;
              }
              setPicking(true);
              pickLocation(which, () => {
                setPicking(false);
              });
            }}
          >
            {picking ? t('ug.loc.picking') : t('ug.loc.pick')}
          </button>
        )}
        <button
          title={t('ug.loc.viewFrontTitle')}
          onClick={() => {
            viewFront(placement, dims.w, dims.h);
          }}
        >
          {t('ug.loc.viewFront')}
        </button>
      </div>
    </div>
  );
}
