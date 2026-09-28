import { z } from 'zod';
import { polygonEdge } from '../geometry/boundary';
import { holeToe } from '../geometry/hole';
import type { Blast, Polygon2, Vec2 } from '../model/types';
import {
  DEFAULT_CSV_UNITS,
  detectThousands,
  guessHoleMapping,
  importHolesFromCsv,
  parseNumber,
  positionalHoleMapping,
  type CsvTable,
  type HoleCsvDefaults,
  type HoleCsvImport,
} from './csv';

/**
 * GeoJSON de entrada y salida (R-01, H-202, `docs/theory/03 §4`). Convención de Cronos:
 * - Point [E, N, Z?] = taladro; propiedades opcionales `label`, `diameter_mm`, `length_m`,
 *   `inclination_deg`, `azimuth_deg`, `subdrill_m`, `group`.
 * - Polygon = perímetro; `free_face_edges` (índices de aristas) marca la cara libre.
 * - LineString = cara libre: marca las aristas de perímetro que coinciden.
 * Las coordenadas están en el CRS del proyecto (proyectadas, m). Cronos no reproyecta: un archivo en
 * longitud/latitud (RFC 7946) se rechaza con un mensaje claro.
 */

const position = z.array(z.number()).min(2);
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: position }),
  z.object({ type: z.literal('MultiPoint'), coordinates: z.array(position) }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(position) }),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(position)) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(z.array(position))),
  }),
]);
type Geometry = z.infer<typeof geometry>;
const feature = z.object({
  type: z.literal('Feature'),
  geometry: geometry.nullable(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
});
const crsMember = z.object({ properties: z.object({ name: z.string() }).optional() }).optional();
const document = z.union([
  z.object({ type: z.literal('FeatureCollection'), features: z.array(feature), crs: crsMember }),
  feature.extend({ crs: crsMember }),
]);

export interface GeoJsonImport extends Omit<HoleCsvImport, 'errors'> {
  boundaries: { polygon: Polygon2; freeFaceEdges: number[] }[];
  errors: string[];
}

const PT_TOL = 1e-3;
const same2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < PT_TOL;
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** EPSG del miembro `crs` (GeoJSON 2008), p. ej. «urn:ogc:def:crs:EPSG::32718» o «EPSG:32718». */
function epsgOf(name: string | undefined): number | undefined {
  const m = name ? /EPSG:{1,2}(\d+)/i.exec(name) : null;
  return m ? Number(m[1]) : undefined;
}

export function importGeoJson(source: string, defaults: HoleCsvDefaults): GeoJsonImport {
  const empty: GeoJsonImport = { holes: [], boundaries: [], warnings: [], groups: [], errors: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return { ...empty, errors: ['El archivo no es JSON válido.'] };
  }
  const parsed = document.safeParse(raw);
  if (!parsed.success)
    return { ...empty, errors: ['No es un GeoJSON (Feature o FeatureCollection) válido.'] };
  const doc = parsed.data;
  const features = doc.type === 'FeatureCollection' ? doc.features : [doc];

  const points: { coords: number[]; props: Record<string, unknown> }[] = [];
  const polygons: { ring: Vec2[]; props: Record<string, unknown> }[] = [];
  const lines: Vec2[][] = [];
  const all: number[][] = [];
  const add = (g: Geometry, props: Record<string, unknown>) => {
    const xy = (p: number[]): Vec2 => ({ x: p[0] ?? NaN, y: p[1] ?? NaN });
    switch (g.type) {
      case 'Point':
        points.push({ coords: g.coordinates, props });
        all.push(g.coordinates);
        break;
      case 'MultiPoint':
        for (const c of g.coordinates) points.push({ coords: c, props });
        all.push(...g.coordinates);
        break;
      case 'LineString':
        lines.push(g.coordinates.map(xy));
        all.push(...g.coordinates);
        break;
      case 'MultiLineString':
        for (const l of g.coordinates) lines.push(l.map(xy));
        all.push(...g.coordinates.flat());
        break;
      case 'Polygon':
      case 'MultiPolygon':
        for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
          const outer = poly[0] ?? []; // los huecos no se usan como perímetro
          polygons.push({ ring: outer.map(xy), props });
          all.push(...outer);
        }
    }
  };
  for (const f of features) if (f.geometry) add(f.geometry, f.properties ?? {});

  if (all.length > 0 && all.every(([x = 0, y = 0]) => Math.abs(x) <= 180 && Math.abs(y) <= 90))
    return {
      ...empty,
      errors: [
        'El GeoJSON parece estar en longitud/latitud (WGS 84). Cronos no reproyecta: expórtalo en el CRS del proyecto (coordenadas UTM en metros).',
      ],
    };

  const warnings: GeoJsonImport['warnings'] = [];
  const fileEpsg = epsgOf(doc.crs?.properties?.name);
  if (fileEpsg !== undefined && defaults.epsg !== undefined && fileEpsg !== defaults.epsg)
    warnings.push({
      kind: 'outOfCrs',
      message: `El archivo declara EPSG ${String(fileEpsg)} y el proyecto usa EPSG ${String(defaults.epsg)}; Cronos no reproyecta.`,
      labels: [],
    });

  // Taladros: por el importador de CSV (duplicados, cotas, Norte/Este, grupos).
  const headers = ['label', 'x', 'y', 'z', 'diameter', 'length', 'inclination', 'azimuth'];
  headers.push('subdrill', 'group');
  const table: CsvTable = {
    delimiter: ',',
    hasHeader: true,
    headers,
    rows: points.map(({ coords, props: p }) => [
      text(p.label ?? p.id ?? p.name),
      text(coords[0]),
      text(coords[1]),
      text(coords[2]),
      text(p.diameter_mm),
      text(p.length_m),
      text(p.inclination_deg),
      text(p.azimuth_deg),
      text(p.subdrill_m),
      text(p.group),
    ]),
  };
  const holes = importHolesFromCsv(table, guessHoleMapping(headers), DEFAULT_CSV_UNITS, defaults);

  const boundaries: GeoJsonImport['boundaries'] = [];
  for (const { ring, props } of polygons) {
    const pts = ring.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first && last && pts.length > 1 && same2(first, last)) pts.pop();
    if (pts.length < 3) continue;
    const listed = Array.isArray(props.free_face_edges)
      ? props.free_face_edges.filter(
          (i): i is number =>
            Number.isInteger(i) && (i as number) >= 0 && (i as number) < pts.length,
        )
      : [];
    boundaries.push({ polygon: pts, freeFaceEdges: listed });
  }
  for (const b of boundaries)
    for (let i = 0; i < b.polygon.length; i++) {
      const edge = polygonEdge(b.polygon, i);
      if (!edge || b.freeFaceEdges.includes(i)) continue;
      const [p, q] = edge;
      const onLine = lines.some((l) =>
        l.some((a, k) => {
          const c = l[k + 1];
          return c !== undefined && ((same2(a, p) && same2(c, q)) || (same2(a, q) && same2(c, p)));
        }),
      );
      if (onLine) b.freeFaceEdges.push(i);
    }

  return {
    ...holes,
    boundaries,
    warnings: [...warnings, ...holes.warnings],
    errors: holes.errors.map((e) => `Punto ${String(e.line - 1)}: ${e.message}`),
  };
}

/** Exporta taladros, perímetros y caras libres de la voladura (convención de `importGeoJson`). */
export function exportGeoJson(blast: Blast, epsg?: number): string {
  const r = (v: number, d = 4) => Number(v.toFixed(d));
  const groupName = new Map(blast.groups.map((g) => [g.id, g.name]));
  const features: unknown[] = [];
  for (const h of blast.holes) {
    const toe = holeToe(h);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r(h.collar.x), r(h.collar.y), r(h.collar.z)] },
      properties: {
        label: h.label,
        diameter_mm: r(h.diameter * 1000, 3),
        length_m: r(h.length),
        inclination_deg: r((h.inclination * 180) / Math.PI, 7),
        azimuth_deg: r((h.azimuth * 180) / Math.PI, 7),
        subdrill_m: r(h.subdrill),
        ...(h.groupId && groupName.has(h.groupId) ? { group: groupName.get(h.groupId) } : {}),
        toe: [r(toe.x), r(toe.y), r(toe.z)],
      },
    });
  }
  for (const b of blast.boundaries) {
    const ring = [...b.polygon, b.polygon[0]].filter((p): p is Vec2 => p !== undefined);
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring.map((p) => [r(p.x), r(p.y)])] },
      properties: { name: b.name, free_face_edges: b.freeFaceEdges },
    });
    for (const i of b.freeFaceEdges) {
      const edge = polygonEdge(b.polygon, i);
      if (edge)
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: edge.map((p) => [r(p.x), r(p.y)]) },
          properties: { kind: 'free-face', boundary: b.name },
        });
    }
  }
  return JSON.stringify({
    type: 'FeatureCollection',
    // Miembro `crs` de GeoJSON 2008: RFC 7946 lo retiró, pero QGIS y otros lo leen.
    ...(epsg === undefined
      ? {}
      : { crs: { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${String(epsg)}` } } }),
    features,
  });
}

/**
 * Perímetros desde CSV (R-01): columnas Este y Norte, y opcionalmente un ID que separa polígonos
 * (filas consecutivas con el mismo ID forman un polígono). Sin encabezado: «ID, Este, Norte» o
 * «Este, Norte».
 */
export function importBoundariesFromCsv(table: CsvTable): {
  boundaries: { polygon: Polygon2; freeFaceEdges: number[] }[];
  errors: string[];
} {
  const mapping = table.hasHeader
    ? guessHoleMapping(table.headers)
    : positionalHoleMapping(table.rows[0] ?? []);
  const { x: xi, y: yi, label: li } = mapping;
  if (xi === undefined || yi === undefined)
    return { boundaries: [], errors: ['No se encontraron las columnas Este y Norte.'] };
  const groups: { id: string; pts: Vec2[] }[] = [];
  const errors: string[] = [];
  const thousands = detectThousands(table.rows);
  table.rows.forEach((row, r) => {
    const x = parseNumber(row[xi], thousands);
    const y = parseNumber(row[yi], thousands);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      errors.push(`Línea ${String(r + (table.hasHeader ? 2 : 1))}: Este o Norte no numéricos`);
      return;
    }
    const id = li === undefined ? '' : (row[li] ?? '').trim();
    const current = groups[groups.length - 1];
    if (current?.id === id) current.pts.push({ x, y });
    else groups.push({ id, pts: [{ x, y }] });
  });
  const boundaries: { polygon: Polygon2; freeFaceEdges: number[] }[] = [];
  for (const g of groups) {
    const first = g.pts[0];
    const last = g.pts[g.pts.length - 1];
    if (first && last && g.pts.length > 3 && same2(first, last)) g.pts.pop();
    if (g.pts.length < 3) errors.push(`Polígono «${g.id}» con menos de 3 vértices: ignorado`);
    else boundaries.push({ polygon: g.pts, freeFaceEdges: [] });
  }
  return { boundaries, errors };
}
