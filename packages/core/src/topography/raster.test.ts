import { describe, expect, it } from 'vitest';
import type { CloudAccumulator } from './las';
import { readLasHeader, readLasPoints } from './las';
import { imageSize, parseWorldFile } from './raster';

// Fixtures armados a mano desde la definición de cada formato (ESRI world file, PNG, JPEG, ASPRS LAS).

describe('archivo de mundo', () => {
  it('sin giro: la esquina está medio píxel antes del centro del primer píxel', () => {
    const g = parseWorldFile('0.5\n0\n0\n-0.5\n345000.25\n8512000.75\n');
    expect(g).toEqual({
      originX: 345000,
      originY: 8512001,
      pixelSizeX: 0.5,
      pixelSizeY: -0.5,
      rotation: -0,
    });
  });

  it('girada 30° en sentido horario', () => {
    const s = 2;
    const th = Math.PI / 6;
    // Eje de columnas (cos θ, −sen θ)·s; eje de filas (−sen θ, −cos θ)·s.
    const text = [
      s * Math.cos(th),
      -s * Math.sin(th),
      -s * Math.sin(th),
      -s * Math.cos(th),
      1000,
      2000,
    ].join('\n');
    const g = parseWorldFile(text);
    expect(g?.rotation).toBeCloseTo(th, 12);
    expect(g?.pixelSizeX).toBeCloseTo(2, 12);
    expect(g?.pixelSizeY).toBeCloseTo(-2, 12);
  });

  it('un archivo incompleto no se acepta', () => {
    expect(parseWorldFile('1\n0\n0\n')).toBeNull();
  });
});

describe('tamaño de imagen por su encabezado', () => {
  it('PNG (IHDR) y JPEG (SOF0 después de APP0)', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(imageSize(png)).toEqual({ mime: 'image/png', width: 640, height: 480 });
    const jpg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58,
      0x03, 0x20, 0x03,
    ]);
    expect(imageSize(jpg)).toEqual({ mime: 'image/jpeg', width: 800, height: 600 });
    expect(imageSize(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

/** LAS 1.2, formato de punto 1 (28 bytes), con un VLR de GeoKeys (ProjectedCSType = 32719). */
function lasFile(points: [number, number, number, number][]): Uint8Array {
  const headerSize = 227;
  const vlr = 54 + 8 + 8; // encabezado + directorio + 1 clave
  const record = 28;
  const offsetToPoints = headerSize + vlr;
  const bytes = new Uint8Array(offsetToPoints + points.length * record);
  const v = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('LASF'));
  bytes[24] = 1;
  bytes[25] = 2;
  v.setUint16(94, headerSize, true);
  v.setUint32(96, offsetToPoints, true);
  v.setUint32(100, 1, true);
  bytes[104] = 1;
  v.setUint16(105, record, true);
  v.setUint32(107, points.length, true);
  // Escala 1 mm y desplazamiento en UTM.
  [0.001, 0.001, 0.001].forEach((k, i) => {
    v.setFloat64(131 + i * 8, k, true);
  });
  [300000, 8000000, 0].forEach((o, i) => {
    v.setFloat64(155 + i * 8, o, true);
  });
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = points.map((p) => p[2]);
  [
    Math.max(...xs),
    Math.min(...xs),
    Math.max(...ys),
    Math.min(...ys),
    Math.max(...zs),
    Math.min(...zs),
  ].forEach((b, i) => {
    v.setFloat64(179 + i * 8, b, true);
  });
  // VLR: id de registro 34735 (GeoKeyDirectoryTag), 16 bytes de contenido.
  v.setUint16(headerSize + 18, 34735, true);
  v.setUint16(headerSize + 20, 16, true);
  const keys = headerSize + 54;
  [1, 1, 0, 1, 3072, 0, 1, 32719].forEach((k, i) => {
    v.setUint16(keys + i * 2, k, true);
  });
  points.forEach(([x, y, z, cls], i) => {
    const at = offsetToPoints + i * record;
    v.setInt32(at, Math.round((x - 300000) / 0.001), true);
    v.setInt32(at + 4, Math.round((y - 8000000) / 0.001), true);
    v.setInt32(at + 8, Math.round(z / 0.001), true);
    bytes[at + 15] = cls;
  });
  return bytes;
}

describe('nubes LAS', () => {
  const pts: [number, number, number, number][] = [
    [330000.123, 8100150.456, 3400.789, 2],
    [330001.5, 8100151.5, 3401.25, 2],
    [330002.0, 8100150.0, 3399.5, 1],
    [330012.0, 8100150.0, 3410, 2],
    [330005.0, 8100155.0, 3600, 7], // ruido
  ];
  const bytes = lasFile(pts);

  it('lee encabezado, EPSG de las GeoKeys y coordenadas exactas en Float64', () => {
    const h = readLasHeader(bytes);
    expect(h).toMatchObject({
      version: '1.2',
      pointFormat: 1,
      recordLength: 28,
      count: 5,
      compressed: false,
      epsg: 32719,
    });
    const acc = readLasPoints(bytes, h, { cell: 0 });
    const p = acc.points();
    expect(acc.excluded).toBe(1);
    expect(p).toHaveLength(12);
    expect(p[0]).toBeCloseTo(330000.123, 9);
    expect(p[1]).toBeCloseTo(8100150.456, 9);
    expect(p[2]).toBeCloseTo(3400.789, 9);
  });

  it('reduce a una celda de 10 m con la cota mínima (S-14)', () => {
    const acc = readLasPoints(bytes, readLasHeader(bytes), { cell: 10 });
    const p = acc.points();
    // Celda 1: los tres primeros puntos (cota mínima 3399,5); celda 2: el de 330012.
    expect(p).toHaveLength(6);
    expect(p[2]).toBeCloseTo(3399.5, 9);
    expect(p[0]).toBeCloseTo((330000.123 + 330001.5 + 330002) / 3, 6);
    expect(p[5]).toBeCloseTo(3410, 9);
    expect(acc.read).toBe(5);
  });

  it('un archivo que no es LAS se rechaza', () => {
    expect(() => readLasHeader(new Uint8Array(300))).toThrow(/LASF/);
  });

  it('el acumulador crece más allá de su capacidad inicial', () => {
    const many: [number, number, number, number][] = Array.from({ length: 3000 }, (_, i) => [
      330000 + i * 2,
      8100000,
      3400,
      2,
    ]);
    const b = lasFile(many);
    const acc: CloudAccumulator = readLasPoints(b, readLasHeader(b), { cell: 1 });
    expect(acc.points()).toHaveLength(9000);
  });
});
