import { buildExample, EXAMPLE_SPECS, radToDeg, sToMs, type Blast } from '@cronos/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as actions from '../actions';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { AI_FUNCTION_DECLARATIONS, runTool } from './tools';

vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return {
    session: createEditorSession(),
    getEngine: () => null,
    getCompute: () => {
      throw new Error('sin worker en las pruebas');
    },
    APP_VERSION: 'test',
  };
});
vi.mock('../topography/session', () => ({
  topographyElevation: () => null,
  collectAssets: vi.fn(),
  drapeNewHoles: vi.fn(),
  storeEmbeddedAssets: vi.fn(),
}));
vi.mock('../demo/runtime', () => ({ analysisReady: () => Promise.resolve() }));
// La malla se genera en el worker: aquí se verifica qué le pide la herramienta.
vi.mock('../actions', async (original) => ({
  ...(await original<typeof actions>()),
  generatePattern: vi.fn(() =>
    Promise.resolve({
      patternId: 'p',
      name: 'Malla 2',
      holes: 120,
      replacedHoles: 250,
      hasFreeFace: true,
      outside: 0,
    }),
  ),
}));

const { document } = session;
const blast = (): Blast => {
  const b = document.project.blasts[0];
  if (!b) throw new Error('sin voladura');
  return b;
};
const ok = async (name: string, args: unknown) => {
  const out = await runTool(name, args);
  if (!out.ok) throw new Error(out.error);
  return out.result as Record<string, unknown>;
};

beforeEach(() => {
  // «Producción estándar»: un perímetro con cara libre al Norte, malla 6 × 7 m Ø 229 mm.
  document.load(buildExample(EXAMPLE_SPECS.production));
  useUiStore.getState().setActiveBoundary(null);
  vi.mocked(actions.generatePattern).mockClear();
});

describe('herramientas del asistente de IA', () => {
  it('sin perímetro pide dibujarlo antes de generar la malla', async () => {
    document.load({ ...document.project, blasts: [{ ...blast(), boundaries: [] }] });
    const out = await runTool('generate_pattern', { kind: 'square', burden: 5 });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toContain('NO_PERIMETER');
    expect(actions.generatePattern).not.toHaveBeenCalled();
  });

  it('malla cuadrada sobre el perímetro existente: conserva el burden y la plantilla', async () => {
    const r = await ok('generate_pattern', { kind: 'square', diameter_mm: 165 });
    const [form, options] = vi.mocked(actions.generatePattern).mock.calls[0] ?? [];
    const boundary = blast().boundaries[0];
    // Pedido: cuadrada; burden y espaciamiento salen de la malla actual (6 m), Ø nuevo 165 mm.
    expect(form).toMatchObject({ kind: 'square', burden: 6, spacing: 6, boundaryId: boundary?.id });
    expect(form?.frontOffset).toBe(3);
    expect(options?.confirm).toBe(false);
    expect(options?.template?.diameter).toBeCloseTo(0.165, 12);
    expect(options?.template?.subdrill).toBe(1.5);
    expect(r).toMatchObject({ holes: 120, replaced_holes: 250, burden: 6, spacing: 6 });
  });

  it('carga la fila 1: fondo 3 m, taco 4,5 m y la columna completa el resto', async () => {
    const before = blast().holes.filter((h) => h.row === 0);
    await ok('set_charge', {
      target: { rows: [1] },
      bottom_explosive: 'ANFO pesado 30/70',
      bottom_length: 3,
      column_explosive: 'ANFO',
      stemming: 4.5,
      primer: 'Booster 450',
    });
    const lib = document.project.library;
    for (const old of before) {
      const h = blast().holes.find((x) => x.id === old.id);
      if (!h) throw new Error('falta un taladro');
      const kinds = h.decks.map((d) => d.kind);
      expect(kinds).toEqual(['explosive', 'explosive', 'stemming']);
      expect(h.decks[0]?.length).toBe(3);
      expect(h.decks[2]?.length).toBe(4.5);
      // Columna = largo − fondo − taco (la suma llega exacta a la boca).
      expect(h.decks[1]?.length).toBeCloseTo(h.length - 3 - 4.5, 9);
      const column = h.decks[1];
      expect(
        column?.kind === 'explosive' &&
          lib.explosives.find((e) => e.id === column.explosiveId)?.name,
      ).toBe('ANFO');
      // Se conserva el detonador y su retardo; el primer queda junto a él, a 0,5 m del fondo.
      expect(h.initiators[0]?.detonatorId).toBe(old.initiators[0]?.detonatorId);
      expect(h.initiators[0]?.delay).toBe(old.initiators[0]?.delay);
      expect(h.initiators[0]?.depth).toBeCloseTo(h.length - 0.5, 9);
    }
    // Las otras filas no cambian, y todo es un solo paso de deshacer.
    const other = blast().holes.find((h) => h.row === 1);
    expect(other?.decks.length).toBe(3);
    document.undo();
    expect(blast().holes.filter((h) => h.row === 0)).toEqual(before);
  });

  it('un producto desconocido no cambia nada y devuelve la lista para corregir', async () => {
    const version = document.version;
    const out = await runTool('set_charge', {
      target: { all: true },
      column_explosive: 'Dinamita X',
      stemming: 4,
    });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toMatch(/Unknown explosive "Dinamita X". Available: .*ANFO/);
    expect(document.version).toBe(version);
  });

  it('sin decir qué taladros no se asume «todos»', async () => {
    const out = await runTool('edit_holes', { target: {}, diameter_mm: 200 });
    expect(out.ok).toBe(false);
  });

  it('edita diámetro e inclinación en unidades de obra (mm y grados)', async () => {
    await ok('edit_holes', {
      target: { labels: ['1', '2'] },
      diameter_mm: 200,
      inclination_deg: 10,
    });
    for (const label of ['1', '2']) {
      const h = blast().holes.find((x) => x.label === label);
      expect(h?.diameter).toBeCloseTo(0.2, 12);
      expect(radToDeg(h?.inclination ?? 0)).toBeCloseTo(10, 9);
    }
  });

  it('amarre en V de 17/42 ms: un solo árbol que une todos los taladros desde el centro de la fila 1', async () => {
    const r = await ok('set_tie_up', { mode: 'v', inter_hole: 17, inter_row: '42' });
    const holes = blast().holes.filter((h) => h.patternId === blast().patterns[0]?.id);
    // Un amarre por filas conecta n taladros con n − 1 conexiones (una red sin ciclos).
    expect(blast().initiation.connections).toHaveLength(holes.length - 1);
    expect(r.connections).toBe(holes.length - 1);
    const lib = document.project.library;
    const delays = new Set(
      blast().initiation.connections.map((c) =>
        sToMs(lib.surfaceConnectors.find((x) => x.id === c.connectorId)?.delay ?? NaN),
      ),
    );
    expect([...delays].sort((a, b) => a - b)).toEqual([17, 42]);
    const front = holes.filter((h) => h.row === 0).map((h) => h.col ?? 0);
    const start = blast().initiation.initiationPoints[0]?.at;
    const startHole = holes.find((h) => start?.kind === 'hole' && h.id === start.holeId);
    expect(startHole?.row).toBe(0);
    expect(startHole?.col).toBe(Math.round((Math.min(...front) + Math.max(...front)) / 2));
  });

  it('electrónicos 9/120 ms: cada taladro con su tiempo y sin red de superficie', async () => {
    await ok('set_electronic_timing', { inter_hole_ms: 9, inter_row_ms: 120, start: 'left' });
    const lib = document.project.library;
    const holes = blast().holes;
    expect(blast().initiation.connections).toHaveLength(0);
    for (const h of holes)
      expect(lib.detonators.find((d) => d.id === h.initiators[0]?.detonatorId)?.type).toBe(
        'electronic',
      );
    const row1 = holes.filter((h) => h.row === 0).sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
    // Desde el extremo izquierdo de la fila 1: 0, 9, 18 ms…
    expect(row1.slice(0, 3).map((h) => sToMs(h.initiators[0]?.delay ?? NaN))).toEqual([0, 9, 18]);
  });

  it('retardos taladro por taladro conservan el detonador de cada uno', async () => {
    const det = blast().holes.find((h) => h.label === '5')?.initiators[0]?.detonatorId;
    await ok('set_hole_delays', { delays: [{ label: '5', delay_ms: 475 }] });
    const h = blast().holes.find((x) => x.label === '5');
    expect(h?.initiators[0]?.detonatorId).toBe(det);
    expect(sToMs(h?.initiators[0]?.delay ?? NaN)).toBeCloseTo(475, 9);
  });

  it('perímetro rectangular de 100 × 40 m con cara libre al Norte, y queda activo', async () => {
    const r = await ok('create_perimeter', {
      rectangle: { width: 100, depth: 40, center_x: 1000, center_y: 2000 },
      free_face_sides: ['N'],
    });
    const created = blast().boundaries.at(-1);
    expect(r.area_m2).toBe(4000);
    expect(created?.polygon).toEqual([
      { x: 950, y: 1980 },
      { x: 1050, y: 1980 },
      { x: 1050, y: 2020 },
      { x: 950, y: 2020 },
    ]);
    // Aristas: 0 Sur, 1 Este, 2 Norte (de (1050, 2020) a (950, 2020)), 3 Oeste.
    expect(created?.freeFaceEdges).toEqual([2]);
    expect(useUiStore.getState().activeBoundaryId).toBe(created?.id);
  });

  it('argumentos inválidos o herramienta desconocida vuelven como error al modelo', async () => {
    expect((await runTool('generate_pattern', { kind: 'hexagonal' })).ok).toBe(false);
    expect((await runTool('borrar_todo', {})).ok).toBe(false);
  });

  it('deshacer revierte el último cambio y lo informa', async () => {
    const n = blast().holes.length;
    await ok('edit_holes', { target: { all: true }, subdrill: 2 });
    const r = await ok('undo', {});
    expect(r.undone).toEqual([`IA: editar ${n} taladros`]);
    expect(blast().holes.every((h) => h.subdrill === 1.5)).toBe(true);
  });
});

describe('declaraciones para Gemini', () => {
  const ALLOWED = new Set([
    'type',
    'description',
    'enum',
    'properties',
    'required',
    'items',
    'minimum',
    'maximum',
    'minItems',
    'maxItems',
  ]);
  const check = (schema: Record<string, unknown>, path: string): void => {
    for (const key of Object.keys(schema)) expect(ALLOWED.has(key), `${path}.${key}`).toBe(true);
    expect(['OBJECT', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY']).toContain(schema.type);
    for (const [k, v] of Object.entries(
      (schema.properties ?? {}) as Record<string, Record<string, unknown>>,
    ))
      check(v, `${path}.${k}`);
    if (schema.items) check(schema.items as Record<string, unknown>, `${path}[]`);
  };

  it('solo usan el subconjunto de esquema que acepta la API', () => {
    expect(AI_FUNCTION_DECLARATIONS.length).toBeGreaterThanOrEqual(18);
    for (const d of AI_FUNCTION_DECLARATIONS) {
      expect(d.name).toMatch(/^[a-z_]+$/);
      if ('parameters' in d) check(d.parameters, d.name);
    }
  });
});
