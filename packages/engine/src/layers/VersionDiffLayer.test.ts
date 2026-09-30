import type { DiffMarker } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { VersionDiffLayer } from './VersionDiffLayer';

const ORIGIN = { x: 1000, y: 2000, z: 0 };
const markers: DiffMarker[] = [
  { kind: 'added', holeId: 'a', label: 'A', position: { x: 1010, y: 2000, z: 0 } },
  { kind: 'removed', holeId: 'r', label: 'R', position: { x: 1020, y: 2000, z: 0 } },
  {
    kind: 'moved',
    holeId: 'm',
    label: 'M',
    position: { x: 1030, y: 2003, z: 0 },
    from: { x: 1030, y: 2000, z: 0 },
  },
  { kind: 'changed', holeId: 'c', label: 'C', position: { x: 1040, y: 2000, z: 0 } },
];

describe('VersionDiffLayer', () => {
  it('dibuja un anillo por cambio, la cruz de los quitados y la línea de los movidos', () => {
    const layer = new VersionDiffLayer();
    layer.set(markers, ORIGIN, 1);
    // 4 anillos de 12 segmentos (24 vértices) + cruz (4) + línea de movido (2)
    expect(layer.vertexCount).toBe(4 * 24 + 4 + 2);
    expect(layer.lines.visible).toBe(true);
    const pos = layer.lines.geometry.getAttribute('position');
    // Primer vértice del anillo del agregado: centro (10, 0) relativo al origen + radio 1 en x
    expect(pos.getX(0)).toBeCloseTo(11, 5);
    expect(pos.getY(0)).toBeCloseTo(0, 5);
    // La línea del movido va de (30, 0) a (30, 3); después solo queda el anillo del cambiado (24)
    const line = layer.vertexCount - 24 - 2;
    expect([pos.getX(line), pos.getY(line)]).toEqual([30, 0]);
    expect([pos.getX(line + 1), pos.getY(line + 1)]).toEqual([30, 3]);
  });

  it('sin marcadores se oculta', () => {
    const layer = new VersionDiffLayer();
    layer.set(markers, ORIGIN, 1);
    layer.set(null, ORIGIN, 1);
    expect(layer.vertexCount).toBe(0);
    expect(layer.lines.visible).toBe(false);
  });
});
