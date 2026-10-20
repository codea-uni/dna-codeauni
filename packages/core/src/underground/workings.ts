import type {
  I3DfaceEntity,
  IEntity,
  ILineEntity,
  ILwpolylineEntity,
  IPolylineEntity,
} from 'dxf-parser';
import { entityPoints, parseDxfEntities } from '../io/dxf';
import type { Meters, Radians, Vec3 } from '../model/types';
import type { WorkingAxisMeta, WorkingProfileSpec, WorkingsData } from '../topography/asset';
import type { TopoWarning } from '../topography/data';
import { parseSurpacDtm, parseSurpacStr } from '../topography/surpac';
import {
  arched,
  circular,
  horseshoe,
  rectangular,
  roundedShoulders,
  type ExcavationProfile,
  type UV,
} from './profiles';
import { localToWorld, planeFrame, type PlaneFrame } from './transform';

/**
 * Labores subterráneas reales (túneles, galerías, rampas, cruceros) importadas para ubicar el
 * diseño: sólidos (3DFACE y POLYLINE polyface de un DXF, `.str` + `.dtm` de Surpac) y líneas de
 * eje (POLYLINE 3D, LWPOLYLINE, LINE, cadenas de Surpac) que se convierten en túnel con un perfil.
 *
 * Los ejes se guardan AL NIVEL DEL PISO (el origen del frente en `transform.ts` es el centro del
 * piso). De un sólido se estima el eje por componentes principales en planta: sirve para labores
 * rectas o poco curvas; en una rampa en espiral conviene importar su eje.
 */

/** Sólido leído del archivo (triángulos sobre vértices x, y, z intercalados). */
export interface WorkingsSolid {
  name: string;
  vertices: number[];
  triangles: number[];
}

/** Línea de eje leída del archivo. */
export interface WorkingsAxisLine {
  name: string;
  points: Vec3[];
}

/** Contenido de un archivo de labores antes de armarlas. */
export interface WorkingsSource {
  solids: WorkingsSolid[];
  axes: WorkingsAxisLine[];
  warnings: TopoWarning[];
}

const EPS = 1e-9;

// ------------------------------------------------------------------ Perfiles

/**
 * Perfil de excavación de una labor (mismas reglas que el panel Subterránea): arco-D con hastiales
 * H − W/2, herradura con flecha W/4, hombros redondeados de radio 0,5 m, circular de diámetro W.
 * Si el alto no alcanza para el arco, cae a rectangular.
 */
export function workingProfile(spec: WorkingProfileSpec): ExcavationProfile {
  const W = Math.max(0.5, spec.width);
  const H = Math.max(0.5, spec.height);
  switch (spec.kind) {
    case 'arched':
      return H - W / 2 > 0.05 ? arched(W, H - W / 2, 0.25) : rectangular(W, H);
    case 'horseshoe':
      return H - W / 4 > 0.05 ? horseshoe(W, H - W / 4, W / 4, 0.25) : rectangular(W, H);
    case 'roundedShoulders':
      return roundedShoulders(W, H, Math.min(0.5, W / 2, H), 0.25);
    case 'circular':
      return circular(W / 2, 0.25);
    case 'rectangular':
      return rectangular(W, H);
  }
}

// ------------------------------------------------------------------ Lectura

/**
 * Lee un DXF de labores: 3DFACE y POLYLINE polyface como sólidos (uno por capa); POLYLINE 3D o 2D,
 * LWPOLYLINE y LINE (encadenadas) como ejes. La malla poligonal M×N y la entidad MESH no se leen
 * (aviso).
 */
export function parseWorkingsDxf(text: string): WorkingsSource {
  const out: WorkingsSource = { solids: [], axes: [], warnings: [] };
  const solids = new Map<string, { s: WorkingsSolid; index: Map<string, number> }>();
  const solidOf = (layer: string) => {
    let entry = solids.get(layer);
    if (!entry) {
      entry = { s: { name: layer, vertices: [], triangles: [] }, index: new Map() };
      solids.set(layer, entry);
    }
    return entry;
  };
  const vertexOf = (
    entry: { s: WorkingsSolid; index: Map<string, number> },
    p: { x: number; y: number; z?: number },
  ) => {
    const z = p.z ?? 0;
    const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${z.toFixed(4)}`;
    let i = entry.index.get(key);
    if (i === undefined) {
      i = entry.s.vertices.length / 3;
      entry.index.set(key, i);
      entry.s.vertices.push(p.x, p.y, z);
    }
    return i;
  };
  const quad = (
    layer: string,
    pts: readonly ({ x: number; y: number; z?: number } | undefined)[],
  ): void => {
    const [a, b, c, d] = pts;
    if (!a || !b || !c) return;
    const entry = solidOf(layer);
    const ia = vertexOf(entry, a);
    const ib = vertexOf(entry, b);
    const ic = vertexOf(entry, c);
    if (ia !== ib && ib !== ic && ia !== ic) entry.s.triangles.push(ia, ib, ic);
    if (d) {
      const id = vertexOf(entry, d);
      if (id !== ic && id !== ia && ia !== ic) entry.s.triangles.push(ia, ic, id);
    }
  };
  const lines = new Map<string, Vec3[][]>();
  let polygonMesh = 0;
  let flat = 0;
  const addAxis = (name: string, pts: Vec3[]) => {
    const clean = dedupe(pts.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })));
    if (clean.length < 2) return;
    if (clean.every((p) => p.z === 0)) flat++;
    out.axes.push({ name, points: clean });
  };
  for (const e of parseDxfEntities(text) as IEntity[]) {
    if (e.type === '3DFACE') {
      quad(e.layer, (e as I3DfaceEntity).vertices);
      continue;
    }
    if (e.type === 'POLYLINE') {
      const pl = e as IPolylineEntity;
      if (pl.isPolyfaceMesh) {
        // Registros de vértice (banderas 128 + 64) y de cara (128, índices desde 1; negativo =
        // arista invisible).
        const verts = pl.vertices.filter((v) => v.threeDPolylineMesh || !v.polyfaceMeshVertex);
        const faces = pl.vertices.filter((v) => v.polyfaceMeshVertex && !v.threeDPolylineMesh);
        const at = (i: number | undefined) =>
          i === undefined || i === 0 ? undefined : verts[Math.abs(i) - 1];
        for (const f of faces) quad(e.layer, [at(f.faceA), at(f.faceB), at(f.faceC), at(f.faceD)]);
        continue;
      }
      if (pl.is3dPolygonMesh) {
        polygonMesh++;
        continue;
      }
      addAxis(e.layer, entityPoints(e));
      continue;
    }
    if (e.type === 'LWPOLYLINE') {
      const lw = e as ILwpolylineEntity;
      addAxis(
        e.layer,
        lw.vertices.map((v) => ({ x: v.x, y: v.y, z: lw.elevation ?? 0 })),
      );
      continue;
    }
    if (e.type === 'LINE') {
      const v = (e as ILineEntity).vertices;
      const [a, b] = v;
      if (!a || !b) continue;
      const list = lines.get(e.layer) ?? [];
      list.push([
        { x: a.x, y: a.y, z: a.z ?? 0 },
        { x: b.x, y: b.y, z: b.z ?? 0 },
      ]);
      lines.set(e.layer, list);
    }
  }
  for (const [layer, segs] of lines) for (const chain of chainSegments(segs)) addAxis(layer, chain);
  for (const { s } of solids.values()) if (s.triangles.length > 0) out.solids.push(s);
  if (polygonMesh > 0)
    out.warnings.push({ code: 'workings.polygonMesh', params: { n: polygonMesh } });
  if (/^\s*0\s*\r?\n\s*MESH\s*$/m.test(text)) out.warnings.push({ code: 'workings.meshEntity' });
  if (flat > 0) out.warnings.push({ code: 'workings.flatAxis', params: { n: flat } });
  if (out.solids.length === 0 && out.axes.length === 0)
    out.warnings.push({ code: 'workings.empty' });
  return out;
}

/**
 * Lee cadenas de Surpac (`.str`) como ejes de labores; con su `.dtm`, la triangulación como sólido.
 */
export function parseWorkingsSurpac(strText: string, dtmText?: string): WorkingsSource {
  const str = parseSurpacStr(strText);
  const out: WorkingsSource = { solids: [], axes: [], warnings: [] };
  if (dtmText !== undefined) {
    const { triangles, bad } = parseSurpacDtm(dtmText, str);
    if (bad > 0) out.warnings.push({ code: 'surpac.badTriangles', params: { n: bad } });
    if (triangles.length > 0)
      out.solids.push({
        name: 'Surpac',
        vertices: Array.from(str.points),
        triangles: Array.from(triangles),
      });
    return out;
  }
  for (const s of str.strings) {
    const pts: Vec3[] = [];
    for (let i = 0; i + 2 < s.coords.length; i += 3)
      pts.push({ x: s.coords[i] ?? 0, y: s.coords[i + 1] ?? 0, z: s.coords[i + 2] ?? 0 });
    const clean = dedupe(pts);
    if (clean.length >= 2) out.axes.push({ name: `${String(s.id)}`, points: clean });
  }
  if (out.axes.length === 0) out.warnings.push({ code: 'workings.empty' });
  return out;
}

/** Quita puntos repetidos seguidos. */
function dedupe(pts: readonly Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 1e-6) out.push(p);
  }
  return out;
}

/** Encadena segmentos sueltos (LINE) que comparten extremos en polilíneas. */
function chainSegments(segs: readonly Vec3[][]): Vec3[][] {
  const key = (p: Vec3) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const used = new Array<boolean>(segs.length).fill(false);
  const byEnd = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s[0], s[1]]) {
      if (!p) continue;
      const k = key(p);
      byEnd.set(k, [...(byEnd.get(k) ?? []), i]);
    }
  });
  const next = (p: Vec3): Vec3 | null => {
    for (const i of byEnd.get(key(p)) ?? []) {
      if (used[i]) continue;
      used[i] = true;
      const [a, b] = segs[i] as [Vec3, Vec3];
      return key(a) === key(p) ? b : a;
    }
    return null;
  };
  const chains: Vec3[][] = [];
  segs.forEach((s, i) => {
    if (used[i]) return;
    used[i] = true;
    const [a, b] = s as [Vec3, Vec3];
    const chain = [a, b];
    for (let q = next(b); q; q = next(chain[chain.length - 1] as Vec3)) chain.push(q);
    for (let q = next(a); q; q = next(chain[0] as Vec3)) chain.unshift(q);
    chains.push(chain);
  });
  return chains;
}

// ------------------------------------------------------------------ Armado

export interface BuildWorkingsOptions {
  /** Perfil con el que se convierten los ejes en túnel. */
  profile: WorkingProfileSpec;
  /** Dónde está la línea de eje del archivo: al piso (por defecto) o al centro de la sección. */
  axisAt?: 'floor' | 'center';
  /** Separar cada sólido en sus partes conexas (una labor por parte). Por defecto, sí. */
  splitSolids?: boolean;
}

/** Une sólidos y túneles generados en una sola malla con sus ejes al nivel del piso. */
export function buildWorkings(src: WorkingsSource, options: BuildWorkingsOptions): WorkingsData {
  const vertices: number[] = [];
  const triangles: number[] = [];
  const axisCoords: number[] = [];
  const axisOffsets: number[] = [0];
  const axes: WorkingAxisMeta[] = [];
  const addMesh = (v: readonly number[], t: readonly number[]) => {
    const base = vertices.length / 3;
    for (const x of v) vertices.push(x);
    for (const i of t) triangles.push(i + base);
  };
  const addAxis = (meta: WorkingAxisMeta, pts: readonly Vec3[]) => {
    for (const p of pts) axisCoords.push(p.x, p.y, p.z);
    axisOffsets.push(axisCoords.length / 3);
    axes.push(meta);
  };
  const profile = workingProfile(options.profile);
  const drop = options.axisAt === 'center' ? profile.height / 2 : 0;
  src.axes.forEach((a, i) => {
    const pts = a.points.map((p) => ({ x: p.x, y: p.y, z: p.z - drop }));
    const mesh = tunnelMesh(pts, profile.points);
    addMesh(mesh.vertices, mesh.triangles);
    const name = src.axes.length > 1 ? `${a.name} ${String(i + 1)}` : a.name;
    addAxis({ name, source: 'axis', profile: { ...options.profile } }, pts);
  });
  let n = 0;
  for (const s of src.solids) {
    addMesh(s.vertices, s.triangles);
    const parts =
      (options.splitSolids ?? true) ? connectedParts(s.vertices, s.triangles) : [s.triangles];
    const solidParts = parts.filter((t) => t.length >= 12);
    solidParts.forEach((t, j) => {
      const est = estimateSolidAxis(s.vertices, t);
      if (!est) return;
      n++;
      const name = solidParts.length > 1 ? `${s.name} ${String(j + 1)}` : s.name;
      addAxis(
        {
          name: name || `#${String(n)}`,
          source: 'solid',
          profile: {
            kind: est.height > est.width / 2 + 0.05 ? 'arched' : 'rectangular',
            width: est.width,
            height: est.height,
          },
          estimated: true,
        },
        est.points,
      );
    });
  }
  return {
    vertices: Float64Array.from(vertices),
    triangles: Uint32Array.from(triangles),
    axisCoords: Float64Array.from(axisCoords),
    axisOffsets: Uint32Array.from(axisOffsets),
    axes,
  };
}

/** Puntos del eje i de las labores. */
export function workingAxisPoints(w: WorkingsData, i: number): Vec3[] {
  const a = w.axisOffsets[i] ?? 0;
  const b = w.axisOffsets[i + 1] ?? a;
  const out: Vec3[] = [];
  for (let k = a; k < b; k++)
    out.push({
      x: w.axisCoords[3 * k] ?? 0,
      y: w.axisCoords[3 * k + 1] ?? 0,
      z: w.axisCoords[3 * k + 2] ?? 0,
    });
  return out;
}

/**
 * Túnel a lo largo de un eje (al piso): una sección del perfil en cada vértice, orientada con la
 * dirección media de los tramos vecinos, y la piel entre secciones contiguas.
 */
export function tunnelMesh(
  axis: readonly Vec3[],
  profile: readonly UV[],
): { vertices: number[]; triangles: number[] } {
  const vertices: number[] = [];
  const triangles: number[] = [];
  const n = profile.length;
  if (axis.length < 2 || n < 3) return { vertices, triangles };
  axis.forEach((p, i) => {
    const prev = axis[i - 1];
    const next = axis[i + 1];
    const d1 = prev ? unit(sub(p, prev)) : null;
    const d2 = next ? unit(sub(next, p)) : null;
    const d = d1 && d2 ? unit(add(d1, d2)) : (d1 ?? d2 ?? { x: 0, y: 1, z: 0 });
    const frame = planeFrame({
      origin: p,
      azimuth: Math.atan2(d.x, d.y),
      gradient: Math.atan2(d.z, Math.hypot(d.x, d.y)),
    });
    for (const q of profile) {
      const w = localToWorld(frame, q);
      vertices.push(w.x, w.y, w.z);
    }
  });
  for (let j = 0; j + 1 < axis.length; j++)
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const a = j * n + i;
      const b = (j + 1) * n + i;
      const c = (j + 1) * n + k;
      const d = j * n + k;
      triangles.push(a, b, c, a, c, d);
    }
  return { vertices, triangles };
}

/** Partes conexas de una malla (triángulos que comparten vértices). */
function connectedParts(vertices: readonly number[], tris: readonly number[]): number[][] {
  const nv = vertices.length / 3;
  const parent = Array.from({ length: nv }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    while (parent[i] !== r) {
      const next = parent[i] as number;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let t = 0; t + 2 < tris.length; t += 3) {
    union(tris[t] as number, tris[t + 1] as number);
    union(tris[t] as number, tris[t + 2] as number);
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const r = find(tris[t] as number);
    const g = groups.get(r) ?? [];
    g.push(tris[t] as number, tris[t + 1] as number, tris[t + 2] as number);
    groups.set(r, g);
  }
  return [...groups.values()];
}

/**
 * Eje estimado de un sólido: dirección principal en planta (componentes principales de sus
 * vértices) y, en tramos de ~1/40 del largo (≥ 1 m), el centro del ancho a la cota del piso.
 * Ancho y alto = medianas de los tramos.
 */
export function estimateSolidAxis(
  vertices: readonly number[],
  tris: readonly number[],
): { points: Vec3[]; width: Meters; height: Meters } | null {
  const used = [...new Set(tris)];
  if (used.length < 4) return null;
  let cx = 0;
  let cy = 0;
  for (const i of used) {
    cx += vertices[3 * i] ?? 0;
    cy += vertices[3 * i + 1] ?? 0;
  }
  cx /= used.length;
  cy /= used.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const i of used) {
    const dx = (vertices[3 * i] ?? 0) - cx;
    const dy = (vertices[3 * i + 1] ?? 0) - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = { x: Math.cos(theta), y: Math.sin(theta) };
  const nrm = { x: -dir.y, y: dir.x };
  const pts = used.map((i) => {
    const x = vertices[3 * i] ?? 0;
    const y = vertices[3 * i + 1] ?? 0;
    return {
      t: (x - cx) * dir.x + (y - cy) * dir.y,
      s: (x - cx) * nrm.x + (y - cy) * nrm.y,
      z: vertices[3 * i + 2] ?? 0,
    };
  });
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of pts) {
    tMin = Math.min(tMin, p.t);
    tMax = Math.max(tMax, p.t);
  }
  const L = tMax - tMin;
  if (!(L > EPS)) return null;
  const bins = Math.max(1, Math.min(200, Math.round(L / Math.max(1, L / 40))));
  const step = L / bins;
  const acc = Array.from({ length: bins }, () => ({
    sMin: Infinity,
    sMax: -Infinity,
    zMin: Infinity,
    zMax: -Infinity,
    n: 0,
  }));
  for (const p of pts) {
    const b = acc[Math.min(bins - 1, Math.floor((p.t - tMin) / step))];
    if (!b) continue;
    b.sMin = Math.min(b.sMin, p.s);
    b.sMax = Math.max(b.sMax, p.s);
    b.zMin = Math.min(b.zMin, p.z);
    b.zMax = Math.max(b.zMax, p.z);
    b.n++;
  }
  const points: Vec3[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  acc.forEach((b, k) => {
    if (b.n === 0) return;
    const t = tMin + (k + 0.5) * step;
    const s = (b.sMin + b.sMax) / 2;
    points.push({
      x: cx + t * dir.x + s * nrm.x,
      y: cy + t * dir.y + s * nrm.y,
      z: b.zMin,
    });
    widths.push(b.sMax - b.sMin);
    heights.push(b.zMax - b.zMin);
  });
  // Los extremos del eje llegan a los extremos del sólido.
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length >= 2) {
    const half = step / 2;
    points[0] = { x: first.x - half * dir.x, y: first.y - half * dir.y, z: first.z };
    points[points.length - 1] = { x: last.x + half * dir.x, y: last.y + half * dir.y, z: last.z };
  } else if (first) {
    points.splice(
      0,
      1,
      { x: first.x - (L / 2) * dir.x, y: first.y - (L / 2) * dir.y, z: first.z },
      { x: first.x + (L / 2) * dir.x, y: first.y + (L / 2) * dir.y, z: first.z },
    );
  }
  return { points, width: median(widths), height: median(heights) };
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

// ------------------------------------------------------------------ Progresivas

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > EPS ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 1, z: 0 };
}

/** Largo de un eje [m]. */
export function axisLength(points: readonly Vec3[]): Meters {
  let s = 0;
  for (let i = 1; i < points.length; i++)
    s += Math.hypot(
      (points[i] as Vec3).x - (points[i - 1] as Vec3).x,
      (points[i] as Vec3).y - (points[i - 1] as Vec3).y,
      (points[i] as Vec3).z - (points[i - 1] as Vec3).z,
    );
  return s;
}

/** Punto de un eje a una progresiva, con la dirección de avance. */
export interface AxisStation {
  /** Punto del eje (centro del piso) [m]. */
  point: Vec3;
  /** Azimut de avance, horario desde el Norte [rad], [0, 2π). */
  azimuth: Radians;
  /** Pendiente de avance [rad] (positiva hacia arriba). */
  gradient: Radians;
  /** Progresiva desde el primer punto del eje [m] (recortada a [0, largo]). */
  station: Meters;
  /** Largo del eje [m]. */
  length: Meters;
}

/**
 * Ubicación por progresiva: el punto a `station` metros del inicio del eje y la dirección del
 * tramo. `reverse` = el frente avanza hacia el inicio del eje (la progresiva sigue contándose desde
 * el inicio).
 */
export function stationOnAxis(
  points: readonly Vec3[],
  station: Meters,
  reverse = false,
): AxisStation {
  const length = axisLength(points);
  const s = Math.max(0, Math.min(length, Number.isFinite(station) ? station : 0));
  const first = points[0] ?? { x: 0, y: 0, z: 0 };
  let point: Vec3 = { ...first };
  let dir: Vec3 = { x: 0, y: 1, z: 0 };
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec3;
    const b = points[i] as Vec3;
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (seg <= EPS) continue;
    dir = unit(sub(b, a));
    // En un vértice manda el tramo que sigue (salvo al final del eje).
    if (s < acc + seg || i === points.length - 1) {
      const k = Math.min(1, Math.max(0, (s - acc) / seg));
      point = { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y), z: a.z + k * (b.z - a.z) };
      break;
    }
    acc += seg;
  }
  if (reverse) dir = { x: -dir.x, y: -dir.y, z: -dir.z };
  let azimuth = Math.atan2(dir.x, dir.y);
  if (azimuth < 0) azimuth += 2 * Math.PI;
  return {
    point,
    azimuth,
    gradient: Math.atan2(dir.z, Math.hypot(dir.x, dir.y)),
    station: s,
    length,
  };
}

/** Progresiva del punto del eje más cercano a `p` (en planta si `plan`). */
export function nearestStation(
  points: readonly Vec3[],
  p: { x: number; y: number; z?: number },
  plan = false,
): { station: Meters; distance: Meters } {
  let best = { station: 0, distance: Infinity };
  let acc = 0;
  const pz = plan || p.z === undefined ? 0 : p.z;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec3;
    const b = points[i] as Vec3;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = plan ? 0 : b.z - a.z;
    const seg2 = dx * dx + dy * dy + dz * dz;
    const az = plan ? 0 : a.z;
    const k =
      seg2 > EPS
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (pz - az) * dz) / seg2))
        : 0;
    const d = Math.hypot(a.x + k * dx - p.x, a.y + k * dy - p.y, az + k * dz - pz);
    const len3 = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d < best.distance) best = { station: acc + k * len3, distance: d };
    acc += len3;
  }
  if (points.length === 1) {
    const a = points[0] as Vec3;
    best = { station: 0, distance: Math.hypot(a.x - p.x, a.y - p.y, plan ? 0 : a.z - pz) };
  }
  return best;
}

// ------------------------------------------------------------------ Sección

/** Segmento de una sección en el plano del frente. */
export interface SectionSegment {
  a: UV;
  b: UV;
}

/**
 * Corte de la malla de labores con el plano del frente (normal = avance): segmentos en (u, v)
 * del plano, solo los que quedan a menos de `radius` del origen (la labor donde se trabaja, no
 * las vecinas que cruza el mismo plano).
 */
export function sectionWorkings(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  frame: PlaneFrame,
  radius: Meters,
): SectionSegment[] {
  const { origin: o, forward: f, right: r, up: v } = frame;
  const out: SectionSegment[] = [];
  const P = (i: number): Vec3 => ({
    x: vertices[3 * i] ?? 0,
    y: vertices[3 * i + 1] ?? 0,
    z: vertices[3 * i + 2] ?? 0,
  });
  const dist = (p: Vec3) => (p.x - o.x) * f.x + (p.y - o.y) * f.y + (p.z - o.z) * f.z;
  const toUV = (p: Vec3): UV => {
    const d = sub(p, o);
    return { u: d.x * r.x + d.y * r.y + d.z * r.z, v: d.x * v.x + d.y * v.y + d.z * v.z };
  };
  const r2 = radius * radius;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const ps = [P(triangles[t] ?? 0), P(triangles[t + 1] ?? 0), P(triangles[t + 2] ?? 0)];
    // Descarte rápido: el triángulo lejos del origen.
    if (ps.every((p) => (p.x - o.x) ** 2 + (p.y - o.y) ** 2 + (p.z - o.z) ** 2 > 4 * r2)) continue;
    const ds = ps.map(dist);
    const hits: UV[] = [];
    for (let k = 0; k < 3; k++) {
      const a = ps[k] as Vec3;
      const b = ps[(k + 1) % 3] as Vec3;
      const da = ds[k] as number;
      const db = ds[(k + 1) % 3] as number;
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
      const s = da / (da - db);
      hits.push(
        toUV({ x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y), z: a.z + s * (b.z - a.z) }),
      );
    }
    if (hits.length < 2) continue;
    const [a, b] = hits as [UV, UV];
    if (Math.hypot(a.u - b.u, a.v - b.v) < 1e-9) continue;
    if (a.u * a.u + a.v * a.v > r2 && b.u * b.u + b.v * b.v > r2) continue;
    out.push({ a, b });
  }
  return out;
}
