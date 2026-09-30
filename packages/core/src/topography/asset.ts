import { sha256Hex } from './sha256';

/**
 * Assets binarios de topografía (D-16), formato `CRTS`:
 *
 *   'CRTS' | versión u32 | largo del encabezado u32 | encabezado JSON (UTF-8) | relleno a 8 bytes |
 *   secciones (arreglos tipados alineados a 8 bytes, en el orden del encabezado)
 *
 * Coordenadas en metros del CRS del levantamiento, en float64 (UTM no cabe en float32). Los
 * arreglos decodificados son vistas sobre el mismo buffer: no se copian.
 */

/** Triangulación: vértices x, y, z intercalados y triángulos como índices de vértice. */
export interface TinData {
  vertices: Float64Array;
  triangles: Uint32Array;
}

/** Roles de las líneas de referencia (índice = código en `LineSetData.roles`). */
export const LINE_ROLES = ['contour', 'crest', 'toe', 'breakline', 'other'] as const;
export type LineRole = (typeof LINE_ROLES)[number];

/**
 * Polilíneas 3D: `coords` x, y, z intercalados; la línea i va de los puntos `offsets[i]` a
 * `offsets[i+1] - 1`; `roles[i]` indexa `LINE_ROLES`; `closed[i]` = 1 si es cerrada.
 */
export interface LineSetData {
  coords: Float64Array;
  offsets: Uint32Array;
  roles: Uint8Array;
  closed: Uint8Array;
}

/** Georreferencia de una imagen: esquina superior izquierda, tamaño de píxel y giro. */
export interface ImageGeoref {
  originX: number;
  originY: number;
  /** Metros por píxel en X (positivo) y en Y (negativo si las filas crecen hacia el Sur). */
  pixelSizeX: number;
  pixelSizeY: number;
  /** Giro en radianes (0 = norte arriba). */
  rotation: number;
}

/** Ortofoto: la imagen codificada (WebP, JPEG o PNG) y su georreferencia. */
export interface OrthoImageData {
  mime: string;
  width: number;
  height: number;
  georef: ImageGeoref;
  bytes: Uint8Array;
}

export type TopographyAsset =
  | { kind: 'tin'; tin: TinData }
  | { kind: 'lines'; lines: LineSetData }
  | { kind: 'image'; image: OrthoImageData };

type SectionType = 'f64' | 'u32' | 'u8';
interface Section {
  name: string;
  type: SectionType;
  length: number;
}
interface Header {
  kind: TopographyAsset['kind'];
  sections: Section[];
  meta?: Record<string, unknown>;
}

const MAGIC = 0x53545243; // 'CRTS' en little-endian
const VERSION = 1;
const BYTES: Record<SectionType, number> = { f64: 8, u32: 4, u8: 1 };
const align8 = (n: number) => Math.ceil(n / 8) * 8;

type Arr = Float64Array | Uint32Array | Uint8Array;

function sectionsOf(asset: TopographyAsset): { header: Header; arrays: Arr[] } {
  switch (asset.kind) {
    case 'tin':
      return {
        header: {
          kind: 'tin',
          sections: [
            { name: 'vertices', type: 'f64', length: asset.tin.vertices.length },
            { name: 'triangles', type: 'u32', length: asset.tin.triangles.length },
          ],
        },
        arrays: [asset.tin.vertices, asset.tin.triangles],
      };
    case 'lines':
      return {
        header: {
          kind: 'lines',
          sections: [
            { name: 'coords', type: 'f64', length: asset.lines.coords.length },
            { name: 'offsets', type: 'u32', length: asset.lines.offsets.length },
            { name: 'roles', type: 'u8', length: asset.lines.roles.length },
            { name: 'closed', type: 'u8', length: asset.lines.closed.length },
          ],
        },
        arrays: [asset.lines.coords, asset.lines.offsets, asset.lines.roles, asset.lines.closed],
      };
    case 'image': {
      const { bytes, ...meta } = asset.image;
      return {
        header: {
          kind: 'image',
          sections: [{ name: 'bytes', type: 'u8', length: bytes.length }],
          meta: { ...meta },
        },
        arrays: [bytes],
      };
    }
  }
}

export function encodeAsset(asset: TopographyAsset): Uint8Array {
  const { header, arrays } = sectionsOf(asset);
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  let size = align8(12 + headerBytes.length);
  for (const s of header.sections) size = align8(size + s.length * BYTES[s.type]);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, headerBytes.length, true);
  out.set(headerBytes, 12);
  let offset = align8(12 + headerBytes.length);
  header.sections.forEach((s, i) => {
    const arr = arrays[i];
    if (!arr) return;
    out.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), offset);
    offset = align8(offset + s.length * BYTES[s.type]);
  });
  return out;
}

/** Decodifica un asset `CRTS`. Lanza si el contenido no es válido. */
export function decodeAsset(bytes: Uint8Array): TopographyAsset {
  if (bytes.byteLength < 12) throw new Error('Asset de topografía vacío o truncado');
  // Las vistas tipadas exigen alineación: si el buffer no empieza alineado, se copia una vez.
  const data = bytes.byteOffset % 8 === 0 ? bytes : bytes.slice();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('No es un asset de topografía (CRTS)');
  if (view.getUint32(4, true) !== VERSION) throw new Error('Versión de asset no soportada');
  const headerLen = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(data.subarray(12, 12 + headerLen))) as Header;
  let offset = align8(12 + headerLen);
  const out: Record<string, Arr> = {};
  for (const s of header.sections) {
    const byteLength = s.length * BYTES[s.type];
    if (offset + byteLength > data.byteLength) throw new Error('Asset de topografía truncado');
    const start = data.byteOffset + offset;
    out[s.name] =
      s.type === 'f64'
        ? new Float64Array(data.buffer, start, s.length)
        : s.type === 'u32'
          ? new Uint32Array(data.buffer, start, s.length)
          : new Uint8Array(data.buffer, start, s.length);
    offset = align8(offset + byteLength);
  }
  const get = (name: string): Arr => {
    const a = out[name];
    if (!a) throw new Error(`Falta la sección ${name}`);
    return a;
  };
  const f64 = (name: string) => get(name) as Float64Array;
  const u32 = (name: string) => get(name) as Uint32Array;
  const u8 = (name: string) => get(name) as Uint8Array;
  switch (header.kind) {
    case 'tin':
      return { kind: 'tin', tin: { vertices: f64('vertices'), triangles: u32('triangles') } };
    case 'lines':
      return {
        kind: 'lines',
        lines: {
          coords: f64('coords'),
          offsets: u32('offsets'),
          roles: u8('roles'),
          closed: u8('closed'),
        },
      };
    case 'image': {
      const meta = header.meta as Omit<OrthoImageData, 'bytes'>;
      return { kind: 'image', image: { ...meta, bytes: u8('bytes') } };
    }
    default:
      throw new Error('Tipo de asset desconocido');
  }
}

/** Identificador de contenido: SHA-256 en hexadecimal. */
export function assetHash(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** Base64 (para embeber assets en un `.cronos.json`). Funciona en navegador, worker y Node. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
