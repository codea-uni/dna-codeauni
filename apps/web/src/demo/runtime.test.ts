import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMuckpile } from '../analysis/muckpileActions';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { analysisReady, pileReady, terrainReady } from './runtime';

vi.mock('../analysis/muckpileActions', () => ({ requestMuckpile: vi.fn() }));
vi.mock('../topography/session', () => ({ topographyTin: vi.fn() }));
vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return { session: createEditorSession(), getEngine: () => null };
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('preparación del tour y tráiler', () => {
  it('respeta Esc aunque el documento no tenga terreno que esperar', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(terrainReady(session.document.project, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('no acepta un análisis de la versión anterior y permite cancelar su espera', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    useAnalysisStore.setState({ version: session.document.version - 1, computing: false });
    const controller = new AbortController();
    const ready = analysisReady(controller.signal);
    const rejected = expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
  });

  it('pide la maza una sola vez por documento y cancela sin martillar el worker', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    useAnalysisStore.setState({ muckpile: null, muckpileVersion: -1, muckpileComputing: false });
    const controller = new AbortController();
    const ready = pileReady(controller.signal);
    const rejected = expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(requestMuckpile).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
  });
});
