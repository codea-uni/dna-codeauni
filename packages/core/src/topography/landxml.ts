import { XMLParser } from 'fast-xml-parser';
import type { TopoData, TopoLine } from './data';

/** Pies internacionales y pies de agrimensura de EE. UU. a metros (definiciones exactas). */
const FOOT = 0.3048;
const US_SURVEY_FOOT = 1200 / 3937;

type Node = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const obj = (v: unknown): Node => (typeof v === 'object' && v !== null ? (v as Node) : {});
const str = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';
const textOf = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : str(obj(v)['#text']);

/**
 * LandXML 1.x/2.0 (Civil 3D, software de dron): `Surfaces/Surface/Definition` con `Pnts/P`
 * («norte este cota», en ese orden según el esquema de LandXML) y `Faces/F` (tres ids de punto),
 * más `Breaklines`. Convierte pies a metros según `Units`. Usa un lector XML en JS puro porque en
 * los workers no hay `DOMParser`.
 */
export function parseLandXml(text: string): TopoData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
  });
  const root = obj(obj(parser.parse(text)).LandXML);
  const data: TopoData = { points: [], lines: [], warnings: [] };
  if (Object.keys(root).length === 0) {
    data.warnings.push({ code: 'landxml.notLandXml' });
    return data;
  }
  const units = obj(root.Units);
  const imperial = obj(units.Imperial);
  const linear = str(imperial['@_linearUnit']);
  const k = Object.keys(imperial).length === 0 ? 1 : /survey/i.test(linear) ? US_SURVEY_FOOT : FOOT;
  if (k !== 1) data.warnings.push({ code: 'landxml.feet' });
  const epsg = Number(obj(root.CoordinateSystem)['@_epsgCode']);
  if (Number.isInteger(epsg) && epsg > 0) data.epsg = epsg;

  const vertices: number[] = [];
  const triangles: number[] = [];
  for (const surface of asArray(obj(root.Surfaces).Surface)) {
    const def = obj(obj(surface).Definition);
    const ids = new Map<string, number>();
    for (const p of asArray(obj(def.Pnts).P)) {
      const [n, e, z] = textOf(p).trim().split(/\s+/).map(Number);
      if (
        n === undefined ||
        e === undefined ||
        z === undefined ||
        ![n, e, z].every(Number.isFinite)
      )
        continue;
      ids.set(str(obj(p)['@_id']) || String(ids.size + 1), vertices.length / 3);
      vertices.push(e * k, n * k, z * k);
    }
    for (const f of asArray(obj(def.Faces).F)) {
      if (obj(f)['@_i'] === '1') continue; // cara invisible (hueco)
      const v = textOf(f)
        .trim()
        .split(/\s+/)
        .map((id) => ids.get(id));
      const [a, b, c] = v;
      if (a !== undefined && b !== undefined && c !== undefined) triangles.push(a, b, c);
    }
    for (const bl of asArray(
      obj(obj(surface).SourceData).Breaklines
        ? obj(obj(obj(surface).SourceData).Breaklines).Breakline
        : undefined,
    )) {
      const nums = textOf(obj(bl).PntList3D).trim().split(/\s+/).map(Number);
      const coords: number[] = [];
      for (let i = 0; i + 2 < nums.length; i += 3)
        coords.push((nums[i + 1] ?? 0) * k, (nums[i] ?? 0) * k, (nums[i + 2] ?? 0) * k);
      if (coords.length >= 6)
        data.lines.push({ coords, role: 'breakline', closed: false } satisfies TopoLine);
    }
  }
  if (triangles.length > 0)
    data.faces = { vertices: Float64Array.from(vertices), triangles: Uint32Array.from(triangles) };
  else data.points = vertices;
  if (vertices.length === 0) data.warnings.push({ code: 'landxml.noSurface' });
  return data;
}
