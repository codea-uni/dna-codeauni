import { decodeText } from '../io/csv';
import type { TopographyFormat } from '../model/types';
import { mergeTopo } from './assemble';
import type { TopoData } from './data';
import {
  inspectDxfTopography,
  parseDxfTopography,
  type TopoLayerInfo,
  type TopoLayerRole,
} from './dxfTopography';
import { parseLandXml } from './landxml';
import { parsePoints, type PointColumns } from './points';
import { parseSurpac } from './surpac';

/** Archivo tal como lo entrega el navegador. */
export interface TopoFile {
  name: string;
  bytes: Uint8Array;
}

/** Formatos vectoriales que se leen en el núcleo (los ráster y las nubes, en el worker). */
export type VectorTopoFormat = Extract<TopographyFormat, 'dxf' | 'surpac' | 'points' | 'landxml'>;
/** Todo lo que acepta el asistente de importación. */
export type ImportTopoFormat =
  VectorTopoFormat | Extract<TopographyFormat, 'geotiff' | 'image' | 'las'>;

const EXTENSIONS: Record<string, ImportTopoFormat> = {
  dxf: 'dxf',
  str: 'surpac',
  dtm: 'surpac',
  xml: 'landxml',
  landxml: 'landxml',
  csv: 'points',
  txt: 'points',
  xyz: 'points',
  pts: 'points',
  asc: 'points',
  tif: 'geotiff',
  tiff: 'geotiff',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  las: 'las',
  laz: 'las',
};

/** Archivos de mundo (georreferencia de una imagen): acompañan a la imagen, no son un formato. */
const WORLD_FILES = new Set(['jgw', 'jpgw', 'pgw', 'pngw', 'tfw', 'tifw', 'wld', 'wlf']);

const extOf = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/** Formato por extensión (`undefined` si no se reconoce: la web lo informa con claridad). */
export function detectTopoFormat(name: string): ImportTopoFormat | undefined {
  return EXTENSIONS[extOf(name)];
}

export const isVectorFormat = (f: ImportTopoFormat): f is VectorTopoFormat =>
  f === 'dxf' || f === 'surpac' || f === 'points' || f === 'landxml';

/** Archivo de mundo que acompaña a la imagen (mismo nombre o el único que haya). */
export function worldFileFor(files: readonly TopoFile[], imageName: string): TopoFile | undefined {
  const worlds = files.filter((f) => WORLD_FILES.has(extOf(f.name)));
  const base = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase();
  return (
    worlds.find((w) => base(w.name) === base(imageName)) ??
    (worlds.length === 1 ? worlds[0] : undefined)
  );
}

export interface TopoInspection {
  format: ImportTopoFormat | undefined;
  /** Archivos no reconocidos o que no corresponden al formato del conjunto. */
  rejected: string[];
  /** DXF: capas con su rol sugerido. */
  layers?: TopoLayerInfo[];
  /** Puntos: columnas detectadas y las primeras filas, para corregirlas. */
  points?: { columns: PointColumns; hasHeader: boolean; sample: string[] };
  /** EPSG declarado en el archivo (LandXML, GeoTIFF, LAS). */
  epsg?: number;
  /** GeoTIFF: modelo de elevación o imagen, y su tamaño en píxeles (lo completa el worker). */
  raster?: { kind: 'dem' | 'image'; width: number; height: number };
  /** Nube LAS/LAZ: cantidad de puntos, versión y compresión (lo completa el worker). */
  cloud?: { count: number; version: string; compressed: boolean };
  /** Imagen: falta su archivo de mundo. */
  missingWorldFile?: boolean;
}

/**
 * Qué hay en los archivos elegidos: el formato del conjunto (el del primer archivo reconocido),
 * las capas del DXF o las columnas de los puntos. Varios archivos del mismo formato se unen
 * (varios DXF, varios CSV); Surpac admite el `.str` con su `.dtm`.
 */
export function inspectTopography(files: readonly TopoFile[]): TopoInspection {
  const format = files.map((f) => detectTopoFormat(f.name)).find((f) => f !== undefined);
  const companion = (f: TopoFile) =>
    (format === 'image' || format === 'geotiff') && WORLD_FILES.has(extOf(f.name));
  const rejected = files
    .filter((f) => (detectTopoFormat(f.name) !== format || format === undefined) && !companion(f))
    .map((f) => f.name);
  const own = files.filter((f) => format !== undefined && detectTopoFormat(f.name) === format);
  const out: TopoInspection = { format, rejected };
  if (format === 'dxf') {
    const merged = new Map<string, TopoLayerInfo>();
    for (const f of own)
      for (const l of inspectDxfTopography(decodeText(f.bytes).text)) {
        const prev = merged.get(l.name);
        if (!prev) merged.set(l.name, l);
        else
          for (const [k, v] of Object.entries(l.counts)) prev.counts[k] = (prev.counts[k] ?? 0) + v;
      }
    out.layers = [...merged.values()];
  } else if (format === 'points' && own[0]) {
    const p = parsePoints(own[0].bytes);
    out.points = {
      columns: p.columns,
      hasHeader: p.hasHeader,
      sample: decodeText(own[0].bytes).text.split(/\r?\n/, 8),
    };
  } else if (format === 'landxml' && own[0]) {
    const epsg = /epsgCode\s*=\s*"(\d+)"/.exec(decodeText(own[0].bytes).text)?.[1];
    if (epsg) out.epsg = Number(epsg);
  }
  return out;
}

export interface TopoReadOptions {
  /** DXF: rol de cada capa (las no listadas se ignoran). */
  layerRoles?: Record<string, TopoLayerRole>;
  /** Puntos: columnas elegidas (sin ellas, las detectadas). */
  pointColumns?: PointColumns;
}

/** Lee los archivos del formato indicado y une su contenido. */
export function readTopography(
  files: readonly TopoFile[],
  format: VectorTopoFormat,
  options: TopoReadOptions = {},
): TopoData {
  const own = files.filter((f) => detectTopoFormat(f.name) === format);
  const text = (f: TopoFile) => decodeText(f.bytes).text;
  switch (format) {
    case 'dxf':
      return mergeTopo(own.map((f) => parseDxfTopography(text(f), options.layerRoles ?? {})));
    case 'points':
      return mergeTopo(own.map((f) => parsePoints(f.bytes, options.pointColumns)));
    case 'landxml':
      return mergeTopo(own.map((f) => parseLandXml(text(f))));
    case 'surpac': {
      const strs = own.filter((f) => extOf(f.name) === 'str');
      const dtms = own.filter((f) => extOf(f.name) === 'dtm');
      const base = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase();
      return mergeTopo(
        strs.map((s) => {
          const dtm =
            dtms.find((d) => base(d.name) === base(s.name)) ??
            (strs.length === 1 ? dtms[0] : undefined);
          return parseSurpac(text(s), dtm ? text(dtm) : undefined);
        }),
      );
    }
  }
}
