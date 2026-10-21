/* eslint-disable @typescript-eslint/no-non-null-assertion -- datos de prueba fijos */
import { buildExample, EXAMPLE_SPECS, newId } from '@cronos/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePattern } from '../actions';
import { session } from '../session';

vi.mock('../session', async () => {
  const { createEditorSession, generatePatternHoles } = await import('@cronos/core');
  return {
    session: createEditorSession(),
    getEngine: () => ({ getViewCenter: () => ({ x: 0, y: 0 }) }),
    getCompute: () => ({
      api: {
        generatePattern: (
          pattern: Parameters<typeof generatePatternHoles>[0],
          bench: Parameters<typeof generatePatternHoles>[1],
          startNumber: number,
        ) => Promise.resolve(generatePatternHoles(pattern, bench, { startNumber })),
      },
    }),
  };
});
// Cota de boca que pone el terreno a cada taladro (por índice), o `null` para dejarlos como vienen.
const terrain = vi.hoisted(() => ({ z: null as ((i: number) => number) | null }));
vi.mock('../topography/session', () => ({
  drapeNewHoles: (_blast: unknown, holes: { collar: { z: number } }[]) =>
    Promise.resolve({
      holes: terrain.z
        ? holes.map((h, i) => ({ ...h, collar: { ...h.collar, z: terrain.z?.(i) ?? h.collar.z } }))
        : holes,
      outside: 0,
      floor: null,
    }),
}));

beforeEach(() => {
  terrain.z = null;
  const project = buildExample(EXAMPLE_SPECS.production);
  project.blasts[0]!.holes = project.blasts[0]!.holes.map((h, i) => ({
    ...h,
    label: String(1672 + i),
  }));
  session.document.load(project);
});

const regenerate = () => {
  const blast = session.document.project.blasts[0]!;
  return generatePattern(
    {
      kind: 'square',
      burden: 8,
      spacing: 8,
      rowAzimuth: Math.PI / 2,
      rowAdvance: 'right',
      rows: 3,
      holesPerRow: 3,
      frontOffset: 4,
      boundaryId: blast.boundaries[0]!.id,
    },
    { confirm: false },
  );
};

describe('generación real de una malla de reemplazo', () => {
  it('reemplazos sucesivos empiezan en 1 y deshacer recupera las etiquetas previas', async () => {
    const before = session.document.project.blasts[0]!.holes;
    const first = await regenerate();
    expect(first?.replacedHoles).toBe(before.length);
    const holes = session.document.project.blasts[0]!.holes;
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.map((h) => h.label)).toEqual(holes.map((_, i) => String(i + 1)));
    await regenerate();
    expect(session.document.project.blasts[0]!.holes.map((h) => h.label)).toEqual(
      holes.map((h) => h.label),
    );
    session.document.undo();
    session.document.undo();
    expect(session.document.project.blasts[0]!.holes).toEqual(before);
  });
  it('conserva otra malla y salta sus etiquetas ocupadas', async () => {
    const project = session.document.project;
    const blast = project.blasts[0]!;
    const boundary = { ...blast.boundaries[0]!, id: newId<'Boundary'>() };
    const pattern = { ...blast.patterns[0]!, id: newId<'Pattern'>(), boundaryId: boundary.id };
    const other = { ...blast.holes[0]!, id: newId<'Hole'>(), patternId: pattern.id, label: '2' };
    session.document.load({
      ...project,
      blasts: [
        {
          ...blast,
          boundaries: [...blast.boundaries, boundary],
          patterns: [...blast.patterns, pattern],
          holes: [...blast.holes, other],
        },
      ],
    });
    await regenerate();
    const after = session.document.project.blasts[0]!;
    expect(after.holes.find((h) => h.id === other.id)).toEqual(other);
    const labels = after.holes.filter((h) => h.patternId !== pattern.id).map((h) => h.label);
    expect(labels[0]).toBe('1');
    expect(labels[1]).toBe('3');
    expect(new Set(after.holes.map((h) => h.label)).size).toBe(after.holes.length);
  });
});

describe('taladros con la boca en el piso o bajo él', () => {
  it('no se crean, los demás quedan numerados sin huecos y los cortos se informan', async () => {
    const blast = session.document.project.blasts[0]!;
    const floor = blast.boundaries[0]!.floorElevation ?? blast.bench.floorElevation;
    const H = blast.bench.height;
    // Terreno en pendiente: uno de cada tres bajo el piso, otro corto (¼ de banco), otro normal.
    terrain.z = (i) => (i % 3 === 0 ? floor - 1 : i % 3 === 1 ? floor + H / 4 : floor + H);
    const r = await regenerate();
    const holes = session.document.project.blasts[0]!.holes;
    expect(r?.belowFloor).toBeGreaterThan(0);
    expect(r?.holes).toBe(holes.length);
    expect(holes.every((h) => h.collar.z > floor)).toBe(true);
    expect(holes.map((h) => h.label)).toEqual(holes.map((_, i) => String(i + 1)));
    expect(r?.shortHoles.length).toBe(holes.filter((h) => h.collar.z - floor < H / 2).length);
    expect(r?.shortHoles.length).toBeGreaterThan(0);
  });
});
