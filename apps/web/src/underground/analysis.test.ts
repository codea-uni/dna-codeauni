import { analyzeBlast, buildExample, EXAMPLE_SPECS } from '@cronos/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '../session';
import { runTool } from '../ai/tools';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUgAnalysisStore } from './analysisStore';
import { computeFace, pickFaceExplosive } from './model';
import { defaultPlacements, sendFace } from './send';
import { useUndergroundStore } from './store';
import { UndergroundAnalysis } from './UndergroundAnalysis';

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
// renderToString no tiene instantánea de servidor para useSyncExternalStore: el documento directo.
vi.mock('../hooks/useDocument', async () => {
  const { session: s } = await import('../session');
  return {
    useProject: () => s.document.project,
    useActiveBlast: () => s.document.project.blasts[0],
  };
});
vi.mock('../topography/session', () => ({
  topographyElevation: () => null,
  collectAssets: vi.fn(),
  drapeNewHoles: vi.fn(),
  storeEmbeddedAssets: vi.fn(),
}));

const { document } = session;

/** Lleva el frente del formulario al 3D y deja el análisis vigente en el store. */
function sendDefaultFace(holeInterval: number) {
  const store = useUndergroundStore.getState();
  store.patchFace({ holeInterval });
  const form = useUndergroundStore.getState().face;
  const explosive = pickFaceExplosive(document.project.library, form);
  if (!explosive) throw new Error('sin explosivo');
  const n = sendFace(form, computeFace(form, explosive), defaultPlacements(document.project).face);
  expect(n).toBeGreaterThan(0);
  const blast = document.project.blasts[0];
  if (!blast) throw new Error('sin voladura');
  // Solo el frente: se quitan los taladros de banco del ejemplo.
  document.dispatch(
    [
      {
        type: 'holes/remove',
        blastId: blast.id,
        ids: blast.holes.filter((h) => !h.tags?.includes('ug-face')).map((h) => h.id),
      },
    ],
    'solo frente',
  );
  const analysis = analyzeBlast(document.project, blast.id);
  useAnalysisStore.setState({ analysis, version: document.version, computing: false });
  return analysis;
}

beforeEach(() => {
  document.load(buildExample(EXAMPLE_SPECS.production));
  useUgAnalysisStore.getState().set({ open: true });
});

describe('pestaña Análisis de Subterránea', () => {
  it('el frente por defecto (25 ms entre taladros) sale sin acoplamiento', async () => {
    const a = sendDefaultFace(0.025);
    expect(a?.checks.map((c) => c.id)).not.toContain('ugCoupling');
    const out = await runTool('underground_state', {});
    if (!out.ok) throw new Error(out.error);
    const state = out.result as {
      analysis: {
        sequence: { coupled_group_count: number };
        volumes: { kind: string; volume_m3: number; tonnes: number }[];
        fragmentation_kuz_ram_swebrec: { face?: { p80_cm: number } };
      };
    };
    expect(state.analysis.sequence.coupled_group_count).toBe(0);
    const face = state.analysis.volumes.find((v) => v.kind === 'face');
    expect(face?.volume_m3).toBeGreaterThan(0);
    expect(state.analysis.fragmentation_kuz_ram_swebrec.face?.p80_cm).toBeGreaterThan(0);
  });

  it('con 0 ms entre taladros del mismo número aparecen grupos acoplados', async () => {
    const a = sendDefaultFace(0);
    expect(a?.checks.map((c) => c.id)).toContain('ugCoupling');
    const out = await runTool('underground_state', {});
    if (!out.ok) throw new Error(out.error);
    const seq = (out.result as { analysis: { sequence: { coupled_group_count: number } } }).analysis
      .sequence;
    expect(seq.coupled_group_count).toBeGreaterThan(0);
  });

  it('la pestaña se dibuja (halos, secuencia, cubicación y fragmentación)', () => {
    sendDefaultFace(0.025);
    const html = renderToString(createElement(UndergroundAnalysis));
    expect(html).toContain('Simular voladura');
    // (El análisis de tiempos vive en un store que no se lee en el servidor.)
    expect(html).toContain('Cubicación');
    expect(html).toContain('<svg');
  });
});
