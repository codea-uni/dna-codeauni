import {
  turboRgb,
  type BlastDomain,
  type MuckpileResult,
  type SurfaceComparison,
} from '@cronos/core';
import type { EnergyData } from '@cronos/engine';
import type { MuckpileColorBy } from '../stores/analysisStore';

/**
 * Colores de la pila (A7, presentación): por bloque y por celda, según el modo. Las clases de
 * tamaño usan una escala propia de azul (fino) a rojo (grueso), una por clase de `sizeClasses`.
 */
export const FRAGMENT_CLASS_COLORS = [
  '#1d3fb8',
  '#2f78e0',
  '#27a8a0',
  '#3fb84f',
  '#a6d62f',
  '#f2cf1b',
  '#f2891b',
  '#d7263d',
] as const;

const NEUTRAL: [number, number, number] = [150, 132, 108];

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return NEUTRAL;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const FRAGMENT_RGB = FRAGMENT_CLASS_COLORS.map(hexRgb);

/** Índice de clase de un tamaño [m] con los cortes ascendentes (el último es «mayor que»). */
export function sizeClassIndex(size: number, cuts: readonly number[]): number {
  const i = cuts.findIndex((c) => size <= c);
  return i < 0 ? cuts.length : i;
}

/** Error de la comparación [m] que satura la escala divergente (± este valor). */
export function errorScale(c: SurfaceComparison): number {
  return Math.max(0.5, Math.min(5, 2 * (Number.isFinite(c.rmse) ? c.rmse : 1)));
}

/** Escala divergente azul (simulación baja) – blanco – rojo (simulación alta). */
function divergingRgb(e: number, scale: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, e / scale));
  const lerp = (a: number, b: number, w: number) => Math.round(a + (b - a) * w);
  return t < 0
    ? [lerp(240, 33, -t), lerp(240, 102, -t), lerp(240, 172, -t)]
    : [lerp(240, 178, t), lerp(240, 24, t), lerp(240, 43, t)];
}

/** Rango del valor continuo del modo (para la leyenda y el mapa turbo). */
export function muckpileRange(r: MuckpileResult, mode: MuckpileColorBy): [number, number] {
  if (mode === 'launch') {
    const a = r.stats.firstLaunch;
    const b = r.stats.lastLaunch;
    return Number.isFinite(a) && Number.isFinite(b) ? [a, Math.max(b, a + 1e-3)] : [0, 1];
  }
  return [0, Math.max(r.stats.maxDisplacement, 1e-3)];
}

function colorOf(
  mode: MuckpileColorBy,
  value: number,
  range: [number, number],
  cuts: readonly number[],
  domains: readonly BlastDomain[],
): [number, number, number] {
  if (!Number.isFinite(value)) return NEUTRAL;
  if (mode === 'fragment')
    return FRAGMENT_RGB[Math.min(FRAGMENT_RGB.length - 1, sizeClassIndex(value, cuts))] ?? NEUTRAL;
  if (mode === 'domain') {
    const d = domains[value];
    return d ? hexRgb(d.color) : NEUTRAL;
  }
  const t = (value - range[0]) / (range[1] - range[0]);
  return turboRgb(Math.min(1, Math.max(0, t)));
}

/** Color sRGB por bloque [r, g, b, …]. */
export function blockColors(
  r: MuckpileResult,
  colorBy: MuckpileColorBy,
  domains: readonly BlastDomain[],
): Uint8Array {
  const b = r.blocks;
  const out = new Uint8Array(3 * b.count);
  // El error es de la superficie: los bloques siguen coloreados por tamaño.
  const mode = colorBy === 'error' ? 'fragment' : colorBy;
  const range = muckpileRange(r, mode);
  const cuts = r.sizeClasses.slice(0, -1).map((c) => c.upper);
  for (let k = 0; k < b.count; k++) {
    let v: number;
    if (mode === 'fragment') v = b.fragmentSize[k] ?? NaN;
    else if (mode === 'domain') v = (b.domain[k] ?? -1) >= 0 ? (b.domain[k] ?? -1) : NaN;
    else if (mode === 'launch') v = b.launchTime[k] ?? NaN;
    else
      v = Math.hypot(
        (b.destination[3 * k] ?? 0) - (b.origin[3 * k] ?? 0),
        (b.destination[3 * k + 1] ?? 0) - (b.origin[3 * k + 1] ?? 0),
      );
    out.set(colorOf(mode, v, range, cuts, domains), 3 * k);
  }
  return out;
}

/** Color sRGB por celda de la pila [r, g, b, …] (la columna de bloques que termina en ella). */
export function cellColors(
  r: MuckpileResult,
  mode: MuckpileColorBy,
  domains: readonly BlastDomain[],
  comparison: SurfaceComparison | null = null,
): Uint8Array {
  const g = r.grids;
  const n = g.after.nx * g.after.ny;
  const out = new Uint8Array(3 * n);
  if (mode === 'error') {
    const scale = comparison ? errorScale(comparison) : 1;
    for (let k = 0; k < n; k++) {
      const e = comparison?.error.values[k] ?? NaN;
      out.set(Number.isFinite(e) ? divergingRgb(e, scale) : NEUTRAL, 3 * k);
    }
    return out;
  }
  const range = mode === 'launch' ? muckpileRange(r, 'displacement') : muckpileRange(r, mode);
  const cuts = r.sizeClasses.slice(0, -1).map((c) => c.upper);
  // Por celda no hay tiempo de salida: el modo «salida» usa el desplazamiento.
  const cellMode: MuckpileColorBy = mode === 'launch' ? 'displacement' : mode;
  for (let k = 0; k < n; k++) {
    const v =
      cellMode === 'fragment'
        ? (g.fragmentSize[k] ?? NaN)
        : cellMode === 'domain'
          ? (g.domain[k] ?? -1) >= 0
            ? (g.domain[k] ?? -1)
            : NaN
          : (g.displacement[k] ?? NaN);
    out.set(colorOf(cellMode, v, range, cuts, domains), 3 * k);
  }
  return out;
}

/** Raster para la planta: el color de cada celda donde hay pila (≥ 5 cm). */
export function planRaster(r: MuckpileResult, colors: Uint8Array): EnergyData {
  const { after, base } = r.grids;
  const n = after.nx * after.ny;
  const rgba = new Uint8Array(4 * n);
  for (let k = 0; k < n; k++) {
    const loose = (after.values[k] ?? 0) - (base.values[k] ?? 0);
    rgba[4 * k] = colors[3 * k] ?? 0;
    rgba[4 * k + 1] = colors[3 * k + 1] ?? 0;
    rgba[4 * k + 2] = colors[3 * k + 2] ?? 0;
    rgba[4 * k + 3] = loose >= 0.05 ? 255 : 0;
  }
  return {
    originX: after.originX,
    originY: after.originY,
    cellSize: after.cellSize,
    nx: after.nx,
    ny: after.ny,
    rgba,
    contours: { segments: new Float64Array(0), levels: new Float32Array(0) },
    colorMin: 0,
    colorMax: 1,
    colorLog: false,
  };
}
