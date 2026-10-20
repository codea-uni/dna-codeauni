import { deckIntervals, holeCharge, indexLibrary } from '../charging/charge';
import type { DesignCheck } from '../diagnostics/designChecks';
import type { EnergyPlane } from '../energy/energy';
import { azimuthToUnit } from '../geometry/vec';
import type {
  Blast,
  Hole,
  HoleId,
  Kilograms,
  Meters,
  MetersPerSecond,
  ProductLibrary,
  RockMass,
  Seconds,
  Vec3,
} from '../model/types';
import { isUndergroundHole, RELIEF_TAG } from './toHoles';

/**
 * Análisis de una voladura subterránea ya llevada al 3D (taladros `ug-*`): planos de evaluación de
 * la energía (frente y abanicos), acoplamiento y corte por onda entre taladros vecinos y cubicación
 * por sección × avance (frente) o área del anillo × burden (abanicos). Las propiedades de la roca
 * se reciben como parámetro (más adelante vendrán del modelo de bloques).
 */

export const FACE_HOLE_TAG = 'ug-face';
export const RING_HOLE_TAG = 'ug-ring';

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => ({
  x: a.x + k * b.x,
  y: a.y + k * b.y,
  z: a.z + k * b.z,
});
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n > 0 ? { x: a.x / n, y: a.y / n, z: a.z / n } : { x: 0, y: 0, z: 0 };
};

/** Dirección unitaria boca → fondo de un taladro. */
export function holeAxis(hole: Pick<Hole, 'inclination' | 'azimuth'>): Vec3 {
  const h = azimuthToUnit(hole.azimuth);
  const si = Math.sin(hole.inclination);
  return { x: h.x * si, y: h.y * si, z: -Math.cos(hole.inclination) };
}

/** El taladro lleva explosivo (los alivios `ug-relief` quedan vacíos). */
export function isChargedHole(hole: Pick<Hole, 'decks' | 'tags'>): boolean {
  if (hole.tags?.includes(RELIEF_TAG)) return false;
  return hole.decks.some((d) => d.kind === 'explosive');
}

/** Tramo con explosivo (de la carga más alta a la más profunda) en coordenadas de proyecto. */
export function chargeSegment(hole: Hole): { a: Vec3; b: Vec3 } | null {
  let top = Infinity;
  let bottom = -Infinity;
  for (const d of deckIntervals(hole)) {
    if (d.deck.kind !== 'explosive') continue;
    top = Math.min(top, Math.max(0, d.top));
    bottom = Math.max(bottom, d.bottom);
  }
  if (!(bottom > top)) return null;
  const u = holeAxis(hole);
  return { a: add(hole.collar, u, top), b: add(hole.collar, u, bottom) };
}

/** Distancia mínima entre dos segmentos 3D (Ericson, «Real-Time Collision Detection» §5.1.9). */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): Meters {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const EPS = 1e-12;
  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) return norm(r);
  if (a <= EPS) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const c1 = add(p1, d1, s);
  const c2 = add(p2, d2, t);
  return norm(sub(c1, c2));
}

// ------------------------------------------------------------------ Planos de evaluación

/**
 * Ejes del plano perpendicular a `forward` con la convención de `planeFrame`: u horizontal a la
 * derecha del avance, v = u × forward (arriba).
 */
function crossSectionAxes(forward: Vec3): { u: Vec3; v: Vec3 } {
  let u = { x: forward.y, y: -forward.x, z: 0 };
  if (norm(u) < 1e-9) u = { x: 1, y: 0, z: 0 }; // avance vertical (chimenea)
  u = unit(u);
  return { u, v: unit(cross(u, forward)) };
}

export interface FacePlane extends EnergyPlane {
  /** Dirección media de avance (eje de los taladros). */
  forward: Vec3;
  /** Profundidad media perforada a lo largo del avance [m]. */
  depth: Meters;
  /** Profundidad del plano desde las bocas [m]. */
  at: Meters;
}

/**
 * Plano del frente: perpendicular a la dirección media de los taladros cargados del frente, a la
 * fracción `depthFraction` (0 = bocas, 1 = fondos) de la profundidad perforada. Origen: centroide de
 * las bocas proyectado a esa profundidad. null sin taladros cargados.
 */
export function facePlane(holes: readonly Hole[], depthFraction = 0.5): FacePlane | null {
  const charged = holes.filter(isChargedHole);
  if (charged.length === 0) return null;
  let f = { x: 0, y: 0, z: 0 };
  let c = { x: 0, y: 0, z: 0 };
  for (const h of charged) {
    f = add(f, holeAxis(h));
    c = add(c, h.collar);
  }
  const forward = unit(f);
  c = { x: c.x / charged.length, y: c.y / charged.length, z: c.z / charged.length };
  // Profundidad: la mediana del avance de cada taladro (fondo − boca sobre el eje).
  const depths = charged.map((h) => h.length * dot(holeAxis(h), forward)).sort((a, b) => a - b);
  const depth = depths[Math.floor(depths.length / 2)] ?? 0;
  const at = Math.min(1, Math.max(0, depthFraction)) * depth;
  // Origen: el centroide de bocas llevado a «at», pero medido desde la boca media sobre el eje.
  const collarDepth =
    charged.reduce((s, h) => s + dot(sub(h.collar, c), forward), 0) / charged.length;
  const origin = add(c, forward, at - collarDepth);
  const { u, v } = crossSectionAxes(forward);
  return { origin, u, v, forward, depth, at };
}

export interface RingPlane extends EnergyPlane {
  /** Índice del anillo en el orden de avance (0 = el primero). */
  index: number;
  /** Normal del plano (eje de la galería de perforación). */
  normal: Vec3;
  holeIds: HoleId[];
}

/**
 * Planos de los abanicos: normal = eje de la galería (perpendicular a todos los taladros del
 * abanico) y un plano por anillo, agrupando las bocas por su posición a lo largo de ese eje
 * (tolerancia `tolerance`, 0,3 m). Origen: centroide de las bocas del anillo; ejes como el frente.
 */
export function ringPlanes(holes: readonly Hole[], tolerance: Meters = 0.3): RingPlane[] {
  if (holes.length === 0) return [];
  // Normal: el par de direcciones más perpendicular entre sí.
  let best = { x: 0, y: 0, z: 0 };
  const axes = holes.map(holeAxis);
  for (let i = 0; i < axes.length; i++)
    for (let j = i + 1; j < axes.length; j++) {
      const c = cross(axes[i] ?? best, axes[j] ?? best);
      if (norm(c) > norm(best)) best = c;
    }
  let normal = unit(best);
  if (norm(normal) === 0) {
    // Un solo taladro o todos paralelos: perpendicular horizontal al primero.
    const a = axes[0] ?? { x: 0, y: 1, z: 0 };
    normal = unit({ x: a.y, y: -a.x, z: 0 });
    if (norm(normal) === 0) normal = { x: 0, y: 1, z: 0 };
  }
  // Sentido: hacia donde avanzan los anillos (la mayoría de las bocas adelante del primero).
  const along = holes.map((h, k) => ({ h, k, s: dot(h.collar, normal) }));
  along.sort((a, b) => a.s - b.s);
  const groups: { s: number; hs: Hole[] }[] = [];
  for (const x of along) {
    const g = groups.at(-1);
    if (g && x.s - g.s <= tolerance) g.hs.push(x.h);
    else groups.push({ s: x.s, hs: [x.h] });
  }
  return groups.map((g, index) => {
    let c = { x: 0, y: 0, z: 0 };
    for (const h of g.hs) c = add(c, h.collar);
    const origin = { x: c.x / g.hs.length, y: c.y / g.hs.length, z: c.z / g.hs.length };
    const { u, v } = crossSectionAxes(normal);
    return { origin, u, v, normal, index, holeIds: g.hs.map((h) => h.id) };
  });
}

/** Coordenadas (u, v) de un punto en el plano. */
export function toPlaneUV(plane: EnergyPlane, p: Vec3): { u: Meters; v: Meters; w: Meters } {
  const d = sub(p, plane.origin);
  return { u: dot(d, plane.u), v: dot(d, plane.v), w: dot(d, cross(plane.u, plane.v)) };
}

// ------------------------------------------------------------------ Acoplamiento y corte

export interface UndergroundTimingOptions {
  /** Ventana de acoplamiento [s] (referencia USBM de 8 ms, `calcParams.micWindow`, DF-12). */
  window: Seconds;
  /**
   * Distancia entre cargas bajo la cual la onda del vecino corta o desensibiliza la carga si llega
   * antes de que detone [m] (0,3–0,5 m en seco según la literatura de «dead pressing»; 0,5 m).
   */
  shockDistance: Meters;
  /** Factor sobre `shockDistance` si alguno de los dos taladros tiene agua (×2). */
  wetFactor: number;
  /** Margen sumado a la llegada de la onda d/Vp [s] (dispersión de los detonadores; 0). */
  margin: Seconds;
}

/** 8 ms, 0,5 m en seco ×2 con agua, sin margen (R0/[CG]: parámetros a calibrar). */
export const DEFAULT_UG_TIMING: UndergroundTimingOptions = {
  window: 0.008,
  shockDistance: 0.5,
  wetFactor: 2,
  margin: 0,
};

/** Vp de respaldo [m/s] si la roca no la trae ni se puede estimar. */
export const FALLBACK_VP: MetersPerSecond = 4500;

/**
 * Velocidad de onda P de la roca: el dato de `RockMass.vp`; si falta, la velocidad de barra
 * √(E/ρ) (cota inferior de Vp: la de onda P en medio infinito es mayor); sin datos, 4.500 m/s.
 */
export function rockVp(rock: Pick<RockMass, 'vp' | 'youngModulus' | 'density'> | undefined): {
  value: MetersPerSecond;
  source: 'rock' | 'estimated' | 'default';
} {
  if (rock?.vp !== undefined && rock.vp > 0) return { value: rock.vp, source: 'rock' };
  if (rock && rock.youngModulus > 0 && rock.density > 0)
    return { value: Math.sqrt(rock.youngModulus / rock.density), source: 'estimated' };
  return { value: FALLBACK_VP, source: 'default' };
}

export interface CouplingGroup {
  holeIds: HoleId[];
  /** Primer tiempo del grupo [s] (de disparo, o de llegada al receptor) y dispersión [s]. */
  time: Seconds;
  spread: Seconds;
  /** Explosivo que detona junto [kg]. */
  kg: Kilograms;
}

interface Fired {
  hole: Hole;
  t: number;
}

function firedCharged(holes: readonly Hole[], fireTime: ArrayLike<number>): Fired[] {
  const out: Fired[] = [];
  holes.forEach((hole, i) => {
    const t = fireTime[i] ?? NaN;
    if (Number.isFinite(t) && isUndergroundHole(hole) && isChargedHole(hole)) out.push({ hole, t });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Receptor para la ventana de llegada (punto de control): tiempo = t_disparo + R/Vp. */
export interface ArrivalReceiver {
  position: Vec3;
  vp: MetersPerSecond;
}

/**
 * Acoplamiento: dos o más taladros cargados que detonan dentro de la ventana (en cadena: cada uno
 * a menos de `window` del anterior). Detonan como una sola carga: pierden el alivio que da la
 * secuencia y suman su carga en la vibración. Con `receiver` se agrupa por tiempo de LLEGADA al
 * receptor, t_i + R_i/Vp (criterio adicional: dos taladros con tiempos distintos pueden llegar
 * juntos). `fireTime` va indexado como `holes`.
 */
export function couplingGroups(
  holes: readonly Hole[],
  fireTime: ArrayLike<number>,
  library: ProductLibrary,
  window: Seconds = DEFAULT_UG_TIMING.window,
  receiver?: ArrivalReceiver,
): CouplingGroup[] {
  const lib = indexLibrary(library);
  let fired = firedCharged(holes, fireTime);
  if (receiver) {
    fired = fired
      .map((f) => {
        const seg = chargeSegment(f.hole);
        const mid = seg ? add(seg.a, sub(seg.b, seg.a), 0.5) : f.hole.collar;
        return { hole: f.hole, t: f.t + norm(sub(mid, receiver.position)) / receiver.vp };
      })
      .sort((a, b) => a.t - b.t);
  }
  const groups: CouplingGroup[] = [];
  let cur: Fired[] = [];
  const flush = () => {
    if (cur.length >= 2) {
      const first = cur[0]?.t ?? 0;
      groups.push({
        holeIds: cur.map((f) => f.hole.id),
        time: first,
        spread: (cur.at(-1)?.t ?? first) - first,
        kg: cur.reduce((s, f) => {
          const c = holeCharge(f.hole, lib);
          return s + c.explosive + c.primers;
        }, 0),
      });
    }
    cur = [];
  };
  for (const f of fired) {
    const last = cur.at(-1);
    if (last && f.t - last.t >= window - 1e-9) flush();
    cur.push(f);
  }
  flush();
  return groups;
}

export interface WaveCutoffRisk {
  /** El que detona primero y el que queda expuesto. */
  firstId: HoleId;
  secondId: HoleId;
  /** Distancia mínima entre las cargas [m]. */
  distance: Meters;
  /** Llegada de la onda del primero a la carga del segundo, d/Vp (+ margen) [s]. */
  arrival: Seconds;
  /** Diferencia de tiempos de disparo t₂ − t₁ [s]. */
  delay: Seconds;
  /** Distancia límite usada (con agua, ×wetFactor) [m]. */
  limit: Meters;
}

/**
 * Corte por la onda del vecino (pedido del jefe; desensibilización dinámica, «dead pressing"): el
 * segundo taladro debe detonar ANTES de que le llegue la onda del primero, d/Vp. Si le llega antes
 * y las cargas están cerca (< `shockDistance`, ×`wetFactor` con agua), la onda comprime la
 * emulsión, corta la columna o el iniciador y el taladro puede fallar. Como d/Vp es de décimas de
 * ms (0,5 m / 5.000 m/s = 0,1 ms), en la práctica la única defensa es la distancia o un explosivo
 * menos sensible; los pares que salen dentro de la ventana de acoplamiento se informan como
 * acoplamiento, no como corte. Solo cuentan taladros cargados (los alivios vacíos no).
 */
export function waveCutoffRisks(
  holes: readonly Hole[],
  fireTime: ArrayLike<number>,
  vp: MetersPerSecond,
  options: UndergroundTimingOptions = DEFAULT_UG_TIMING,
): WaveCutoffRisk[] {
  const fired = firedCharged(holes, fireTime)
    .map((f) => ({ ...f, seg: chargeSegment(f.hole) }))
    .filter((f): f is Fired & { seg: { a: Vec3; b: Vec3 } } => f.seg !== null);
  const wet = (h: Hole) => h.water === 'static' || h.water === 'dynamic';
  const out: WaveCutoffRisk[] = [];
  for (let i = 0; i < fired.length; i++) {
    const a = fired[i];
    if (!a) continue;
    for (let j = i + 1; j < fired.length; j++) {
      const b = fired[j];
      if (!b) continue;
      const delay = b.t - a.t;
      if (delay < options.window - 1e-9) continue; // acoplados: otro aviso
      const limit = options.shockDistance * (wet(a.hole) || wet(b.hole) ? options.wetFactor : 1);
      const distance = segmentDistance(a.seg.a, a.seg.b, b.seg.a, b.seg.b);
      if (distance > limit) continue;
      const arrival = distance / vp + options.margin;
      if (delay > arrival)
        out.push({ firstId: a.hole.id, secondId: b.hole.id, distance, arrival, delay, limit });
    }
  }
  return out.sort((x, y) => x.distance - y.distance);
}

/**
 * Avisos de secuencia de los taladros subterráneos para la revisión general (`analyzeBlast`):
 * acoplamiento (`ugCoupling`) y corte por onda (`ugWaveCutoff`). Vacío sin taladros `ug-*`.
 */
export function undergroundTimingChecks(
  blast: Pick<Blast, 'holes'>,
  fireTime: ArrayLike<number>,
  library: ProductLibrary,
  rock: Pick<RockMass, 'vp' | 'youngModulus' | 'density'> | undefined,
  options: UndergroundTimingOptions = DEFAULT_UG_TIMING,
): DesignCheck[] {
  if (!blast.holes.some(isUndergroundHole)) return [];
  const groups = couplingGroups(blast.holes, fireTime, library, options.window);
  const vp = rockVp(rock).value;
  const cut = waveCutoffRisks(blast.holes, fireTime, vp, options);
  const ms = (s: number) => (s * 1000).toFixed(0);
  const checks: DesignCheck[] = [
    {
      id: 'ugCoupling',
      severity: 'warning',
      title: 'Taladros acoplados',
      detail: `${String(groups.length)} grupo(s) de taladros cargados detonan dentro de ${ms(options.window)} ms: salen como una sola carga, sin alivio entre ellos (más vibración y daño).`,
      params: { groups: groups.length, window: ms(options.window) },
      holes: groups.flatMap((g) => g.holeIds),
    },
    {
      id: 'ugWaveCutoff',
      severity: 'warning',
      title: 'Riesgo de corte por la onda del vecino',
      detail: `${String(cut.length)} par(es) de cargas a menos de ${options.shockDistance.toFixed(2)} m: la onda del primero (d/Vp, Vp = ${vp.toFixed(0)} m/s) llega antes de que detone el segundo y puede cortarlo o desensibilizarlo.`,
      params: { pairs: cut.length, distance: options.shockDistance.toFixed(2), vp: vp.toFixed(0) },
      holes: [...new Set(cut.map((c) => c.secondId))],
    },
  ];
  return checks.filter((c) => c.holes.length > 0);
}

// ------------------------------------------------------------------ Cubicación

/** Eficiencia de avance por defecto: avance / largo perforado (0,85–0,95; 0,9). */
export const DEFAULT_ADVANCE_EFFICIENCY = 0.9;

/** Área de un polígono 3D plano (fórmula de Newell) [m²]. */
export function polygonArea3d(points: readonly Vec3[]): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

function centroid(points: readonly Vec3[]): Vec3 {
  let c = { x: 0, y: 0, z: 0 };
  for (const p of points) c = add(c, p);
  const n = Math.max(1, points.length);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}

export interface UndergroundVolume {
  kind: 'face' | 'rings';
  holes: number;
  chargedHoles: number;
  /** Área de la sección del frente o del anillo (sin la galería) [m²]. */
  area: number;
  /** Frente: avance efectivo (largo perforado × eficiencia); abanicos: N × burden [m]. */
  length: Meters;
  volume: number;
  /** Tonelaje [kg] (como `ChargeResult.tonnage`). */
  tonnage: Kilograms;
  explosive: Kilograms;
  drilledLength: Meters;
  /** kg/m³ y kg/kg (×1000 = kg/t). */
  loadingFactor: number;
  powderFactor: number;
  /** Frente: profundidad perforada [m] y eficiencia (el área ya incluye la sobreexcavación); abanicos: anillos y burden [m]. */
  depth?: Meters;
  efficiency?: number;
  rings?: number;
  burden?: Meters;
  /** De dónde salió el área: la excavación guardada con el diseño o el contorno de las bocas. */
  areaSource: 'excavation' | 'collars';
}

export interface UndergroundVolumeOptions {
  /** Avance / largo perforado del frente (0,9). */
  advanceEfficiency?: number;
  /** Sobreexcavación del frente como fracción del área de diseño (0 = sin; 0,05–0,10 buena voladura suave). */
  overbreak?: number;
}

/** Contorno convexo (Andrew) de puntos 2D: área [m²]. */
function hullArea(pts: { u: number; v: number }[]): number {
  if (pts.length < 3) return 0;
  const p = [...pts].sort((a, b) => a.u - b.u || a.v - b.v);
  const crossZ = (
    o: { u: number; v: number },
    a: { u: number; v: number },
    b: { u: number; v: number },
  ) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  const lower: typeof p = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      crossZ(lower[lower.length - 2] ?? q, lower[lower.length - 1] ?? q, q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: typeof p = [];
  for (const q of [...p].reverse()) {
    while (
      upper.length >= 2 &&
      crossZ(upper[upper.length - 2] ?? q, upper[upper.length - 1] ?? q, q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let a = 0;
  for (let i = 0; i < hull.length; i++) {
    const s = hull[i];
    const t = hull[(i + 1) % hull.length];
    if (s && t) a += s.u * t.v - t.u * s.v;
  }
  return Math.abs(a) / 2;
}

/**
 * Cubicación subterránea (no usa el área de influencia en planta × altura de banco):
 * - frente: V = A_sección·(1 + sobreexcavación) × avance, avance = profundidad perforada × eficiencia;
 * - abanicos: V = (A_tajeo − A_galería) × burden por anillo (volumen tributario de cada anillo).
 * El área sale de la excavación guardada con el diseño (`blast.excavations`); sin ella, del
 * contorno convexo de las bocas (subestima: el perímetro queda afuera de las bocas).
 */
export function undergroundVolumes(
  blast: Pick<Blast, 'holes' | 'excavations'>,
  library: ProductLibrary,
  rockDensity: number,
  options: UndergroundVolumeOptions = {},
): UndergroundVolume[] {
  const lib = indexLibrary(library);
  const efficiency = options.advanceEfficiency ?? DEFAULT_ADVANCE_EFFICIENCY;
  const out: UndergroundVolume[] = [];
  const kgOf = (hs: readonly Hole[]) =>
    hs.reduce((s, h) => {
      const c = holeCharge(h, lib);
      return s + c.explosive + c.primers;
    }, 0);
  const finish = (
    base: Omit<
      UndergroundVolume,
      | 'tonnage'
      | 'explosive'
      | 'drilledLength'
      | 'loadingFactor'
      | 'powderFactor'
      | 'holes'
      | 'chargedHoles'
    >,
    hs: readonly Hole[],
  ): UndergroundVolume => {
    const explosive = kgOf(hs);
    const tonnage = base.volume * rockDensity;
    return {
      ...base,
      holes: hs.length,
      chargedHoles: hs.filter(isChargedHole).length,
      tonnage,
      explosive,
      drilledLength: hs.reduce((s, h) => s + h.length, 0),
      loadingFactor: base.volume > 0 ? explosive / base.volume : 0,
      powderFactor: tonnage > 0 ? explosive / tonnage : 0,
    };
  };
  const excavation = (tag: string, kind: 'drive' | 'round' | 'stope') =>
    (blast.excavations ?? []).find((e) => e.tag === tag && e.kind === kind);

  // Frente
  const face = blast.holes.filter((h) => h.tags?.includes(FACE_HOLE_TAG));
  if (face.some(isChargedHole)) {
    const plane = facePlane(face, 0);
    const round = excavation(FACE_HOLE_TAG, 'round');
    const first = round?.sections[0];
    const last = round?.sections.at(-1);
    let area = 0;
    let areaSource: UndergroundVolume['areaSource'] = 'collars';
    let depth = plane?.depth ?? 0;
    if (first && first.length >= 3) {
      area = polygonArea3d(first);
      areaSource = 'excavation';
      if (last && round.sections.length > 1) depth = norm(sub(centroid(last), centroid(first)));
    } else if (plane) {
      area = hullArea(face.map((h) => toPlaneUV(plane, h.collar)));
    }
    area *= 1 + Math.max(0, options.overbreak ?? 0);
    const length = depth * efficiency;
    out.push(
      finish(
        { kind: 'face', area, length, volume: area * length, depth, efficiency, areaSource },
        face,
      ),
    );
  }

  // Abanicos
  const rings = blast.holes.filter((h) => h.tags?.includes(RING_HOLE_TAG));
  if (rings.some(isChargedHole)) {
    const planes = ringPlanes(rings);
    const stope = excavation(RING_HOLE_TAG, 'stope');
    const drive = excavation(RING_HOLE_TAG, 'drive');
    const s0 = stope?.sections[0];
    const d0 = drive?.sections[0];
    let area = 0;
    let areaSource: UndergroundVolume['areaSource'] = 'collars';
    if (s0 && s0.length >= 3) {
      area = Math.max(0, polygonArea3d(s0) - (d0 && d0.length >= 3 ? polygonArea3d(d0) : 0));
      areaSource = 'excavation';
    } else if (planes[0]) {
      // Sin excavación: contorno de bocas y fondos del primer anillo.
      const p = planes[0];
      const ids = new Set(p.holeIds);
      const pts = rings
        .filter((h) => ids.has(h.id))
        .flatMap((h) => [h.collar, add(h.collar, holeAxis(h), h.length)])
        .map((q) => toPlaneUV(p, q));
      area = hullArea(pts);
    }
    // Burden: el guardado con la excavación o la separación mediana entre anillos.
    const gaps: number[] = [];
    for (let i = 1; i < planes.length; i++) {
      const a = planes[i - 1];
      const b = planes[i];
      if (a && b) gaps.push(Math.abs(dot(sub(b.origin, a.origin), a.normal)));
    }
    gaps.sort((a, b) => a - b);
    const burden = stope?.burden ?? gaps[Math.floor(gaps.length / 2)] ?? 0;
    const n = planes.length;
    const length = n * burden;
    out.push(
      finish(
        { kind: 'rings', area, length, volume: area * length, rings: n, burden, areaSource },
        rings,
      ),
    );
  }
  return out;
}
