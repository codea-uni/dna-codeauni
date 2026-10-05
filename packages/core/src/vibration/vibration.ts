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
  MonitoringPoint,
  PpvLimit,
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

/**
 * Carga por retardo admisible [kg] para no superar `ppv` [m/s] a la distancia `distance` [m]
 * (H-603, FC-25): se invierte la ley, W = (R / SD_adm)^(2 ó 3) con SD_adm = (PPV/k)^(−1/β).
 */
export function admissibleCharge(
  law: Pick<VibrationLaw, 'k' | 'beta' | 'scaling'>,
  distance: number,
  ppv: number,
): number {
  const sd = Math.pow(ppv / law.k, -1 / law.beta);
  return Math.pow(distance / sd, law.scaling === 'square-root' ? 2 : 3);
}

/**
 * Límite de PPV de un punto (RM-21, P-12): el propio del punto o, si no tiene, el menor de las
 * filas de la tabla que aplican a su tipo de estructura y a la distancia. null si no hay límite.
 */
export function ppvLimitFor(
  point: Pick<MonitoringPoint, 'ppvLimit' | 'structure'>,
  distance: number,
  limits: readonly PpvLimit[],
): { ppvMax: number; source: string } | null {
  if (point.ppvLimit !== undefined) return { ppvMax: point.ppvLimit, source: 'Límite del punto' };
  let best: PpvLimit | null = null;
  for (const l of limits) {
    if (l.structure !== undefined && l.structure !== point.structure) continue;
    if (distance < l.from || (l.to !== undefined && distance >= l.to)) continue;
    if (!best || l.ppvMax < best.ppvMax) best = l;
  }
  return best ? { ppvMax: best.ppvMax, source: best.source } : null;
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

/** Lundborg: tamaño del fragmento asociado T [m] = 0,1·d^(2/3) con d en pulgadas (P-20). */
export function lundborgFragmentSize(diameter: number): number {
  return 0.1 * Math.pow(diameter / 0.0254, 2 / 3);
}

/**
 * Carga por retardo de cada taladro (`docs/theory/02 §4`): la mayor carga de las ventanas
 * semiabiertas [t, t + w) que lo contienen. Así, el máximo por taladro de PPV(R_i, Q_i) es el
 * máximo por ventana del PPV con la distancia al taladro más cercano del grupo (P-07), y el
 * máximo de Q_i es la MIC. Dos taladros separados exactamente w no se agrupan (CR-05, amarre 4).
 * Taladros sin tiempo cuentan solos.
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
  const m = order.length;
  const t = (k: number) => fireTime[order[k] ?? 0] ?? 0;
  // Tolerancia de 1 ns: sumas de retardos en s no son exactas (0.017 + 0.017 ≠ 0.034).
  const w = window - 1e-9;

  // Carga de la ventana que empieza en t(k): taladros con t ∈ [t(k), t(k) + w).
  const start = new Float64Array(m);
  for (let k = 0, first = 0, hi = 0, sum = 0; k < m; k++) {
    if (k > 0 && t(k) > t(k - 1)) {
      for (; first < k; first++) sum -= charge[order[first] ?? 0] ?? 0;
    }
    for (hi = Math.max(hi, k); hi < m && t(hi) - t(k) < w; hi++) sum += charge[order[hi] ?? 0] ?? 0;
    start[k] = sum;
  }

  // Q_i = máximo de las ventanas que empiezan en (t_i − w, t_i] (cola monótona; ambos
  // extremos avanzan con i). Los empates de tiempo entran por el extremo derecho.
  const deque: number[] = [];
  for (let i = 0, lo = 0, hi = 0; i < m; i++) {
    for (; hi < m && t(hi) <= t(i); hi++) {
      while (deque.length > 0 && (start[deque[deque.length - 1] ?? 0] ?? 0) <= (start[hi] ?? 0))
        deque.pop();
      deque.push(hi);
    }
    for (; t(i) - t(lo) >= w; lo++) if (deque[0] === lo) deque.shift();
    out[order[i] ?? 0] = start[deque[0] ?? i] ?? 0;
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
  /** Ley usada en el punto (K y β propios o los del sitio). */
  law: Pick<VibrationLaw, 'k' | 'beta' | 'scaling'> | null;
  /** Carga de la ventana que gobierna [kg] y su inicio [s]. */
  charge: number;
  windowStart: number;
  /** Límite aplicable y si se excede (RM-21). */
  limit: { ppvMax: number; source: string } | null;
  exceeds: boolean;
  /** Carga por retardo admisible para el límite a la distancia del taladro más cercano [kg] (H-603). */
  admissibleCharge: number | null;
  /**
   * PPV con la distancia al centroide de la carga de la ventana, solo informativo y solo si el
   * punto está a más de 5 veces la extensión del grupo (P-07).
   */
  centroid: { distance: number; ppv: number } | null;
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
  /**
   * MIC con ventana ampliada por la dispersión de los detonadores pirotécnicos (P-10):
   * w + 2·σ_máx de los no electrónicos usados. null si todos son electrónicos.
   */
  micExtended: { window: number; mic: number } | null;
  notInitiated: number;
  /** Distancia a la que se alcanza cada nivel con la MIC [m] (mismo orden que `levels`). */
  distanceForLevel: number[];
  receivers: ReceiverResult[];
  /** Alcance de Lundborg [m], tamaño del fragmento asociado [m] y zona de exclusión. */
  flyrock: { range: number; fragmentSize: number; zone: Vec2[] };
  elapsedMs: number;
}

interface Source {
  id: HoleId;
  x: number;
  y: number;
  z: number;
  /** Carga de la ventana que gobierna [kg]. */
  w: number;
  /** Carga propia del taladro [kg]. */
  w0: number;
}

/** Vibración, sobrepresión y flyrock de una voladura. */
export function computeVibration(
  project: Project,
  blast: Blast,
  options: VibrationOptions,
  /**
   * Terreno (topografía del banco): cada celda es un receptor sobre el terreno, a su cota real. Sin
   * él, todos a la cota del banco (`receiverElevation`).
   */
  surface?: { elevationAt(x: number, y: number): number | null } | null,
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
    { coincidenceWindow: blast.calcParams.micWindow },
    charge.perHole,
  );
  const w = chargePerDelay(timing.fireTime, charge.perHole, blast.calcParams.micWindow);
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
      w0: kg,
    });
  });
  let mic = 0;
  for (const s of sources) mic = Math.max(mic, s.w);

  // P-10: con pirotécnicos, dos taladros separados algo más que la ventana pueden coincidir.
  const detonators = new Map(project.library.detonators.map((d) => [d.id, d]));
  let sigma = -1;
  for (const h of blast.holes)
    for (const init of h.initiators) {
      const d = detonators.get(init.detonatorId);
      if (d && d.type !== 'electronic') sigma = Math.max(sigma, d.delayScatter);
    }
  const micExtended =
    sigma < 0
      ? null
      : (() => {
          const window = blast.calcParams.micWindow + 2 * sigma;
          const wx = chargePerDelay(timing.fireTime, charge.perHole, window);
          let m = 0;
          for (const v of wx) m = Math.max(m, v);
          return { window, mic: m };
        })();

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

  const indexOf = new Map(blast.holes.map((h, i) => [h.id, i]));
  const window = blast.calcParams.micWindow;
  const receivers: ReceiverResult[] = (project.monitoringPoints ?? []).map((p) => {
    // K y β propios del punto (H-602) sobre la ley del sitio.
    const pointLaw = law ? { ...law, k: p.k ?? law.k, beta: p.beta ?? law.beta } : null;
    let best = { ppv: 0, air: 0, distance: Infinity, hole: null as HoleId | null, w: 0 };
    for (const s of sources) {
      const r = Math.hypot(p.position.x - s.x, p.position.y - s.y, p.position.z - s.z);
      const v = pointLaw ? ppvAt(pointLaw, r, s.w) : 0;
      const a = airblastAt(site.airblast, r, s.w);
      if (v > best.ppv) best = { ...best, ppv: v, distance: r, hole: s.id, w: s.w };
      best.air = Math.max(best.air, a);
    }
    const distance = Number.isFinite(best.distance) ? best.distance : 0;
    const group = best.hole ? governingWindow(indexOf.get(best.hole) ?? -1) : null;
    const limit = ppvLimitFor(p, distance, project.ppvLimits ?? []);
    let centroid: ReceiverResult['centroid'] = null;
    if (group && pointLaw) {
      const members = sources.filter((s) => group.members.has(s.id));
      const kg = members.reduce((a, s) => a + s.w0, 0);
      if (kg > 0) {
        const cx = members.reduce((a, s) => a + s.x * s.w0, 0) / kg;
        const cy = members.reduce((a, s) => a + s.y * s.w0, 0) / kg;
        const cz = members.reduce((a, s) => a + s.z * s.w0, 0) / kg;
        const extent = Math.max(...members.map((s) => Math.hypot(s.x - cx, s.y - cy, s.z - cz)));
        const rc = Math.hypot(p.position.x - cx, p.position.y - cy, p.position.z - cz);
        if (rc >= 5 * extent) centroid = { distance: rc, ppv: ppvAt(pointLaw, rc, best.w) };
      }
    }
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      distance,
      ppv: best.ppv,
      airblastPa: best.air,
      airblastDb: pascalToDb(best.air),
      governingHole: best.hole,
      law: pointLaw,
      charge: best.w,
      windowStart: group?.start ?? NaN,
      limit,
      exceeds: limit !== null && best.ppv > limit.ppvMax,
      admissibleCharge:
        limit && pointLaw && distance > 0
          ? admissibleCharge(pointLaw, distance, limit.ppvMax)
          : null,
      centroid,
    };
  });

  /** Ventana [t, t + w) de mayor carga que contiene al taladro i (la que gobierna su PPV). */
  function governingWindow(i: number): { start: number; members: Set<HoleId> } | null {
    const ti = timing.fireTime[i] ?? NaN;
    if (!Number.isFinite(ti)) return null;
    const eps = 1e-9;
    let bestStart = ti;
    let bestKg = -1;
    let bestMembers = new Set<HoleId>();
    for (let k = 0; k < blast.holes.length; k++) {
      const s = timing.fireTime[k] ?? NaN;
      if (!(s > ti - window + eps && s <= ti)) continue;
      const members = new Set<HoleId>();
      let kg = 0;
      blast.holes.forEach((h, j) => {
        const t = timing.fireTime[j] ?? NaN;
        if (t >= s && t - s < window - eps) {
          members.add(h.id);
          kg += charge.perHole[j] ?? 0;
        }
      });
      if (kg > bestKg) {
        bestKg = kg;
        bestStart = s;
        bestMembers = members;
      }
    }
    return { start: bestStart, members: bestMembers };
  }

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
    micExtended,
    notInitiated: timing.notInitiated,
    distanceForLevel,
    receivers,
    flyrock: {
      range: flyrockRange,
      fragmentSize: maxDiameter > 0 ? lundborgFragmentSize(maxDiameter) : 0,
      zone: flyrockZone,
    },
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
      const rz = surface?.elevationAt(x, y) ?? receiverZ;
      let v = 0;
      for (const c of indexed) {
        const [k] = c.idx.neighbors(x, y, 1);
        const s = c.list[k ?? 0];
        if (!s) continue;
        v = Math.max(v, valueAt(Math.hypot(x - s.x, y - s.y, rz - s.z), c.w));
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
    // Bajo el nivel mínimo: sin color. Sobre el máximo: campo cercano (pestaña Energía), transparente
    // para no tapar el diseño.
    if (v < colorMin || v > colorMax * 1.0001) continue;
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
