import DxfParser, {
  type I3DfaceEntity,
  type ICircleEntity,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPointEntity,
  type IPolylineEntity,
  type ITextEntity,
} from 'dxf-parser';
import { holeToe, lengthToFloor } from '../geometry/hole';
import { polygonEdge } from '../geometry/boundary';
import { unitToAzimuth } from '../geometry/vec';
import { newId } from '../model/ids';
import type { Bench, Blast, Hole, Polygon2, Surface, Vec2, Vec3 } from '../model/types';

// ------------------------------------------------------------------ Escritura (DXF R12 ASCII)

/** Capas que escribe BlastLab (y que reconoce al importar). */
export const DXF_LAYERS = {
  collars: 'BL_BOCAS',
  traces: 'BL_TRAZAS',
  labels: 'BL_ETIQUETAS',
  boundaries: 'BL_PERIMETROS',
  freeFaces: 'BL_CARA_LIBRE',
  ties: 'BL_AMARRES',
  surface: 'BL_TOPOGRAFIA',
} as const;

const LAYER_COLORS: Record<string, number> = {
  [DXF_LAYERS.collars]: 5,
  [DXF_LAYERS.traces]: 8,
  [DXF_LAYERS.labels]: 7,
  [DXF_LAYERS.boundaries]: 30,
  [DXF_LAYERS.freeFaces]: 1,
  [DXF_LAYERS.ties]: 3,
  [DXF_LAYERS.surface]: 9,
};

/** Número con precisión de 1 µm, sin ceros sobrantes. */
const n = (v: number) => String(Number(v.toFixed(6)));

class DxfWriter {
  private readonly out: string[] = [];
  private pair(code: number, value: string | number): void {
    this.out.push(String(code), typeof value === 'number' ? n(value) : value);
  }
  point3(c: number, p: Vec3): void {
    this.pair(10 + c, p.x);
    this.pair(20 + c, p.y);
    this.pair(30 + c, p.z);
  }
  entity(type: string, layer: string): void {
    this.pair(0, type);
    this.pair(8, layer);
  }
  line(layer: string, a: Vec3, b: Vec3): void {
    this.entity('LINE', layer);
    this.point3(0, a);
    this.point3(1, b);
  }
  point(layer: string, p: Vec3): void {
    this.entity('POINT', layer);
    this.point3(0, p);
  }
  circle(layer: string, c: Vec3, r: number): void {
    this.entity('CIRCLE', layer);
    this.point3(0, c);
    this.pair(40, r);
  }
  text(layer: string, p: Vec3, height: number, value: string): void {
    this.entity('TEXT', layer);
    this.point3(0, p);
    this.pair(40, height);
    this.pair(1, value.replace(/[\r\n]+/g, ' '));
  }
  /** Polilínea 3D cerrada (R12: POLYLINE + VERTEX + SEQEND). */
  closedPolyline(layer: string, pts: readonly Vec3[]): void {
    this.entity('POLYLINE', layer);
    this.pair(66, 1);
    this.point3(0, { x: 0, y: 0, z: 0 });
    this.pair(70, 9); // 1 = cerrada, 8 = 3D
    for (const p of pts) {
      this.entity('VERTEX', layer);
      this.point3(0, p);
      this.pair(70, 32);
    }
    this.entity('SEQEND', layer);
  }
  face(layer: string, a: Vec3, b: Vec3, c: Vec3, d: Vec3 = c): void {
    this.entity('3DFACE', layer);
    this.point3(0, a);
    this.point3(1, b);
    this.point3(2, c);
    this.point3(3, d);
  }
  toString(layers: string[]): string {
    const head: string[] = [];
    const p = (c: number, v: string | number) =>
      head.push(String(c), typeof v === 'number' ? String(v) : v);
    p(0, 'SECTION');
    p(2, 'HEADER');
    p(9, '$ACADVER');
    p(1, 'AC1009');
    p(9, '$INSUNITS');
    p(70, 6); // metros
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'TABLES');
    p(0, 'TABLE');
    p(2, 'LAYER');
    p(70, layers.length);
    for (const l of layers) {
      p(0, 'LAYER');
      p(2, l);
      p(70, 0);
      p(62, LAYER_COLORS[l] ?? 7);
      p(6, 'CONTINUOUS');
    }
    p(0, 'ENDTAB');
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'ENTITIES');
    const tail = ['0', 'ENDSEC', '0', 'EOF'];
    return [...head, ...this.out, ...tail].join('\r\n') + '\r\n';
  }
}

export interface DxfExportOptions {
  /** Incluir amarres de superficie como líneas. */
  ties?: boolean;
  /** Superficies (topografía) a exportar como 3DFACE. */
  surfaces?: readonly Surface[];
  /** Altura de texto de etiquetas [m]. */
  textHeight?: number;
}

/**
 * Exporta la voladura a DXF (R12, metros, coordenadas de proyecto con Z):
 * bocas (POINT + CIRCLE de diámetro real), trazas boca→fondo (LINE 3D), etiquetas (TEXT),
 * perímetros (POLYLINE 3D cerrada a la cota de la superficie), caras libres y amarres (LINE).
 */
export function exportDxf(blast: Blast, options: DxfExportOptions = {}): string {
  const w = new DxfWriter();
  const L = DXF_LAYERS;
  const th = options.textHeight ?? 0.6;
  const byId = new Map(blast.holes.map((h) => [h.id, h]));
  for (const h of blast.holes) {
    w.point(L.collars, h.collar);
    w.circle(L.collars, h.collar, h.diameter / 2);
    w.line(L.traces, h.collar, holeToe(h));
    w.text(L.labels, h.collar, th, h.label);
  }
  const top = blast.bench.floorElevation + blast.bench.height;
  for (const b of blast.boundaries) {
    if (b.polygon.length < 3) continue;
    w.closedPolyline(
      L.boundaries,
      b.polygon.map((p) => ({ x: p.x, y: p.y, z: top })),
    );
    const first = b.polygon[0];
    if (first) w.text(L.boundaries, { x: first.x, y: first.y, z: top }, th * 1.5, b.name);
    for (const e of b.freeFaceEdges) {
      const edge = polygonEdge(b.polygon, e);
      if (edge) w.line(L.freeFaces, { ...edge[0], z: top }, { ...edge[1], z: top });
    }
  }
  if (options.ties) {
    for (const c of blast.initiation.connections) {
      if (c.from.kind !== 'hole' || c.to.kind !== 'hole') continue;
      const a = byId.get(c.from.holeId);
      const b = byId.get(c.to.holeId);
      if (a && b) w.line(L.ties, a.collar, b.collar);
    }
  }
  for (const s of options.surfaces ?? []) {
    const v = (i: number): Vec3 => ({
      x: s.vertices[i * 3] ?? 0,
      y: s.vertices[i * 3 + 1] ?? 0,
      z: s.vertices[i * 3 + 2] ?? 0,
    });
    for (let t = 0; t + 2 < s.triangles.length; t += 3) {
      w.face(
        L.surface,
        v(s.triangles[t] ?? 0),
        v(s.triangles[t + 1] ?? 0),
        v(s.triangles[t + 2] ?? 0),
      );
    }
  }
  const layers: string[] = [L.collars, L.traces, L.labels, L.boundaries, L.freeFaces];
  if (options.ties) layers.push(L.ties);
  if (options.surfaces?.length) layers.push(L.surface);
  return w.toString(layers);
}

// ------------------------------------------------------------------ Lectura

export type DxfLayerRole =
  'holeLines' | 'holePoints' | 'boundaries' | 'freeFaces' | 'labels' | 'topography' | 'ignore';

export interface DxfLayerInfo {
  name: string;
  /** Cantidad de entidades por tipo en la capa. */
  counts: Record<string, number>;
  suggested: DxfLayerRole;
}

export interface DxfInspection {
  layers: DxfLayerInfo[];
  entityCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

function parse(text: string): IEntity[] {
  const dxf = new DxfParser().parseSync(text);
  if (!dxf) throw new Error('No se pudo leer el DXF');
  return dxf.entities;
}

function suggestRole(name: string, counts: Record<string, number>): DxfLayerRole {
  const up = name.toUpperCase();
  if (up === DXF_LAYERS.traces) return 'holeLines';
  if (up === DXF_LAYERS.collars) return 'holePoints';
  if (up === DXF_LAYERS.labels) return 'labels';
  if (up === DXF_LAYERS.boundaries) return 'boundaries';
  if (up === DXF_LAYERS.freeFaces) return 'freeFaces';
  if (up === DXF_LAYERS.surface) return 'topography';
  if (up === DXF_LAYERS.ties) return 'ignore';
  const c = (t: string) => counts[t] ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (c('3DFACE') > total / 2) return 'topography';
  if (c('TEXT') + c('MTEXT') > total / 2) return 'labels';
  if (c('LINE') > total / 2) return 'holeLines';
  if (c('POINT') + c('CIRCLE') > total / 2) return 'holePoints';
  if (c('LWPOLYLINE') + c('POLYLINE') > total / 2) return 'boundaries';
  return 'ignore';
}

/** Capas del DXF, entidades por tipo y un rol sugerido para cada una. */
export function inspectDxf(text: string): DxfInspection {
  const entities = parse(text);
  const layers = new Map<string, Record<string, number>>();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const grow = (p: { x: number; y: number } | undefined) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const e of entities) {
    const counts = layers.get(e.layer) ?? {};
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    layers.set(e.layer, counts);
    for (const p of entityPoints(e)) grow(p);
  }
  return {
    layers: [...layers]
      .map(([name, counts]) => ({ name, counts, suggested: suggestRole(name, counts) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    entityCount: entities.length,
    bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
  };
}

function entityPoints(e: IEntity): Vec3[] {
  const z = (p: { x: number; y: number; z?: number }): Vec3 => ({ x: p.x, y: p.y, z: p.z ?? 0 });
  switch (e.type) {
    case 'LINE':
    case '3DFACE':
      return (e as ILineEntity).vertices.map(z);
    case 'POINT':
      return [z((e as IPointEntity).position)];
    case 'CIRCLE':
      return [z((e as ICircleEntity).center)];
    case 'TEXT':
      return [z((e as ITextEntity).startPoint)];
    case 'LWPOLYLINE': {
      const lw = e as ILwpolylineEntity;
      return lw.vertices.map((v) => ({ x: v.x, y: v.y, z: lw.elevation }));
    }
    case 'POLYLINE':
      return (e as IPolylineEntity).vertices.map(z);
    default:
      return [];
  }
}

export interface DxfImportDefaults {
  diameter: number;
  subdrill: number;
  bench: Bench;
  startNumber: number;
  /** Radio de búsqueda de etiquetas y círculos alrededor de la boca [m]. */
  matchRadius?: number;
}

export interface DxfImport {
  holes: Hole[];
  boundaries: { polygon: Polygon2; freeFaceEdges: number[] }[];
  surfaces: Omit<Surface, 'id' | 'name' | 'kind'>[];
  warnings: string[];
}

const PT_TOL = 1e-3;
const same2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < PT_TOL;

/** Construye taladros, perímetros y topografía a partir de las capas y sus roles. */
export function importDxf(
  text: string,
  roles: Readonly<Record<string, DxfLayerRole>>,
  defaults: DxfImportDefaults,
): DxfImport {
  const entities = parse(text);
  const role = (e: IEntity) => roles[e.layer] ?? 'ignore';
  const warnings: string[] = [];
  const radius = defaults.matchRadius ?? 1;
  const top = defaults.bench.floorElevation + defaults.bench.height;

  // Etiquetas y círculos disponibles para asociar a bocas.
  const texts = entities.filter((e): e is ITextEntity => role(e) === 'labels' && e.type === 'TEXT');
  const circles = entities.filter(
    (e): e is ICircleEntity =>
      (role(e) === 'holePoints' || role(e) === 'holeLines') && e.type === 'CIRCLE',
  );
  const nearest = <T>(list: readonly T[], at: (t: T) => Vec2, p: Vec2): T | undefined => {
    let best: T | undefined;
    let bestD = radius;
    for (const t of list) {
      const q = at(t);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  };

  const holes: Hole[] = [];
  let next = defaults.startNumber;
  let flatCount = 0;
  const makeHole = (collar: Vec3, toe: Vec3 | null): Hole => {
    const circle = nearest(circles, (c) => c.center, collar);
    const diameter =
      circle && circle.radius > 0 && circle.radius < 1 ? circle.radius * 2 : defaults.diameter;
    const label = nearest(texts, (t) => t.startPoint, collar)?.text.trim();
    let length: number;
    let inclination = 0;
    let azimuth = 0;
    if (toe) {
      const dx = toe.x - collar.x;
      const dy = toe.y - collar.y;
      const dz = collar.z - toe.z;
      length = Math.hypot(dx, dy, dz);
      const hz = Math.hypot(dx, dy);
      inclination = Math.atan2(hz, dz);
      azimuth = hz > 1e-9 ? unitToAzimuth(dx, dy) : 0;
    } else {
      length = lengthToFloor(collar.z, defaults.bench.floorElevation, defaults.subdrill, 0);
    }
    return {
      id: newId<'Hole'>(),
      label: label !== undefined && label !== '' ? label : String(next++),
      collar,
      diameter,
      length,
      inclination,
      azimuth,
      subdrill: defaults.subdrill,
      decks: [],
      initiators: [],
      status: 'designed',
    };
  };

  // 1) Líneas boca→fondo (la boca es el extremo más alto).
  for (const e of entities) {
    if (role(e) !== 'holeLines') continue;
    let verts: Vec3[] = [];
    if (e.type === 'LINE')
      verts = (e as ILineEntity).vertices.map((v) => ({ x: v.x, y: v.y, z: v.z }));
    else if (e.type === 'POLYLINE' && (e as IPolylineEntity).vertices.length === 2)
      // Los tipos dicen number, pero las polilíneas 2D pueden no traer Z.
      verts = (e as IPolylineEntity).vertices.map((v) => ({
        x: v.x,
        y: v.y,
        z: Number.isFinite(v.z) ? v.z : 0,
      }));
    const [a, b] = verts;
    if (!a || !b) continue;
    if (Math.abs(a.z - b.z) < 1e-6) {
      // Línea 2D: no dice la profundidad → boca en el extremo inicial, taladro vertical al piso.
      flatCount++;
      holes.push(makeHole({ ...a, z: a.z === 0 ? top : a.z }, null));
      continue;
    }
    const [collar, toe] = a.z >= b.z ? [a, b] : [b, a];
    if (holes.some((h) => same2(h.collar, collar))) continue;
    holes.push(makeHole(collar, toe));
  }
  if (flatCount > 0)
    warnings.push(
      `${flatCount} líneas sin diferencia de cota: se tomaron como bocas de taladros verticales.`,
    );

  // 2) Puntos / círculos como bocas (si no hay ya un taladro por línea en esa boca).
  let zeroZ = 0;
  for (const e of entities) {
    if (role(e) !== 'holePoints') continue;
    const p =
      e.type === 'POINT'
        ? (e as IPointEntity).position
        : e.type === 'CIRCLE'
          ? (e as ICircleEntity).center
          : null;
    if (!p) continue;
    if (holes.some((h) => same2(h.collar, p))) continue;
    let z = p.z;
    if (!z) {
      z = top;
      zeroZ++;
    }
    holes.push(makeHole({ x: p.x, y: p.y, z }, null));
  }
  if (zeroZ > 0)
    warnings.push(`${zeroZ} bocas sin cota: se ubicaron en la superficie del banco (${top} m).`);

  // 3) Perímetros: polilíneas cerradas (o que terminan en su inicio).
  const boundaries: DxfImport['boundaries'] = [];
  const faceLines: [Vec2, Vec2][] = [];
  for (const e of entities) {
    const r = role(e);
    if (r === 'freeFaces' && e.type === 'LINE') {
      const [a, b] = (e as ILineEntity).vertices;
      if (a && b) faceLines.push([a, b]);
    }
    if (r !== 'boundaries') continue;
    let pts: Vec2[];
    let closed: boolean;
    if (e.type === 'LWPOLYLINE') {
      const lw = e as ILwpolylineEntity;
      pts = lw.vertices.map((v) => ({ x: v.x, y: v.y }));
      closed = lw.shape;
    } else if (e.type === 'POLYLINE') {
      const pl = e as IPolylineEntity;
      pts = pl.vertices.map((v) => ({ x: v.x, y: v.y }));
      closed = pl.shape;
    } else continue;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first && last && pts.length > 3 && same2(first, last)) {
      pts.pop();
      closed = true;
    }
    if (!closed || pts.length < 3) {
      warnings.push(`Polilínea abierta en la capa "${e.layer}" ignorada como perímetro.`);
      continue;
    }
    boundaries.push({ polygon: pts, freeFaceEdges: [] });
  }
  // Caras libres: aristas del perímetro que coinciden con una línea de la capa de caras libres.
  for (const b of boundaries) {
    for (let i = 0; i < b.polygon.length; i++) {
      const edge = polygonEdge(b.polygon, i);
      if (!edge) continue;
      const [p, q] = edge;
      if (faceLines.some(([a, c]) => (same2(a, p) && same2(c, q)) || (same2(a, q) && same2(c, p))))
        b.freeFaceEdges.push(i);
    }
  }

  // 4) Topografía: 3DFACE → TIN (vértices compartidos por coordenada).
  const faces = entities.filter(
    (e): e is I3DfaceEntity => role(e) === 'topography' && e.type === '3DFACE',
  );
  const surfaces: DxfImport['surfaces'] = [];
  if (faces.length > 0) {
    const vertices: number[] = [];
    const triangles: number[] = [];
    const index = new Map<string, number>();
    const vid = (p: Vec3) => {
      const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
      let i = index.get(key);
      if (i === undefined) {
        i = vertices.length / 3;
        vertices.push(p.x, p.y, p.z);
        index.set(key, i);
      }
      return i;
    };
    for (const f of faces) {
      const v = f.vertices.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      const [a, b, c, d] = v;
      if (!a || !b || !c) continue;
      triangles.push(vid(a), vid(b), vid(c));
      if (d && !(same2(d, c) && Math.abs(d.z - c.z) < PT_TOL))
        triangles.push(vid(a), vid(c), vid(d));
    }
    if (triangles.length > 0) surfaces.push({ vertices, triangles });
  }

  return { holes, boundaries, surfaces, warnings };
}
