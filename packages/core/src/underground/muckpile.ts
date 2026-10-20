import { STANDARD_GRAVITY } from '../analysis/displacement';
import { computeCharges } from '../charging/chargeAnalysis';
import { clipPolygonConvex } from '../charging/influence';
import type { ScalarGrid } from '../energy/contours';
import { pointInPolygon, polygonSignedArea } from '../geometry/polygon';
import type {
  Blast,
  BlastId,
  Hole,
  Meters,
  ProductLibrary,
  Project,
  Radians,
  Seconds,
  UndergroundExcavation,
  Vec2,
  Vec3,
} from '../model/types';
import { Heightmap, reposeExcess, type Lattice } from '../muckpile/heightmap';
import type { MuckpileBlocks, MuckpileResult, MuckpileVectors } from '../muckpile/types';
import { computeTiming } from '../timing/timing';
import { chargeSegment, DEFAULT_ADVANCE_EFFICIENCY, holeAxis, isChargedHole } from './analysis';
import { CUT_TAG, GUIDE_TAG, isUndergroundHole, RELIEF_TAG } from './toHoles';

/**
 * Pila de material subterránea (roca volada en un frente o en un tajeo). Modelo cinemático puro y
 * determinista, hermano del de banco (`muckpile/simulate.ts`) y con el mismo resultado
 * (`MuckpileResult`) para que el engine lo anime con la misma capa de bloques:
 *
 * 1. Cada diseño (`ug-face`, `ug-ring`, plantillas por método) se modela como una CÁMARA: el perfil
 *    de su excavación (`blast.excavations`, kinds `round`, `drive`, `stope`) barrido a lo largo de
 *    su eje. Tres modos: `face` (frente con eje horizontal o inclinado como una rampa: la roca sale
 *    hacia atrás, a la galería), `stope` (tajeo de eje horizontal: la roca sale hacia la cara libre
 *    —slot o anillo anterior— y cae por gravedad al fondo) y `shaft` (eje vertical: chimenea, drop
 *    raise, slot: la roca cae por la chimenea y se amontona en el nivel de abajo).
 * 2. El volumen volado (frente: sección × avance efectivo; tajeo: sección × largo volado) se parte
 *    en bloques cúbicos; cada uno se asigna al taladro cargado más cercano (distancia al tramo con
 *    explosivo, 3D) y sale cuando detona ese taladro (`computeTiming`).
 * 3. Velocidad inicial del taladro con la ley de Richards & Moore v = k·(√m/B)^n (m = carga lineal
 *    [kg/m], B = distancia al hueco ya abierto: alivio o taladro que salió antes), acotada; en los
 *    tajeos se multiplica por `stopeFactor` (confinamiento). Por bloque se atenúa con la distancia
 *    a la carga y una dispersión pseudoaleatoria determinista (hash del índice).
 * 4. Trayectoria balística (g) CONFINADA: si el bloque sale del perfil choca con techo o paredes y
 *    rebota con restitución `restitution` (la componente normal se invierte y se reduce, la
 *    tangencial pierde 20 %). Al tocar el piso o la pila conserva `impactRetention` de su
 *    velocidad horizontal y desliza con fricción `friction` (d = v²/(2·μ·g), tope `maxSlide`).
 * 5. Depósito en una grilla de alturas en planta (celda = lado del bloque) cuyo terreno fijo es el
 *    piso de la excavación; las celdas fuera del perfil son roca (muro: no reciben material). Se
 *    deposita V·esponjamiento y se relaja al ángulo de reposo (misma avalancha que el banco, que
 *    conserva el volumen). La pila no puede pasar el techo: el exceso se corre a la celda vecina
 *    más baja. La posición final de cada bloque llena la pila en orden de llegada (S-23).
 *
 * Reglas y nivel de confianza: `docs/RULES.md` §9 (UG-P). Todo es calibrable (`UgMuckpileParams`).
 */

const G = STANDARD_GRAVITY;
/** Paso de integración del vuelo [s] y vuelo máximo [s]. */
const DT = 0.01;
const MAX_FLIGHT = 6;
/** Muestras de la trayectoria por bloque que se envían al engine (vuelo y deslizamiento). */
export const UG_PATH_POINTS = 14;
/** Espesor mínimo para contar una celda como pila [m] (como el banco). */
const PILE_MIN = 0.1;
/** Fracción de la sección tapada desde la que se avisa (ventilación y paso del equipo). */
export const BLOCKAGE_WARNING = 0.8;
/** Holgura de la pila bajo el techo [m]. */
const ROOF_CLEARANCE = 0.15;
/** Celdas máximas de la grilla (si se supera, la celda crece). */
const MAX_CELLS = 300_000;
const RELAX_BATCH = 16;
const DEFAULT_ROCK_DENSITY = 2650;
const AUX_TAGS = new Set<string>([RELIEF_TAG, CUT_TAG, GUIDE_TAG]);

/** Parámetros calibrables de la pila subterránea (`docs/RULES.md` §9). */
export interface UgMuckpileParams {
  /** Esponjamiento V_suelto / V_in situ (1,4–1,6; 1,5). */
  swell: number;
  /** Ángulo de reposo de la roca volada [rad] (35–40°; 37°). */
  reposeAngle: Radians;
  /** Restitución normal en techo y paredes (0,2–0,3; 0,25). */
  restitution: number;
  /** Fricción de deslizamiento sobre el piso o la pila (0,5–0,7; 0,6). */
  friction: number;
  /** Fracción de la velocidad horizontal que conserva el bloque al tocar el piso (0,4). */
  impactRetention: number;
  /** Ley v = k·(√m/B)^n: k [m/s] y n (Richards & Moore 2004: 13,5 roca blanda, 27 dura; n 1,3). */
  velocityK: number;
  velocityN: number;
  /** Cotas de la velocidad del taladro en frentes [m/s] (10–25 típico; 3–25). */
  minSpeed: number;
  maxSpeed: number;
  /** Factor de confinamiento de tajeos sobre la misma ley (0,35: 2–8 m/s típico). */
  stopeFactor: number;
  /** Factor de calibración del alcance (multiplica la velocidad; 1 = sin calibrar). */
  throwFactor: number;
  /** Largo de galería que se modela detrás del frente [m] (60). */
  maxRunout: Meters;
  /** Deslizamiento máximo tras tocar el piso [m] (15). */
  maxSlide: Meters;
  /** Bloques objetivo (el lado del bloque se ajusta entre `minBlock` y 3 m). */
  targetBlocks: number;
  minBlock: Meters;
  /** Avance / largo perforado del frente (0,9, como la cubicación). */
  advanceEfficiency: number;
}

export const DEFAULT_UG_MUCKPILE_PARAMS: UgMuckpileParams = {
  swell: 1.5,
  reposeAngle: (37 * Math.PI) / 180,
  restitution: 0.25,
  friction: 0.6,
  impactRetention: 0.4,
  velocityK: 13.5,
  velocityN: 1.3,
  minSpeed: 3,
  maxSpeed: 25,
  stopeFactor: 0.35,
  throwFactor: 1,
  maxRunout: 60,
  maxSlide: 15,
  targetBlocks: 4000,
  minBlock: 0.4,
  advanceEfficiency: DEFAULT_ADVANCE_EFFICIENCY,
};

export type UgPileMode = 'face' | 'stope' | 'shaft';

/** Indicadores de la pila de un diseño subterráneo. */
export interface UgPileDesign {
  tag: string;
  mode: UgPileMode;
  blocks: number;
  /** Volumen in situ volado [m³] y volumen suelto de la pila [m³]. */
  inSituVolume: number;
  pileVolume: number;
  /** Área de la sección (frente) o del tajeo sin la galería [m²] y largo volado [m]. */
  sectionArea: number;
  advance: Meters;
  /**
   * Alcance: frente → distancia del frente nuevo al pie de la pila (espesor ≥ 0,1 m) a lo largo de
   * la galería; tajeo y chimenea → mayor desplazamiento de un bloque [m].
   */
  throw: Meters;
  /** Altura máxima de la pila sobre el piso [m] y altura junto al frente nuevo [m] (frente). */
  maxHeight: Meters;
  heightAtFace: Meters;
  /** Desplazamiento medio de los bloques (3D, ponderado por volumen) [m]. */
  meanDisplacement: Meters;
  /** Frente: fracción de la sección tapada por la pila a varias distancias del frente nuevo. */
  blockage: { distance: Meters; fraction: number }[];
  maxBlockage: { distance: Meters; fraction: number } | null;
  firstLaunch: Seconds;
  lastImpact: Seconds;
}

export type UgMuckpileWarning =
  | { id: 'ugPile.blockage'; params: { tag: string; pct: number; distance: number } }
  | { id: 'ugPile.noExcavation'; params: { tag: string } }
  | { id: 'ugPile.noTiming'; params: { tag: string; holes: number } }
  | { id: 'ugPile.clipped'; params: { blocks: number } }
  | { id: 'ugPile.roof'; params: { tag: string; mode: UgPileMode } };

export interface UndergroundMuckpileResult extends MuckpileResult {
  underground: {
    /** Lado del bloque [m]. */
    blockSize: Meters;
    designs: UgPileDesign[];
    warnings: UgMuckpileWarning[];
    params: UgMuckpileParams;
  };
}

// ------------------------------------------------------------------ Vectores

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
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

function centroid(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n, z: z / n };
}

/** Número pseudoaleatorio determinista en [0, 1) a partir de un entero (hash de Wang + xorshift). */
export function hash01(k: number, salt = 0): number {
  let h = (k * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Distancia de un punto a un segmento 3D. */
function pointSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / L2)) : 0;
  return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t, p.z - a.z - ab.z * t);
}

/** Distancia mínima entre segmentos (muestreo; para el burden por taladro basta). */
function segmentGap(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3): number {
  let best = Infinity;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const p = {
      x: a0.x + (a1.x - a0.x) * t,
      y: a0.y + (a1.y - a0.y) * t,
      z: a0.z + (a1.z - a0.z) * t,
    };
    best = Math.min(best, pointSegment(p, b0, b1));
  }
  return best;
}

// ------------------------------------------------------------------ Cámara

/** Marco de la excavación: eje a (avance o barrido), u y v en la sección. */
interface Frame {
  O: Vec3;
  a: Vec3;
  U: Vec3;
  V: Vec3;
}

/** Ejes de la sección perpendicular a `a` (u horizontal a la derecha, v = u × a). */
function sectionFrame(O: Vec3, a: Vec3): Frame {
  let U = { x: a.y, y: -a.x, z: 0 };
  if (norm(U) < 1e-6) U = { x: 1, y: 0, z: 0 };
  U = unit(U);
  return { O, a, U, V: unit(cross(U, a)) };
}

function toLocal(f: Frame, p: Vec3): { s: number; u: number; v: number } {
  const d = sub(p, f.O);
  return { s: dot(d, f.a), u: dot(d, f.U), v: dot(d, f.V) };
}

function toWorld(f: Frame, s: number, u: number, v: number): Vec3 {
  return {
    x: f.O.x + f.a.x * s + f.U.x * u + f.V.x * v,
    y: f.O.y + f.a.y * s + f.U.y * u + f.V.y * v,
    z: f.O.z + f.a.z * s + f.U.z * u + f.V.z * v,
  };
}

/** Cámara de vuelo: perfiles abiertos (u, v) y tramo abierto a lo largo del eje. */
interface Chamber {
  tag: string;
  mode: UgPileMode;
  frame: Frame;
  /** Perfiles abiertos (la unión): ronda o galería, tajeo y su galería. */
  open: Vec2[][];
  /** Perfil del volumen volado y perfiles a restar (galería dentro del tajeo). */
  blasted: Vec2[];
  hollow: Vec2[][];
  /** Tramo volado a lo largo del eje [s0, s1]. */
  s0: number;
  s1: number;
  /** Tramo abierto donde puede volar [m] (fuera: roca o, en `shaft`, caída libre bajo `openS0`). */
  openS0: number;
  openS1: number;
  /** Sentido de salida a lo largo del eje (−1 o +1). */
  out: number;
  /** La roca sale del frente hacia atrás (frente o chimenea), no hacia una cara libre lateral. */
  fromFace: boolean;
  /** Centro del cuele en la sección (frentes) o centro del perfil. */
  cutCenter: Vec2;
  /** Piso del nivel inferior (`shaft`) [m]. */
  bottomZ: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  holes: number[];
}

function project2(f: Frame, pts: readonly Vec3[]): Vec2[] {
  return pts.map((p) => {
    const l = toLocal(f, p);
    return { x: l.u, y: l.v };
  });
}

function sweepAxis(e: UndergroundExcavation): { O: Vec3; a: Vec3; length: number } | null {
  const first = e.sections[0];
  const last = e.sections.at(-1);
  if (!first || first.length < 3 || !last) return null;
  const c0 = centroid(first);
  const c1 = centroid(last);
  const d = sub(c1, c0);
  const length = norm(d);
  if (length < 1e-6) return null;
  return { O: c0, a: unit(d), length };
}

/** Intersecciones de la vertical u = cte con el perfil: v mínima y máxima (null si no lo corta). */
function verticalSpan(polys: readonly Vec2[][], u: number): { lo: number; hi: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % n];
      if (!p || !q) continue;
      if ((p.x <= u && q.x > u) || (q.x <= u && p.x > u)) {
        const t = (u - p.x) / (q.x - p.x);
        const v = p.y + (q.y - p.y) * t;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  return lo <= hi ? { lo, hi } : null;
}

/** Punto más cercano del borde de los perfiles y su normal hacia adentro. */
function nearestEdge(
  polys: readonly Vec2[][],
  u: number,
  v: number,
): { u: number; v: number; nu: number; nv: number } {
  let best = Infinity;
  let out = { u, v, nu: 0, nv: 1 };
  for (const poly of polys) {
    const n = poly.length;
    const ccw = polygonSignedArea(poly) > 0;
    for (let i = 0; i < n; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % n];
      if (!p || !q) continue;
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const L2 = ex * ex + ey * ey;
      if (L2 <= 0) continue;
      const t = Math.min(1, Math.max(0, ((u - p.x) * ex + (v - p.y) * ey) / L2));
      const cu = p.x + ex * t;
      const cv = p.y + ey * t;
      const d = (u - cu) ** 2 + (v - cv) ** 2;
      if (d < best) {
        best = d;
        // Normal hacia adentro del borde (izquierda si el perfil es antihorario).
        const L = Math.sqrt(L2);
        const nu = ccw ? -ey / L : ey / L;
        const nv = ccw ? ex / L : -ex / L;
        out = { u: cu, v: cv, nu, nv };
      }
    }
  }
  return out;
}

function insideAny(polys: readonly Vec2[][], u: number, v: number): boolean {
  for (const p of polys) if (pointInPolygon(u, v, p)) return true;
  return false;
}

/** Marca principal `ug-*` de un taladro (sin las auxiliares de alivio, cuele y guía). */
function designTag(h: Hole): string | null {
  for (const t of h.tags ?? []) if (t.startsWith('ug-') && !AUX_TAGS.has(t)) return t;
  return null;
}

interface HoleInfo {
  a: Vec3;
  b: Vec3;
  /** Velocidad del taladro [m/s] (NaN sin tiempo). */
  speed: number;
  burden: number;
  t: number;
  /** Rol en el frente: arrastre (piso), techo o resto. */
  role: 'lifter' | 'roof' | 'other';
}

function buildChamber(
  blast: Pick<Blast, 'holes' | 'excavations'>,
  tag: string,
  holeIdx: number[],
  fireTime: Float64Array,
  params: UgMuckpileParams,
): Chamber | null {
  const exc = (kind: UndergroundExcavation['kind']) =>
    (blast.excavations ?? []).find((e) => e.tag === tag && e.kind === kind) ?? null;
  const round = exc('round');
  const drive = exc('drive');
  const stope = exc('stope');
  const primary = round ?? stope;
  if (!primary) return null;
  const axis = sweepAxis(primary);
  if (!axis) return null;
  const vertical = Math.abs(axis.a.z) > 0.7;
  const frame = sectionFrame(axis.O, axis.a);
  const prim = project2(frame, primary.sections[0] ?? []);
  const drv =
    drive?.sections[0] && drive.sections[0].length >= 3 ? project2(frame, drive.sections[0]) : null;
  // Tramo del contexto a lo largo del eje (galería, ronda, tajeo).
  let ctx0 = Infinity;
  let ctx1 = -Infinity;
  for (const e of [round, drive, stope])
    for (const sec of e?.sections ?? []) {
      const s = toLocal(frame, centroid(sec)).s;
      ctx0 = Math.min(ctx0, s);
      ctx1 = Math.max(ctx1, s);
    }
  const segs = holeIdx
    .map((i) => {
      const h = blast.holes[i];
      return h ? chargeSegment(h) : null;
    })
    .filter((x): x is { a: Vec3; b: Vec3 } => x !== null);
  const chargeS = segs.flatMap((g) => [toLocal(frame, g.a).s, toLocal(frame, g.b).s]);
  const cMin = Math.min(...chargeS);
  const cMax = Math.max(...chargeS);
  // Centro del cuele: los alivios (o el cuele) del diseño; si no, el centro del perfil.
  const cutPts = blast.holes
    .filter(
      (h) => h.tags?.includes(tag) && (h.tags.includes(RELIEF_TAG) || h.tags.includes(CUT_TAG)),
    )
    .map((h) => toLocal(frame, h.collar));
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  const open = drv ? [prim, drv] : [prim];
  for (const poly of open)
    for (const p of poly) {
      uMin = Math.min(uMin, p.x);
      uMax = Math.max(uMax, p.x);
      vMin = Math.min(vMin, p.y);
      vMax = Math.max(vMax, p.y);
    }
  const cutCenter =
    cutPts.length > 0
      ? {
          x: cutPts.reduce((s, p) => s + p.u, 0) / cutPts.length,
          y: cutPts.reduce((s, p) => s + p.v, 0) / cutPts.length,
        }
      : { x: (uMin + uMax) / 2, y: (vMin + vMax) / 2 };
  // Sentido de salida: los taladros que salen después están más lejos de la cara libre.
  let out = -1;
  const timed = holeIdx.filter((i) => Number.isFinite(fireTime[i] ?? NaN));
  if (round === null && timed.length > 1) {
    let ms = 0;
    let mt = 0;
    const ss = timed.map((i) => {
      const h = blast.holes[i];
      const g = h ? chargeSegment(h) : null;
      return g ? (toLocal(frame, g.a).s + toLocal(frame, g.b).s) / 2 : 0;
    });
    timed.forEach((i, k) => {
      ms += ss[k] ?? 0;
      mt += fireTime[i] ?? 0;
    });
    ms /= timed.length;
    mt /= timed.length;
    let cov = 0;
    timed.forEach((i, k) => {
      cov += ((ss[k] ?? 0) - ms) * ((fireTime[i] ?? 0) - mt);
    });
    out = cov < 0 ? 1 : -1;
  }
  const bottomZ = Math.min(
    ...[round, drive, stope].flatMap((e) => (e?.sections ?? []).flatMap((s) => s.map((p) => p.z))),
  );
  const base = {
    tag,
    frame,
    open,
    cutCenter,
    bottomZ,
    uMin,
    uMax,
    vMin,
    vMax,
    holes: holeIdx,
    out,
  };
  if (round) {
    // Frente (o chimenea): sección de la ronda × avance efectivo desde la boca (s = 0).
    const depth = axis.length;
    const advance = depth * params.advanceEfficiency;
    return {
      ...base,
      mode: vertical ? 'shaft' : 'face',
      out: -1,
      fromFace: true,
      blasted: prim,
      hollow: [],
      s0: 0,
      s1: advance,
      openS0: vertical ? Math.min(0, ctx0) : -params.maxRunout,
      openS1: advance,
    };
  }
  // Tajeo o cuele: largo volado = tramo de las cargas, con un burden del lado de la cara libre.
  const burden = stope?.burden ?? 1.5;
  let s0: number;
  let s1: number;
  if (vertical) {
    s0 = Math.max(ctx0, cMin - 1);
    s1 = Math.min(ctx1, cMax + 1.5);
  } else if (out < 0) {
    s0 = Math.max(ctx0, cMin - burden);
    s1 = Math.min(ctx1, cMax);
  } else {
    s0 = Math.max(ctx0, cMin);
    s1 = Math.min(ctx1, cMax + burden);
  }
  if (!(s1 > s0)) {
    s0 = ctx0;
    s1 = ctx1;
  }
  // Hueco del lado de la cara libre (slot o tajeo ya extraído): lugar para el esponjamiento.
  const slot = Math.max(2 * burden, 0.6 * (s1 - s0));
  // En el tajeo solo se vuela la franja de la sección que alcanzan las cargas (p. ej. la rebanada
  // del VCR): la carga más baja − 1 m y la más alta + 1,5 m (el taco también se rompe).
  let blastedPoly = prim;
  if (!vertical) {
    const vs = segs.flatMap((g) => [toLocal(frame, g.a).v, toLocal(frame, g.b).v]);
    const lo = Math.min(...vs) - 1;
    const hi = Math.max(...vs) + 1.5;
    if (lo > vMin || hi < vMax) {
      const band = clipPolygonConvex(prim, [
        { x: uMin - 1, y: lo },
        { x: uMax + 1, y: lo },
        { x: uMax + 1, y: hi },
        { x: uMin - 1, y: hi },
      ]);
      if (band.length >= 3) blastedPoly = band;
    }
  }
  return {
    ...base,
    mode: vertical ? 'shaft' : 'stope',
    fromFace: false,
    blasted: blastedPoly,
    hollow: drv ? [drv] : [],
    s0,
    s1,
    openS0: vertical ? ctx0 : out < 0 ? Math.min(ctx0, s0 - slot) : ctx0,
    openS1: vertical ? ctx1 : out > 0 ? Math.max(ctx1, s1 + slot) : ctx1,
  };
}

// ------------------------------------------------------------------ Grilla en planta

interface PlanGrid {
  lattice: Lattice;
  base: Float64Array;
  roof: Float64Array;
  open: Uint8Array;
}

/** (s, u) del punto de planta (x, y) sobre la superficie v = vOf(u) (2 iteraciones). */
function planToSU(f: Frame, x: number, y: number, vOf: (u: number) => number) {
  // Sistema 2×2: (x, y) − O − v·V_h = s·a_h + u·U_h.
  const a11 = f.a.x;
  const a12 = f.U.x;
  const a21 = f.a.y;
  const a22 = f.U.y;
  const det = a11 * a22 - a12 * a21;
  let v = 0;
  let s = 0;
  let u = 0;
  for (let it = 0; it < 3; it++) {
    const rx = x - f.O.x - v * f.V.x;
    const ry = y - f.O.y - v * f.V.y;
    s = (rx * a22 - a12 * ry) / det;
    u = (a11 * ry - rx * a21) / det;
    const nv = vOf(u);
    if (!Number.isFinite(nv)) break;
    v = nv;
  }
  return { s, u, v };
}

function buildGrid(c: Chamber, cell: number): PlanGrid {
  const f = c.frame;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ext = (p: Vec3) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  if (c.mode === 'shaft') {
    // Nivel inferior: el contorno de la chimenea con un margen para que la pila se abra.
    for (const poly of c.open) for (const p of poly) ext(toWorld(f, c.openS0, p.x, p.y));
    const m = 8;
    minX -= m;
    minY -= m;
    maxX += m;
    maxY += m;
  } else {
    for (const s of [c.openS0, c.openS1])
      for (const u of [c.uMin, c.uMax]) for (const v of [c.vMin, c.vMax]) ext(toWorld(f, s, u, v));
  }
  let size = cell;
  while (((maxX - minX) / size + 2) * ((maxY - minY) / size + 2) > MAX_CELLS) size *= 1.25;
  const nx = Math.max(2, Math.ceil((maxX - minX) / size) + 2);
  const ny = Math.max(2, Math.ceil((maxY - minY) / size) + 2);
  const lattice: Lattice = { x0: minX - size, y0: minY - size, cell: size, nx, ny };
  const n = nx * ny;
  const base = new Float64Array(n);
  const roof = new Float64Array(n);
  const open = new Uint8Array(n);
  const spanOf = (u: number) => verticalSpan(c.open, u);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = lattice.x0 + (i + 0.5) * size;
      const y = lattice.y0 + (j + 0.5) * size;
      if (c.mode === 'shaft') {
        base[k] = c.bottomZ;
        roof[k] = Infinity;
        open[k] = 1;
        continue;
      }
      const lo = planToSU(f, x, y, (u) => spanOf(u)?.lo ?? NaN);
      const span = spanOf(lo.u);
      if (!span || lo.s < c.openS0 || lo.s > c.openS1) {
        // Roca: muro alto (no recibe material).
        base[k] = f.O.z + 1e4;
        roof[k] = base[k];
        continue;
      }
      const hi = planToSU(f, x, y, (u) => spanOf(u)?.hi ?? NaN);
      base[k] = toWorld(f, lo.s, lo.u, span.lo).z;
      roof[k] = toWorld(f, hi.s, hi.u, spanOf(hi.u)?.hi ?? span.hi).z;
      open[k] = 1;
    }
  return { lattice, base, roof, open };
}

/** Celda abierta más cercana a (i, j) (búsqueda por anillos). */
function nearestOpen(g: PlanGrid, i: number, j: number): number {
  const { nx, ny } = g.lattice;
  const k0 = j * nx + i;
  if (g.open[k0]) return k0;
  for (let r = 1; r < Math.max(nx, ny); r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const k = jj * nx + ii;
        if (g.open[k]) return k;
      }
  return k0;
}

// ------------------------------------------------------------------ Simulación

export interface UgMuckpileInput {
  blast: Pick<Blast, 'holes' | 'excavations'>;
  library: ProductLibrary;
  /** kg por taladro (índice de `blast.holes`). */
  chargePerHole: Float64Array;
  /** Tiempo de disparo por taladro [s] (NaN = sin tiempo). */
  fireTime: Float64Array;
}

/** Pila subterránea de la voladura activa del proyecto (solo taladros `ug-*` cargados). */
export function computeUndergroundMuckpile(
  project: Project,
  blastId: BlastId,
  params: Partial<UgMuckpileParams> = {},
): UndergroundMuckpileResult | null {
  const blast = project.blasts.find((b) => b.id === blastId);
  if (!blast) return null;
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const charge = computeCharges(blast, project.library, rock?.density ?? DEFAULT_ROCK_DENSITY);
  const timing = computeTiming(
    blast,
    project.library,
    { coincidenceWindow: blast.calcParams.micWindow },
    charge.perHole,
  );
  return simulateUndergroundMuckpile(
    { blast, library: project.library, chargePerHole: charge.perHole, fireTime: timing.fireTime },
    params,
  );
}

/** La voladura tiene taladros subterráneos cargados (la pila se calcula con este modelo). */
export function hasUndergroundCharges(blast: Pick<Blast, 'holes'>): boolean {
  return blast.holes.some((h) => isUndergroundHole(h) && isChargedHole(h));
}

interface BlockAcc {
  origin: number[];
  impact: number[];
  dest: number[];
  vel: number[];
  launch: number[];
  impactT: number[];
  hole: number[];
  volume: number[];
  path: number[];
}

/** Modelo cinemático de la pila subterránea (ver el encabezado del módulo). Determinista. */
export function simulateUndergroundMuckpile(
  input: UgMuckpileInput,
  overrides: Partial<UgMuckpileParams> = {},
): UndergroundMuckpileResult {
  const t0 = performance.now();
  const params: UgMuckpileParams = { ...DEFAULT_UG_MUCKPILE_PARAMS, ...overrides };
  const { blast, fireTime } = input;
  const warnings: UgMuckpileWarning[] = [];
  // Diseños con taladros cargados.
  const byTag = new Map<string, number[]>();
  blast.holes.forEach((h, i) => {
    if (!isUndergroundHole(h) || !isChargedHole(h) || !((input.chargePerHole[i] ?? 0) > 0)) return;
    const tag = designTag(h);
    if (!tag) return;
    const list = byTag.get(tag) ?? [];
    list.push(i);
    byTag.set(tag, list);
  });
  const chambers: Chamber[] = [];
  for (const [tag, idx] of byTag) {
    const c = buildChamber(blast, tag, idx, fireTime, params);
    if (c) chambers.push(c);
    else warnings.push({ id: 'ugPile.noExcavation', params: { tag } });
  }
  // Lado del bloque: el volumen total entre los bloques objetivo.
  let total = 0;
  for (const c of chambers)
    total += Math.abs(polygonSignedArea(c.blasted)) * Math.max(0, c.s1 - c.s0);
  const cell = Math.min(
    3,
    Math.max(params.minBlock, Math.cbrt(total / Math.max(100, params.targetBlocks))),
  );
  const acc: BlockAcc = {
    origin: [],
    impact: [],
    dest: [],
    vel: [],
    launch: [],
    impactT: [],
    hole: [],
    volume: [],
    path: [],
  };
  const designs: UgPileDesign[] = [];
  let grids: MuckpileResult['grids'] | null = null;
  let gridsVolume = -1;
  let clipped = 0;
  let maxExcess = 0;
  let pileVolume = 0;
  for (const c of chambers) {
    const r = simulateChamber(c, input, params, cell, acc, warnings);
    designs.push(r.design);
    clipped += r.clipped;
    maxExcess = Math.max(maxExcess, r.maxExcess);
    pileVolume += r.design.pileVolume;
    if (r.design.inSituVolume > gridsVolume) {
      gridsVolume = r.design.inSituVolume;
      grids = r.grids;
    }
  }
  if (clipped > 0) warnings.push({ id: 'ugPile.clipped', params: { blocks: clipped } });
  const count = acc.hole.length;
  const blocks: MuckpileBlocks = {
    count,
    origin: Float64Array.from(acc.origin),
    impact: Float64Array.from(acc.impact),
    destination: Float64Array.from(acc.dest),
    velocity: Float32Array.from(acc.vel),
    launchTime: Float64Array.from(acc.launch),
    impactTime: Float64Array.from(acc.impactT),
    hole: Int32Array.from(acc.hole),
    volume: Float32Array.from(acc.volume),
    height: new Float32Array(count).fill(cell),
    topSlope: new Float32Array(2 * count),
    fragmentSize: new Float32Array(count).fill(NaN),
    domain: new Int16Array(count).fill(-1),
    path: Float32Array.from(acc.path),
    pathPoints: UG_PATH_POINTS,
  };
  const inSitu = designs.reduce((s, d) => s + d.inSituVolume, 0);
  let maxD = 0;
  let sumD = 0;
  let sumV = 0;
  let dirX = 0;
  let dirY = 0;
  let staticBlocks = 0;
  let firstLaunch = Infinity;
  let lastLaunch = -Infinity;
  let lastImpact = -Infinity;
  let maxZ = -Infinity;
  for (let k = 0; k < count; k++) {
    const dx = (blocks.destination[3 * k] ?? 0) - (blocks.origin[3 * k] ?? 0);
    const dy = (blocks.destination[3 * k + 1] ?? 0) - (blocks.origin[3 * k + 1] ?? 0);
    const dz = (blocks.destination[3 * k + 2] ?? 0) - (blocks.origin[3 * k + 2] ?? 0);
    const d = Math.hypot(dx, dy, dz);
    const v = blocks.volume[k] ?? 0;
    maxD = Math.max(maxD, d);
    sumD += d * v;
    sumV += v;
    dirX += dx * v;
    dirY += dy * v;
    maxZ = Math.max(maxZ, blocks.destination[3 * k + 2] ?? -Infinity);
    const L = blocks.launchTime[k] ?? NaN;
    if (!Number.isFinite(L)) {
      staticBlocks++;
      continue;
    }
    firstLaunch = Math.min(firstLaunch, L);
    lastLaunch = Math.max(lastLaunch, L);
    lastImpact = Math.max(lastImpact, blocks.impactTime[k] ?? L);
  }
  const dn = Math.hypot(dirX, dirY);
  const result: UndergroundMuckpileResult = {
    blocks,
    vectors: holeVectors(blocks),
    grids: grids ?? emptyGrids(),
    stats: {
      inSituVolume: inSitu,
      pileVolume,
      volumeError: inSitu > 0 ? pileVolume / (inSitu * params.swell) - 1 : 0,
      wedgeVolume: 0,
      maxReposeExcess: maxExcess,
      maxDisplacement: maxD,
      meanDisplacement: sumV > 0 ? sumD / sumV : 0,
      throw: designs.reduce((m, d) => Math.max(m, d.throw), 0),
      maxDrop: 0,
      meanDrop: 0,
      lateralSpread: 0,
      maxElevation: Number.isFinite(maxZ) ? maxZ : 0,
      maxHeight: designs.reduce((m, d) => Math.max(m, d.maxHeight), 0),
      direction: dn > 0 ? { x: dirX / dn, y: dirY / dn } : { x: 0, y: 0 },
      blocks: count,
      staticBlocks,
      firstLaunch: Number.isFinite(firstLaunch) ? firstLaunch : NaN,
      lastLaunch: Number.isFinite(lastLaunch) ? lastLaunch : NaN,
      lastImpact: Number.isFinite(lastImpact) ? lastImpact : NaN,
    },
    sizeClasses: [],
    warnings: byTag.size === 0 ? [{ id: 'muckpile.noChargedHoles' }] : [],
    elapsedMs: 0,
    underground: { blockSize: cell, designs, warnings, params },
  };
  result.elapsedMs = performance.now() - t0;
  return result;
}

interface ChamberResult {
  design: UgPileDesign;
  grids: MuckpileResult['grids'];
  clipped: number;
  maxExcess: number;
}

/** Bloques in situ de la cámara: celdas de la sección (recortadas) × rebanadas a lo largo del eje. */
function discretize(c: Chamber, cell: number): { s: number; u: number; v: number; vol: number }[] {
  const out: { s: number; u: number; v: number; vol: number }[] = [];
  const poly = c.blasted;
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const p of poly) {
    u0 = Math.min(u0, p.x);
    u1 = Math.max(u1, p.x);
    v0 = Math.min(v0, p.y);
    v1 = Math.max(v1, p.y);
  }
  const cells: { u: number; v: number; area: number }[] = [];
  for (let v = v0; v < v1 - 1e-9; v += cell)
    for (let u = u0; u < u1 - 1e-9; u += cell) {
      const rect: Vec2[] = [
        { x: u, y: v },
        { x: u + cell, y: v },
        { x: u + cell, y: v + cell },
        { x: u, y: v + cell },
      ];
      const piece = clipPolygonConvex(poly, rect);
      if (piece.length < 3) continue;
      const area = Math.abs(polygonSignedArea(piece));
      if (area < 0.02 * cell * cell) continue;
      let cu = 0;
      let cv = 0;
      for (const p of piece) {
        cu += p.x;
        cv += p.y;
      }
      cu /= piece.length;
      cv /= piece.length;
      // Galería dentro del tajeo: ya está excavada (se resta por el centro de la celda).
      if (c.hollow.some((h) => pointInPolygon(cu, cv, h))) continue;
      cells.push({ u: cu, v: cv, area });
    }
  const L = c.s1 - c.s0;
  const ns = Math.max(1, Math.round(L / cell));
  const ds = L / ns;
  for (let i = 0; i < ns; i++) {
    const s = c.s0 + (i + 0.5) * ds;
    for (const q of cells) out.push({ s, u: q.u, v: q.v, vol: q.area * ds });
  }
  return out;
}

function simulateChamber(
  c: Chamber,
  input: UgMuckpileInput,
  params: UgMuckpileParams,
  cell: number,
  acc: BlockAcc,
  warnings: UgMuckpileWarning[],
): ChamberResult {
  const { blast, fireTime } = input;
  const f = c.frame;
  const up = f.V.z;
  // ----- Taladros: tramo cargado, burden al hueco abierto y velocidad.
  const reliefSegs = blast.holes
    .filter((h) => h.tags?.includes(c.tag) && h.tags.includes(RELIEF_TAG))
    .map((h) => {
      const L = h.length;
      const ax = holeAxis(h);
      return {
        a: h.collar,
        b: { x: h.collar.x + ax.x * L, y: h.collar.y + ax.y * L, z: h.collar.z + ax.z * L },
      };
    });
  const infos = new Map<number, HoleInfo>();
  const timedHoles = c.holes.filter((i) => Number.isFinite(fireTime[i] ?? NaN));
  if (timedHoles.length < c.holes.length)
    warnings.push({
      id: 'ugPile.noTiming',
      params: { tag: c.tag, holes: c.holes.length - timedHoles.length },
    });
  const segOf = new Map<number, { a: Vec3; b: Vec3 }>();
  for (const i of c.holes) {
    const h = blast.holes[i];
    const g = h ? chargeSegment(h) : null;
    if (g) segOf.set(i, g);
  }
  let vMinH = Infinity;
  let vMaxH = -Infinity;
  for (const g of segOf.values()) {
    const v = toLocal(f, g.a).v;
    vMinH = Math.min(vMinH, v);
    vMaxH = Math.max(vMaxH, v);
  }
  const stopeLike = !c.fromFace;
  for (const i of c.holes) {
    const g = segOf.get(i);
    if (!g) continue;
    const t = fireTime[i] ?? NaN;
    // Burden: distancia al alivio o al taladro cargado que salió antes (el hueco ya abierto).
    let B = Infinity;
    for (const r of reliefSegs) B = Math.min(B, segmentGap(g.a, g.b, r.a, r.b));
    for (const j of c.holes) {
      if (j === i) continue;
      const tj = fireTime[j] ?? NaN;
      if (!(tj < t)) continue;
      const gj = segOf.get(j);
      if (gj) B = Math.min(B, segmentGap(g.a, g.b, gj.a, gj.b));
    }
    const len = norm(sub(g.b, g.a));
    const m = len > 0 ? (input.chargePerHole[i] ?? 0) / len : 0;
    if (!Number.isFinite(B)) B = stopeLike ? 2 : 1;
    B = Math.max(0.2, B);
    let v = params.velocityK * Math.pow(Math.sqrt(m) / B, params.velocityN);
    v = Math.min(params.maxSpeed, Math.max(params.minSpeed, v));
    if (stopeLike) v *= params.stopeFactor;
    v *= params.throwFactor;
    const vLocal = toLocal(f, g.a).v;
    const role =
      c.mode === 'face' && vLocal < vMinH + 0.35 * cell + 0.3
        ? 'lifter'
        : c.mode === 'face' && vLocal > vMaxH - 0.3
          ? 'roof'
          : 'other';
    infos.set(i, { a: g.a, b: g.b, speed: Number.isFinite(t) ? v : NaN, burden: B, t, role });
  }
  const tFirst = Math.min(...timedHoles.map((i) => fireTime[i] ?? Infinity));
  const tLast = Math.max(...timedHoles.map((i) => fireTime[i] ?? -Infinity));
  const tSpan = Math.max(1e-6, tLast - tFirst);

  // ----- Bloques in situ y su taladro.
  const raw = discretize(c, cell);
  const holeList = [...infos.entries()];
  const blocks = raw.map((b, k) => {
    const p = toWorld(f, b.s, b.u, b.v);
    let best = -1;
    let bestD = Infinity;
    for (const [i, h] of holeList) {
      const d = pointSegment(p, h.a, h.b);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { ...b, p, hole: best, r: bestD, k };
  });

  // ----- Grilla de la pila.
  const grid = buildGrid(c, cell);
  const hm = new Heightmap(grid.lattice, grid.base, params.reposeAngle);
  const { nx, ny } = grid.lattice;
  const cellOf = (x: number, y: number) => {
    const [i, j] = hm.cellAt(x, y);
    return j * nx + i;
  };

  // ----- Vuelo de cada bloque, en orden de salida.
  const order = blocks
    .map((b, n) => ({ n, t: infos.get(b.hole)?.t ?? NaN }))
    .sort(
      (a, b) =>
        (Number.isFinite(a.t) ? a.t : Infinity) - (Number.isFinite(b.t) ? b.t : Infinity) ||
        a.n - b.n,
    );
  const nB = blocks.length;
  const rest = new Float64Array(3 * nB);
  const impact = new Float64Array(3 * nB);
  const vel = new Float32Array(3 * nB);
  const tImpact = new Float64Array(nB).fill(NaN);
  const tLaunch = new Float64Array(nB).fill(NaN);
  const path = new Float32Array(nB * UG_PATH_POINTS * 4);
  const trackT: number[] = [];
  const trackP: number[] = [];
  let clipped = 0;
  let pending = 0;
  const e = params.restitution;
  for (const { n } of order) {
    const b = blocks[n];
    if (!b) continue;
    const info = infos.get(b.hole);
    const t = info?.t ?? NaN;
    const k = b.k;
    if (!info || !Number.isFinite(t) || !Number.isFinite(info.speed)) {
      // No sale: queda en su lugar (sin tiempo o sin carga).
      rest[3 * n] = b.p.x;
      rest[3 * n + 1] = b.p.y;
      rest[3 * n + 2] = b.p.z;
      impact.set([b.p.x, b.p.y, b.p.z], 3 * n);
      continue;
    }
    tLaunch[n] = t;
    // Dirección en el marco (s, u, v).
    const tau = (t - tFirst) / tSpan;
    let ds: number;
    let du: number;
    let dv: number;
    const ru = c.cutCenter.x - b.u;
    const rv = c.cutCenter.y - b.v;
    const rn = Math.hypot(ru, rv) || 1;
    const jitter = (salt: number) => hash01(k, salt) - 0.5;
    if (c.fromFace) {
      // Afuera del frente (−a), hacia el hueco del cuele al principio de la secuencia.
      const inward = 0.35 * (1 - tau);
      ds = -1;
      du = (inward * ru) / rn + 0.18 * jitter(1);
      dv = (inward * rv) / rn + 0.12 * jitter(2);
      if (info.role === 'lifter') dv += 0.18;
      else if (info.role === 'roof') dv -= 0.12;
    } else if (c.mode === 'shaft') {
      // Cuele vertical: hacia el alivio y abajo.
      ds = -0.4;
      du = ru / rn + 0.2 * jitter(1);
      dv = rv / rn + 0.2 * jitter(2);
    } else {
      // Tajeo: hacia la cara libre, con algo de apertura.
      ds = c.out;
      du = 0.25 * jitter(1);
      dv = 0.25 * jitter(2);
    }
    const dn = Math.hypot(ds, du, dv);
    // Atenuación con la distancia a la carga y dispersión determinista.
    // Sesgada hacia abajo: buena parte de la roca cae cerca del frente y pocos bloques vuelan lejos.
    const att = Math.exp((-0.5 * b.r) / Math.max(0.2, info.burden));
    const speed = info.speed * att * (0.25 + 1.05 * Math.pow(hash01(k, 3), 1.2));
    let vs = (speed * ds) / dn;
    let vu = (speed * du) / dn;
    let vv = (speed * dv) / dn;
    const v0 = toWorldVec(f, vs, vu, vv);
    vel.set([v0.x, v0.y, v0.z], 3 * n);
    // Integración.
    let L: { s: number; u: number; v: number };
    let px = b.p.x;
    let py = b.p.y;
    let pz = b.p.z;
    let vx = v0.x;
    let vy = v0.y;
    let vz = v0.z;
    trackT.length = 0;
    trackP.length = 0;
    trackT.push(0);
    trackP.push(px, py, pz);
    let tt = 0;
    let landed = false;
    for (let step = 0; step < MAX_FLIGHT / DT; step++) {
      vz -= G * DT;
      px += vx * DT;
      py += vy * DT;
      pz += vz * DT;
      tt += DT;
      L = toLocal(f, { x: px, y: py, z: pz });
      const confined = c.mode !== 'shaft' || L.s > c.openS0;
      if (confined) {
        // Extremos del tramo abierto (frente nuevo o fin del tajeo).
        if (L.s > c.openS1 || L.s < c.openS0) {
          const lim = L.s > c.openS1 ? c.openS1 : c.openS0;
          const loc = { ...L, s: lim + (L.s > c.openS1 ? -1e-3 : 1e-3) };
          ({ x: px, y: py, z: pz } = toWorld(f, loc.s, loc.u, loc.v));
          ({ vs, vu, vv } = velLocal(f, vx, vy, vz));
          vs = -vs * e;
          vu *= 0.8;
          vv *= 0.8;
          ({ x: vx, y: vy, z: vz } = toWorldVec(f, vs, vu, vv));
          L = loc;
        }
        if (!insideAny(c.open, L.u, L.v)) {
          const q = nearestEdge(c.open, L.u, L.v);
          const floorLike = q.nu * f.U.z + q.nv * up > 0.6;
          ({ x: px, y: py, z: pz } = toWorld(f, L.s, q.u + q.nu * 1e-3, q.v + q.nv * 1e-3));
          if (floorLike && c.mode !== 'shaft') {
            landed = true;
            break;
          }
          ({ vs, vu, vv } = velLocal(f, vx, vy, vz));
          const vn = vu * q.nu + vv * q.nv;
          if (vn < 0) {
            const tu = vu - vn * q.nu;
            const tv = vv - vn * q.nv;
            vu = 0.8 * tu - e * vn * q.nu;
            vv = 0.8 * tv - e * vn * q.nv;
            vs *= 0.8;
          }
          ({ x: vx, y: vy, z: vz } = toWorldVec(f, vs, vu, vv));
        }
      }
      if (step % 3 === 2) {
        trackT.push(tt);
        trackP.push(px, py, pz);
      }
      // Piso o pila (celda abierta más cercana).
      if (vz < 0) {
        const kc = cellOf(px, py);
        if (grid.open[kc] && pz <= (hm.h[kc] ?? -Infinity)) {
          pz = hm.h[kc] ?? pz;
          landed = true;
          break;
        }
      }
    }
    if (!landed) clipped++;
    impact.set([px, py, pz], 3 * n);
    trackT.push(tt);
    trackP.push(px, py, pz);
    // Deslizamiento sobre el piso o la pila.
    const hx = vx * params.impactRetention;
    const hy = vy * params.impactRetention;
    const vh = Math.hypot(hx, hy);
    let sx = px;
    let sy = py;
    let kc = nearestOpen(grid, ...hm.cellAt(px, py));
    if (vh > 0.05) {
      const dist = Math.min(params.maxSlide, (vh * vh) / (2 * params.friction * G));
      const stepL = grid.lattice.cell * 0.5;
      const ux = hx / vh;
      const uy = hy / vh;
      const tanR = Math.tan(params.reposeAngle);
      for (let d = stepL; d <= dist; d += stepL) {
        const nxp = sx + ux * stepL;
        const nyp = sy + uy * stepL;
        if (!hm.contains(nxp, nyp)) {
          clipped++;
          break;
        }
        const kn = cellOf(nxp, nyp);
        if (!grid.open[kn]) break;
        // No sube por la pila más de lo que permite el reposo.
        if ((hm.h[kn] ?? 0) - (hm.h[kc] ?? 0) > stepL * tanR) break;
        sx = nxp;
        sy = nyp;
        kc = kn;
      }
      const slid = Math.hypot(sx - px, sy - py);
      tt += vh > 0 ? (2 * slid) / vh : 0;
    }
    const ci = kc % nx;
    const cj = (kc - ci) / nx;
    const cx = grid.lattice.x0 + (ci + 0.5) * grid.lattice.cell;
    const cy = grid.lattice.y0 + (cj + 0.5) * grid.lattice.cell;
    if (c.mode !== 'shaft') ({ x: sx, y: sy } = clampInside(c, sx, sy, hm.h[kc] ?? pz));
    rest.set([sx, sy, hm.h[kc] ?? pz], 3 * n);
    trackT.push(tt);
    trackP.push(sx, sy, hm.h[kc] ?? pz);
    tImpact[n] = t + tt;
    // Muestras de la trayectoria (relativas al origen y a la salida).
    resample(trackT, trackP, b.p, path, n);
    hm.deposit(cx, cy, b.vol * params.swell, false);
    if (++pending >= RELAX_BATCH) {
      hm.relax();
      pending = 0;
    }
  }
  hm.relax();
  // Aviso si el techo detuvo una parte apreciable de la pila (> 2 %).
  const capped = capRoof(hm, grid);
  const looseNow = hm.looseVolume();
  if (capped > 0.02 * looseNow)
    warnings.push({ id: 'ugPile.roof', params: { tag: c.tag, mode: c.mode } });

  // ----- Posición final: llenar la pila en orden de llegada.
  const arrival = blocks
    .map((_, n) => n)
    .sort((a, b) => {
      const ta = tImpact[a] ?? NaN;
      const tb = tImpact[b] ?? NaN;
      return (
        (Number.isFinite(ta) ? ta : -Infinity) - (Number.isFinite(tb) ? tb : -Infinity) || a - b
      );
    });
  const dest = placeBlocks(hm, grid, arrival, rest, blocks, params.swell, tImpact);

  // ----- Acumular en el resultado global.
  for (let n = 0; n < nB; n++) {
    const b = blocks[n];
    if (!b) continue;
    acc.origin.push(b.p.x, b.p.y, b.p.z);
    acc.impact.push(impact[3 * n] ?? 0, impact[3 * n + 1] ?? 0, impact[3 * n + 2] ?? 0);
    acc.dest.push(dest[3 * n] ?? 0, dest[3 * n + 1] ?? 0, dest[3 * n + 2] ?? 0);
    acc.vel.push(vel[3 * n] ?? 0, vel[3 * n + 1] ?? 0, vel[3 * n + 2] ?? 0);
    acc.launch.push(tLaunch[n] ?? NaN);
    acc.impactT.push(
      Number.isFinite(tImpact[n] ?? NaN) ? (tImpact[n] ?? NaN) : (tLaunch[n] ?? NaN),
    );
    acc.hole.push(b.hole);
    acc.volume.push(b.vol);
    for (let q = 0; q < UG_PATH_POINTS * 4; q++)
      acc.path.push(path[n * UG_PATH_POINTS * 4 + q] ?? 0);
  }

  // ----- Indicadores.
  const inSitu = blocks.reduce((s, b) => s + b.vol, 0);
  const pile = hm.looseVolume();
  let maxH = 0;
  for (let k = 0; k < nx * ny; k++)
    if (grid.open[k])
      maxH = Math.max(
        maxH,
        ((hm.h[k] ?? 0) - (grid.base[k] ?? 0)) * (c.mode === 'shaft' ? 1 : 1 / Math.max(0.3, up)),
      );
  let sumD = 0;
  let maxDisp = 0;
  let firstLaunch = Infinity;
  let lastImpact = -Infinity;
  for (let n = 0; n < nB; n++) {
    const b = blocks[n];
    if (!b) continue;
    const d = Math.hypot(
      (dest[3 * n] ?? 0) - b.p.x,
      (dest[3 * n + 1] ?? 0) - b.p.y,
      (dest[3 * n + 2] ?? 0) - b.p.z,
    );
    sumD += d * b.vol;
    maxDisp = Math.max(maxDisp, d);
    if (Number.isFinite(tLaunch[n] ?? NaN))
      firstLaunch = Math.min(firstLaunch, tLaunch[n] ?? Infinity);
    if (Number.isFinite(tImpact[n] ?? NaN))
      lastImpact = Math.max(lastImpact, tImpact[n] ?? -Infinity);
  }
  const sectionArea =
    Math.abs(polygonSignedArea(c.blasted)) -
    c.hollow.reduce((s, h) => s + Math.abs(polygonSignedArea(h)), 0);
  let throwD = maxDisp;
  let heightAtFace = 0;
  const blockage: { distance: number; fraction: number }[] = [];
  let maxBlockage: { distance: number; fraction: number } | null = null;
  if (c.mode === 'face') {
    const area = Math.abs(polygonSignedArea(c.blasted));
    const du = Math.max(0.05, cell / 2);
    const covered = (s: number): { frac: number; thick: number } => {
      let a = 0;
      let thick = 0;
      for (let u = c.uMin + du / 2; u < c.uMax; u += du) {
        const span = verticalSpan(c.open, u);
        if (!span) continue;
        const w = toWorld(f, s, u, span.lo);
        if (!hm.contains(w.x, w.y)) continue;
        const kc = cellOf(w.x, w.y);
        if (!grid.open[kc]) continue;
        const h = Math.max(0, ((hm.h[kc] ?? 0) - (grid.base[kc] ?? 0)) / Math.max(0.3, up));
        thick = Math.max(thick, h);
        a += Math.min(h, span.hi - span.lo) * du;
      }
      return { frac: area > 0 ? Math.min(1, a / area) : 0, thick };
    };
    // Distancias desde el frente nuevo (s = avance) hacia la galería.
    throwD = 0;
    const stepD = Math.max(0.25, cell / 2);
    for (let d = 0; d <= c.s1 - c.openS0; d += stepD) {
      const r = covered(c.s1 - d);
      if (d === 0) heightAtFace = r.thick;
      if (r.thick >= PILE_MIN) throwD = d;
      if (!maxBlockage || r.frac > maxBlockage.fraction)
        maxBlockage = { distance: d, fraction: r.frac };
    }
    for (const d of [0, 5, 10, 15, 20, 30, 40])
      if (d <= throwD + 5) blockage.push({ distance: d, fraction: covered(c.s1 - d).frac });
    if (maxBlockage && maxBlockage.fraction >= BLOCKAGE_WARNING)
      warnings.push({
        id: 'ugPile.blockage',
        params: {
          tag: c.tag,
          pct: Math.round(maxBlockage.fraction * 100),
          distance: Math.round(maxBlockage.distance),
        },
      });
  }
  const design: UgPileDesign = {
    tag: c.tag,
    mode: c.mode,
    blocks: nB,
    inSituVolume: inSitu,
    pileVolume: pile,
    sectionArea: Math.max(0, sectionArea),
    advance: c.s1 - c.s0,
    throw: throwD,
    maxHeight: maxH,
    heightAtFace,
    meanDisplacement: inSitu > 0 ? sumD / inSitu : 0,
    blockage,
    maxBlockage,
    firstLaunch: Number.isFinite(firstLaunch) ? firstLaunch : NaN,
    lastImpact: Number.isFinite(lastImpact) ? lastImpact : NaN,
  };
  return {
    design,
    grids: chamberGrids(hm, grid),
    clipped,
    maxExcess: openReposeExcess(hm, grid, params.reposeAngle),
  };
}

/** Lleva el punto de reposo adentro del perfil (la celda abierta puede asomar al muro). */
function clampInside(c: Chamber, x: number, y: number, z: number): Vec3 {
  const l = toLocal(c.frame, { x, y, z });
  const span = verticalSpan(c.open, l.u);
  if (span && l.v >= span.lo - 1e-6 && l.v <= span.hi + 1e-6) return { x, y, z };
  const margin = 0.02;
  const u = Math.min(c.uMax - margin, Math.max(c.uMin + margin, l.u));
  const sp = verticalSpan(c.open, u);
  if (!sp) return { x, y, z };
  const p = toWorld(c.frame, l.s, u, Math.min(sp.hi, Math.max(sp.lo, l.v)));
  return { x: p.x, y: p.y, z };
}

function toWorldVec(f: Frame, s: number, u: number, v: number): Vec3 {
  return {
    x: f.a.x * s + f.U.x * u + f.V.x * v,
    y: f.a.y * s + f.U.y * u + f.V.y * v,
    z: f.a.z * s + f.U.z * u + f.V.z * v,
  };
}

function velLocal(f: Frame, x: number, y: number, z: number) {
  const w = { x, y, z };
  return { vs: dot(w, f.a), vu: dot(w, f.U), vv: dot(w, f.V) };
}

/** Remuestrea la trayectoria a `UG_PATH_POINTS` puntos uniformes en el tiempo [dx, dy, dz, t]. */
function resample(
  T: readonly number[],
  P: readonly number[],
  o: Vec3,
  out: Float32Array,
  n: number,
): void {
  const total = T.at(-1) ?? 0;
  let j = 0;
  for (let q = 0; q < UG_PATH_POINTS; q++) {
    const t = (total * q) / (UG_PATH_POINTS - 1);
    while (j < T.length - 2 && (T[j + 1] ?? 0) < t) j++;
    const ta = T[j] ?? 0;
    const tb = T[j + 1] ?? ta;
    const w = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    const base = (n * UG_PATH_POINTS + q) * 4;
    for (let c = 0; c < 3; c++) {
      const a = P[3 * j + c] ?? 0;
      const b = P[3 * Math.min(T.length - 1, j + 1) + c] ?? a;
      out[base + c] = a + (b - a) * w - (c === 0 ? o.x : c === 1 ? o.y : o.z);
    }
    out[base + 3] = t;
  }
}

/** La pila no pasa el techo: el exceso se corre a la celda abierta vecina más baja. Devuelve el volumen corrido [m³]. */
function capRoof(hm: Heightmap, g: PlanGrid): number {
  const { nx, ny, x0, y0, cell } = g.lattice;
  let total = 0;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let k = 0; k < nx * ny; k++) {
      if (!g.open[k]) continue;
      const cap = (g.roof[k] ?? Infinity) - ROOF_CLEARANCE;
      const h = hm.h[k] ?? 0;
      if (!(h > cap + 1e-6)) continue;
      const excess = Math.min(h - cap, h - (g.base[k] ?? 0));
      if (!(excess > 0)) continue;
      const i = k % nx;
      const j = (k - i) / nx;
      let best = -1;
      let bestH = Infinity;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if ((di === 0 && dj === 0) || ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const kk = jj * nx + ii;
          if (!g.open[kk]) continue;
          const hh = hm.h[kk] ?? Infinity;
          if (hh < bestH) {
            bestH = hh;
            best = kk;
          }
        }
      if (best < 0) continue;
      total += excess * cell * cell;
      moved = true;
      hm.h[k] = h - excess;
      const bi = best % nx;
      const bj = (best - bi) / nx;
      hm.deposit(x0 + (bi + 0.5) * cell, y0 + (bj + 0.5) * cell, excess * cell * cell, true);
    }
    if (!moved) break;
  }
  return total;
}

/** Posición final de cada bloque: en orden de llegada, en la columna abierta con lugar más cercana. */
function placeBlocks(
  hm: Heightmap,
  g: PlanGrid,
  order: readonly number[],
  rest: Float64Array,
  blocks: readonly { p: Vec3; vol: number }[],
  swell: number,
  tImpact: Float64Array,
): Float64Array {
  const { nx, ny, cell, x0, y0 } = g.lattice;
  const area = cell * cell;
  const capacity = new Float64Array(nx * ny);
  for (let k = 0; k < capacity.length; k++)
    capacity[k] = g.open[k] ? Math.max(0, ((hm.h[k] ?? 0) - (g.base[k] ?? 0)) * area) : 0;
  const filled = new Float64Array(nx * ny);
  const out = new Float64Array(3 * blocks.length);
  const maxR = Math.max(nx, ny);
  for (const n of order) {
    const b = blocks[n];
    if (!b) continue;
    if (!Number.isFinite(tImpact[n] ?? NaN)) {
      out.set([b.p.x, b.p.y, b.p.z], 3 * n);
      continue;
    }
    const vs = b.vol * swell;
    const px = rest[3 * n] ?? 0;
    const py = rest[3 * n + 1] ?? 0;
    const [ci, cj] = hm.cellAt(px, py);
    let chosen = -1;
    for (let r = 0; r <= maxR && chosen < 0; r++) {
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        const jj = cj + dj;
        if (jj < 0 || jj >= ny) continue;
        const ring = Math.abs(dj) === r;
        for (let di = -r; di <= r; di += ring ? 1 : 2 * r || 1) {
          const ii = ci + di;
          if (ii < 0 || ii >= nx) continue;
          const k = jj * nx + ii;
          if ((capacity[k] ?? 0) - (filled[k] ?? 0) < 0.5 * vs) continue;
          const d = Math.hypot(x0 + (ii + 0.5) * cell - px, y0 + (jj + 0.5) * cell - py);
          if (d < bestD) {
            bestD = d;
            chosen = k;
          }
        }
      }
    }
    if (chosen < 0) chosen = nearestOpen(g, ci, cj);
    const ii = chosen % nx;
    const jj = (chosen - ii) / nx;
    const below = filled[chosen] ?? 0;
    filled[chosen] = below + vs;
    // El centro del bloque no pasa la superficie de la pila relajada (ni el techo).
    const top = hm.h[chosen] ?? 0;
    const z = Math.min(
      (g.base[chosen] ?? 0) + (below + vs / 2) / area,
      Math.max(g.base[chosen] ?? 0, top - 0.25 * cell),
    );
    out.set([x0 + (ii + 0.5) * cell, y0 + (jj + 0.5) * cell, z], 3 * n);
  }
  return out;
}

function openReposeExcess(hm: Heightmap, g: PlanGrid, angle: number): number {
  // Los muros (roca) quedan fuera del control: se ponen a la cota de la pila vecina.
  const h = Float64Array.from(hm.h);
  const base = Float64Array.from(g.base);
  for (let k = 0; k < h.length; k++)
    if (!g.open[k]) {
      h[k] = Infinity;
      base[k] = Infinity;
    }
  const v = reposeExcess(h, base, g.lattice, angle);
  return Number.isFinite(v) ? v : 0;
}

function chamberGrids(hm: Heightmap, g: PlanGrid): MuckpileResult['grids'] {
  const { nx, ny, x0, y0, cell } = g.lattice;
  const mk = (src: ArrayLike<number>): ScalarGrid => {
    const values = new Float32Array(nx * ny);
    for (let k = 0; k < nx * ny; k++) values[k] = g.open[k] ? (src[k] ?? NaN) : NaN;
    return { originX: x0, originY: y0, cellSize: cell, nx, ny, values };
  };
  const n = nx * ny;
  return {
    base: mk(g.base),
    before: mk(g.base),
    after: mk(hm.h),
    displacement: new Float32Array(n).fill(NaN),
    fragmentSize: new Float32Array(n).fill(NaN),
    domain: new Int16Array(n).fill(-1),
    domainPurity: new Float32Array(n).fill(1),
  };
}

function emptyGrids(): MuckpileResult['grids'] {
  const empty: ScalarGrid = {
    originX: 0,
    originY: 0,
    cellSize: 1,
    nx: 0,
    ny: 0,
    values: new Float32Array(0),
  };
  return {
    base: empty,
    before: empty,
    after: empty,
    displacement: new Float32Array(0),
    fragmentSize: new Float32Array(0),
    domain: new Int16Array(0),
    domainPurity: new Float32Array(0),
  };
}

function holeVectors(blocks: MuckpileBlocks): MuckpileVectors {
  const byHole = new Map<number, { v: number; f: number[]; t: number[] }>();
  for (let k = 0; k < blocks.count; k++) {
    const h = blocks.hole[k] ?? -1;
    const v = blocks.volume[k] ?? 0;
    const a = byHole.get(h) ?? { v: 0, f: [0, 0, 0], t: [0, 0, 0] };
    a.v += v;
    for (let c = 0; c < 3; c++) {
      a.f[c] = (a.f[c] ?? 0) + v * (blocks.origin[3 * k + c] ?? 0);
      a.t[c] = (a.t[c] ?? 0) + v * (blocks.destination[3 * k + c] ?? 0);
    }
    byHole.set(h, a);
  }
  const holes = [...byHole.entries()].filter(([h, a]) => h >= 0 && a.v > 0);
  const from = new Float64Array(3 * holes.length);
  const to = new Float64Array(3 * holes.length);
  const magnitude = new Float32Array(holes.length);
  holes.forEach(([, a], i) => {
    for (let c = 0; c < 3; c++) {
      from[3 * i + c] = (a.f[c] ?? 0) / a.v;
      to[3 * i + c] = (a.t[c] ?? 0) / a.v;
    }
    magnitude[i] = Math.hypot(
      (to[3 * i] ?? 0) - (from[3 * i] ?? 0),
      (to[3 * i + 1] ?? 0) - (from[3 * i + 1] ?? 0),
    );
  });
  return { count: holes.length, hole: Int32Array.from(holes.map(([h]) => h)), from, to, magnitude };
}
