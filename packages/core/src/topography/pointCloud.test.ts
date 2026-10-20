import { describe, expect, it } from 'vitest';
import { decodeAsset, encodeAsset } from './asset';
import { IBPC_HEADER_BYTES, parseCloudText, readIbpc } from './pointCloud';

const enc = (s: string) => new TextEncoder().encode(s);

describe('parseCloudText', () => {
  it('lee XYZ RGB con encabezado y unidades, relativo al origen', () => {
    const c = parseCloudText(
      enc(
        'X (m)\tY (m)\tZ (m)\tRed\tGreen\tBlue\n619033.729\t7763715.702\t1420.152\t102\t75\t48\n619034.5\t7763716\t1421\t1\t2\t3\n',
      ),
    );
    expect(c.sourcePoints).toBe(2);
    expect(c.origin).toEqual([619033, 7763715, 1420]);
    expect(c.positions[0]).toBeCloseTo(0.729, 3);
    expect(Array.from(c.colors ?? [])).toEqual([102, 75, 48, 1, 2, 3]);
  });

  it('reduce con paso regular hasta el máximo', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `${String(i)} 0 0`).join('\n');
    const c = parseCloudText(enc(rows), 4);
    expect(c.positions.length / 3).toBe(4);
    expect(c.colors).toBeUndefined();
  });
});

describe('readIbpc', () => {
  function ibpc(points: [number, number, number, number, number, number][]): Uint8Array {
    const n = points.length;
    const out = new Uint8Array(IBPC_HEADER_BYTES + n * 15);
    const v = new DataView(out.buffer);
    v.setUint16(0, 3, true);
    v.setUint32(2, n, true);
    v.setFloat64(6, 480929, true);
    v.setFloat64(14, 2208157, true);
    v.setFloat64(22, 2239, true);
    v.setUint32(60, 1, true);
    points.forEach(([x, y, z, r, g, b], i) => {
      v.setFloat32(IBPC_HEADER_BYTES + i * 12, x, true);
      v.setFloat32(IBPC_HEADER_BYTES + i * 12 + 4, y, true);
      v.setFloat32(IBPC_HEADER_BYTES + i * 12 + 8, z, true);
      out.set([r, g, b], IBPC_HEADER_BYTES + n * 12 + i * 3);
    });
    return out;
  }

  it('lee por partes posiciones relativas y color', async () => {
    const file = ibpc([
      [-58.96, -15.44, -39.82, 132, 117, 107],
      [1, 2, 3, 172, 160, 145],
      [4, 5, 6, 167, 157, 142],
    ]);
    const read = (o: number, l: number) => Promise.resolve(file.subarray(o, o + l));
    const c = await readIbpc(read, file.byteLength, 2);
    expect(c.sourcePoints).toBe(3);
    expect(c.origin).toEqual([480929, 2208157, 2239]);
    expect(c.positions.length).toBe(6);
    expect(c.positions[3]).toBeCloseTo(4);
    expect(Array.from(c.colors ?? [])).toEqual([132, 117, 107, 167, 157, 142]);
    const back = decodeAsset(encodeAsset({ kind: 'cloud', cloud: c }));
    expect(back.kind === 'cloud' && Array.from(back.cloud.colors ?? [])).toEqual(
      Array.from(c.colors ?? []),
    );
  });

  it('rechaza un archivo que no cuadra', async () => {
    const file = ibpc([[0, 0, 0, 0, 0, 0]]).subarray(0, 110);
    const read = (o: number, l: number) => Promise.resolve(file.subarray(o, o + l));
    await expect(readIbpc(read, file.byteLength)).rejects.toThrow(/no cuadra/);
  });
});
