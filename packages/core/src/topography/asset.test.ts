import { describe, expect, it } from 'vitest';
import {
  assetHash,
  base64ToBytes,
  bytesToBase64,
  decodeAsset,
  encodeAsset,
  type TopographyAsset,
} from './asset';

const tin: TopographyAsset = {
  kind: 'tin',
  tin: {
    // Coordenadas UTM reales: deben conservar los decimales (float64).
    vertices: new Float64Array([
      345200.125, 8512480.5, 3435.25, 345210, 8512480.5, 3436, 345205, 8512490, 3437.75,
    ]),
    triangles: new Uint32Array([0, 1, 2]),
  },
};

describe('assets de topografía (CRTS)', () => {
  it('TIN: ida y vuelta exacta', () => {
    const bytes = encodeAsset(tin);
    const back = decodeAsset(bytes);
    expect(back.kind).toBe('tin');
    if (back.kind !== 'tin') throw new Error('tipo');
    expect([...back.tin.vertices]).toEqual([
      ...(tin as { tin: { vertices: Float64Array } }).tin.vertices,
    ]);
    expect([...back.tin.triangles]).toEqual([0, 1, 2]);
  });

  it('líneas y imagen: ida y vuelta', () => {
    const lines: TopographyAsset = {
      kind: 'lines',
      lines: {
        coords: new Float64Array([0, 0, 10, 5, 0, 10, 5, 5, 12]),
        offsets: new Uint32Array([0, 2, 3]),
        roles: new Uint8Array([1, 0]),
        closed: new Uint8Array([0, 0]),
      },
    };
    const back = decodeAsset(encodeAsset(lines));
    if (back.kind !== 'lines') throw new Error('tipo');
    expect([...back.lines.offsets]).toEqual([0, 2, 3]);
    expect([...back.lines.roles]).toEqual([1, 0]);

    const image: TopographyAsset = {
      kind: 'image',
      image: {
        mime: 'image/webp',
        width: 2,
        height: 1,
        georef: { originX: 1, originY: 2, pixelSizeX: 0.1, pixelSizeY: -0.1, rotation: 0 },
        bytes: new Uint8Array([1, 2, 3, 4, 5]),
      },
    };
    const img = decodeAsset(encodeAsset(image));
    if (img.kind !== 'image') throw new Error('tipo');
    expect(img.image).toMatchObject({ mime: 'image/webp', width: 2, georef: { pixelSizeY: -0.1 } });
    expect([...img.image.bytes]).toEqual([1, 2, 3, 4, 5]);
  });

  it('el hash identifica el contenido y el base64 lo conserva', () => {
    const a = encodeAsset(tin);
    expect(assetHash(a)).toBe(assetHash(encodeAsset(tin)));
    expect(assetHash(a)).toMatch(/^[0-9a-f]{64}$/);
    const back = base64ToBytes(bytesToBase64(a));
    expect(assetHash(back)).toBe(assetHash(a));
    // Un buffer desalineado (subarray) también se decodifica.
    const shifted = new Uint8Array(a.length + 3);
    shifted.set(a, 3);
    expect(decodeAsset(shifted.subarray(3)).kind).toBe('tin');
  });

  it('rechaza contenido que no es CRTS', () => {
    expect(() => decodeAsset(new Uint8Array(16))).toThrow(/CRTS/);
  });
});
