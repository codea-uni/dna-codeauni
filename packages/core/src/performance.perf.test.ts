/**
 * Presupuestos de rendimiento (docs/ROADMAP.md). Corren en el proyecto `perf`, después del resto
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
import { effectiveBurden } from './timing/effectiveBurden';
import { timingChecks } from './timing/timingChecks';
import { checkOptionsOf } from './diagnostics/designChecks';
import { buildExample, EXAMPLE_SPECS } from './examples/examples';
import { computeMuckpile } from './muckpile/simulate';

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

    // Burden efectivo y revisión de tiempos (G5), O(n²) en el worker: presupuesto de 300 ms, el
    // mismo que la energía (criterio de docs/ROADMAP.md: actualizar en < 300 ms tras una edición).
    const withFace = {
      ...blast,
      freeFaces: [
        {
          id: newId<'FreeFace'>(),
          crest: [
            { x: 349_990, y: 8_500_000 + 3, z: 15 },
            { x: 351_000, y: 8_500_000 + 3, z: 15 },
          ],
        },
      ],
    };
    const timing = computeTiming(withFace, lib, undefined, kg);
    const g5 = best(3, () => {
      const eb = effectiveBurden(withFace, timing.fireTime, withFace.calcParams.reliefRate);
      timingChecks(
        withFace,
        timing.fireTime,
        eb,
        checkOptionsOf(withFace),
        withFace.calcParams.delayGuide,
      );
    });
    expect(g5).toBeLessThan(300);
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

describe('pila de material (A7)', () => {
  it('≈ 500 taladros con bloques de 1,5 m en < 1 s', () => {
    // Producción estándar ampliada a 190 × 120 m: ≈ 500 taladros de 229 mm, banco de 15 m.
    const project = buildExample({
      ...EXAMPLE_SPECS.production,
      perimeter: [
        { x: 0, y: 0 },
        { x: 190, y: 0 },
        { x: 190, y: 120 },
        { x: 0, y: 120 },
      ],
      freeFaceEdges: [2],
      scenarios: [],
    });
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    expect(blast.holes.length).toBeGreaterThanOrEqual(450);
    const ms = best(3, () => computeMuckpile(project, blast.id));
    expect(ms).toBeLessThan(1000);
  });
});
