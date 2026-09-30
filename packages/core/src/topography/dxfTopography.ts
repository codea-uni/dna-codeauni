import type { I3DfaceEntity, ILwpolylineEntity, IPointEntity, IPolylineEntity } from 'dxf-parser';
import { entityPoints, parseDxfEntities } from '../io/dxf';
import type { LineRole } from './asset';
import type { TopoData } from './data';

/** Rol de una capa del DXF en la topografía. */
export type TopoLayerRole = 'tin' | 'points' | LineRole | 'ignore';

export interface TopoLayerInfo {
  name: string;
  counts: Record<string, number>;
  suggested: TopoLayerRole;
}

/** Rol sugerido por el nombre de la capa (español/inglés habituales) y sus entidades. */
export function suggestTopoRole(name: string, counts: Record<string, number>): TopoLayerRole {
  const c = (t: string) => counts[t] ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  if (c('3DFACE') > total / 2) return 'tin';
  if (/cresta|crest/i.test(name)) return 'crest';
  if (/\bpie\b|toe/i.test(name)) return 'toe';
  if (/quiebre|break/i.test(name)) return 'breakline';
  if (/curv|contour|cn_|_cn|isolin/i.test(name)) return 'contour';
  if (c('POINT') > total / 2) return 'points';
  if (c('LWPOLYLINE') + c('POLYLINE') + c('LINE') > total / 2)
    return /topo|terreno|superf/i.test(name) ? 'contour' : 'other';
  return 'ignore';
}

/** Capas del DXF con sus entidades y el rol topográfico sugerido. */
export function inspectDxfTopography(text: string): TopoLayerInfo[] {
  const layers = new Map<string, Record<string, number>>();
  for (const e of parseDxfEntities(text)) {
    const counts = layers.get(e.layer) ?? {};
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    layers.set(e.layer, counts);
  }
  return [...layers]
    .map(([name, counts]) => ({ name, counts, suggested: suggestTopoRole(name, counts) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Topografía de un DXF: 3DFACE como triangulación; POLYLINE/LWPOLYLINE/LINE como líneas (curvas
 * con su cota, cresta, pie, quiebres); POINT como puntos. La cota de una LWPOLYLINE es su
 * `elevation` (curvas de nivel 2D, el caso más común).
 */
export function parseDxfTopography(text: string, roles: Record<string, TopoLayerRole>): TopoData {
  const data: TopoData & { points: number[] } = { points: [], lines: [], warnings: [] };
  const vertices: number[] = [];
  const triangles: number[] = [];
  const vIndex = new Map<string, number>();
  const vertexOf = (p: { x: number; y: number; z?: number }) => {
    const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${(p.z ?? 0).toFixed(4)}`;
    let i = vIndex.get(key);
    if (i === undefined) {
      i = vertices.length / 3;
      vIndex.set(key, i);
      vertices.push(p.x, p.y, zOf(p));
    }
    return i;
  };
  // Algunos exportadores omiten la cota (código 30): llega sin `z`.
  const zOf = (p: { z?: number }) => p.z ?? 0;
  let flat = 0;
  for (const e of parseDxfEntities(text)) {
    const role = roles[e.layer] ?? 'ignore';
    if (role === 'ignore') continue;
    if (role === 'tin' && e.type === '3DFACE') {
      const v = (e as I3DfaceEntity).vertices;
      const [a, b, c, d] = v;
      if (!a || !b || !c) continue;
      triangles.push(vertexOf(a), vertexOf(b), vertexOf(c));
      if (d && (d.x !== c.x || d.y !== c.y || zOf(d) !== zOf(c)))
        triangles.push(vertexOf(a), vertexOf(c), vertexOf(d));
      continue;
    }
    if (role === 'points' || e.type === 'POINT') {
      const p = (e as IPointEntity).position;
      if (e.type === 'POINT') data.points.push(p.x, p.y, zOf(p));
      else for (const q of entityPoints(e)) data.points.push(q.x, q.y, q.z);
      continue;
    }
    if (role === 'tin') continue;
    const pts = entityPoints(e);
    if (pts.length < 2) continue;
    // `shape` (bandera 70 = 1) falta en el objeto si el archivo no trae la bandera.
    const closed =
      (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') &&
      (e as Partial<ILwpolylineEntity | IPolylineEntity>).shape === true;
    if (pts.every((p) => p.z === 0)) flat++;
    data.lines.push({ coords: pts.flatMap((p) => [p.x, p.y, p.z]), role, closed });
  }
  if (triangles.length > 0)
    data.faces = { vertices: Float64Array.from(vertices), triangles: Uint32Array.from(triangles) };
  if (flat > 0) data.warnings.push({ code: 'dxf.flatLines', params: { n: flat } });
  return data;
}
