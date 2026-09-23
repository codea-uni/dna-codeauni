import { describe, expect, it } from 'vitest';
import { createBlast, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Pattern } from '../model/types';
import { generatePatternHoles } from '../patterns/pattern';
import { computeIsochrones, niceInterval } from './isochrones';
import { computeTiming } from './timing';
import { electronicTimes, rowTieUp, withDownholeDetonator } from './tieUp';

const lib = createDefaultLibrary();
const nonel500 = lib.detonators[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
const electronic = lib.detonators[2]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
const c17 = lib.surfaceConnectors[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
const c42 = lib.surfaceConnectors[2]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion

function blastWith(rows: number, cols: number): { blast: Blast; pattern: Pattern } {
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: 'P',
    kind: 'rectangular',
    burden: 5,
    spacing: 6,
    origin: { x: 0, y: 0 },
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right',
    rows,
    holesPerRow: cols,
    holeTemplate: DEFAULT_HOLE_TEMPLATE,
  };
  const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h) => ({
    ...h,
    initiators: withDownholeDetonator(h, nonel500.id, 0.5),
  }));
  return {
    blast: { ...createBlast('V', newId<'RockMass'>()), patterns: [pattern], holes },
    pattern,
  };
}

function tied(rows: number, cols: number, startCol: number): Blast {
  const { blast, pattern } = blastWith(rows, cols);
  const plan = rowTieUp(blast, {
    patternId: pattern.id,
    startRow: 0,
    startCol,
    interHoleConnectorId: c17.id,
    interRowConnectorId: c42.id,
  });
  return { ...blast, initiation: { ...blast.initiation, ...plan } };
}

const at = (blast: Blast, fire: Float64Array, row: number, col: number) =>
  fire[blast.holes.findIndex((h) => h.row === row && h.col === col)];

describe('tiempos', () => {
  it('línea a línea: t = 500 + 42·fila + 17·col [ms]', () => {
    const blast = tied(3, 5, 0);
    const r = computeTiming(blast, lib);
    expect(r.notInitiated).toBe(0);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++)
        expect(at(blast, r.fireTime, row, col)).toBeCloseTo(0.5 + 0.042 * row + 0.017 * col, 9);
    }
    expect(r.firstTime).toBeCloseTo(0.5);
    expect(r.lastTime).toBeCloseTo(0.5 + 0.084 + 0.068);
    expect(r.coincidentGroups).toHaveLength(0);
    // Entre filas: cada taladro contra el de la misma columna de la fila anterior → 42 ms
    expect(r.interRowDelays).toHaveLength(2);
    expect(r.interRowDelays[0]).toMatchObject({ rowA: 0, rowB: 1, count: 5 });
    expect(r.interRowDelays[0]?.min).toBeCloseTo(0.042, 9);
    expect(r.interRowDelays[0]?.max).toBeCloseTo(0.042, 9);
  });

  it('en V desde la columna central: pares simétricos coinciden', () => {
    const blast = tied(3, 5, 2);
    const r = computeTiming(
      blast,
      lib,
      { coincidenceWindow: 0.008 },
      new Float64Array(15).fill(100),
    );
    expect(at(blast, r.fireTime, 1, 4)).toBeCloseTo(0.5 + 0.042 + 2 * 0.017, 9);
    expect(at(blast, r.fireTime, 1, 0)).toBeCloseTo(at(blast, r.fireTime, 1, 4) ?? NaN, 9);
    // Por fila: (1,3) y (0,4) disparan juntos → 2 grupos × 3 filas
    expect(r.coincidentGroups).toHaveLength(6);
    expect(r.maxHolesPerWindow).toBe(2);
    expect(r.maxChargePerWindow).toBe(200);
  });

  it('electrónicos: tiempo programado sin red de superficie', () => {
    const { blast, pattern } = blastWith(2, 4);
    const times = electronicTimes(blast, {
      patternId: pattern.id,
      startRow: 0,
      startCol: 0,
      interHole: 0.009,
      interRow: 0.1,
      offset: 0.01,
      detonatorId: electronic.id,
    });
    const holes = blast.holes.map((h) => ({
      ...h,
      initiators: withDownholeDetonator(h, electronic.id, times.get(h.id) ?? 0),
    }));
    const r = computeTiming({ ...blast, holes }, lib);
    expect(at(blast, r.fireTime, 1, 3)).toBeCloseTo(0.01 + 0.1 + 0.027, 9);
    expect(r.notInitiated).toBe(0);
  });

  it('taladros sin conexión quedan sin iniciar; el iniciador más temprano manda', () => {
    const blast = tied(1, 3, 0);
    const [h0, h1, h2] = blast.holes;
    if (!h0 || !h1 || !h2) throw new Error('faltan taladros');
    const connections = blast.initiation.connections.filter(
      (c) => c.to.kind === 'hole' && c.to.holeId !== h2.id,
    );
    const init0 = h1.initiators[0];
    if (!init0) throw new Error('sin iniciador');
    const doubled = {
      ...h1,
      initiators: [...h1.initiators, { ...init0, id: newId<'InHoleInitiator'>(), delay: 0.4 }],
    };
    const r = computeTiming(
      { ...blast, holes: [h0, doubled, h2], initiation: { ...blast.initiation, connections } },
      lib,
    );
    expect(r.notInitiated).toBe(1);
    expect(Number.isNaN(r.fireTime[2])).toBe(true);
    expect(r.fireTime[1]).toBeCloseTo(0.017 + 0.4, 9);
  });
});

describe('isócronas', () => {
  it('campo lineal t = x/1000: las isócronas son verticales en x = nivel·1000', () => {
    const pts = [];
    const times = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        pts.push({ x: 300_000 + i * 5, y: 8_000_000 + j * 5 });
        times.push((i * 5) / 1000);
      }
    }
    const iso = computeIsochrones(pts, Float64Array.from(times), 0.01);
    expect(iso.levels.length).toBeGreaterThan(0);
    for (let k = 0; k < iso.levels.length; k++) {
      const x = 300_000 + (iso.levels[k] ?? 0) * 1000;
      expect(iso.segments[k * 4]).toBeCloseTo(x, 3);
      expect(iso.segments[k * 4 + 2]).toBeCloseTo(x, 3);
    }
    expect(new Set(iso.levels).size).toBe(4); // 10, 20, 30, 40 ms
  });

  it('intervalo redondo', () => {
    expect(niceInterval(0.3)).toBe(0.025);
    expect(niceInterval(1.2)).toBe(0.1);
  });
});
