import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePngRgb } from './png';
import { imageSize } from './raster';

describe('PNG', () => {
  it('la imagen se lee de vuelta con zlib de Node, fila a fila con filtro 0', () => {
    // 300 × 300 RGB: más de 65 535 bytes, así que usa varios bloques «stored».
    const w = 300;
    const h = 300;
    const rgb = new Uint8Array(w * h * 3).map((_, i) => (i * 7) % 256);
    const png = encodePngRgb(rgb, w, h);
    expect(imageSize(png)).toEqual({ mime: 'image/png', width: w, height: h });
    // IDAT empieza tras la firma (8) + IHDR (25): largo, tipo y datos.
    const len = new DataView(png.buffer).getUint32(33);
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + len));
    expect(raw.length).toBe((w * 3 + 1) * h);
    expect(raw[0]).toBe(0);
    expect(Array.from(raw.subarray(1, 7))).toEqual(Array.from(rgb.subarray(0, 6)));
    expect(Array.from(raw.subarray((w * 3 + 1) * 5 + 1, (w * 3 + 1) * 5 + 4))).toEqual(
      Array.from(rgb.subarray(w * 3 * 5, w * 3 * 5 + 3)),
    );
  });
});
