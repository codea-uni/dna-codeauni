import Flatbush from 'flatbush';
import { deckIntervals } from '../charging/charge';
import { computeCharges } from '../charging/chargeAnalysis';
import { turboRgb } from '../energy/colormap';
import { marchingSquares, type Contours, type ScalarGrid } from '../energy/contours';
import { holeToe } from '../geometry/hole';
import { polygonSignedArea } from '../geometry/polygon';
import type {
  AirblastLaw,
  Blast,
  FlyrockParams,
  HoleId,
  Project,
  Vec2,
  Vec3,
  VibrationLaw,
} from '../model/types';
import { computeTiming } from '../timing/timing';

/** Presión de referencia para dB (20 µPa). */
const P_REF = 20e-6;

/** PPV [m/s] por distancia escalada: v = k · (R / W^(1/2 ó 1/3))^(−β). R [m], W [kg por retardo]. */
export function ppvAt(
  law: Pick<VibrationLaw, 'k' | 'beta' | 'scaling'>,
  distance: number,
  chargePerDelay: number,
): number {
  if (!(chargePerDelay > 0)) return 0;
  const sd = distance / Math.pow(chargePerDelay, law.scaling === 'square-root' ? 1 / 2 : 1 / 3);
  return law.k * Math.pow(Math.max(sd, 1e-6), -law.beta);
}

/** Distancia [m] a la que el PPV cae a `ppv` [m/s] (inversa de `ppvAt`). */
export function distanceForPpv(
  law: Pick<VibrationLaw, 'k' | 'beta' | 'scaling'>,
  ppv: number,
  chargePerDelay: number,
): number {
  return (
    Math.pow(chargePerDelay, law.scaling === 'square-root' ? 1 / 2 : 1 / 3) *
    Math.pow(law.k / ppv, 1 / law.beta)
  );
}

/** Sobrepresión [Pa] (raíz cúbica): P = k · (R / W^(1/3))^(−β). */
export function airblastAt(law: AirblastLaw, distance: number, chargePerDelay: number): number {
  if (!(chargePerDelay > 0)) return 0;
  return law.k * Math.pow(Math.max(distance / Math.cbrt(chargePerDelay), 1e-6), -law.beta);
}

export function pascalToDb(p: number): number {
  return p > 0 ? 20 * Math.log10(p / P_REF) : 0;
}

/**
 * Lundborg (1981): alcance máximo de proyecciones L = 260 · d^(2/3) [m] con d en pulgadas.
 * En SI (d en m) la constante es k = 260 / 0.0254^(2/3) ≈ 3009. Se multiplica por el factor de seguridad.
 */
export function lundborgRange(params: FlyrockParams, diameter: number): number {
  return params.k * Math.pow(diameter, 2 / 3) * params.safetyFactor;
}

/**
 * Carga por retardo de cada taladro: suma de las cargas de los taladros que detonan a menos de
 * `window` de él (ventana deslizante centrada en su tiempo). Taladros sin tiempo cuentan solos.
 */
export function chargePerDelay(
  fireTime: Float64Array,
  charge: Float64Array,
  window: number,
): Float64Array {
  const n = charge.length;
  const out = new Float64Array(n);
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(fireTime[i])) order.push(i);
    else out[i] = charge[i] ?? 0;
  }
  order.sort((a, b) => (fireTime[a] ?? 0) - (fireTime[b] ?? 0));
  const w = window - 1e-9;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let k = 0; k < order.length; k++) {
    const t = fireTime[order[k] ?? 0] ?? 0;
    while (hi < order.length && (fireTime[order[hi] ?? 0] ?? 0) - t < w)
      sum += charge[order[hi++] ?? 0] ?? 0;
    while (lo < k && t - (fireTime[order[lo] ?? 0] ?? 0) >= w) sum -= charge[order[lo++] ?? 0] ?? 0;
    out[order[k] ?? 0] = sum;
  }
  return out;
}

/** Contorno convexo desplazado `d` con esquinas redondeadas (zona de exclusión). */
export function offsetHullRound(points: readonly Vec2[], d: number, arcSegments = 8): Vec2[] {
  const hull = convexHull(points);
  if (hull.length === 0) return [];
  if (hull.length < 3) {
    // Punto o segmento: "estadio" alrededor.
    const a = hull[0] as Vec2;
    const b = hull[hull.length - 1] as Vec2;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const out: Vec2[] = [];
    for (let k = 0; k <= arcSegments * 2; k++) {
      const t = ang + Math.PI / 2 + (Math.PI * k) / (arcSegments * 2);
      out.push({ x: a.x + Math.cos(t) * d, y: a.y + Math.sin(t) * d });
    }
    for (let k = 0; k <= arcSegments * 2; k++) {
      const t = ang - Math.PI / 2 + (Math.PI * k) / (arcSegments * 2);
      out.push({ x: b.x + Math.cos(t) * d, y: b.y + Math.sin(t) * d });
    }
    return out;
  }
  const out: Vec2[] = [];
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const prev = hull[(i + n - 1) % n] as Vec2;
    const cur = hull[i] as Vec2;
    const next = hull[(i + 1) % n] as Vec2;
    // Normales exteriores (hull antihorario → exterior a la derecha).
    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x) - Math.PI / 2;
    let a2 = Math.atan2(next.y - cur.y, next.x - cur.x) - Math.PI / 2;
    while (a2 < a1) a2 += 2 * Math.PI;
    for (let k = 0; k <= arcSegments; k++) {
      const t = a1 + ((a2 - a1) * k) / arcSegments;
      out.push({ x: cur.x + Math.cos(t) * d, y: cur.y + Math.sin(t) * d });
    }
  }
  return out;
}

/** Envolvente convexa (monotone chain), antihoraria. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as Vec2, lower[lower.length - 1] as Vec2, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as Vec2;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as Vec2, upper[upper.length - 1] as Vec2, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return polygonSignedArea(hull) < 0 ? hull.reverse() : hull;
}

export type VibrationMetric = 'ppv' | 'airblast';

export interface VibrationOptions {
  metric: VibrationMetric;
  /** Ley de PPV a usar (id); por defecto la primera del proyecto. */
  lawId?: string;
  /** Ventana para agrupar cargas por retardo [s]. */
  coincidenceWindow: number;
  /** Cota de los receptores [m]; por defecto la superficie del banco. */
  receiverElevation?: number;
  /** Radio de cálculo alrededor de la voladura [m]; 0 = hasta el nivel más bajo. */
  extent: number;
  /** Niveles de contorno (m/s para PPV, Pa para sobrepresión); vacío = por defecto. */
  levels: number[];
  maxCells: number;
  /** Solo puntos de control y flyrock (sin mapa). */
  skipGrid?: boolean;
}

export const DEFAULT_VIBRATION_OPTIONS: VibrationOptions = {
  metric: 'ppv',
  coincidenceWindow: 0.008,
  extent: 0,
  levels: [],
  maxCells: 120_000,
};

/** Niveles por defecto: PPV 2–100 mm/s; sobrepresión 115–134 dB. */
const DEFAULT_PPV_LEVELS = [0.002, 0.005, 0.01, 0.025, 0.05, 0.1];
const DEFAULT_AIR_LEVELS_DB = [115, 120, 125, 130, 134];

export interface ReceiverResult {
  id: string;
  name: string;
  position: Vec3;
  /** Distancia a la carga que gobierna el PPV [m]. */
  distance: number;
  ppv: number;
  airblastPa: number;
  airblastDb: number;
  governingHole: HoleId | null;
}

export interface VibrationResult extends ScalarGrid {
  metric: VibrationMetric;
  law: VibrationLaw | null;
  levels: number[];
  contours: Contours;
  rgba: Uint8Array;
  colorMin: number;
  colorMax: number;
  /** Máxima carga por retardo [kg] y si hubo taladros sin tiempo (carga individual). */
  mic: number;
  notInitiated: number;
  /** Distancia a la que se alcanza cada nivel con la MIC [m] (mismo orden que `levels`). */
  distanceForLevel: number[];
  receivers: ReceiverResult[];
  flyrock: { range: number; zone: Vec2[] };
  elapsedMs: number;
}

interface Source {
  id: HoleId;
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Vibración, sobrepresión y flyrock de una voladura. */
export function computeVibration(
  project: Project,
  blast: Blast,
  options: VibrationOptions,
): VibrationResult {
  const t0 = performance.now();
  const site = project.siteModels;
  const law =
    site.vibrationLaws.find((l) => l.id === options.lawId) ?? site.vibrationLaws[0] ?? null;
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const charge = computeCharges(blast, project.library, rock?.density ?? 2650);
  const timing = computeTiming(
    blast,
    project.library,
    { coincidenceWindow: options.coincidenceWindow },
    charge.perHole,
  );
  const w = chargePerDelay(timing.fireTime, charge.perHole, options.coincidenceWindow);
  const receiverZ = options.receiverElevation ?? blast.bench.floorElevation + blast.bench.height;

  // Fuente = centroide de la carga explosiva de cada taladro.
  const sources: Source[] = [];
  let maxDiameter = 0;
  blast.holes.forEach((h, i) => {
    const kg = charge.perHole[i] ?? 0;
    if (kg <= 0) return;
    maxDiameter = Math.max(maxDiameter, h.diameter);
    let s = 0;
    let len = 0;
    for (const d of deckIntervals(h)) {
      if (d.deck.kind !== 'explosive') continue;
      const l = d.bottom - Math.max(0, d.top);
      s += ((Math.max(0, d.top) + d.bottom) / 2) * l;
      len += l;
    }
    const depth = len > 0 ? s / len : h.length;
    const toe = holeToe(h);
    const f = h.length > 0 ? depth / h.length : 0;
    sources.push({
      id: h.id,
      x: h.collar.x + (toe.x - h.collar.x) * f,
      y: h.collar.y + (toe.y - h.collar.y) * f,
      z: h.collar.z + (toe.z - h.collar.z) * f,
      w: w[i] ?? kg,
    });
  });
  let mic = 0;
  for (const s of sources) mic = Math.max(mic, s.w);

  const flyrockRange = maxDiameter > 0 ? lundborgRange(site.flyrock, maxDiameter) : 0;
  const flyrockZone =
    sources.length > 0
      ? offsetHullRound(
          blast.holes.map((h) => h.collar),
          flyrockRange,
        )
      : [];

  const isPpv = options.metric === 'ppv';
  const levels =
    options.levels.length > 0
      ? [...options.levels].sort((a, b) => a - b)
      : isPpv
        ? DEFAULT_PPV_LEVELS
        : DEFAULT_AIR_LEVELS_DB.map((db) => P_REF * Math.pow(10, db / 20));
  const valueAt = (r: number, wk: number) =>
    isPpv ? (law ? ppvAt(law, r, wk) : 0) : airblastAt(site.airblast, r, wk);

  const distanceForLevel = levels.map((lv) =>
    isPpv
      ? law
        ? distanceForPpv(law, lv, mic)
        : 0
      : Math.cbrt(mic) * Math.pow(site.airblast.k / lv, 1 / site.airblast.beta),
  );

  const receivers: ReceiverResult[] = (project.monitoringPoints ?? []).map((p) => {
    let best = { ppv: 0, air: 0, distance: Infinity, hole: null as HoleId | null };
    for (const s of sources) {
      const r = Math.hypot(p.position.x - s.x, p.position.y - s.y, p.position.z - s.z);
      const v = law ? ppvAt(law, r, s.w) : 0;
      const a = airblastAt(site.airblast, r, s.w);
      if (v > best.ppv) best = { ...best, ppv: v, distance: r, hole: s.id };
      best.air = Math.max(best.air, a);
    }
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      distance: Number.isFinite(best.distance) ? best.distance : 0,
      ppv: best.ppv,
      airblastPa: best.air,
      airblastDb: pascalToDb(best.air),
      governingHole: best.hole,
    };
  });

  const emptyGrid = {
    originX: 0,
    originY: 0,
    cellSize: 1,
    nx: 0,
    ny: 0,
    values: new Float32Array(0),
    contours: { segments: new Float64Array(0), levels: new Float32Array(0) },
    rgba: new Uint8Array(0),
    colorMin: 0,
    colorMax: 1,
  };
  const base = {
    metric: options.metric,
    law,
    levels,
    mic,
    notInitiated: timing.notInitiated,
    distanceForLevel,
    receivers,
    flyrock: { range: flyrockRange, zone: flyrockZone },
  };
  if (sources.length === 0 || (isPpv && !law) || options.skipGrid)
    return { ...emptyGrid, ...base, elapsedMs: performance.now() - t0 };

  // Extensión: hasta el nivel más bajo (con la MIC), limitada a 3 km.
  const extent = Math.min(
    3000,
    options.extent > 0 ? options.extent : (distanceForLevel[0] ?? 500) * 1.1,
  );
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of sources) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }
  minX -= extent;
  minY -= extent;
  maxX += extent;
  maxY += extent;
  const cell = Math.max(0.5, Math.sqrt(((maxX - minX) * (maxY - minY)) / options.maxCells));
  const nx = Math.max(2, Math.ceil((maxX - minX) / cell));
  const ny = Math.max(2, Math.ceil((maxY - minY) / cell));

  // Clases de carga por retardo (log, razón ≤ 1.1). Cada clase toma la carga máxima de su rango
  // (conservador: ≤ 10 % más de carga) y un índice espacial para hallar su fuente más cercana.
  const wMin = Math.max(1e-6, Math.min(...sources.map((s) => s.w)));
  const classOf = (wk: number) => Math.floor(Math.log(wk / wMin) / Math.log(1.1));
  const classes = new Map<number, Source[]>();
  for (const s of sources) {
    const c = classOf(s.w);
    let list = classes.get(c);
    if (!list) classes.set(c, (list = []));
    list.push(s);
  }
  const indexed = [...classes.values()].map((list) => {
    const idx = new Flatbush(list.length);
    for (const s of list) idx.add(s.x, s.y, s.x, s.y);
    idx.finish();
    return { list, idx, w: Math.max(...list.map((s) => s.w)) };
  });

  const values = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = minY + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = minX + (i + 0.5) * cell;
      let v = 0;
      for (const c of indexed) {
        const [k] = c.idx.neighbors(x, y, 1);
        const s = c.list[k ?? 0];
        if (!s) continue;
        v = Math.max(v, valueAt(Math.hypot(x - s.x, y - s.y, receiverZ - s.z), c.w));
      }
      values[j * nx + i] = v;
    }
  }
  const grid: ScalarGrid = { originX: minX, originY: minY, cellSize: cell, nx, ny, values };
  const contours = marchingSquares(grid, levels);

  // Color: escala log entre el nivel más bajo y el más alto.
  const colorMin = levels[0] ?? 1e-3;
  const colorMax = levels[levels.length - 1] ?? 1;
  const lo = Math.log(colorMin);
  const hi = Math.log(colorMax);
  const rgba = new Uint8Array(nx * ny * 4);
  for (let k = 0; k < values.length; k++) {
    const v = values[k] ?? 0;
    if (v < colorMin) continue;
    const [r, g, b] = turboRgb(hi > lo ? (Math.log(v) - lo) / (hi - lo) : 1);
    rgba[k * 4] = r;
    rgba[k * 4 + 1] = g;
    rgba[k * 4 + 2] = b;
    rgba[k * 4 + 3] = 255;
  }
  return {
    ...grid,
    ...base,
    contours,
    rgba,
    colorMin,
    colorMax,
    elapsedMs: performance.now() - t0,
  };
}
