import { describe, expect, it } from 'vitest';
import { decodeAsset, encodeAsset } from './asset';
import { parseBlockModelCsv } from './blockModel';
import { blockModelBounds } from './survey';

const enc = (s: string) => new TextEncoder().encode(s);

/** Grilla de 3×2 bloques de 10 m girada `deg` grados antihorario (como el POL77 de Datamine). */
function datamine(deg: number): string {
  const a = (deg * Math.PI) / 180;
  const head =
    '﻿_XMORIG,_YMORIG,_ZMORIG,_ROTANGLE1,_ROTAXIS1,lito,density,_XC,_YC,_ZC,_XSIZE,_YSIZE,_ZSIZE';
  const rows: string[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const u = i * 10;
      const v = j * 10;
      const x = 617000 + u * Math.cos(a) - v * Math.sin(a);
      const y = 7759000 + u * Math.sin(a) + v * Math.cos(a);
      rows.push(
        `0,0,0,${String(deg)},3,${i === 0 ? 'ic' : 'if'},${String(3 + i / 10)},${String(x)},${String(y)},1365,10,10,10`,
      );
    }
  return [head, ...rows].join('\n');
}

describe('parseBlockModelCsv', () => {
  it('lee centros, tamaños, atributos y el giro de Datamine', () => {
    const m = parseBlockModelCsv(enc(datamine(59)));
    expect(m.centers.length).toBe(18);
    expect(m.sizes[0]).toBe(10);
    expect((m.rotation * 180) / Math.PI).toBeCloseTo(59, 3);
    expect(m.numeric.map((a) => a.name)).toEqual(['density']);
    expect(m.densityAttribute).toBe('density');
    expect(m.categorical[0]?.name).toBe('lito');
    expect(m.categorical[0]?.categories).toEqual(['ic', 'if']);
    const back = decodeAsset(encodeAsset({ kind: 'blocks', blocks: m }));
    expect(back.kind).toBe('blocks');
    if (back.kind === 'blocks') {
      expect(back.blocks.categorical[0]?.codes.length).toBe(6);
      expect(back.blocks.numeric[0]?.values[5]).toBeCloseTo(3.2, 5);
    }
  });

  it('elige el signo del giro que coincide con los datos', () => {
    const m = parseBlockModelCsv(enc(datamine(-31).replace(/,-31,3,/g, ',59,3,')));
    // Los datos están girados −31° (≡ 59° módulo 90°): con la cabecera de 59° se queda en 59°.
    expect(((m.rotation * 180) / Math.PI + 360) % 90).toBeCloseTo(59, 3);
  });

  it('caja envolvente con el giro', () => {
    const m = parseBlockModelCsv(enc(datamine(0)));
    const b = blockModelBounds(m);
    expect(b.minX).toBeCloseTo(616995);
    expect(b.maxX).toBeCloseTo(617025);
    expect(b.minZ).toBe(1360);
  });
});
