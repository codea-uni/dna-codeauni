import { inFrontOfFace } from '../geometry/face';
import { deckIntervals, indexLibrary, linearChargeDensity } from '../charging/charge';
import { azimuthToUnit } from '../geometry/vec';
import type {
  Blast,
  Hole,
  Meters,
  MetersPerSecond,
  ProductLibrary,
  RockMass,
  Vec3,
} from '../model/types';
import { turboRgb } from './colormap';
import { marchingSquares, type Contours, type ScalarGrid } from './contours';

/**
 * Holmberg–Persson (campo cercano): v = K · [ Σ q·dx / (d²)^(β/2α) ]^α
 * con q [kg/m], dx y d [m], v en m/s. Valores típicos: K = 0.7 m/s (700 mm/s), α = 0.7, β = 1.5
 * (Holmberg & Persson, 1979; Persson, Holmberg & Lee, "Rock Blasting and Explosives Engineering", 1994).
 * La integral se hace por taladro (su columna de carga) y en cada punto se toma el MÁXIMO entre
 * taladros: detonan en tiempos distintos, así que sus picos no se superponen. (Sumar todos los
 * taladros haría crecer el valor sin límite con el tamaño de la malla.)
 */
export interface NearFieldParams {
  k: number;
  alpha: number;
  beta: number;
  /** Modelo de PPV de campo cercano; sin él, Holmberg–Persson. */
  model?: NearFieldModel;
  /** Criterio de las bandas de daño; sin él, múltiplos de VPPc (Persson–Holmberg–Lee). */
  damageCriterion?: DamageCriterion;
}

/**
 * `holmbergPerson`: integra Σ q·dx/d^(β/α) a lo largo de la carga (Holmberg & Persson 1979).
 * `nioshModified`: la carga del taladro W a la distancia media R̄ a la columna (Hustrulid & Lu
 * 2003; Iverson et al. 2008): PPV = K·W^α / R̄^β. Mismas constantes K, α, β (para un punto de
 * carga ambos dan K·W^α/R^β); cerca del eje NIOSH da menos y la forma es casi esférica.
 */
export type NearFieldModel = 'holmbergPersson' | 'nioshModified';

/**
 * `vppcMultiples`: ¼, 1, 4 y 8 × VPPc (Persson–Holmberg–Lee; Forsyth 1993).
 * `bauerCalder`: umbrales fijos 254, 635 y 2540 mm/s (Bauer & Calder; roca intacta).
 */
export type DamageCriterion = 'vppcMultiples' | 'bauerCalder';

/** Umbrales de Bauer & Calder [m/s]: fisuras incipientes, fracturas fuertes, rotura total. */
export const BAUER_CALDER_LEVELS = [0.254, 0.635, 2.54] as const;

/** Niveles de las bandas de daño [m/s] del criterio; null si falta VPPc para calcularlos. */
export function damageLevels(criterion: DamageCriterion, vppc: number | null): number[] | null {
  if (criterion === 'bauerCalder') return [...BAUER_CALDER_LEVELS];
  return vppc !== null && vppc > 0 ? DAMAGE_MULTIPLES.map((m) => m * vppc) : null;
}

export const DEFAULT_NEAR_FIELD: NearFieldParams = { k: 0.7, alpha: 0.7, beta: 1.5 };

/**
 * Forma cerrada de Holmberg–Persson para una columna vertical con β = 2α (`R1` F25, `X-D1 HOLMBERG
 * Fit`): PPV = K·[(q/R)·Δθ]^α, con Δθ = φ − atan(tan φ − L_c/R) y φ = atan((D − G)/R). R es la
 * distancia horizontal, D la profundidad del fondo de la carga y G la del geófono (0 en superficie).
 * PPV en las unidades de K. Válida en campo cercano (R ≲ 2–3·L_c, P-17).
 */
export function holmbergPerssonPpv(p: {
  linearCharge: number;
  chargeLength: number;
  chargeBottomDepth: number;
  distance: number;
  geophoneDepth?: number;
  k: number;
  alpha: number;
}): number {
  const phi = Math.atan((p.chargeBottomDepth - (p.geophoneDepth ?? 0)) / p.distance);
  const dTheta = phi - Math.atan(Math.tan(phi) - p.chargeLength / p.distance);
  return p.k * ((p.linearCharge / p.distance) * dTheta) ** p.alpha;
}

/** Bandas de daño por Holmberg–Persson en múltiplos de VPPc (`R3` F14, McKenzie; FC-33). */
export const DAMAGE_MULTIPLES = [0.25, 1, 4, 8] as const;

/**
 * VPPc de la roca (P-17): el dato del usuario (retroanálisis) o, si falta, RT·Vp/E (criterio de
 * Persson–Holmberg–Lee de daño incipiente). Sin datos no hay valor por defecto.
 */
export function criticalPpv(
  rock: Pick<RockMass, 'vppc' | 'tensileStrength' | 'vp' | 'youngModulus'> | undefined,
): { value: MetersPerSecond; computed: boolean } | null {
  if (!rock) return null;
  if (rock.vppc !== undefined && rock.vppc > 0) return { value: rock.vppc, computed: false };
  const { tensileStrength: rt, vp } = rock;
  if (rt && vp && rock.youngModulus > 0)
    return { value: (rt * vp) / rock.youngModulus, computed: true };
  return null;
}

export type EnergyMetric = 'nearFieldPpv' | 'chargeDensity';

export interface EnergyOptions {
  metric: EnergyMetric;
  /** Cota del plano horizontal evaluado [m]. */
  elevation: number;
  /** Tamaño de celda [m]; 0 = automático. */
  cellSize: number;
  /** Radio máximo de influencia de un taladro [m]; 0 = automático. */
  cutoff: number;
  nearField: NearFieldParams;
  /** σ del núcleo gaussiano para densidad de carga [m]. */
  sigma: number;
  /** Niveles de contorno (unidades SI de la métrica); vacío = automáticos. */
  levels: number[];
  /** Límite de celdas de la grilla. */
  maxCells: number;
  /**
   * Solo en la roca (A7b): sin valor en el aire, delante de la cara libre (con su ángulo y alto) o
   * sobre el terreno si hay topografía. La energía es del macizo, no del hueco frente al talud.
   */
  clipToRock: boolean;
  /**
   * Evaluar sobre el terreno (con topografía): cada celda a la cota del levantamiento en vez del
   * plano a `elevation` (que queda donde no hay terreno). Es la energía en la superficie del banco.
   */
  onTerrain?: boolean;
  /**
   * Plano arbitrario (subterráneo: plano del frente o del abanico) en vez del horizontal a
   * `elevation`. La grilla queda en coordenadas del plano (x = u, y = v); `elevation`,
   * `onTerrain` y `clipToRock` no se usan.
   */
  plane?: EnergyPlane;
}

/**
 * Plano de evaluación: P(a, b) = origin + a·u + b·v, con u y v ortonormales [m]. `bounds` fija la
 * ventana en coordenadas del plano; sin ella, la de las cargas que pasan a menos del radio de
 * influencia del plano.
 */
export interface EnergyPlane {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  bounds?: { minU: Meters; minV: Meters; maxU: Meters; maxV: Meters };
}

export const DEFAULT_ENERGY_OPTIONS: Omit<EnergyOptions, 'elevation'> = {
  metric: 'nearFieldPpv',
  cellSize: 0,
  cutoff: 0,
  nearField: DEFAULT_NEAR_FIELD,
  sigma: 2,
  levels: [],
  maxCells: 160_000,
  clipToRock: true,
};

export interface EnergyResult extends ScalarGrid {
  metric: EnergyMetric;
  elevation: number;
  /** Se evaluó sobre el terreno (cota por celda) y no en el plano a `elevation`. */
  onTerrain: boolean;
  /** Plano arbitrario evaluado (la grilla está en sus coordenadas u, v); sin él, horizontal. */
  plane?: EnergyPlane;
  min: number;
  max: number;
  contours: Contours;
  contourLevels: number[];
  /** Área [m²] con valor ≥ cada nivel de contorno (mismo orden). */
  areaAbove: number[];
  /** Raster RGBA 8 bits (turbo, escala log para PPV) listo para textura; alfa 0 = sin valor. */
  rgba: Uint8Array;
  /** Rango de la escala de color (unidades SI) y si es logarítmica. */
  colorMin: number;
  colorMax: number;
  colorLog: boolean;
  elapsedMs: number;
}

/** Punto de carga a lo largo del eje: s = distancia desde la boca [m], w = masa [kg]. */
interface ChargePoint {
  s: number;
  w: number;
}

const SEGMENT = 0.25; // discretización de la columna [m]

/**
 * `effective`: usa el diámetro efectivo del tramo (cartuchos desacoplados, subterráneo). El plano
 * horizontal (banco) lo ignora, como siempre lo hizo, para no cambiar sus resultados.
 */
function chargePoints(
  hole: Hole,
  lib: ReturnType<typeof indexLibrary>,
  effective = false,
): ChargePoint[] {
  const pts: ChargePoint[] = [];
  for (const { deck, top, bottom } of deckIntervals(hole)) {
    if (deck.kind !== 'explosive') continue;
    const product = lib.explosives.get(deck.explosiveId);
    if (!product) continue;
    const q = linearChargeDensity(
      product,
      hole.diameter,
      deck.densityOverride,
      effective ? deck.effectiveDiameter : undefined,
    );
    const t = Math.max(0, top);
    const len = bottom - t;
    if (len <= 0) continue;
    const n = Math.max(1, Math.ceil(len / SEGMENT));
    const dx = len / n;
    for (let k = 0; k < n; k++) pts.push({ s: t + (k + 0.5) * dx, w: q * dx });
  }
  return pts;
}

/**
 * Tabla de contribución de un taladro en coordenadas relativas a su eje: ρ = distancia al eje
 * (espaciado cuadrático, fino cerca del eje) y s = posición a lo largo del eje. Taladros con la
 * misma carga comparten la tabla, así el costo no crece con la cantidad de taladros.
 */
interface ProfileTable {
  rhoMin: number;
  rhoMax: number;
  nRho: number;
  sMin: number;
  sStep: number;
  nS: number;
  data: Float32Array; // data[is · nRho + ir]
}

const N_RHO = 72;
const S_STEP = 0.25;

/** Valor acumulado S de un taladro en (ρ², s); el mapa toma el máximo y PPV = K·S^α. */
type ProfileFn = (points: readonly ChargePoint[], rho2: number, s: number) => number;

/** Suma de los elementos de carga con un núcleo de la distancia (H-P o densidad). */
function kernelSum(kernel: (d2: number) => number): ProfileFn {
  return (points, rho2, s) => {
    let sum = 0;
    for (const p of points) {
      const ds = s - p.s;
      sum += p.w * kernel(rho2 + ds * ds);
    }
    return sum;
  };
}

/** NIOSH modificado: S = W / R̄^(β/α), con R̄ la distancia media ponderada por la carga. */
function nioshProfile(nf: NearFieldParams): ProfileFn {
  const e = nf.beta / nf.alpha;
  return (points, rho2, s) => {
    let w = 0;
    let wd = 0;
    for (const p of points) {
      const ds = s - p.s;
      w += p.w;
      wd += p.w * Math.sqrt(rho2 + ds * ds);
    }
    return w > 0 && wd > 0 ? w / Math.pow(wd / w, e) : 0;
  };
}

function buildProfile(
  points: readonly ChargePoint[],
  value: ProfileFn,
  rhoMin: number,
  rhoMax: number,
  sMin: number,
  sMax: number,
): ProfileTable {
  const nS = Math.max(2, Math.ceil((sMax - sMin) / S_STEP) + 1);
  const data = new Float32Array(nS * N_RHO);
  for (let is = 0; is < nS; is++) {
    const s = sMin + is * S_STEP;
    for (let ir = 0; ir < N_RHO; ir++) {
      const f = ir / (N_RHO - 1);
      const rho = rhoMin + (rhoMax - rhoMin) * f * f;
      data[is * N_RHO + ir] = value(points, rho * rho, s);
    }
  }
  return { rhoMin, rhoMax, nRho: N_RHO, sMin, sStep: S_STEP, nS, data };
}

function sampleProfile(t: ProfileTable, rho: number, s: number): number {
  if (rho >= t.rhoMax) return 0;
  const r = Math.max(rho, t.rhoMin);
  const fr = Math.sqrt((r - t.rhoMin) / (t.rhoMax - t.rhoMin)) * (t.nRho - 1);
  const fs = (s - t.sMin) / t.sStep;
  if (fs < 0 || fs > t.nS - 1) return 0;
  const ir = Math.min(t.nRho - 2, Math.floor(fr));
  const is = Math.min(t.nS - 2, Math.floor(fs));
  const ar = fr - ir;
  const as = fs - is;
  const d = t.data;
  const a = d[is * t.nRho + ir] ?? 0;
  const b = d[is * t.nRho + ir + 1] ?? 0;
  const c = d[(is + 1) * t.nRho + ir] ?? 0;
  const e = d[(is + 1) * t.nRho + ir + 1] ?? 0;
  return (a * (1 - ar) + b * ar) * (1 - as) + (c * (1 - ar) + e * ar) * as;
}

/** Distribución de energía (PPV de campo cercano o densidad de carga) en un plano horizontal. */
export function computeEnergyGrid(
  blast: Blast,
  library: ProductLibrary,
  options: EnergyOptions,
  /** Terreno (topografía del banco): arriba de él es aire. */
  surface?: { elevationAt(x: number, y: number): number | null } | null,
): EnergyResult {
  const t0 = performance.now();
  if (options.plane) return computePlaneEnergyGrid(blast, library, options, options.plane, t0);
  const lib = indexLibrary(library);
  const isPpv = options.metric === 'nearFieldPpv';
  const sigma = Math.max(0.1, options.sigma);
  const profile = profileOf(options);

  // Espaciamiento típico para valores automáticos.
  let spacing = Infinity;
  for (const p of blast.patterns) spacing = Math.min(spacing, p.burden, p.spacing);
  if (!Number.isFinite(spacing)) spacing = 5;
  // Densidad: 4σ deja fuera 0.03 % de la masa (e^(−8) en el plano).
  const cutoff = options.cutoff > 0 ? options.cutoff : isPpv ? 4 * spacing : 4 * sigma;

  // Taladros con carga y sus tablas (cacheadas por firma de carga).
  const profiles = new Map<string, ProfileTable>();
  interface Item {
    hole: Hole;
    table: ProfileTable;
    key: string;
    ux: number;
    uy: number;
    uz: number;
  }
  const items: Item[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const noCharge = new Set<string>();
  for (const hole of blast.holes) {
    // Firma de carga: diámetro + decks (tipo, producto, largo, densidad). Taladros con la misma
    // firma comparten tabla; los puntos de carga solo se generan para firmas nuevas.
    let key = `${hole.diameter}|${hole.length}`;
    for (const d of hole.decks)
      key += `|${d.kind}:${d.kind === 'explosive' ? `${d.explosiveId}:${d.densityOverride ?? ''}` : ''}:${d.length}`;
    if (noCharge.has(key)) continue;
    const rhoMin = Math.max(hole.diameter / 2, 0.05);
    let table = profiles.get(key);
    if (!table) {
      const pts = chargePoints(hole, lib);
      if (pts.length === 0) {
        noCharge.add(key);
        continue;
      }
      const sMin = (pts[0]?.s ?? 0) - cutoff;
      const sMax = (pts.at(-1)?.s ?? 0) + cutoff;
      table = buildProfile(pts, profile, rhoMin, cutoff, sMin, sMax);
      profiles.set(key, table);
    }
    const h = azimuthToUnit(hole.azimuth);
    const si = Math.sin(hole.inclination);
    items.push({ hole, table, key, ux: h.x * si, uy: h.y * si, uz: -Math.cos(hole.inclination) });
    // Donde el eje corta el plano (o la boca) ± radio de influencia.
    const sPlane = (hole.collar.z - options.elevation) / Math.cos(hole.inclination);
    const cx = hole.collar.x + h.x * si * sPlane;
    const cy = hole.collar.y + h.y * si * sPlane;
    for (const [x, y] of [
      [hole.collar.x, hole.collar.y],
      [cx, cy],
    ] as const) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const empty = (): EnergyResult => ({
    originX: 0,
    originY: 0,
    cellSize: 1,
    nx: 0,
    ny: 0,
    values: new Float32Array(0),
    metric: options.metric,
    elevation: options.elevation,
    onTerrain: false,
    min: 0,
    max: 0,
    contours: { segments: new Float64Array(0), levels: new Float32Array(0) },
    contourLevels: [],
    areaAbove: [],
    rgba: new Uint8Array(0),
    colorMin: 0,
    colorMax: 1,
    colorLog: false,
    elapsedMs: performance.now() - t0,
  });
  if (items.length === 0) return empty();

  const margin = Math.min(cutoff, 1.5 * spacing);
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;
  const area = (maxX - minX) * (maxY - minY);
  const cell =
    options.cellSize > 0
      ? Math.max(options.cellSize, Math.sqrt(area / options.maxCells))
      : Math.max(0.25, Math.sqrt(area / options.maxCells), spacing / 8);
  const nx = Math.max(2, Math.ceil((maxX - minX) / cell));
  const ny = Math.max(2, Math.ceil((maxY - minY) / cell));
  const sum = new Float64Array(nx * ny);
  // Sobre el terreno: cota de cada celda (la del plano donde el levantamiento no llega).
  const onTerrain = options.onTerrain === true && !!surface;
  const zAt = new Float64Array(onTerrain ? nx * ny : 0);
  if (onTerrain)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        zAt[j * nx + i] =
          surface.elevationAt(minX + (i + 0.5) * cell, minY + (j + 0.5) * cell) ??
          options.elevation;
  // Taladros verticales: s es constante en el plano → perfil radial 1D indexado por ρ²
  // (sin raíces por celda), compartido por los taladros con igual carga y cota de boca.
  const RADIAL_N = 4096;
  const radialCache = new Map<string, Float32Array>();
  const radialFor = (table: ProfileTable, s: number, key: string): Float32Array => {
    const k = `${key}|${s.toFixed(4)}`;
    let r = radialCache.get(k);
    if (!r) {
      r = new Float32Array(RADIAL_N + 1);
      const du = (cutoff * cutoff) / RADIAL_N;
      for (let n = 0; n <= RADIAL_N; n++) r[n] = sampleProfile(table, Math.sqrt(n * du), s);
      radialCache.set(k, r);
    }
    return r;
  };

  for (const it of items) {
    const { hole, table, key, ux, uy, uz } = it;
    // Rango de celdas: proyección del tramo de eje relevante ± radio.
    const sPlane = (hole.collar.z - options.elevation) / -uz;
    const cx = hole.collar.x + ux * sPlane;
    const cy = hole.collar.y + uy * sPlane;
    const x0 = Math.min(hole.collar.x, cx) - cutoff;
    const x1 = Math.max(hole.collar.x, cx) + cutoff;
    const y0 = Math.min(hole.collar.y, cy) - cutoff;
    const y1 = Math.max(hole.collar.y, cy) + cutoff;
    const i0 = Math.max(0, Math.floor((x0 - minX) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((x1 - minX) / cell));
    const j0 = Math.max(0, Math.floor((y0 - minY) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((y1 - minY) / cell));
    const dz = options.elevation - hole.collar.z;
    // Taladro vertical: la zona de influencia es un disco; se recorre solo su ancho en cada fila.
    // Sobre el terreno la cota cambia por celda: va por el recorrido general.
    const vertical = ux === 0 && uy === 0 && !onTerrain;
    const r2 = cutoff * cutoff;
    if (vertical) {
      const radial = radialFor(table, dz * uz, key);
      const invDu = RADIAL_N / r2;
      for (let j = j0; j <= j1; j++) {
        const py = minY + (j + 0.5) * cell - hole.collar.y;
        const rem = r2 - py * py;
        if (rem <= 0) continue;
        const half = Math.sqrt(rem);
        const ia = Math.max(i0, Math.floor((hole.collar.x - half - minX) / cell));
        const ib = Math.min(i1, Math.ceil((hole.collar.x + half - minX) / cell));
        const py2 = py * py;
        const row = j * nx;
        for (let i = ia; i <= ib; i++) {
          const px = minX + (i + 0.5) * cell - hole.collar.x;
          const f = (px * px + py2) * invDu;
          if (f >= RADIAL_N) continue;
          const n = f | 0;
          const a = radial[n] ?? 0;
          const v = a + ((radial[n + 1] ?? 0) - a) * (f - n);
          if (v <= 0) continue;
          const k = row + i;
          sum[k] = isPpv ? Math.max(sum[k] ?? 0, v) : (sum[k] ?? 0) + v;
        }
      }
      continue;
    }
    // Taladro inclinado: recorrido general en coordenadas del eje (ρ, s).
    for (let j = j0; j <= j1; j++) {
      const py = minY + (j + 0.5) * cell - hole.collar.y;
      for (let i = i0; i <= i1; i++) {
        const px = minX + (i + 0.5) * cell - hole.collar.x;
        const dzc = onTerrain ? (zAt[j * nx + i] ?? options.elevation) - hole.collar.z : dz;
        // s = proyección sobre el eje; ρ = distancia al eje.
        const s = px * ux + py * uy + dzc * uz;
        const rx = px - ux * s;
        const ry = py - uy * s;
        const rz = dzc - uz * s;
        const rho = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const v = sampleProfile(table, rho, s);
        if (v <= 0) continue;
        const k = j * nx + i;
        // PPV: máximo entre taladros (v es monótono en S); densidad: suma de masas.
        sum[k] = isPpv ? Math.max(sum[k] ?? 0, v) : (sum[k] ?? 0) + v;
      }
    }
  }

  if (options.clipToRock) {
    const inAir = inFrontOfFace(blast);
    for (let j = 0; j < ny; j++) {
      const y = minY + (j + 0.5) * cell;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!(sum[k] ?? 0)) continue;
        const z = onTerrain ? (zAt[k] ?? options.elevation) : options.elevation;
        const x = minX + (i + 0.5) * cell;
        const ground = surface?.elevationAt(x, y) ?? null;
        if (ground !== null ? z > ground + 0.05 : inAir(x, y, z)) sum[k] = 0;
      }
    }
  }

  return finishGrid(sum, { minX, minY, cell, nx, ny }, options, {
    elevation: options.elevation,
    onTerrain,
    t0,
  });
}

/**
 * Valores finales (PPV = K·S^α), contornos, áreas y raster de color de una grilla acumulada `sum`.
 * Común al plano horizontal y a los planos arbitrarios (subterráneo).
 */
function finishGrid(
  sum: Float64Array,
  box: { minX: number; minY: number; cell: number; nx: number; ny: number },
  options: EnergyOptions,
  extra: { elevation: number; onTerrain: boolean; plane?: EnergyPlane; t0: number },
): EnergyResult {
  const { minX, minY, cell, nx, ny } = box;
  const nf = options.nearField;
  const isPpv = options.metric === 'nearFieldPpv';
  const values = new Float32Array(nx * ny);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < values.length; k++) {
    const s = sum[k] ?? 0;
    const v = isPpv ? (s > 0 ? nf.k * Math.pow(s, nf.alpha) : 0) : s;
    values[k] = v;
    if (v > 0) min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (!Number.isFinite(min)) min = 0;

  const contourLevels =
    options.levels.length > 0
      ? [...options.levels].sort((a, b) => a - b)
      : isPpv
        ? [0.25, 0.5, 0.7, 1, 2, 5, 10].filter((l) => l < max)
        : niceLevels(max);
  const grid: ScalarGrid = { originX: minX, originY: minY, cellSize: cell, nx, ny, values };
  const contours = marchingSquares(grid, contourLevels);
  const areaAbove = contourLevels.map((l) => {
    let c = 0;
    for (const v of values) if (v >= l) c++;
    return c * cell * cell;
  });

  // Escala de color: PPV logarítmica desde el primer nivel; densidad lineal. El tope es el
  // percentil 99 para que los picos junto al eje de cada taladro no aplasten la escala.
  const colorLog = isPpv;
  const sorted = values.slice().sort(); // orden numérico nativo de Float32Array
  let firstPositive = 0;
  while (firstPositive < sorted.length && (sorted[firstPositive] ?? 0) <= 0) firstPositive++;
  const p99 = sorted[firstPositive + Math.floor((sorted.length - firstPositive) * 0.99)] ?? max;
  const colorMin = isPpv ? Math.min(contourLevels[0] ?? p99 / 20, p99 / 2) : 0;
  const colorMax = p99;
  const rgba = new Uint8Array(nx * ny * 4);
  const lo = colorLog ? Math.log(Math.max(colorMin, 1e-9)) : colorMin;
  const hi = colorLog ? Math.log(Math.max(colorMax, 1e-9)) : colorMax;
  for (let k = 0; k < values.length; k++) {
    const v = values[k] ?? 0;
    if (v <= 0 || v < colorMin || (!isPpv && v < max * 0.02)) continue;
    const t = hi > lo ? ((colorLog ? Math.log(v) : v) - lo) / (hi - lo) : 1;
    const [r, g, b] = turboRgb(t);
    rgba[k * 4] = r;
    rgba[k * 4 + 1] = g;
    rgba[k * 4 + 2] = b;
    rgba[k * 4 + 3] = 255;
  }

  return {
    ...grid,
    metric: options.metric,
    elevation: extra.elevation,
    onTerrain: extra.onTerrain,
    ...(extra.plane ? { plane: extra.plane } : {}),
    min,
    max,
    contours,
    contourLevels,
    areaAbove,
    rgba,
    colorMin,
    colorMax,
    colorLog,
    elapsedMs: performance.now() - extra.t0,
  };
}

/**
 * Valor por taladro de la métrica: Holmberg–Persson Σ q·dx/d^(β/α), NIOSH modificado W/R̄^(β/α)
 * o gaussiana 3D normalizada (densidad).
 */
function profileOf(options: EnergyOptions): ProfileFn {
  const nf = options.nearField;
  if (options.metric === 'nearFieldPpv') {
    if (nf.model === 'nioshModified') return nioshProfile(nf);
    const n = nf.beta / (2 * nf.alpha);
    return kernelSum((d2: number) => Math.pow(d2, -n));
  }
  const sigma = Math.max(0.1, options.sigma);
  const gaussNorm = 1 / (Math.pow(2 * Math.PI, 1.5) * sigma * sigma * sigma);
  return kernelSum((d2: number) => gaussNorm * Math.exp(-d2 / (2 * sigma * sigma)));
}

/** Mediana de la distancia 3D de cada boca a la más cercana (espaciamiento típico sin malla). */
function typicalSpacing(holes: readonly Hole[]): number {
  if (holes.length < 2) return 5;
  const d: number[] = [];
  for (const a of holes) {
    let best = Infinity;
    for (const b of holes) {
      if (a === b) continue;
      const r = Math.hypot(
        a.collar.x - b.collar.x,
        a.collar.y - b.collar.y,
        a.collar.z - b.collar.z,
      );
      if (r > 1e-6) best = Math.min(best, r);
    }
    if (Number.isFinite(best)) d.push(best);
  }
  d.sort((x, y) => x - y);
  return d[Math.floor(d.length / 2)] ?? 5;
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Energía en un plano arbitrario (frente de un túnel, plano de un abanico): la misma integral por
 * taladro de `computeEnergyGrid` (tabla ρ–s de cada firma de carga) evaluada en los puntos
 * P = origin + a·u + b·v. PPV: máximo entre taladros; densidad: suma.
 */
function computePlaneEnergyGrid(
  blast: Blast,
  library: ProductLibrary,
  options: EnergyOptions,
  plane: EnergyPlane,
  t0: number,
): EnergyResult {
  const lib = indexLibrary(library);
  const isPpv = options.metric === 'nearFieldPpv';
  const profile = profileOf(options);
  const loaded = blast.holes.filter((h) => h.decks.some((d) => d.kind === 'explosive'));
  const spacing = typicalSpacing(loaded);
  const sigma = Math.max(0.1, options.sigma);
  const cutoff = options.cutoff > 0 ? options.cutoff : isPpv ? 4 * spacing : 4 * sigma;
  const n = {
    x: plane.u.y * plane.v.z - plane.u.z * plane.v.y,
    y: plane.u.z * plane.v.x - plane.u.x * plane.v.z,
    z: plane.u.x * plane.v.y - plane.u.y * plane.v.x,
  };
  const o = plane.origin;
  const toPlane = (p: Vec3) => {
    const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
    return { a: dot(d, plane.u), b: dot(d, plane.v), w: dot(d, n) };
  };

  interface Item {
    hole: Hole;
    table: ProfileTable;
    axis: Vec3;
    /** Tramo de carga recortado a |w| ≤ cutoff, en coordenadas del plano. */
    a0: number;
    b0: number;
    a1: number;
    b1: number;
  }
  const profiles = new Map<string, ProfileTable | null>();
  const items: Item[] = [];
  let minA = Infinity,
    minB = Infinity,
    maxA = -Infinity,
    maxB = -Infinity;
  for (const hole of loaded) {
    let key = `${hole.diameter}|${hole.length}`;
    for (const d of hole.decks)
      key += `|${d.kind}:${d.kind === 'explosive' ? `${d.explosiveId}:${d.densityOverride ?? ''}:${d.effectiveDiameter ?? ''}` : ''}:${d.length}`;
    let table = profiles.get(key);
    if (table === undefined) {
      const pts = chargePoints(hole, lib, true);
      table =
        pts.length === 0
          ? null
          : buildProfile(
              pts,
              profile,
              Math.max(hole.diameter / 2, 0.01),
              cutoff,
              (pts[0]?.s ?? 0) - cutoff,
              (pts.at(-1)?.s ?? 0) + cutoff,
            );
      profiles.set(key, table);
    }
    if (!table) continue;
    const h = azimuthToUnit(hole.azimuth);
    const si = Math.sin(hole.inclination);
    const axis = { x: h.x * si, y: h.y * si, z: -Math.cos(hole.inclination) };
    // Tramo de carga: del primer al último punto de carga de la tabla (sMin + cutoff … sMax − cutoff).
    const sTop = table.sMin + cutoff;
    const sBot = table.sMin + (table.nS - 1) * table.sStep - cutoff;
    const at = (s: number) =>
      toPlane({
        x: hole.collar.x + axis.x * s,
        y: hole.collar.y + axis.y * s,
        z: hole.collar.z + axis.z * s,
      });
    let p = at(sTop);
    let q = at(Math.max(sTop, sBot));
    // Recorte a la losa |w| ≤ cutoff.
    const clip = (lim: number): boolean => {
      const fp = p.w - lim;
      const fq = q.w - lim;
      const sign = lim > 0 ? 1 : -1;
      if (sign * fp > 0 && sign * fq > 0) return false;
      if (sign * fp > 0 || sign * fq > 0) {
        const t = fp / (fp - fq);
        const m = { a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t, w: lim };
        if (sign * fp > 0) p = m;
        else q = m;
      }
      return true;
    };
    if (!clip(cutoff) || !clip(-cutoff)) continue;
    items.push({ hole, table, axis, a0: p.a, b0: p.b, a1: q.a, b1: q.b });
    minA = Math.min(minA, p.a, q.a);
    maxA = Math.max(maxA, p.a, q.a);
    minB = Math.min(minB, p.b, q.b);
    maxB = Math.max(maxB, p.b, q.b);
  }
  const margin = Math.min(cutoff, 1.5 * spacing);
  const bounds = plane.bounds ?? {
    minU: minA - margin,
    minV: minB - margin,
    maxU: maxA + margin,
    maxV: maxB + margin,
  };
  const { minU, minV } = bounds;
  const area = (bounds.maxU - minU) * (bounds.maxV - minV);
  const extra = { elevation: o.z, onTerrain: false, plane, t0 };
  if (items.length === 0 || !(area > 0)) {
    const r = finishGrid(
      new Float64Array(4),
      { minX: minU || 0, minY: minV || 0, cell: 1, nx: 2, ny: 2 },
      options,
      extra,
    );
    return { ...r, nx: 0, ny: 0, values: new Float32Array(0), rgba: new Uint8Array(0) };
  }
  const cell =
    options.cellSize > 0
      ? Math.max(options.cellSize, Math.sqrt(area / options.maxCells))
      : Math.max(0.02, Math.sqrt(area / options.maxCells), spacing / 8);
  const nx = Math.max(2, Math.ceil((bounds.maxU - minU) / cell));
  const ny = Math.max(2, Math.ceil((bounds.maxV - minV) / cell));
  const sum = new Float64Array(nx * ny);
  const { u, v } = plane;
  for (const it of items) {
    const { hole, table, axis } = it;
    const i0 = Math.max(0, Math.floor((Math.min(it.a0, it.a1) - cutoff - minU) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(it.a0, it.a1) + cutoff - minU) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(it.b0, it.b1) - cutoff - minV) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(it.b0, it.b1) + cutoff - minV) / cell));
    // Punto de la celda relativo a la boca: c + a·u + b·v, con c = origin − boca.
    const cx = o.x - hole.collar.x;
    const cy = o.y - hole.collar.y;
    const cz = o.z - hole.collar.z;
    for (let j = j0; j <= j1; j++) {
      const b = minV + (j + 0.5) * cell;
      const bx = cx + b * v.x;
      const by = cy + b * v.y;
      const bz = cz + b * v.z;
      for (let i = i0; i <= i1; i++) {
        const a = minU + (i + 0.5) * cell;
        const px = bx + a * u.x;
        const py = by + a * u.y;
        const pz = bz + a * u.z;
        const s = px * axis.x + py * axis.y + pz * axis.z;
        const rx = px - axis.x * s;
        const ry = py - axis.y * s;
        const rz = pz - axis.z * s;
        const val = sampleProfile(table, Math.sqrt(rx * rx + ry * ry + rz * rz), s);
        if (val <= 0) continue;
        const k = j * nx + i;
        sum[k] = isPpv ? Math.max(sum[k] ?? 0, val) : (sum[k] ?? 0) + val;
      }
    }
  }
  return finishGrid(sum, { minX: minU, minY: minV, cell, nx, ny }, options, extra);
}

/** ~5 niveles redondos entre 0 y max. */
function niceLevels(max: number): number[] {
  if (!(max > 0)) return [];
  const raw = max / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let v = step; v < max; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}
