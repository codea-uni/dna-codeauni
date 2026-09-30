import type { Bounds3 } from '../model/types';
import { LINE_ROLES, type LineSetData, type TinData } from './asset';
import type { TopoData, TopoLine, TopoWarning } from './data';
import { decimateGrid, type DecimateOptions } from './decimate';
import { applyLocalGrid, reprojectXyz, type LocalGridTransform } from './reproject';
import { boundsOf, type SurveyParts } from './survey';
import { buildTin, type TinOptions } from './tin';
import { checkTopography, swapXY, type TopoCheckContext } from './validate';

/** Une el contenido de varios archivos de un mismo levantamiento (p. ej. curvas + puntos). */
export function mergeTopo(list: readonly TopoData[]): TopoData {
  const out: TopoData = { points: [], lines: [], warnings: [] };
  const vertices: number[] = [];
  const triangles: number[] = [];
  for (const d of list) {
    for (const p of d.points) out.points.push(p);
    out.lines.push(...d.lines);
    out.warnings.push(...d.warnings);
    if (d.epsg !== undefined) out.epsg ??= d.epsg;
    if (d.faces) {
      const base = vertices.length / 3;
      for (const v of d.faces.vertices) vertices.push(v);
      for (const t of d.faces.triangles) triangles.push(t + base);
    }
  }
  if (triangles.length > 0)
    out.faces = { vertices: Float64Array.from(vertices), triangles: Uint32Array.from(triangles) };
  return out;
}

export interface AssembleOptions {
  /** Intercambiar Norte y Este (trampa de `03 §5`), antes de reproyectar. */
  swapNE?: boolean;
  /** Grilla local de mina: se aplica antes de reproyectar y deja las coordenadas en `fromEpsg`. */
  localGrid?: LocalGridTransform;
  /** Reproyección: EPSG del archivo y del destino. */
  fromEpsg?: number;
  toEpsg?: number;
  tin?: TinOptions;
  /** Reducir los puntos sueltos (nubes densas) antes de triangular. */
  decimate?: DecimateOptions;
  /** EPSG y zona de trabajo del proyecto, para avisar si no coinciden o el archivo cae lejos. */
  projectEpsg?: number;
  projectBounds?: Bounds3;
}

export interface AssembleResult {
  parts: SurveyParts;
  bounds: Bounds3;
  warnings: TopoWarning[];
  stats: {
    points: number;
    triangles: number;
    lines: number;
    duplicates: number;
    skippedConstraints: number;
    droppedTriangles: number;
  };
}

/** Roles cuyas líneas se imponen como aristas del TIN al triangular. */
const CONSTRAINT_ROLES = new Set(['contour', 'crest', 'toe', 'breakline']);

function transform(xyz: Float64Array | number[], o: AssembleOptions): void {
  if (o.swapNE) swapXY(xyz);
  if (o.localGrid) applyLocalGrid(xyz, o.localGrid);
  if (o.fromEpsg !== undefined && o.toEpsg !== undefined) reprojectXyz(xyz, o.fromEpsg, o.toEpsg);
}

/**
 * Del contenido leído a las partes del levantamiento: transforma coordenadas, arma el TIN (el del
 * archivo o uno nuevo desde los puntos y los vértices de las líneas, con las líneas como aristas
 * obligadas) y empaqueta las líneas. O(n log n): corre en el worker. `data` se modifica.
 */
export function assembleTopography(data: TopoData, options: AssembleOptions = {}): AssembleResult {
  const warnings = [...data.warnings];
  transform(data.points, options);
  for (const l of data.lines) transform(l.coords, options);
  if (data.faces) transform(data.faces.vertices, options);

  let tin: TinData | undefined;
  let duplicates = 0;
  let skippedConstraints = 0;
  let droppedTriangles = 0;
  if (data.faces && data.faces.triangles.length > 0) {
    tin = data.faces;
  } else {
    let pts: Float64Array = Float64Array.from(data.points);
    if (options.decimate && pts.length > 0) pts = decimateGrid(pts, options.decimate);
    const all: number[] = Array.from(pts);
    const constraints: number[] = [];
    for (const l of data.lines) {
      const base = all.length / 3;
      const n = l.coords.length / 3;
      for (const c of l.coords) all.push(c);
      if (!CONSTRAINT_ROLES.has(l.role)) continue;
      for (let i = 0; i + 1 < n; i++) constraints.push(base + i, base + i + 1);
      if (l.closed && n > 2) constraints.push(base + n - 1, base);
    }
    if (all.length >= 9) {
      const r = buildTin(Float64Array.from(all), Uint32Array.from(constraints), options.tin);
      if (r.tin.triangles.length > 0) tin = r.tin;
      ({ duplicates, skippedConstraints, droppedTriangles } = r);
      if (duplicates > 0) warnings.push({ code: 'topo.duplicates', params: { n: duplicates } });
      if (skippedConstraints > 0)
        warnings.push({ code: 'topo.skippedConstraints', params: { n: skippedConstraints } });
    }
  }

  const lines = data.lines.length > 0 ? packLines(data.lines) : undefined;
  const bounds = boundsOf(tin?.vertices ?? []);
  if (lines) boundsOf(lines.coords, bounds);
  if (!tin && !lines) boundsOf(data.points, bounds);
  const count = (tin?.vertices.length ?? 0) / 3 + (lines?.coords.length ?? 0) / 3;
  // CRS en que quedaron las coordenadas, frente al del proyecto.
  const current = options.toEpsg ?? options.fromEpsg ?? data.epsg;
  const check: TopoCheckContext = {
    ...(current !== undefined ? { sourceEpsg: current } : {}),
    ...(options.projectEpsg !== undefined ? { targetEpsg: options.projectEpsg } : {}),
    ...(options.projectBounds ? { projectBounds: options.projectBounds } : {}),
  };
  warnings.push(...checkTopography(bounds, count, check));
  return {
    parts: { ...(tin ? { tin } : {}), ...(lines ? { lines } : {}) },
    bounds,
    warnings,
    stats: {
      points: (tin?.vertices.length ?? 0) / 3,
      triangles: (tin?.triangles.length ?? 0) / 3,
      lines: data.lines.length,
      duplicates,
      skippedConstraints,
      droppedTriangles,
    },
  };
}

/** Empaqueta polilíneas en el `LineSetData` del asset. */
export function packLines(lines: readonly TopoLine[]): LineSetData {
  let total = 0;
  for (const l of lines) total += l.coords.length;
  const coords = new Float64Array(total);
  const offsets = new Uint32Array(lines.length + 1);
  const roles = new Uint8Array(lines.length);
  const closed = new Uint8Array(lines.length);
  let at = 0;
  lines.forEach((l, i) => {
    coords.set(l.coords, at);
    at += l.coords.length;
    offsets[i + 1] = at / 3;
    roles[i] = Math.max(0, LINE_ROLES.indexOf(l.role));
    closed[i] = l.closed ? 1 : 0;
  });
  return { coords, offsets, roles, closed };
}
