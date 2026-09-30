import Flatbush from 'flatbush';
import { applyHoleEdit } from '../document/commands';
import { pointInPolygon, polygonBounds } from '../geometry/polygon';
import type { Blast, Hole, HoleId, Vec2 } from '../model/types';
import { LINE_ROLES, type LineRole, type LineSetData } from './asset';

/**
 * Herramientas de diseño sobre la topografía (D-16): cara libre desde la cresta, perímetro desde
 * una línea, collares sobre el terreno, cota del banco y ajuste a las líneas de referencia.
 */

/** Tolerancia de la cara libre desde la cresta [m] (supuesto S-15, editable al usarla). */
export const DEFAULT_FREE_FACE_TOLERANCE = 1.0;

const roleOf = (lines: LineSetData, i: number): LineRole =>
  LINE_ROLES[lines.roles[i] ?? 0] ?? 'other';

/** Distancia en planta de (x, y) al segmento a–b. */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Segmentos (índices de punto a–b) de las líneas con los roles pedidos. */
function segmentsOf(lines: LineSetData, roles: readonly LineRole[] | null): [number, number][] {
  const out: [number, number][] = [];
  const n = lines.roles.length;
  for (let i = 0; i < n; i++) {
    if (roles && !roles.includes(roleOf(lines, i))) continue;
    const a = lines.offsets[i] ?? 0;
    const b = lines.offsets[i + 1] ?? a;
    for (let p = a; p + 1 < b; p++) out.push([p, p + 1]);
    if (lines.closed[i] === 1 && b - a > 2) out.push([b - 1, a]);
  }
  return out;
}

function distanceToSegments(
  lines: LineSetData,
  segs: readonly [number, number][],
  x: number,
  y: number,
) {
  const c = lines.coords;
  let best = Infinity;
  for (const [a, b] of segs)
    best = Math.min(
      best,
      segmentDistance(x, y, c[a * 3] ?? 0, c[a * 3 + 1] ?? 0, c[b * 3] ?? 0, c[b * 3 + 1] ?? 0),
    );
  return best;
}

/**
 * Aristas del perímetro que siguen una línea de cresta: sus dos extremos y su punto medio quedan a
 * menos de `tolerance` de alguna línea con esos roles (S-15). La arista i va del vértice i al i+1.
 */
export function freeFaceEdgesFromLines(
  polygon: readonly Vec2[],
  lineSets: readonly LineSetData[],
  tolerance = DEFAULT_FREE_FACE_TOLERANCE,
  roles: readonly LineRole[] = ['crest'],
): number[] {
  const sets = lineSets
    .map((l) => ({ l, segs: segmentsOf(l, roles) }))
    .filter((s) => s.segs.length);
  const near = (x: number, y: number) =>
    sets.some(({ l, segs }) => distanceToSegments(l, segs, x, y) <= tolerance);
  const edges: number[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (!a || !b) continue;
    if (near(a.x, a.y) && near(b.x, b.y) && near((a.x + b.x) / 2, (a.y + b.y) / 2)) edges.push(i);
  }
  return edges;
}

/** Línea de referencia como polígono (sin repetir el primer vértice), si es cerrada. */
export function linePolygon(lines: LineSetData, i: number): Vec2[] | null {
  const a = lines.offsets[i] ?? 0;
  const b = lines.offsets[i + 1] ?? a;
  const pts: Vec2[] = [];
  for (let p = a; p < b; p++)
    pts.push({ x: lines.coords[p * 3] ?? 0, y: lines.coords[p * 3 + 1] ?? 0 });
  const first = pts[0];
  const last = pts[pts.length - 1];
  const repeats = first && last && pts.length > 3 && first.x === last.x && first.y === last.y;
  if (repeats) pts.pop();
  return (lines.closed[i] === 1 || repeats) && pts.length >= 3 ? pts : null;
}

export interface LineSummary {
  index: number;
  role: LineRole;
  closed: boolean;
  /** Largo en planta [m]. */
  length: number;
  /** Cota media de sus vértices [m]. */
  elevation: number;
  /** Centro de su caja envolvente. */
  center: Vec2;
}

/** Resumen de cada línea (para elegir una como perímetro). */
export function summarizeLines(lines: LineSetData): LineSummary[] {
  const out: LineSummary[] = [];
  const c = lines.coords;
  for (let i = 0; i < lines.roles.length; i++) {
    const a = lines.offsets[i] ?? 0;
    const b = lines.offsets[i + 1] ?? a;
    let length = 0;
    let z = 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let p = a; p < b; p++) {
      const x = c[p * 3] ?? 0;
      const y = c[p * 3 + 1] ?? 0;
      z += c[p * 3 + 2] ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (p > a) length += Math.hypot(x - (c[(p - 1) * 3] ?? 0), y - (c[(p - 1) * 3 + 1] ?? 0));
    }
    const closed = lines.closed[i] === 1;
    if (closed && b - a > 2)
      length += Math.hypot(
        (c[a * 3] ?? 0) - (c[(b - 1) * 3] ?? 0),
        (c[a * 3 + 1] ?? 0) - (c[(b - 1) * 3 + 1] ?? 0),
      );
    out.push({
      index: i,
      role: roleOf(lines, i),
      closed,
      length,
      elevation: b > a ? z / (b - a) : 0,
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    });
  }
  return out;
}

export interface DrapeResult {
  holes: Hole[];
  /** Taladros fuera de la topografía: quedan como estaban. */
  outside: HoleId[];
}

/**
 * Collares sobre la topografía (R2 F05 «adaptar collar al terreno»): la cota de boca pasa a ser
 * la del terreno y la longitud se recalcula hasta piso + sobreperforación (`lengthToFloor`).
 */
export function drapeHoles(
  holes: readonly Hole[],
  elevationAt: (x: number, y: number) => number | null,
  blast: Pick<Blast, 'bench' | 'calcParams'>,
): DrapeResult {
  const out: Hole[] = [];
  const outside: HoleId[] = [];
  for (const h of holes) {
    const z = elevationAt(h.collar.x, h.collar.y);
    if (z === null) {
      outside.push(h.id);
      out.push(h);
    } else out.push(applyHoleEdit(h, { z }, blast));
  }
  return { holes: out, outside };
}

/**
 * Mediana de la cota del terreno dentro de un polígono, muestreada en una grilla de ~40 × 40 sobre
 * su caja envolvente (independiente de la densidad del levantamiento). `null` si no lo cubre.
 */
export function medianElevationInPolygon(
  polygon: readonly Vec2[],
  elevationAt: (x: number, y: number) => number | null,
  samples = 40,
): number | null {
  if (polygon.length < 3) return null;
  const b = polygonBounds(polygon);
  const zs: number[] = [];
  for (let i = 0; i < samples; i++)
    for (let j = 0; j < samples; j++) {
      const x = b.minX + ((i + 0.5) / samples) * (b.maxX - b.minX);
      const y = b.minY + ((j + 0.5) / samples) * (b.maxY - b.minY);
      if (!pointInPolygon(x, y, polygon)) continue;
      const z = elevationAt(x, y);
      if (z !== null) zs.push(z);
    }
  if (zs.length === 0) return null;
  zs.sort((p, q) => p - q);
  const m = zs.length / 2;
  return zs.length % 2 ? (zs[Math.floor(m)] ?? null) : ((zs[m - 1] ?? 0) + (zs[m] ?? 0)) / 2;
}

/** Punto de ajuste sobre una línea de referencia. */
export interface LineSnap extends Vec2 {
  kind: 'lineVertex' | 'lineEdge';
}

/**
 * Índice de los segmentos de las líneas de referencia para el ajuste del cursor (O(log n) por
 * consulta). Prioridad: vértice dentro de la tolerancia; si no, el punto más cercano de un borde.
 */
export class LineSnapIndex {
  private constructor(
    private readonly lines: LineSetData,
    private readonly segs: [number, number][],
    private readonly index: Flatbush | null,
  ) {}

  static build(lines: LineSetData): LineSnapIndex {
    const segs = segmentsOf(lines, null);
    if (segs.length === 0) return new LineSnapIndex(lines, segs, null);
    const c = lines.coords;
    const index = new Flatbush(segs.length);
    for (const [a, b] of segs) {
      const ax = c[a * 3] ?? 0,
        ay = c[a * 3 + 1] ?? 0,
        bx = c[b * 3] ?? 0,
        by = c[b * 3 + 1] ?? 0;
      index.add(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
    }
    index.finish();
    return new LineSnapIndex(lines, segs, index);
  }

  /** Reconstruye el índice desde su `data` (armado en el worker), sin volver a ordenar. */
  static fromData(lines: LineSetData, data: ArrayBuffer | null): LineSnapIndex {
    return new LineSnapIndex(lines, segmentsOf(lines, null), data ? Flatbush.from(data) : null);
  }

  /** Buffer del índice, para enviarlo a otro hilo. */
  get data(): ArrayBuffer | null {
    return (this.index?.data as ArrayBuffer | undefined) ?? null;
  }

  nearest(x: number, y: number, tolerance: number): LineSnap | null {
    if (!this.index) return null;
    const c = this.lines.coords;
    const found = this.index.search(x - tolerance, y - tolerance, x + tolerance, y + tolerance);
    let vertex: LineSnap | null = null;
    let vd = tolerance;
    let edge: LineSnap | null = null;
    let ed = tolerance;
    for (const k of found) {
      const seg = this.segs[k];
      if (!seg) continue;
      const [a, b] = seg;
      const ax = c[a * 3] ?? 0,
        ay = c[a * 3 + 1] ?? 0,
        bx = c[b * 3] ?? 0,
        by = c[b * 3 + 1] ?? 0;
      for (const [px, py] of [
        [ax, ay],
        [bx, by],
      ] as const) {
        const d = Math.hypot(px - x, py - y);
        if (d <= vd) {
          vd = d;
          vertex = { x: px, y: py, kind: 'lineVertex' };
        }
      }
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const d = Math.hypot(qx - x, qy - y);
      if (d <= ed) {
        ed = d;
        edge = { x: qx, y: qy, kind: 'lineEdge' };
      }
    }
    return vertex ?? edge;
  }
}
