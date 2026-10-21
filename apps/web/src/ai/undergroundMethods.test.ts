import { buildExample, EXAMPLE_SPECS } from '@cronos/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '../session';
import { useMethodStore } from '../underground/methodStore';
import { useUndergroundStore } from '../underground/store';
import { runTool } from './tools';

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

const { document } = session;
const ok = async (name: string, args: unknown) => {
  const out = await runTool(name, args);
  if (!out.ok) throw new Error(out.error);
  return out.result as Record<string, unknown>;
};
const tagged = (tag: string) =>
  document.project.blasts[0]?.holes.filter((h) => h.tags?.includes(tag)).length ?? 0;

// La ventana flotante del panel mide la página: un DOM mínimo para Node.
vi.stubGlobal('document', { querySelector: () => null });
vi.stubGlobal('window', { innerWidth: 1600, innerHeight: 1000 });

beforeEach(() => {
  document.load(buildExample(EXAMPLE_SPECS.production));
});

describe('plantillas por método de minado en el asistente', () => {
  it('lista los métodos agrupados con sus valores por defecto', async () => {
    const out = await ok('list_mining_methods', {});
    const groups = out.groups as { group: string; methods: { method: string }[] }[];
    expect(groups.map((g) => g.group)).toEqual(['development', 'raise', 'stope']);
    expect(groups.flatMap((g) => g.methods).length).toBe(20);
  });

  it('diseña por método, lo lleva al 3D con su marca y conserva las otras labores', async () => {
    const a = await ok('design_by_method', { method: 'longholeParallel', rows: 3 });
    expect(a.in_3d).toBe(true);
    expect(tagged('ug-longhole')).toBe(a.holes_total);
    expect(a.powder_factor_status).toBe('ok');
    const b = await ok('design_by_method', { method: 'slc', preset: 'Ø 115 mm' });
    expect(tagged('ug-slc')).toBe(b.holes_total);
    expect(tagged('ug-longhole')).toBe(a.holes_total);
    // Cada taladro lleva carga y detonador con su tiempo.
    const holes = document.project.blasts[0]?.holes.filter((h) => h.tags?.includes('ug-slc')) ?? [];
    expect(holes.every((h) => h.decks.some((d) => d.kind === 'explosive'))).toBe(true);
    expect(useMethodStore.getState().methodId).toBe('slc');
  });

  it('solo calcula con send false y rechaza datos imposibles', async () => {
    const out = await ok('design_by_method', { method: 'vcr', send: false });
    expect(out.in_3d).toBe(false);
    expect(tagged('ug-vcr')).toBe(0);
    const bad = await runTool('design_by_method', {
      method: 'driftMechanized',
      width_m: 6,
      height_m: 2,
    });
    expect(bad.ok).toBe(false);
  });
});

describe('mover un diseño subterráneo ya puesto en 3D', () => {
  const faceHoles = () =>
    document.project.blasts[0]?.holes.filter((h) => h.tags?.includes('ug-face')) ?? [];

  it('a otro lugar pregunta (reemplazar o agregar) y no borra nada hasta el «sí»', async () => {
    await ok('design_tunnel_face', {});
    const before = faceHoles();
    expect(before.length).toBeGreaterThan(0);
    const p = useUndergroundStore.getState().placements?.face;
    if (!p) throw new Error('sin ubicación');
    const ask = await ok('design_tunnel_face', { x: p.x + 200, y: p.y });
    expect(ask).toMatchObject({ applied: false, needs_confirmation: true });
    expect(ask.question).toMatch(/Ya hay un frente de \d+ taladros en .*¿lo reemplazo/);
    expect(ask.options).toContain('Cancelar');
    expect(faceHoles()).toEqual(before);
    expect(useUndergroundStore.getState().placements?.face).toEqual(p);
    // Con la confirmación se mueve.
    const done = await ok('design_tunnel_face', { x: p.x + 200, y: p.y, confirmed: true });
    expect(done.in_3d).toBe(true);
    expect(faceHoles()[0]?.collar.x).toBeGreaterThan((before[0]?.collar.x ?? 0) + 150);
  });

  it('ajustar en el mismo lugar no pregunta', async () => {
    await ok('design_tunnel_face', {});
    const out = await ok('design_tunnel_face', { hole_diameter_mm: 51 });
    expect(out.needs_confirmation).toBeUndefined();
    expect(out.in_3d).toBe(true);
    // La sección va en español (antes llegaba «arched 4.5 × 4 m» al usuario).
    expect(out.section).not.toMatch(/arched|horseshoe/);
  });

  it('una plantilla por método también pregunta antes de irse a otro lugar', async () => {
    await ok('design_by_method', { method: 'driftMechanized' });
    const p = useMethodStore.getState().placements.driftMechanized;
    if (!p) throw new Error('sin ubicación');
    const ask = await ok('design_by_method', { method: 'driftMechanized', x: p.x - 300 });
    expect(ask.needs_confirmation).toBe(true);
    expect(useMethodStore.getState().placements.driftMechanized).toEqual(p);
  });
});
