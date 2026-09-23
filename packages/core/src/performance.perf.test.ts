/**
 * Presupuestos de rendimiento (docs/PLAN.md). Corren en el proyecto `perf`, después del resto
 * y sin paralelismo, para medir el algoritmo y no la contención con otros tests.
 * Se toma el mínimo de varias corridas (descarta JIT en frío y ruido del sistema).
 */
import { describe, expect, it } from 'vitest';
import * as commands from './document/commands';
import { DocumentStore } from './document/DocumentStore';
import {
  createBlast,
  createEmptyProject,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from './model/factories';
import { newId } from './model/ids';
import { createDefaultLibrary } from './model/library';
import type { Pattern } from './model/types';
import { generatePatternHoles } from './patterns/pattern';
import { applyChargeRule } from './charging/charge';
import { computeEnergyGrid, DEFAULT_ENERGY_OPTIONS } from './energy/energy';
import { computeTiming } from './timing/timing';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS } from './vibration/vibration';
import { rowTieUp, withDownholeDetonator } from './timing/tieUp';

function best(runs: number, fn: () => void): number {
  let min = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

const pattern: Pattern = {
  id: newId<'Pattern'>(),
  name: 'P',
  kind: 'staggered',
  burden: 5,
  spacing: 6,
  origin: { x: 350_000, y: 8_500_000 },
  rowAzimuth: Math.PI / 2,
  rowAdvance: 'right',
  rows: 50,
  holesPerRow: 100,
  holeTemplate: DEFAULT_HOLE_TEMPLATE,
};

describe('rendimiento con 5.000 taladros', () => {
  it('generar la malla en < 50 ms', () => {
    const ms = best(5, () => generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }));
    expect(ms).toBeLessThan(50);
  });

  it('mover 500, deshacer y rehacer en < 50 ms', () => {
    const store = new DocumentStore(createEmptyProject());
    const blastId = store.project.blasts[0]?.id;
    if (!blastId) throw new Error('sin voladura');
    const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 });
    store.dispatch(commands.addHoles(blastId, holes), 'Agregar');
    const ids = holes.slice(0, 500).map((h) => h.id);
    const ms = best(5, () => {
      store.dispatch(commands.moveHoles(store, ids, 1, 1), 'Mover');
      store.undo();
      store.redo();
    });
    expect(ms).toBeLessThan(50);
  });

  it('tiempos (Dijkstra + ventanas + entre filas) en < 20 ms', () => {
    const lib = createDefaultLibrary();
    const det = lib.detonators[0];
    const c17 = lib.surfaceConnectors[0];
    const c42 = lib.surfaceConnectors[2];
    if (!det || !c17 || !c42) throw new Error('librería incompleta');
    const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h) => ({
      ...h,
      initiators: withDownholeDetonator(h, det.id, 0.5),
    }));
    const base = { ...createBlast('V', newId<'RockMass'>()), patterns: [pattern], holes };
    const plan = rowTieUp(base, {
      patternId: pattern.id,
      startRow: 0,
      startCol: 50,
      interHoleConnectorId: c17.id,
      interRowConnectorId: c42.id,
    });
    const blast = { ...base, initiation: { ...base.initiation, ...plan } };
    const kg = new Float64Array(5000).fill(300);
    const ms = best(10, () => computeTiming(blast, lib, undefined, kg));
    expect(ms).toBeLessThan(20);
  });

  it('energía (Holmberg–Persson) en < 300 ms', () => {
    const lib = createDefaultLibrary();
    const anfo = lib.explosives[0];
    const stem = lib.stemmingMaterials[0];
    if (!anfo || !stem) throw new Error('librería incompleta');
    const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h) => ({
      ...h,
      ...applyChargeRule(
        h,
        {
          stemmingLength: 4,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      ),
    }));
    const blast = { ...createBlast('V', newId<'RockMass'>()), patterns: [pattern], holes };
    const ms = best(3, () =>
      computeEnergyGrid(blast, lib, { ...DEFAULT_ENERGY_OPTIONS, elevation: 7.5 }),
    );
    expect(ms).toBeLessThan(300);
  });

  it('vibración (grilla + puntos de control) en < 800 ms', () => {
    const project = createEmptyProject();
    const lib = project.library;
    const anfo = lib.explosives[0];
    const stem = lib.stemmingMaterials[0];
    const det = lib.detonators[0];
    if (!anfo || !stem || !det) throw new Error('librería incompleta');
    const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h, i) => {
      const loaded = {
        ...h,
        ...applyChargeRule(
          h,
          {
            stemmingLength: 4,
            stemmingMaterialId: stem.id,
            explosiveId: anfo.id,
            primerOffsetFromToe: 0.5,
          },
          lib,
        ),
      };
      // Retardos variados → varias clases de carga por retardo.
      return { ...loaded, initiators: withDownholeDetonator(loaded, det.id, (i % 37) * 0.003) };
    });
    const blast = { ...createBlast('V', newId<'RockMass'>()), patterns: [pattern], holes };
    const ms = best(2, () =>
      computeVibration({ ...project, blasts: [blast] }, blast, DEFAULT_VIBRATION_OPTIONS),
    );
    expect(ms).toBeLessThan(800);
  });
});
