/**
 * Nubes de puntos LAS 1.0–1.4 (ASPRS «LAS Specification» 1.4 R15): encabezado, sistema de
 * coordenadas (GeoKeys o WKT) y registros de punto con X, Y, Z enteros escalados. Las coordenadas
 * se reconstruyen en Float64 (`X·escala + desplazamiento`): en UTM, Float32 perdería centímetros.
 */

export interface LasHeader {
  version: string;
  pointFormat: number;
  recordLength: number;
  count: number;
  offsetToPoints: number;
  scale: [number, number, number];
  offset: [number, number, number];
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  /** Puntos comprimidos (LAZ): los descomprime el worker. */
  compressed: boolean;
  epsg?: number;
}

const decoder = new TextDecoder();

/** EPSG del directorio de GeoKeys (ProjectedCSType 3072 o GeographicType 2048). */
function epsgFromGeoKeys(view: DataView, at: number, length: number): number | undefined {
  const n = view.getUint16(at + 6, true);
  let geographic: number | undefined;
  for (let k = 0; k < n && at + 8 + k * 8 + 8 <= at + length; k++) {
    const e = at + 8 + k * 8;
    const id = view.getUint16(e, true);
    const location = view.getUint16(e + 2, true);
    const value = view.getUint16(e + 6, true);
    if (location !== 0) continue;
    if (id === 3072 && value > 0 && value < 32767) return value;
    if (id === 2048 && value > 0 && value < 32767) geographic = value;
  }
  return geographic;
}

/** Último `AUTHORITY["EPSG","n"]` del WKT (el del sistema proyectado, que envuelve a los demás). */
function epsgFromWkt(text: string): number | undefined {
  const all = [...text.matchAll(/AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)];
  const last = all[all.length - 1]?.[1];
  return last ? Number(last) : undefined;
}

/** Encabezado LAS; lanza si el archivo no es LAS. */
export function readLasHeader(bytes: Uint8Array): LasHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 227 || decoder.decode(bytes.subarray(0, 4)) !== 'LASF')
    throw new Error('No es un archivo LAS (falta la firma LASF)');
  const major = bytes[24] ?? 1;
  const minor = bytes[25] ?? 0;
  const headerSize = view.getUint16(94, true);
  const offsetToPoints = view.getUint32(96, true);
  const vlrCount = view.getUint32(100, true);
  const rawFormat = bytes[104] ?? 0;
  const recordLength = view.getUint16(105, true);
  let count = view.getUint32(107, true);
  if (major === 1 && minor >= 4 && bytes.length >= 255) {
    const big = Number(view.getBigUint64(247, true));
    if (big > 0) count = big;
  }
  const d = (at: number) => view.getFloat64(at, true);
  const header: LasHeader = {
    version: `${String(major)}.${String(minor)}`,
    // Los bits 6 y 7 del formato marcan compresión (LAZ).
    pointFormat: rawFormat & 0x3f,
    compressed: (rawFormat & 0xc0) !== 0,
    recordLength,
    count,
    offsetToPoints,
    scale: [d(131), d(139), d(147)],
    offset: [d(155), d(163), d(171)],
    bounds: { maxX: d(179), minX: d(187), maxY: d(195), minY: d(203), maxZ: d(211), minZ: d(219) },
  };
  // VLR: 54 bytes de encabezado (id de registro en +18, largo en +20) y el contenido.
  let at = headerSize;
  for (let i = 0; i < vlrCount && at + 54 <= bytes.length; i++) {
    const recordId = view.getUint16(at + 18, true);
    const length = view.getUint16(at + 20, true);
    const body = at + 54;
    const epsg =
      recordId === 34735
        ? epsgFromGeoKeys(view, body, length)
        : recordId === 2112
          ? epsgFromWkt(decoder.decode(bytes.subarray(body, body + length)))
          : undefined;
    if (epsg !== undefined && header.epsg === undefined) header.epsg = epsg;
    at = body + length;
  }
  return header;
}

export interface CloudOptions {
  /** Lado de la celda de reducción en planta [m]; 0 = sin reducir. Supuesto S-14. */
  cell: number;
  /** Clases ASPRS a descartar: 7 (ruido bajo) y 18 (ruido alto) por defecto. */
  excludeClasses?: readonly number[];
}

/**
 * Acumula registros de punto (de un LAS o descomprimidos de un LAZ) y los reduce en el momento a
 * un punto por celda con la cota mínima (S-14): una nube de millones de puntos no se guarda
 * entera en memoria.
 */
export class CloudAccumulator {
  private readonly cells = new Map<number, number>();
  private sx: Float64Array;
  private sy: Float64Array;
  private zmin: Float64Array;
  private n: Uint32Array;
  private used = 0;
  private readonly raw: number[] = [];
  read = 0;
  excluded = 0;
  private readonly exclude: Set<number>;
  private readonly classAt: number;

  constructor(
    private readonly header: LasHeader,
    private readonly options: CloudOptions,
  ) {
    this.exclude = new Set(options.excludeClasses ?? [7, 18]);
    // Formatos 0–5: clase en los 5 bits bajos del byte 15; formatos 6–10: byte 16 entero.
    this.classAt = header.pointFormat >= 6 ? 16 : 15;
    const initial = 1024;
    this.sx = new Float64Array(initial);
    this.sy = new Float64Array(initial);
    this.zmin = new Float64Array(initial);
    this.n = new Uint32Array(initial);
  }

  /** Un registro de punto que empieza en `at` de `view`. */
  add(view: DataView, at: number): void {
    this.read++;
    const cls = view.getUint8(at + this.classAt) & (this.classAt === 15 ? 0x1f : 0xff);
    if (this.exclude.has(cls)) {
      this.excluded++;
      return;
    }
    const [kx, ky, kz] = this.header.scale;
    const [ox, oy, oz] = this.header.offset;
    const x = view.getInt32(at, true) * kx + ox;
    const y = view.getInt32(at + 4, true) * ky + oy;
    const z = view.getInt32(at + 8, true) * kz + oz;
    const cell = this.options.cell;
    if (!(cell > 0)) {
      this.raw.push(x, y, z);
      return;
    }
    const cx = Math.floor((x - this.header.bounds.minX) / cell);
    const cy = Math.floor((y - this.header.bounds.minY) / cell);
    const key = cx * 4_194_304 + cy;
    let slot = this.cells.get(key);
    if (slot === undefined) {
      slot = this.used++;
      if (slot >= this.n.length) this.grow();
      this.cells.set(key, slot);
      this.zmin[slot] = z;
    } else if (z < (this.zmin[slot] ?? z)) this.zmin[slot] = z;
    this.sx[slot] = (this.sx[slot] ?? 0) + x;
    this.sy[slot] = (this.sy[slot] ?? 0) + y;
    this.n[slot] = (this.n[slot] ?? 0) + 1;
  }

  private grow(): void {
    const size = this.n.length * 2;
    const g64 = (a: Float64Array) => {
      const b = new Float64Array(size);
      b.set(a);
      return b;
    };
    this.sx = g64(this.sx);
    this.sy = g64(this.sy);
    this.zmin = g64(this.zmin);
    const nn = new Uint32Array(size);
    nn.set(this.n);
    this.n = nn;
  }

  /** Puntos x, y, z: uno por celda (centro de masa en planta y cota mínima) o todos. */
  points(): Float64Array {
    if (!(this.options.cell > 0)) return Float64Array.from(this.raw);
    const out = new Float64Array(this.used * 3);
    for (let s = 0; s < this.used; s++) {
      const k = this.n[s] ?? 1;
      out[s * 3] = (this.sx[s] ?? 0) / k;
      out[s * 3 + 1] = (this.sy[s] ?? 0) / k;
      out[s * 3 + 2] = this.zmin[s] ?? 0;
    }
    return out;
  }
}

/** Puntos de un LAS sin comprimir, reducidos según `options`. */
export function readLasPoints(
  bytes: Uint8Array,
  header: LasHeader,
  options: CloudOptions,
): CloudAccumulator {
  if (header.compressed) throw new Error('El archivo está comprimido (LAZ)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const acc = new CloudAccumulator(header, options);
  const end = Math.min(
    header.count,
    Math.floor((bytes.length - header.offsetToPoints) / header.recordLength),
  );
  for (let i = 0; i < end; i++) acc.add(view, header.offsetToPoints + i * header.recordLength);
  return acc;
}
