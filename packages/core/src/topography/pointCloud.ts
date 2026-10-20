import { decodeText, parseNumber } from '../io/csv';
import type { PointCloudData } from './asset';

/**
 * Nubes de puntos para ver (sin triangular): conservan túneles, voladizos y el color del escaneo.
 * Se reducen tomando uno de cada `paso` puntos hasta `maxPoints`: los escáneres guardan los puntos
 * en orden de barrido, así que el muestreo regular reparte la reducción por toda la nube.
 */

/** Puntos que se guardan como máximo por defecto (≈ 30 MB de asset; fluido en PC y en el Quest). */
export const DEFAULT_CLOUD_MAX_POINTS = 2_000_000;

/** Paso de muestreo para dejar a lo sumo `maxPoints` de `count`. */
export function cloudStride(count: number, maxPoints: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, maxPoints)));
}

/** Origen local: el primer punto redondeado al metro (float32 conserva milímetros a varios km). */
function originOf(x: number, y: number, z: number): [number, number, number] {
  return [Math.floor(x), Math.floor(y), Math.floor(z)];
}

export interface CloudTextColumns {
  x: number;
  y: number;
  z: number;
  /** Columnas de color (0–255); ausentes si la nube no trae color. */
  r?: number;
  g?: number;
  b?: number;
}

const COLUMN_RE: [keyof CloudTextColumns, RegExp][] = [
  ['x', /^(x|e|este|easting|east)$/i],
  ['y', /^(y|n|norte|northing|north)$/i],
  ['z', /^(z|h|cota|elev|elevacion|elevación|elevation|altura|rl)$/i],
  ['r', /^(r|red|rojo)$/i],
  ['g', /^(g|green|verde)$/i],
  ['b', /^(b|blue|azul)$/i],
];

/** «X (m)» → «x»: sin unidades entre paréntesis ni corchetes. */
const cleanHeader = (h: string) =>
  h
    .replace(/[([].*?[)\]]/g, '')
    .replace(/^"|"$/g, '')
    .trim();

/**
 * Nube en texto (XYZ, XYZRGB, PTS, CSV): separador, encabezado y columnas automáticos. Sin
 * encabezado: X Y Z en las tres primeras columnas y, si hay seis o más, R G B en las siguientes.
 */
export function parseCloudText(
  bytes: Uint8Array,
  maxPoints = DEFAULT_CLOUD_MAX_POINTS,
): PointCloudData & { columns: CloudTextColumns } {
  const { text } = decodeText(bytes);
  const lines = text.split(/\r?\n/);
  let first = 0;
  while (first < lines.length && (lines[first]?.trim() ?? '') === '') first++;
  const head = lines[first] ?? '';
  const delimiter = ['\t', ';', ','].find((d) => head.includes(d)) ?? ' ';
  const split = (l: string) =>
    delimiter === ' ' ? l.trim().split(/\s+/) : l.split(delimiter).map((c) => c.trim());
  const headCells = split(head);
  const hasHeader = headCells.some((c) => c !== '' && !Number.isFinite(parseNumber(c)));
  let columns: CloudTextColumns = { x: 0, y: 1, z: 2 };
  if (hasHeader) {
    const found: Partial<CloudTextColumns> = {};
    headCells.forEach((h, i) => {
      const name = cleanHeader(h);
      for (const [key, re] of COLUMN_RE)
        if (re.test(name) && found[key] === undefined) found[key] = i;
    });
    if (found.x !== undefined && found.y !== undefined && found.z !== undefined)
      columns = found as CloudTextColumns;
  } else if (headCells.length >= 6) {
    columns = { x: 0, y: 1, z: 2, r: 3, g: 4, b: 5 };
  }
  const withColor = columns.r !== undefined && columns.g !== undefined && columns.b !== undefined;

  const rows: string[] = [];
  for (let i = hasHeader ? first + 1 : first; i < lines.length; i++) {
    const l = lines[i];
    if (l && l.trim() !== '' && !l.trimStart().startsWith('#')) rows.push(l);
  }
  const stride = cloudStride(rows.length, maxPoints);
  const kept = Math.ceil(rows.length / stride);
  const positions = new Float32Array(kept * 3);
  const colors = withColor ? new Uint8Array(kept * 3) : undefined;
  let origin: [number, number, number] | undefined;
  let n = 0;
  for (let i = 0; i < rows.length; i += stride) {
    const c = split(rows[i] ?? '');
    const x = parseNumber(c[columns.x]);
    const y = parseNumber(c[columns.y]);
    const z = parseNumber(c[columns.z]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    origin ??= originOf(x, y, z);
    positions[n * 3] = x - origin[0];
    positions[n * 3 + 1] = y - origin[1];
    positions[n * 3 + 2] = z - origin[2];
    if (colors && columns.r !== undefined && columns.g !== undefined && columns.b !== undefined) {
      colors[n * 3] = clampByte(parseNumber(c[columns.r]));
      colors[n * 3 + 1] = clampByte(parseNumber(c[columns.g]));
      colors[n * 3 + 2] = clampByte(parseNumber(c[columns.b]));
    }
    n++;
  }
  return {
    origin: origin ?? [0, 0, 0],
    positions: positions.subarray(0, n * 3),
    ...(colors ? { colors: colors.subarray(0, n * 3) } : {}),
    sourcePoints: rows.length,
    columns,
  };
}

const clampByte = (v: number) =>
  Number.isFinite(v) ? Math.min(255, Math.max(0, Math.round(v))) : 0;

// ===================== IBPC =====================

/**
 * Nube binaria `.ibpc` (exportada por el software de escaneo de las voladuras de prueba). Formato
 * deducido de los archivos, little-endian:
 *
 *   u16 versión (3) | u32 puntos | f64 origen X, Y, Z | 6 bytes | f32 mínX, máxX, mínY, máxY,
 *   mínZ, máxZ | u32 con color (1) | relleno hasta 100 bytes |
 *   X, Y, Z float32 intercalados, relativos al origen | R, G, B u8 intercalados (si hay color)
 *
 * El tamaño del archivo lo confirma: 100 + 15·n con color, 100 + 12·n sin color.
 */
export const IBPC_HEADER_BYTES = 100;

export interface IbpcHeader {
  version: number;
  count: number;
  origin: [number, number, number];
  hasColor: boolean;
}

export function readIbpcHeader(header: Uint8Array, fileSize: number): IbpcHeader {
  if (header.byteLength < IBPC_HEADER_BYTES) throw new Error('Archivo .ibpc truncado');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const version = view.getUint16(0, true);
  const count = view.getUint32(2, true);
  const origin: [number, number, number] = [
    view.getFloat64(6, true),
    view.getFloat64(14, true),
    view.getFloat64(22, true),
  ];
  const body = fileSize - IBPC_HEADER_BYTES;
  const hasColor = body === count * 15;
  if (!hasColor && body !== count * 12)
    throw new Error(`El .ibpc no cuadra: ${String(count)} puntos en ${String(fileSize)} bytes`);
  if (!origin.every(Number.isFinite)) throw new Error('El .ibpc no tiene un origen válido');
  return { version, count, origin, hasColor };
}

/** Lee `length` bytes desde `offset` (un `File.slice` en el navegador, un buffer en las pruebas). */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

/**
 * Lee un `.ibpc` por partes (sin cargar el archivo entero: los de un tajo pasan de 500 MB) y lo
 * reduce a `maxPoints`. `onProgress` recibe la fracción leída (0–1).
 */
export async function readIbpc(
  read: ByteReader,
  fileSize: number,
  maxPoints = DEFAULT_CLOUD_MAX_POINTS,
  onProgress?: (fraction: number) => void,
): Promise<PointCloudData> {
  const h = readIbpcHeader(await read(0, IBPC_HEADER_BYTES), fileSize);
  const stride = cloudStride(h.count, maxPoints);
  const kept = Math.ceil(h.count / stride);
  const positions = new Float32Array(kept * 3);
  const colors = h.hasColor ? new Uint8Array(kept * 3) : undefined;
  // Bloques de puntos múltiplos del paso: el muestreo no depende del tamaño del bloque.
  const block = stride * Math.max(1, Math.floor(4_000_000 / stride));
  const total = h.hasColor ? 2 * h.count : h.count;
  let done = 0;
  for (let start = 0; start < h.count; start += block) {
    const n = Math.min(block, h.count - start);
    const bytes = await read(IBPC_HEADER_BYTES + start * 12, n * 12);
    const src = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < n; i += stride) {
      const k = (start + i) / stride;
      positions[k * 3] = src.getFloat32(i * 12, true);
      positions[k * 3 + 1] = src.getFloat32(i * 12 + 4, true);
      positions[k * 3 + 2] = src.getFloat32(i * 12 + 8, true);
    }
    done += n;
    onProgress?.(done / total);
  }
  if (colors) {
    const colorStart = IBPC_HEADER_BYTES + h.count * 12;
    for (let start = 0; start < h.count; start += block) {
      const n = Math.min(block, h.count - start);
      const bytes = await read(colorStart + start * 3, n * 3);
      for (let i = 0; i < n; i += stride) {
        const k = (start + i) / stride;
        colors[k * 3] = bytes[i * 3] ?? 0;
        colors[k * 3 + 1] = bytes[i * 3 + 1] ?? 0;
        colors[k * 3 + 2] = bytes[i * 3 + 2] ?? 0;
      }
      done += n;
      onProgress?.(done / total);
    }
  }
  return {
    origin: h.origin,
    positions,
    ...(colors ? { colors } : {}),
    sourcePoints: h.count,
  };
}
