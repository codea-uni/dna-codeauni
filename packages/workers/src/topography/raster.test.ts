import { readFileSync } from 'node:fs';
import { SurfaceIndex } from '@cronos/core';
import { writeArrayBuffer } from 'geotiff';
import { describe, expect, it } from 'vitest';
import { readCloud } from './cloud';
import { demToTin, geoTiffImage, inspectGeoTiff } from './raster';

// Fixtures generados en la prueba: un DEM que es un plano (el TIN debe reproducirlo exacto) y una
// ortofoto de 2 × 2 píxeles; la nube LAZ la escribió laspy 2.7 + lazrs a partir de una fórmula.

const W = 33;
const plane = (x: number, y: number) => 3400 + 0.05 * (x - 330000) - 0.02 * (y - 8100000);

function demTiff(noDataBox = false): Uint8Array {
  const values = new Float32Array(W * W);
  for (let r = 0; r < W; r++)
    for (let c = 0; c < W; c++) {
      // Centro del píxel: esquina (330000, 8100066) + medio píxel de 2 m.
      const x = 330000 + (c + 0.5) * 2;
      const y = 8100066 - (r + 0.5) * 2;
      values[r * W + c] = noDataBox && r >= 10 && r < 20 && c >= 10 && c < 20 ? -9999 : plane(x, y);
    }
  return new Uint8Array(
    writeArrayBuffer(values, {
      width: W,
      height: W,
      BitsPerSample: [32],
      SampleFormat: [3],
      ModelPixelScale: [2, 2, 0],
      ModelTiepoint: [0, 0, 0, 330000, 8100066, 0],
      GTModelTypeGeoKey: 1,
      ProjectedCSTypeGeoKey: 32719,
      ...(noDataBox ? { GDAL_NODATA: '-9999' } : {}),
    }),
  );
}

describe('GeoTIFF', () => {
  it('reconoce un DEM con su EPSG y su georreferencia', async () => {
    const info = await inspectGeoTiff(demTiff());
    expect(info).toMatchObject({ kind: 'dem', width: W, height: W, epsg: 32719 });
    expect(info.georef).toMatchObject({
      originX: 330000,
      originY: 8100066,
      pixelSizeX: 2,
      pixelSizeY: -2,
    });
  });

  it('DEM → TIN: un plano queda exacto con muy pocos triángulos', async () => {
    const { tin, grid } = await demToTin(demTiff(), 0.01);
    expect(grid).toBe(33);
    expect(tin.triangles.length / 3).toBeLessThan(10);
    const idx = SurfaceIndex.build(tin);
    expect(idx.elevationAt(330031, 8100030)).toBeCloseTo(plane(330031, 8100030), 4);
  });

  it('las celdas sin dato no generan superficie', async () => {
    const { tin } = await demToTin(demTiff(true), 0.01);
    const idx = SurfaceIndex.build(tin);
    // Centro del hueco (filas y columnas 10 a 19).
    expect(idx.elevationAt(330030, 8100036)).toBeNull();
    expect(idx.elevationAt(330006, 8100060)).toBeCloseTo(plane(330006, 8100060), 4);
  });

  it('ortofoto RGB: colores y georreferencia (codificador de prueba)', async () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const bytes = new Uint8Array(
      writeArrayBuffer(rgb, {
        width: 2,
        height: 2,
        SamplesPerPixel: 3,
        BitsPerSample: [8, 8, 8],
        PhotometricInterpretation: 2,
        ModelPixelScale: [0.1, 0.1, 0],
        ModelTiepoint: [0, 0, 0, 330000, 8100000, 0],
        GTModelTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 32719,
      }),
    );
    const { image, info } = await geoTiffImage(bytes, (rgba, width, height) =>
      Promise.resolve({ bytes: rgba.slice(), mime: `raw/${String(width)}x${String(height)}` }),
    );
    expect(info.kind).toBe('image');
    expect(image.mime).toBe('raw/2x2');
    expect(Array.from(image.bytes.slice(0, 8))).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(image.georef).toMatchObject({ originX: 330000, originY: 8100000, pixelSizeX: 0.1 });
  });
});

describe('nube LAZ', () => {
  const laz = new Uint8Array(readFileSync(new URL('./fixtures/grilla-20x10.laz', import.meta.url)));

  it('se descomprime con coordenadas exactas y sin los puntos de ruido', async () => {
    const r = await readCloud(laz, { cell: 0 });
    expect(r.header.compressed).toBe(true);
    expect(r.read).toBe(200);
    expect(r.excluded).toBe(1);
    // Punto i = 0, j = 1 de la grilla: (330000 + 1,5·i, 8100000 + 2·j, 3400 + 0,1·i − 0,05·j).
    expect(r.points[0]).toBeCloseTo(330000, 6);
    expect(r.points[1]).toBeCloseTo(8100002, 6);
    expect(r.points[2]).toBeCloseTo(3399.95, 6);
  });

  it('y se reduce por celda', async () => {
    const r = await readCloud(laz, { cell: 3 });
    // Celdas de 3 m: 10 columnas × 7 filas ocupadas (y de 0 a 18 m).
    expect(r.points.length / 3).toBe(70);
  });
});
