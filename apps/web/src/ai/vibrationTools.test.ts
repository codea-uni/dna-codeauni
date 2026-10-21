import type { SeismographRecord } from '@cronos/core';
import { describe, expect, it, vi } from 'vitest';
import { session } from '../session';
import { useMineVibration } from '../vibration/mineStore';
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
  topographyTin: () => undefined,
  collectAssets: vi.fn(),
  drapeNewHoles: vi.fn(),
  storeEmbeddedAssets: vi.fn(),
  loadedWorkings: () => [],
}));

const { document } = session;
const ok = async (name: string, args: unknown) => {
  const out = await runTool(name, args);
  if (!out.ok) throw new Error(out.error);
  return out.result as Record<string, unknown>;
};

describe('asistente: vibración en labores y calibración', () => {
  it('punto en una labor por nombre (a su centro) y por coordenadas', async () => {
    const blast = document.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const sq = (y: number) => [
      { x: 0, y, z: -200 },
      { x: 4, y, z: -200 },
      { x: 4, y, z: -196 },
      { x: 0, y, z: -196 },
    ];
    document.dispatch(
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { excavations: [{ tag: 'ug-face', kind: 'drive', sections: [sq(0), sq(10)] }] },
      },
      'labor',
    );
    const byName = await ok('add_working_point', { working: 'UG face', name: 'Galería 3370' });
    expect(byName).toMatchObject({ point: 'Galería 3370', kind: 'underground-working', z: -198 });
    expect(byName.x).toBeCloseTo(2, 6);
    expect(byName.y).toBeCloseTo(5, 6);
    await ok('add_working_point', { x: 100, y: 0, z: 3400, kind: 'community', name: 'Comunidad' });
    const pts = document.project.monitoringPoints ?? [];
    expect(pts.map((p) => [p.name, p.kind, p.working ?? null])).toEqual([
      ['Galería 3370', 'underground-working', 'Frente de túnel · galería'],
      ['Comunidad', 'community', null],
    ]);
    const bad = await runTool('add_working_point', { working: 'rampa 9' });
    expect(bad.ok).toBe(false);
  });

  it('calibra la ley con las mediciones de la mina y la usa en el proyecto', async () => {
    const records: SeismographRecord[] = [];
    let i = 0;
    for (const w of [5, 20, 80])
      for (const r of [20, 60, 150])
        records.push({
          id: String(i++),
          date: '2026-10-01',
          zone: 'Norte',
          context: 'surface',
          charge: w,
          distance: r,
          ppv: 0.9 * Math.pow(r / Math.sqrt(w), -1.5),
        });
    useMineVibration.getState().set({ mineId: 'm', records });
    const out = await ok('calibrate_vibration_law', { scaling: 'square-root', level: 50 });
    expect(out).toMatchObject({ zone: 'Norte', context: 'surface', n: 9, applied: true });
    expect(out.k50_mm_s).toBeCloseTo(900, 0);
    expect(out.beta).toBeCloseTo(1.5, 3);
    // La ley elegida queda en el proyecto (se guarda con la versión), no en el estado de la vista.
    const law = document.project.siteModels.vibrationLaws.find(
      (l) => l.id === document.project.siteModels.activeVibrationLawId,
    );
    expect(law).toMatchObject({ context: 'surface', confidence: 0.5 });
    expect(law?.k).toBeCloseTo(0.9, 6);
  });
});
