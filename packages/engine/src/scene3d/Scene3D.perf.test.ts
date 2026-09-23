import {
  applyChargeRule,
  createEmptyProject,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  generatePatternHoles,
  newId,
} from '@blastlab/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_3D_OPTIONS, Scene3D } from './Scene3D';

describe('rendimiento 3D', () => {
  it('reconstruir 5.000 taladros × 4 tramos en < 150 ms', () => {
    const p = createEmptyProject();
    const lib = p.library;
    const base = p.blasts[0];
    const anfo = lib.explosives[0];
    const stem = lib.stemmingMaterials[0];
    if (!base || !anfo || !stem) throw new Error('proyecto incompleto');
    const pattern = {
      id: newId<'Pattern'>(),
      name: 'P',
      kind: 'staggered' as const,
      burden: 6,
      spacing: 7,
      origin: { x: 0, y: 0 },
      rowAzimuth: Math.PI / 2,
      rowAdvance: 'right' as const,
      rows: 50,
      holesPerRow: 100,
      holeTemplate: { ...DEFAULT_HOLE_TEMPLATE, subdrill: 1.5 },
    };
    // Taco + aire + ANFO + 1 m vacío arriba (taladro algo más largo) → 4 tramos por taladro.
    const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h) => {
      const r = applyChargeRule(
        h,
        {
          stemmingLength: 3,
          airDeckLength: 1,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      );
      return {
        ...h,
        ...r,
        decks: r.decks.map((d, i, all) =>
          i === all.length - 1 ? { ...d, length: d.length - 1 } : d,
        ),
      };
    });
    const project = { ...p, blasts: [{ ...base, holes }] };
    const scene = new Scene3D();
    scene.rebuild(project, project.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    expect(scene.segmentCount).toBe(20_000);
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      scene.rebuild(project, project.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(150);
  });
});
