import {
  applyChargeRule,
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  type Hole,
} from '@cronos/core';
import type { XrRow } from '@cronos/engine';
import { describe, expect, it, vi } from 'vitest';
import { holeCardRows } from './holeCard';

vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return { session: createEditorSession(), getEngine: () => null };
});

const project = createEmptyProject();
const lib = project.library;

/** Taladro de 16,5 m y Ø 200 mm con la regla de `charge.test.ts`: taco 4 m + ANFO 12,5 m. */
function loadedHole(): Hole {
  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  const rule = {
    stemmingLength: 4,
    stemmingMaterialId: lib.stemmingMaterials[0]!.id,
    explosiveId: lib.explosives[0]!.id,
    primerId: lib.primers[0]!.id,
    detonatorId: lib.detonators[0]!.id,
    primerOffsetFromToe: 0.5,
  };
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
  const h = {
    ...createHole({
      position: { x: 0, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: '7',
    }),
    length: 16.5,
    diameter: 0.2,
  };
  return { ...h, ...applyChargeRule(h, rule, lib) };
}

const cells = (lines: ReturnType<typeof holeCardRows>): XrRow[] =>
  lines.flatMap((l) => ('label' in l ? [l] : [...l]));

describe('ficha del taladro en el visor', () => {
  it('la columna va de boca a fondo: taco y después explosivo, y suma el largo del taladro', () => {
    const rows = cells(holeCardRows(loadedHole(), project, null));
    const bar = rows.find((r) => r.bar)?.bar ?? [];
    expect(bar.map((s) => s.fraction)).toEqual([4 / 16.5, 12.5 / 16.5]);
    expect(bar.reduce((a, s) => a + s.fraction, 0)).toBeCloseTo(1, 12);
  });

  it('una leyenda por tramo; el explosivo con sus kg (ANFO en Ø 200 mm: 25,133 kg/m · 12,5 m)', () => {
    const legend = cells(holeCardRows(loadedHole(), project, null)).filter((r) => r.swatch);
    expect(legend).toHaveLength(2);
    // Valor de `charge.test.ts` («carga lineal a granel»): 25,1327 kg/m × 12,5 m = 314,2 kg.
    expect(legend[1]?.label).toContain('314,2 kg');
    expect(legend[0]?.label).not.toContain('kg');
  });

  it('un taladro sin carga es una columna vacía', () => {
    const empty = { ...loadedHole(), decks: [], initiators: [] };
    const bar = cells(holeCardRows(empty, project, null)).find((r) => r.bar)?.bar;
    expect(bar?.map((s) => s.fraction)).toEqual([1]);
  });
});
