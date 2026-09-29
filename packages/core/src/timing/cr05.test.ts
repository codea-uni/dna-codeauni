/**
 * CR-05: mini-malla de tiempos (2 × 3 taladros), `docs/theory/04-REFERENCE-CASES.md`.
 * A1–A3 en N = 3 m, B1–B3 en N = 6 m, E = 0 / 3,5 / 7 m. Retardo de fondo 500 ms y 100 kg por
 * taladro; ventana de MIC 8 ms semiabierta. Valores esperados tal como en la fuente (ms, kg).
 */
import { describe, expect, it } from 'vitest';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Hole, Pattern, SurfaceConnection } from '../model/types';
import { checkOptionsOf } from '../diagnostics/designChecks';
import { effectiveBurden } from './effectiveBurden';
import { cycleHoles, timingChecks } from './timingChecks';
import { rowTieUp } from './tieUp';
import { chargePerDelay } from '../vibration/vibration';
import { computeTiming } from './timing';
import { withDownholeDetonator } from './tieUp';

const lib = createDefaultLibrary();
const detonator = lib.detonators[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
const connector = lib.surfaceConnectors[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
const LABELS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'] as const;
type Label = (typeof LABELS)[number];
const KG = new Float64Array(6).fill(100);
const WINDOW = 0.008;

const pattern: Pattern = {
  id: newId<'Pattern'>(),
  name: 'CR-05',
  kind: 'rectangular',
  burden: 3,
  spacing: 3.5,
  origin: { x: 0, y: 3 },
  rowAzimuth: Math.PI / 2,
  rowAdvance: 'left',
  rows: 2,
  holesPerRow: 3,
  holeTemplate: DEFAULT_HOLE_TEMPLATE,
};

function cr05(start: Label, links: [Label, Label, number][]): Blast {
  const holes: Hole[] = LABELS.map((label) => {
    const h = createHole({
      label,
      position: { x: 3.5 * (Number(label[1]) - 1), y: label.startsWith('A') ? 3 : 6 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      patternId: pattern.id,
      row: label.startsWith('A') ? 0 : 1,
      col: Number(label[1]) - 1,
    });
    return { ...h, initiators: withDownholeDetonator(h, detonator.id, 0.5) };
  });
  const ref = (l: Label) => ({
    kind: 'hole' as const,
    holeId: holes[LABELS.indexOf(l)]?.id ?? newId<'Hole'>(),
  });
  const connections: SurfaceConnection[] = links.map(([from, to, ms]) => ({
    id: newId<'Connection'>(),
    from: ref(from),
    to: ref(to),
    connectorId: connector.id,
    delayOverride: ms / 1000,
  }));
  const blast = createBlast('CR-05', newId<'RockMass'>());
  return {
    ...blast,
    patterns: [pattern],
    // Cara libre: la recta y = 0, con el material hacia y > 0
    freeFaces: [
      {
        id: newId<'FreeFace'>(),
        crest: [
          { x: -20, y: 0, z: 15 },
          { x: 30, y: 0, z: 15 },
        ],
      },
    ],
    holes,
    initiation: {
      ...blast.initiation,
      connections,
      initiationPoints: [{ id: newId<'InitiationPoint'>(), at: ref(start), time: 0 }],
    },
  };
}

function run(blast: Blast) {
  const r = computeTiming(blast, lib, { coincidenceWindow: WINDOW }, KG);
  const relativeMs = [...r.fireTime].map((t) => (t - r.firstTime) * 1000);
  const perHole = chargePerDelay(r.fireTime, KG, WINDOW);
  return { r, relativeMs, micVibration: Math.max(...perHole) };
}

describe('CR-05: tiempos al milisegundo y MIC con ventana semiabierta de 8 ms', () => {
  it('amarre 1 (en fila desde A1): 0/17/34/45/62/79 ms; MIC 100 kg', () => {
    const { r, relativeMs, micVibration } = run(
      cr05('A1', [
        ['A1', 'A2', 17],
        ['A2', 'A3', 17],
        ['A1', 'B1', 45],
        ['B1', 'B2', 17],
        ['B2', 'B3', 17],
      ]),
    );
    // Tiempo de detonación absoluto con retardo de fondo: A1 = 500 ms
    expect(r.firstTime * 1000).toBeCloseTo(500, 6);
    [0, 17, 34, 45, 62, 79].forEach((ms, i) => {
      expect(relativeMs[i]).toBeCloseTo(ms, 6);
    });
    expect(r.maxChargePerWindow).toBe(100);
    expect(micVibration).toBe(100);
  });

  it('amarre 2 (en V desde A2): A1 y A3 a 17 ms, B1 y B3 a 59 ms; MIC 200 kg', () => {
    const { r, relativeMs, micVibration } = run(
      cr05('A2', [
        ['A2', 'A1', 17],
        ['A2', 'A3', 17],
        ['A2', 'B2', 42],
        ['B2', 'B1', 17],
        ['B2', 'B3', 17],
      ]),
    );
    [17, 0, 17, 59, 42, 59].forEach((ms, i) => {
      expect(relativeMs[i]).toBeCloseTo(ms, 6);
    });
    expect(r.maxChargePerWindow).toBe(200);
    expect(micVibration).toBe(200);
  });

  it('amarre 3 (5 ms entre A1–A2–A3): ventanas [0,8) y [5,13) con 2 taladros; MIC 200 kg', () => {
    const { r, relativeMs, micVibration } = run(
      cr05('A1', [
        ['A1', 'A2', 5],
        ['A2', 'A3', 5],
        ['A1', 'B1', 45],
        ['B1', 'B2', 17],
        ['B2', 'B3', 17],
      ]),
    );
    [0, 5, 10, 45, 62, 79].forEach((ms, i) => {
      expect(relativeMs[i]).toBeCloseTo(ms, 6);
    });
    expect(r.maxChargePerWindow).toBe(200);
    expect(micVibration).toBe(200);
  });

  it('amarre 4 (A3 = 34 ms, B1 = 42 ms, Δ = 8 ms exactos): no se agrupan; MIC 100 kg', () => {
    const { r, relativeMs, micVibration } = run(
      cr05('A1', [
        ['A1', 'A2', 17],
        ['A2', 'A3', 17],
        ['A1', 'B1', 42],
        ['B1', 'B2', 17],
        ['B2', 'B3', 17],
      ]),
    );
    expect(relativeMs[2]).toBeCloseTo(34, 6);
    expect(relativeMs[3]).toBeCloseTo(42, 6);
    expect(r.maxChargePerWindow).toBe(100);
    expect(micVibration).toBe(100);
  });
});

const AMARRE_1: [Label, Label, number][] = [
  ['A1', 'A2', 17],
  ['A2', 'A3', 17],
  ['A1', 'B1', 45],
  ['B1', 'B2', 17],
  ['B2', 'B3', 17],
];
const AMARRE_5: [Label, Label, number][] = [
  ['B1', 'B2', 17],
  ['B2', 'B3', 17],
  ['B1', 'A1', 45],
  ['A1', 'A2', 17],
  ['A2', 'A3', 17],
];

function burdens(blast: Blast) {
  const r = computeTiming(blast, lib, { coincidenceWindow: WINDOW }, KG);
  const eb = effectiveBurden(blast, r.fireTime, blast.calcParams.reliefRate);
  const checks = timingChecks(
    blast,
    r.fireTime,
    eb,
    checkOptionsOf(blast),
    blast.calcParams.delayGuide,
  );
  return {
    effective: [...eb.effective],
    byId: Object.fromEntries(checks.map((c) => [c.id, c.holes])),
  };
}

describe('CR-05: burden efectivo según la secuencia (P-02: alivio a 3 ms/m de burden)', () => {
  it('amarre 1 (en fila desde A1): todos 3,0 m, sin avisos de cara libre ni de orden', () => {
    const { effective, byId } = burdens(cr05('A1', AMARRE_1));
    effective.forEach((e) => {
      expect(e).toBeCloseTo(3, 9);
    });
    expect(byId.unrelievedBurden).toBeUndefined();
    expect(byId.invertedOrder).toBeUndefined();
  });

  it('amarre 2 (en V desde A2): todos 3,0 m', () => {
    const blast = cr05('A2', [
      ['A2', 'A1', 17],
      ['A2', 'A3', 17],
      ['A2', 'B2', 42],
      ['B2', 'B1', 17],
      ['B2', 'B3', 17],
    ]);
    burdens(blast).effective.forEach((e) => {
      expect(e).toBeCloseTo(3, 9);
    });
  });

  it('amarre 5 (fila trasera primero): B = 6,0 m con avisos; A = 3,0 m', () => {
    const blast = cr05('B1', AMARRE_5);
    const { effective, byId } = burdens(blast);
    expect(effective.slice(0, 3).map((e) => Number(e.toFixed(9)))).toEqual([3, 3, 3]);
    expect(effective.slice(3).map((e) => Number(e.toFixed(9)))).toEqual([6, 6, 6]);
    const back = blast.holes.slice(3).map((h) => h.id);
    expect(byId.unrelievedBurden).toEqual(back);
    expect(byId.invertedOrder).toEqual(back);
  });

  it('sin cara libre y con alivio 0 (caso límite de P-02) cualquier taladro previo alivia', () => {
    const blast = { ...cr05('B1', AMARRE_5), freeFaces: [] };
    const r = computeTiming(blast, lib, { coincidenceWindow: WINDOW }, KG);
    const eb = effectiveBurden(blast, r.fireTime, 0);
    // B1 no tiene superficie libre (∞); B2 se alivia con B1 a 3,5 m.
    expect(eb.effective[3]).toBe(Infinity);
    expect(eb.effective[4]).toBeCloseTo(3.5, 9);
  });
});

describe('amarre: escalón y ciclos (H-504)', () => {
  it('escalón desde A1: solo la fila de inicio se encadena; B desde su columna en A', () => {
    const blast = cr05('A1', []);
    const plan = rowTieUp(blast, {
      patternId: pattern.id,
      startRow: 0,
      startCol: 0,
      interHoleConnectorId: connector.id,
      interRowConnectorId: connector.id,
      mode: 'echelon',
    });
    // 2 conexiones en la fila A y 3 de A a B (una por columna)
    expect(plan.connections).toHaveLength(5);
    const r = computeTiming({ ...blast, initiation: { ...blast.initiation, ...plan } }, lib);
    const rel = [...r.fireTime].map((t) => Math.round((t - r.firstTime) * 1000));
    // Conector de 17 ms en ambos sentidos: t = 17·(col + fila) → isócronas en diagonal
    expect(rel).toEqual([0, 17, 34, 17, 34, 51]);
  });

  it('detecta los taladros de un ciclo del amarre', () => {
    const blast = cr05('A1', [
      ['A1', 'A2', 17],
      ['A2', 'A3', 17],
      ['A3', 'A1', 17],
      ['A1', 'B1', 45],
    ]);
    expect(new Set(cycleHoles(blast))).toEqual(new Set(blast.holes.slice(0, 3).map((h) => h.id)));
  });
});
