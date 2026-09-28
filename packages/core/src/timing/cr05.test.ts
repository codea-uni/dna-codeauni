/**
 * CR-05: mini-malla de tiempos (2 × 3 taladros), `docs/theory/04 - Casos de referencia.md`.
 * A1–A3 en N = 3 m, B1–B3 en N = 6 m, E = 0 / 3,5 / 7 m. Retardo de fondo 500 ms y 100 kg por
 * taladro; ventana de MIC 8 ms semiabierta. Valores esperados tal como en la fuente (ms, kg).
 */
import { describe, expect, it } from 'vitest';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Hole, SurfaceConnection } from '../model/types';
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

function cr05(start: Label, links: [Label, Label, number][]): Blast {
  const holes: Hole[] = LABELS.map((label) => {
    const h = createHole({
      label,
      position: { x: 3.5 * (Number(label[1]) - 1), y: label.startsWith('A') ? 3 : 6 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
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
