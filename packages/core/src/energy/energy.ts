import { deckIntervals, indexLibrary, linearChargeDensity } from '../charging/charge';
import { azimuthToUnit } from '../geometry/vec';
import type { Blast, Hole, ProductLibrary } from '../model/types';
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
}

export const DEFAULT_NEAR_FIELD: NearFieldParams = { k: 0.7, alpha: 0.7, beta: 1.5 };

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
}

export const DEFAULT_ENERGY_OPTIONS: Omit<EnergyOptions, 'elevation'> = {
  metric: 'nearFieldPpv',
  cellSize: 0,
  cutoff: 0,
  nearField: DEFAULT_NEAR_FIELD,
  sigma: 2,
  levels: [],
  maxCells: 160_000,
};

export interface EnergyResult extends ScalarGrid {
  metric: EnergyMetric;
  elevation: number;
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

function chargePoints(hole: Hole, lib: ReturnType<typeof indexLibrary>): ChargePoint[] {
  const pts: ChargePoint[] = [];
  for (const { deck, top, bottom } of deckIntervals(hole)) {
    if (deck.kind !== 'explosive') continue;
    const product = lib.explosives.get(deck.explosiveId);
    if (!product) continue;
    const q = linearChargeDensity(product, hole.diameter, deck.densityOverride);
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

function buildProfile(
  points: readonly ChargePoint[],
  kernel: (d2: number) => number,
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
      let sum = 0;
      for (const p of points) {
        const ds = s - p.s;
        sum += p.w * kernel(rho * rho + ds * ds);
      }
      data[is * N_RHO + ir] = sum;
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
): EnergyResult {
  const t0 = performance.now();
  const lib = indexLibrary(library);
  const nf = options.nearField;
  const isPpv = options.metric === 'nearFieldPpv';
  const n = nf.beta / (2 * nf.alpha);
  const sigma = Math.max(0.1, options.sigma);
  const gaussNorm = 1 / (Math.pow(2 * Math.PI, 1.5) * sigma * sigma * sigma);
  const kernel = isPpv
    ? (d2: number) => Math.pow(d2, -n)
    : (d2: number) => gaussNorm * Math.exp(-d2 / (2 * sigma * sigma));

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
      table = buildProfile(pts, kernel, rhoMin, cutoff, sMin, sMax);
      profiles.set(key, table);
    }
    const h = azimuthToUnit(hole.azimuth);
    const si = Math.sin(hole.inclination);
    items.push({ hole, table, ux: h.x * si, uy: h.y * si, uz: -Math.cos(hole.inclination) });
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

  for (const it of items) {
    const { hole, table, ux, uy, uz } = it;
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
    const vertical = ux === 0 && uy === 0;
    const r2 = cutoff * cutoff;
    for (let j = j0; j <= j1; j++) {
      const py = minY + (j + 0.5) * cell - hole.collar.y;
      let ia = i0;
      let ib = i1;
      if (vertical) {
        const rem = r2 - py * py;
        if (rem <= 0) continue;
        const half = Math.sqrt(rem);
        ia = Math.max(i0, Math.floor((hole.collar.x - half - minX) / cell));
        ib = Math.min(i1, Math.ceil((hole.collar.x + half - minX) / cell));
      }
      for (let i = ia; i <= ib; i++) {
        const px = minX + (i + 0.5) * cell - hole.collar.x;
        // s = proyección sobre el eje; ρ = distancia al eje.
        const s = px * ux + py * uy + dz * uz;
        const rx = px - ux * s;
        const ry = py - uy * s;
        const rz = dz - uz * s;
        const rho = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const v = sampleProfile(table, rho, s);
        if (v <= 0) continue;
        const k = j * nx + i;
        // PPV: máximo entre taladros (v es monótono en S); densidad: suma de masas.
        sum[k] = isPpv ? Math.max(sum[k] ?? 0, v) : (sum[k] ?? 0) + v;
      }
    }
  }

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
    elevation: options.elevation,
    min,
    max,
    contours,
    contourLevels,
    areaAbove,
    rgba,
    colorMin,
    colorMax,
    colorLog,
    elapsedMs: performance.now() - t0,
  };
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
