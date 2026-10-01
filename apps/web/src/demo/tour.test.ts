import { createEmptyProject } from '@cronos/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExample } from '../actions';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { DEMO_STEPS, clean, rememberLocale } from './tour';
import { pileReady, playDemoSequence, terrainReady } from './runtime';

const engine = vi.hoisted(() => ({ stopSequence: vi.fn(), zoomToFit: vi.fn() }));

vi.mock('../actions', () => ({ loadExample: vi.fn(), compareScenarios: vi.fn() }));
vi.mock('./runtime', () => ({
  analysisReady: vi.fn(),
  terrainReady: vi.fn(),
  pileReady: vi.fn(),
  playDemoSequence: vi.fn(),
}));
vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return { session: createEditorSession(), getEngine: () => engine };
});

afterEach(() => {
  clean();
  vi.clearAllMocks();
});

describe('recorrido guiado sobre DXF', () => {
  it('carga la mina y espera el terreno incluso al saltar directamente al capítulo 3D', async () => {
    rememberLocale();
    vi.mocked(loadExample).mockImplementation(() => {
      session.document.load(createEmptyProject('Mina DXF'));
      return Promise.resolve();
    });
    const step = DEMO_STEPS.find((s) => s.chapter === 'demo.ch.view3d');
    const signal = new AbortController().signal;
    await step?.prepare?.(signal);
    await step?.run(signal);
    expect(loadExample).toHaveBeenCalledWith('topoMine', expect.any(String), signal);
    expect(terrainReady).toHaveBeenCalledWith(session.document.project, signal);
    expect(useUiStore.getState().viewMode).toBe('3d');
    expect(engine.zoomToFit).toHaveBeenCalled();
    await step?.prepare?.(signal);
    expect(loadExample).toHaveBeenCalledTimes(1);
  });

  it('muestra bloques en 3D hasta el asentamiento y limpia la maza al pasar de capítulo', async () => {
    const step = DEMO_STEPS.find((s) => s.chapter === 'demo.ch.displacement');
    const signal = new AbortController().signal;
    await step?.prepare?.(signal);
    await step?.run(signal);
    expect(pileReady).toHaveBeenCalledWith(signal);
    expect(useUiStore.getState().viewMode).toBe('3d');
    expect(useAnalysisStore.getState().layers.muckpileBlocks).toBe(true);
    expect(useAnalysisStore.getState().layers.labels).toBe(false);
    expect(playDemoSequence).toHaveBeenCalledWith(signal, 15, true);
    expect(step?.ms).toBeGreaterThan(15000);
    clean();
    expect(useAnalysisStore.getState().layers.muckpileBlocks).toBe(false);
    expect(useAnalysisStore.getState().layers.muckpile).toBe(false);
    expect(useAnalysisStore.getState().layers.labels).toBe(true);
    expect(useUiStore.getState().viewMode).toBe('plan');
  });
});
