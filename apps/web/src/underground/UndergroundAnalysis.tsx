import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import {
  computeEnergyGrid,
  couplingGroups,
  criticalPpv,
  DAMAGE_MULTIPLES,
  DEFAULT_ENERGY_OPTIONS,
  DEFAULT_NEAR_FIELD,
  DEFAULT_UG_TIMING,
  faceFragmentationZones,
  facePlane,
  holeAxis,
  isUndergroundHole,
  ringFragmentationZone,
  ringPlanes,
  rockVp,
  toPlaneUV,
  undergroundFragmentation,
  undergroundVolumes,
  waveCutoffRisks,
  type Blast,
  type EnergyPlane,
  type EnergyResult,
  type Hole,
  type HoleId,
  type Project,
  type UgFragmentationZone,
  type UndergroundVolume,
  type Vec3,
} from '@cronos/core';
import { sequenceTimes } from '../analysis/visualize';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useFormat, useT, type MessageKey } from '../i18n';
import { getEngine } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { useUgAnalysisStore } from './analysisStore';
import { computeFace, computeRing, pickExplosive, pickFaceExplosive } from './model';
import { FACE_TAG, RING_TAG } from './send';
import { useUndergroundStore } from './store';

const SizeCurve = lazy(() => import('../charts/SizeCurve'));

/**
 * Pestaña «Análisis» del panel Subterránea: lo mismo que en superficie para el frente y los
 * abanicos ya llevados al 3D. Halos de energía (Holmberg–Persson o densidad de carga) en el plano
 * del frente o del abanico que avanzan con la simulación de la secuencia; acoplamiento y corte por
 * onda; cubicación por sección × avance y fragmentación por zonas (Kuz-Ram + Swebrec).
 */

const DEFAULT_ROCK_DENSITY = 2650;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="ug-fold" open>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

/** Cubicación subterránea de la voladura con las opciones de la pestaña (también en Resultados). */
export function useUndergroundVolumes(): UndergroundVolume[] {
  const blast = useActiveBlast();
  const project = useProject();
  const eff = useUgAnalysisStore((s) => s.advanceEfficiency);
  const overbreak = useUgAnalysisStore((s) => s.overbreak);
  return useMemo(() => {
    if (!blast) return [];
    const rho =
      project.rockMasses.find((r) => r.id === blast.rockMassId)?.density ?? DEFAULT_ROCK_DENSITY;
    return undergroundVolumes(blast, project.library, rho, { advanceEfficiency: eff, overbreak });
  }, [blast, project, eff, overbreak]);
}

/** Tabla de cubicación del frente y de los abanicos (pestaña Análisis y panel Resultados). */
export function UgVolumeTable({ volumes }: { volumes: readonly UndergroundVolume[] }) {
  const t = useT();
  const fmt = useFormat();
  if (volumes.length === 0) return null;
  const row = (label: MessageKey, unit: string, f: (v: UndergroundVolume) => string) => (
    <tr>
      <td className="muted">
        {t(label)} {unit && <span className="muted">[{unit}]</span>}
      </td>
      {volumes.map((v) => (
        <td key={v.kind} className="num">
          {f(v)}
        </td>
      ))}
    </tr>
  );
  return (
    <table className="grid-table compact">
      <thead>
        <tr>
          <th />
          {volumes.map((v) => (
            <th key={v.kind} className="num">
              {t(v.kind === 'face' ? 'uga.vol.face' : 'uga.vol.rings')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {row('uga.vol.area', 'm²', (v) => fmt(v.area, 2))}
        {row('uga.vol.length', 'm', (v) =>
          v.kind === 'face'
            ? t('uga.vol.advanceDetail', {
                advance: fmt(v.length, 2),
                depth: fmt(v.depth ?? 0, 2),
                eff: fmt((v.efficiency ?? 0) * 100, 0),
              })
            : t('uga.vol.ringsDetail', {
                length: fmt(v.length, 2),
                n: v.rings ?? 0,
                burden: fmt(v.burden ?? 0, 2),
              }),
        )}
        {row('uga.vol.volume', 'm³', (v) => fmt(v.volume, 1))}
        {row('uga.vol.tonnage', 't', (v) => fmt(v.tonnage / 1000, 1))}
        {row('uga.vol.explosive', 'kg', (v) => fmt(v.explosive, 1))}
        {row('uga.vol.loadingFactor', 'kg/m³', (v) => fmt(v.loadingFactor, 2))}
        {row('uga.vol.powderFactor', 'kg/t', (v) => fmt(v.powderFactor * 1000, 3))}
        {row('uga.vol.drilledPerVolume', 'm/m³', (v) =>
          v.volume > 0 ? fmt(v.drilledLength / v.volume, 2) : '—',
        )}
        {row('uga.vol.source', '', (v) =>
          t(v.areaSource === 'excavation' ? 'uga.vol.fromExcavation' : 'uga.vol.fromCollars'),
        )}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ Plano y halos

interface PlaneView {
  plane: EnergyPlane & { forward: Vec3 };
  holes: Hole[];
  /** Contornos de la excavación en (u, v). */
  outlines: { u: number; v: number }[][];
  cellSize: number;
  cutoff: number;
}

function planeView(
  blast: Blast,
  target: 'face' | 'ring',
  ringIndex: number,
  depthFraction: number,
): PlaneView | null {
  const tagged = (tag: string) => blast.holes.filter((h) => h.tags?.includes(tag));
  const sections = (tag: string, kind: 'drive' | 'round' | 'stope') =>
    (blast.excavations ?? []).find((e) => e.tag === tag && e.kind === kind)?.sections[0] ?? null;
  let plane: (EnergyPlane & { forward: Vec3 }) | null;
  let holes: Hole[];
  let outlinesWorld: Vec3[][] = [];
  if (target === 'face') {
    holes = tagged(FACE_TAG);
    const p = facePlane(holes, depthFraction);
    if (!p) return null;
    plane = p;
    const round = sections(FACE_TAG, 'round');
    if (round) outlinesWorld = [round];
  } else {
    holes = tagged(RING_TAG);
    const planes = ringPlanes(holes);
    const p = planes[Math.min(ringIndex, planes.length - 1)];
    if (!p) return null;
    plane = { ...p, forward: p.normal };
    outlinesWorld = [sections(RING_TAG, 'stope'), sections(RING_TAG, 'drive')].filter(
      (s): s is Vec3[] => s !== null,
    );
  }
  const outlines = outlinesWorld.map((s) =>
    s.map((q) => {
      const uv = toPlaneUV(plane, q);
      return { u: uv.u, v: uv.v };
    }),
  );
  // Ventana: el contorno de la excavación (o los taladros) con un margen.
  const pts = outlines.flat();
  for (const h of holes) {
    const a = toPlaneUV(plane, h.collar);
    const b = toPlaneUV(plane, {
      x: h.collar.x + holeAxis(h).x * h.length,
      y: h.collar.y + holeAxis(h).y * h.length,
      z: h.collar.z + holeAxis(h).z * h.length,
    });
    if (target === 'ring' || Math.abs(a.w) < 1e-3) pts.push(a, b);
    else pts.push(a);
  }
  if (pts.length === 0) return null;
  const pad = target === 'face' ? 1.2 : 2.5;
  const bounds = {
    minU: Math.min(...pts.map((p) => p.u)) - pad,
    maxU: Math.max(...pts.map((p) => p.u)) + pad,
    minV: Math.min(...pts.map((p) => p.v)) - pad,
    maxV: Math.max(...pts.map((p) => p.v)) + pad,
  };
  return {
    plane: { ...plane, bounds },
    holes,
    outlines,
    cellSize: target === 'face' ? 0.05 : 0.2,
    cutoff: target === 'face' ? 2.5 : 6,
  };
}

/** Raster del mapa como imagen (fila 0 = v mínima abajo). */
function gridImage(grid: EnergyResult): string | null {
  if (grid.nx === 0 || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = grid.nx;
  canvas.height = grid.ny;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(grid.nx, grid.ny);
  for (let j = 0; j < grid.ny; j++) {
    const src = j * grid.nx * 4;
    const dst = (grid.ny - 1 - j) * grid.nx * 4;
    img.data.set(grid.rgba.subarray(src, src + grid.nx * 4), dst);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** Corte del eje del taladro con el plano (frente) o su traza (abanico), en (u, v). */
function holeMarks(view: PlaneView, target: 'face' | 'ring') {
  const p = view.plane;
  const n = {
    x: p.u.y * p.v.z - p.u.z * p.v.y,
    y: p.u.z * p.v.x - p.u.x * p.v.z,
    z: p.u.x * p.v.y - p.u.y * p.v.x,
  };
  return view.holes.flatMap((h) => {
    const ax = holeAxis(h);
    const toe = {
      x: h.collar.x + ax.x * h.length,
      y: h.collar.y + ax.y * h.length,
      z: h.collar.z + ax.z * h.length,
    };
    const a = toPlaneUV(p, h.collar);
    const b = toPlaneUV(p, toe);
    if (target === 'ring') {
      if (Math.abs(a.w) > 0.5) return [];
      return [{ hole: h, a, b }];
    }
    const den = ax.x * n.x + ax.y * n.y + ax.z * n.z;
    if (Math.abs(den) < 1e-6) return [];
    const s = -a.w / den;
    if (s < -0.01 || s > h.length + 0.01) return [];
    const at = toPlaneUV(p, {
      x: h.collar.x + ax.x * s,
      y: h.collar.y + ax.y * s,
      z: h.collar.z + ax.z * s,
    });
    return [{ hole: h, a: at, b: at }];
  });
}

function HaloSection({ blast, project }: { blast: Blast; project: Project }) {
  const t = useT();
  const fmt = useFormat();
  const s = useUgAnalysisStore();
  const analysis = useAnalysisStore((a) => a.analysis);
  const seqTime = useAnalysisStore((a) => a.sequenceTime);
  const playing = useAnalysisStore((a) => a.sequencePlaying);
  const speed = useAnalysisStore((a) => a.sequenceSpeed);
  const hasFace = blast.holes.some((h) => h.tags?.includes(FACE_TAG));
  const ringCount = useMemo(
    () => ringPlanes(blast.holes.filter((h) => h.tags?.includes(RING_TAG))).length,
    [blast],
  );
  const target = s.target === 'face' && !hasFace && ringCount > 0 ? 'ring' : s.target;
  const effTarget = target === 'ring' && ringCount === 0 ? 'face' : target;
  const view = useMemo(
    () => planeView(blast, effTarget, s.ringIndex, s.depthFraction),
    [blast, effTarget, s.ringIndex, s.depthFraction],
  );
  const times = useMemo(() => (analysis ? sequenceTimes(analysis) : null), [analysis]);
  // Taladros que ya detonaron en el instante de la simulación (todos si no hay simulación).
  const firedKey = useMemo(() => {
    if (!view || !times || seqTime === null) return -1;
    return view.holes.filter((h) => (times.get(h.id) ?? Infinity) <= seqTime).length;
  }, [view, times, seqTime]);
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const vppc = criticalPpv(rock)?.value ?? null;
  const isPpv = s.metric === 'nearFieldPpv';
  const grid = useMemo(() => {
    if (!view) return null;
    const holes =
      firedKey < 0 || !times
        ? view.holes
        : view.holes.filter((h) => (times.get(h.id) ?? Infinity) <= (seqTime ?? Infinity));
    return computeEnergyGrid({ ...blast, holes }, project.library, {
      ...DEFAULT_ENERGY_OPTIONS,
      metric: s.metric,
      elevation: view.plane.origin.z,
      cellSize: view.cellSize,
      cutoff: view.cutoff,
      sigma: view.cellSize * 6,
      clipToRock: false,
      nearField: project.siteModels.nearField ?? DEFAULT_NEAR_FIELD,
      levels: isPpv && vppc ? DAMAGE_MULTIPLES.map((m) => m * vppc) : [],
      plane: view.plane,
    });
    // seqTime cambia en cada cuadro: solo se recalcula cuando cambia la cantidad de detonados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, firedKey, s.metric, blast, project, vppc, isPpv]);
  const image = useMemo(() => (grid ? gridImage(grid) : null), [grid]);

  // Halos en 3D: el mismo mapa en el plano, en la capa de energía del motor.
  useEffect(() => {
    const engine = getEngine();
    if (!engine || !s.show3d) return;
    engine.setEnergy(grid && grid.nx > 0 ? grid : null, 0.8);
  }, [grid, s.show3d]);
  useEffect(() => {
    if (!s.show3d) return;
    return () => {
      const a = useAnalysisStore.getState();
      getEngine()?.setEnergy(a.energy, a.energyOpacity);
    };
  }, [s.show3d]);

  if (!view) return <p className="hint">{t('uga.noHoles')}</p>;
  const marks = holeMarks(view, effTarget);
  const b = view.plane.bounds ?? { minU: 0, minV: 0, maxU: 1, maxV: 1 };
  const fs = Math.max(b.maxU - b.minU, b.maxV - b.minV) / 45;
  const first = analysis?.timing.firstTime ?? 0;
  const last = analysis?.timing.lastTime ?? 0;
  const ms = (x: number) => fmt((x - first) * 1000, 0);

  const play = () => {
    const engine = getEngine();
    if (!engine || !times) return;
    // Vista de frente: desde atrás del plano, mirando el avance.
    const f = view.plane.forward;
    const yaw = (Math.atan2(f.x, f.y) * 180) / Math.PI;
    useUiStore.getState().setViewMode('3d');
    engine.flyCamera({
      at: view.plane.origin,
      size: Math.max(b.maxU - b.minU, b.maxV - b.minV) * 1.6,
      yawDeg: (((yaw + 180) % 360) + 360) % 360,
      pitchDeg: effTarget === 'face' ? 6 : 12,
      mode: '3d',
    });
    if (!s.show3d) s.set({ show3d: true });
    engine.playSequence(times, speed, first - 0.02);
    useAnalysisStore.getState().set({ sequencePlaying: true });
  };
  const pause = () => {
    getEngine()?.pauseSequence();
    useAnalysisStore.getState().set({ sequencePlaying: false });
  };
  const stop = () => {
    getEngine()?.stopSequence();
    useAnalysisStore.getState().set({ sequencePlaying: false, sequenceTime: null });
  };

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
        <label className="field">
          <span className="field-label">{t('uga.plane')}</span>
          <select
            value={effTarget === 'face' ? 'face' : `ring:${String(s.ringIndex)}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'face') s.set({ target: 'face' });
              else s.set({ target: 'ring', ringIndex: Number(v.split(':')[1] ?? 0) });
            }}
          >
            {hasFace && <option value="face">{t('uga.plane.face')}</option>}
            {Array.from({ length: ringCount }, (_, i) => (
              <option key={i} value={`ring:${String(i)}`}>
                {t('uga.plane.ring', { n: i + 1 })}
              </option>
            ))}
          </select>
        </label>
        {effTarget === 'face' && (
          <NumberField
            label={t('uga.depth')}
            unit="%"
            decimals={0}
            min={0}
            max={100}
            value={s.depthFraction * 100}
            onCommit={(v) => {
              s.set({ depthFraction: v / 100 });
            }}
          />
        )}
        <label className="field">
          <span className="field-label">{t('uga.metric')}</span>
          <select
            value={s.metric}
            onChange={(e) => {
              s.set({
                metric: e.target.value === 'chargeDensity' ? 'chargeDensity' : 'nearFieldPpv',
              });
            }}
          >
            <option value="nearFieldPpv">{t('uga.metric.ppv')}</option>
            <option value="chargeDensity">{t('uga.metric.density')}</option>
          </select>
        </label>
      </div>
      <div className="ug-drawing">
        <svg
          className="ug-svg"
          role="img"
          aria-label={t('uga.halos')}
          viewBox={`${b.minU.toFixed(3)} ${(-b.maxV).toFixed(3)} ${(b.maxU - b.minU).toFixed(3)} ${(b.maxV - b.minV).toFixed(3)}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {grid && image && (
            <image
              href={image}
              x={grid.originX}
              y={-(grid.originY + grid.ny * grid.cellSize)}
              width={grid.nx * grid.cellSize}
              height={grid.ny * grid.cellSize}
              preserveAspectRatio="none"
              opacity={0.85}
            />
          )}
          {view.outlines.map((o, k) => (
            <path
              key={k}
              d={
                o
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.u.toFixed(3)},${(-p.v).toFixed(3)}`)
                  .join(' ') + ' Z'
              }
              fill="none"
              stroke="#c9d6e3"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {grid && <ContourPaths grid={grid} critical={isPpv ? vppc : null} />}
          {marks.map(({ hole, a, b: e }) => {
            const tf = times?.get(hole.id);
            const fired = seqTime !== null && tf !== undefined && tf <= seqTime;
            const relief = hole.tags?.includes('ug-relief');
            const color = fired ? '#ff5a1f' : relief ? '#eef3f8' : '#1b2633';
            return effTarget === 'ring' ? (
              <line
                key={hole.id}
                x1={a.u}
                y1={-a.v}
                x2={e.u}
                y2={-e.v}
                stroke={fired ? '#ff5a1f' : '#e8eef5'}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <circle
                key={hole.id}
                cx={a.u}
                cy={-a.v}
                r={Math.max(hole.diameter / 2, fs * 0.18)}
                fill={relief ? 'none' : color}
                stroke={relief ? '#eef3f8' : '#e8eef5'}
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>
      <div className="ug-legend">
        <span>
          {isPpv
            ? vppc
              ? t('uga.legend.vppc', { v: fmt(vppc * 1000, 0) })
              : t('uga.legend.noVppc')
            : t('uga.legend.density')}
        </span>
        {grid && grid.nx > 0 && (
          <span>
            {t('uga.legend.max', {
              v: isPpv ? `${fmt(grid.max * 1000, 0)} mm/s` : `${fmt(grid.max, 2)} kg/m³`,
            })}
          </span>
        )}
        {grid && isPpv && vppc && (
          <span>
            {t('uga.legend.damageArea', {
              a: fmt(grid.areaAbove[1] ?? 0, 2),
            })}
          </span>
        )}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
        {!playing ? (
          <button className="primary" disabled={!times || times.size === 0} onClick={play}>
            {t('uga.simulate')}
          </button>
        ) : (
          <button onClick={pause}>{t('uga.pause')}</button>
        )}
        <button disabled={seqTime === null} onClick={stop}>
          {t('uga.stop')}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={s.show3d}
            onChange={(e) => {
              s.set({ show3d: e.target.checked });
            }}
          />
          {t('uga.show3d')}
        </label>
        {times && last > first && (
          <input
            type="range"
            aria-label={t('uga.time')}
            min={first - 0.001}
            max={last + 0.001}
            step={0.001}
            value={seqTime ?? last + 0.001}
            onChange={(e) => {
              getEngine()?.seekSequence(times, Number(e.target.value));
            }}
            style={{ flex: 1, minWidth: 120 }}
          />
        )}
        <span className="muted">
          {seqTime === null
            ? t('uga.allFired')
            : t('uga.timeAt', { ms: ms(seqTime), n: Math.max(0, firedKey) })}
        </span>
      </div>
      <p className="hint">{t('uga.halosHint')}</p>
    </>
  );
}

function ContourPaths({ grid, critical }: { grid: EnergyResult; critical: number | null }) {
  const { segments, levels } = grid.contours;
  const crit: string[] = [];
  const other: string[] = [];
  for (let k = 0; k < levels.length; k++) {
    const d = `M${(segments[k * 4] ?? 0).toFixed(3)},${(-(segments[k * 4 + 1] ?? 0)).toFixed(3)}L${(segments[k * 4 + 2] ?? 0).toFixed(3)},${(-(segments[k * 4 + 3] ?? 0)).toFixed(3)}`;
    const lv = levels[k] ?? 0;
    if (critical !== null && Math.abs(lv - critical) <= critical * 1e-4) crit.push(d);
    else other.push(d);
  }
  return (
    <>
      <path
        d={other.join('')}
        stroke="#ffffff"
        strokeOpacity={0.45}
        strokeWidth={0.7}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={crit.join('')}
        stroke="#ff2d55"
        strokeWidth={2}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

// ------------------------------------------------------------------ Secuencia

function SequenceSection({ blast, project }: { blast: Blast; project: Project }) {
  const t = useT();
  const fmt = useFormat();
  const s = useUgAnalysisStore();
  const analysis = useAnalysisStore((a) => a.analysis);
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const vp = rockVp(rock);
  const window = blast.calcParams.micWindow;
  const receiver = (project.monitoringPoints ?? []).find((m) => m.id === s.receiverId) ?? null;
  const result = useMemo(() => {
    if (!analysis) return null;
    const times = sequenceTimes(analysis);
    const fire = Float64Array.from(blast.holes, (h) => times.get(h.id) ?? NaN);
    const opts = { ...DEFAULT_UG_TIMING, window, shockDistance: s.shockDistance };
    return {
      groups: couplingGroups(blast.holes, fire, project.library, window),
      arrival: receiver
        ? couplingGroups(blast.holes, fire, project.library, window, {
            position: receiver.position,
            vp: vp.value,
          })
        : [],
      cut: waveCutoffRisks(blast.holes, fire, vp.value, opts),
      first: analysis.timing.firstTime,
    };
  }, [analysis, blast, project.library, window, s.shockDistance, receiver, vp.value]);
  if (!result) return <p className="hint">{t('uga.noTiming')}</p>;
  const label = new Map<HoleId, string>(blast.holes.map((h) => [h.id, h.label]));
  const names = (ids: readonly HoleId[]) => ids.map((id) => label.get(id) ?? '?').join(', ');
  const ms = (x: number, d = 0) => fmt(x * 1000, d);
  const ok = result.groups.length === 0 && result.cut.length === 0;
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
        <NumberField
          label={t('uga.shockDistance')}
          unit="m"
          decimals={2}
          min={0.05}
          max={5}
          value={s.shockDistance}
          onCommit={(v) => {
            s.set({ shockDistance: v });
          }}
        />
        {(project.monitoringPoints ?? []).length > 0 && (
          <label className="field">
            <span className="field-label">{t('uga.receiver')}</span>
            <select
              value={s.receiverId ?? ''}
              onChange={(e) => {
                s.set({ receiverId: e.target.value || null });
              }}
            >
              <option value="">{t('uga.receiver.none')}</option>
              {(project.monitoringPoints ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="hint">
        {t('uga.seqParams', {
          window: ms(window),
          vp: fmt(vp.value, 0),
          source: t(`uga.vp.${vp.source}`),
        })}
      </p>
      {ok && <p className="hint">{t('uga.seqOk')}</p>}
      {result.groups.length > 0 && (
        <>
          <h4>{t('uga.coupling', { n: result.groups.length })}</h4>
          <ul className="ug-warnings">
            {result.groups.map((g, i) => (
              <li key={i} className="warn">
                {t('uga.couplingItem', {
                  holes: names(g.holeIds),
                  t: ms(g.time - result.first),
                  spread: ms(g.spread, 1),
                  kg: fmt(g.kg, 1),
                })}
              </li>
            ))}
          </ul>
          <p className="hint">{t('uga.couplingFix')}</p>
        </>
      )}
      {result.cut.length > 0 && (
        <>
          <h4>{t('uga.cutoff', { n: result.cut.length })}</h4>
          <ul className="ug-warnings">
            {result.cut.slice(0, 30).map((c, i) => (
              <li key={i} className="warn">
                {t('uga.cutoffItem', {
                  first: label.get(c.firstId) ?? '?',
                  second: label.get(c.secondId) ?? '?',
                  d: fmt(c.distance, 2),
                  arrival: ms(c.arrival, 2),
                  delay: ms(c.delay, 0),
                })}
              </li>
            ))}
          </ul>
          <p className="hint">{t('uga.cutoffFix')}</p>
        </>
      )}
      {receiver && (
        <p className="hint">
          {result.arrival.length === 0
            ? t('uga.arrivalOk', { name: receiver.name })
            : t('uga.arrivalGroups', { name: receiver.name, n: result.arrival.length })}
        </p>
      )}
      <p className="hint">{t('uga.seqHint')}</p>
    </>
  );
}

// ------------------------------------------------------------------ Fragmentación

function FragmentationSection({ blast, project }: { blast: Blast | undefined; project: Project }) {
  const t = useT();
  const fmt = useFormat();
  const s = useUgAnalysisStore();
  const faceForm = useUndergroundStore((u) => u.face);
  const ringForm = useUndergroundStore((u) => u.ring);
  const lib = project.library;
  const rock =
    project.rockMasses.find((r) => r.id === blast?.rockMassId) ?? project.rockMasses[0] ?? null;
  const results = useMemo(() => {
    if (!rock) return [];
    const out: { key: 'face' | 'ring'; zones: UgFragmentationZone[]; rws: number; w: number }[] =
      [];
    const fe = pickFaceExplosive(lib, faceForm);
    if (fe) {
      try {
        const f = computeFace(faceForm, fe);
        const advance = f.design.depth * s.advanceEfficiency;
        out.push({
          key: 'face',
          zones: faceFragmentationZones(f.design, f.profile.area * (1 + s.overbreak), advance),
          rws: fe.rws,
          w: f.design.drillingError,
        });
      } catch {
        // Formulario fuera de rango: lo informa la pestaña del frente.
      }
    }
    const re = pickExplosive(lib, ringForm.explosiveId);
    if (re) {
      try {
        const r = computeRing(ringForm, re);
        const z = ringFragmentationZone(r.ring, ringForm.burden);
        if (z)
          out.push({
            key: 'ring',
            zones: [z],
            rws: re.rws,
            w: blast?.calcParams.drillDeviation ?? 0.1,
          });
      } catch {
        // Ídem.
      }
    }
    return out.flatMap((o) => {
      const r = undergroundFragmentation(o.zones, rock, {
        rws: o.rws,
        drillDeviation: o.w,
        variant: s.variant,
        calibration: s.calibration,
        ...(s.inSituBlock > 0 ? { inSituBlock: s.inSituBlock } : {}),
      });
      return r ? [{ key: o.key, r }] : [];
    });
  }, [rock, lib, faceForm, ringForm, s, blast]);
  if (!rock) return <p className="hint">{t('uga.noRock')}</p>;
  const cm = (m: number) => fmt(m * 100, 1);
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
        <label className="field">
          <span className="field-label">{t('uga.frag.variant')}</span>
          <select
            value={s.variant}
            onChange={(e) => {
              s.set({
                variant: e.target.value === 'cunningham1987' ? 'cunningham1987' : 'cunningham2005',
              });
            }}
          >
            <option value="cunningham2005">Cunningham 2005</option>
            <option value="cunningham1987">Cunningham 1987</option>
          </select>
        </label>
        <NumberField
          label={t('uga.frag.calibration')}
          decimals={2}
          min={0.2}
          max={5}
          value={s.calibration}
          onCommit={(v) => {
            s.set({ calibration: v });
          }}
        />
        <NumberField
          label={t('uga.frag.inSitu')}
          unit="m"
          decimals={2}
          min={0}
          value={s.inSituBlock}
          onCommit={(v) => {
            s.set({ inSituBlock: v });
          }}
        />
      </div>
      {results.map(({ key, r }) => (
        <div key={key}>
          <h4>
            {t(key === 'face' ? 'uga.frag.face' : 'uga.frag.ring')} · P50 {cm(r.p50.swebrec)} cm ·
            P80 {cm(r.p80.swebrec)} cm
          </h4>
          <table className="grid-table compact">
            <thead>
              <tr>
                <th>{t('uga.frag.zone')}</th>
                <th className="num">kg</th>
                <th className="num">K [kg/m³]</th>
                <th className="num">B × S [m]</th>
                <th className="num">X50 [cm]</th>
                <th className="num">n</th>
              </tr>
            </thead>
            <tbody>
              {r.zones.map((z) => (
                <tr key={z.zone}>
                  <td>{t(`uga.zone.${z.zone}` as MessageKey)}</td>
                  <td className="num">{fmt(z.mass, 1)}</td>
                  <td className="num">{fmt(z.loadingFactor, 2)}</td>
                  <td className="num">
                    {fmt(z.burden, 2)} × {fmt(z.spacing, 2)}
                  </td>
                  <td className="num">{cm(z.x50)}</td>
                  <td className="num">{fmt(z.n, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {t('uga.frag.rr', {
              p50: cm(r.p50.rosinRammler),
              p80: cm(r.p80.rosinRammler),
              a: fmt(r.rockFactor, 1),
            })}
          </p>
          <ErrorBoundary>
            <Suspense fallback={<div className="chart muted">…</div>}>
              <SizeCurve result={r} />
            </Suspense>
          </ErrorBoundary>
        </div>
      ))}
      <p className="hint">{t('uga.frag.hint')}</p>
    </>
  );
}

// ------------------------------------------------------------------ Pestaña

export function UndergroundAnalysis() {
  const t = useT();
  const project = useProject();
  const blast = useActiveBlast();
  const s = useUgAnalysisStore();
  const volumes = useUndergroundVolumes();
  const hasUg = blast?.holes.some(isUndergroundHole) ?? false;
  return (
    <div className="ug-analysis">
      {!hasUg && <p className="hint warn">{t('uga.sendFirst')}</p>}
      {blast && hasUg && (
        <>
          <Section title={t('uga.section.halos')}>
            <HaloSection blast={blast} project={project} />
          </Section>
          <Section title={t('uga.section.sequence')}>
            <SequenceSection blast={blast} project={project} />
          </Section>
          <Section title={t('uga.section.volume')}>
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
              <NumberField
                label={t('uga.efficiency')}
                unit="%"
                decimals={0}
                min={50}
                max={100}
                value={s.advanceEfficiency * 100}
                onCommit={(v) => {
                  s.set({ advanceEfficiency: v / 100 });
                }}
              />
              <NumberField
                label={t('uga.overbreak')}
                unit="%"
                decimals={0}
                min={0}
                max={50}
                value={s.overbreak * 100}
                onCommit={(v) => {
                  s.set({ overbreak: v / 100 });
                }}
              />
            </div>
            <UgVolumeTable volumes={volumes} />
            <p className="hint">{t('uga.volHint')}</p>
          </Section>
        </>
      )}
      <Section title={t('uga.section.frag')}>
        <FragmentationSection blast={blast} project={project} />
      </Section>
    </div>
  );
}
