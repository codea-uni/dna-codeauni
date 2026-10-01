import { computeMuckpile, createEmptyProject, type MuckpileResult } from '@cronos/core';
import { afterEach, expect, it, vi } from 'vitest';
import { session, getCompute } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { startMuckpileRunner } from './runner';

vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  const api = { computeMuckpile: vi.fn() };
  return { session: createEditorSession(), getCompute: () => ({ api }), getEngine: () => null };
});
vi.mock('../topography/session', () => ({ topographyTin: () => undefined }));

afterEach(() => {
  vi.restoreAllMocks();
});

it('descarta una maza calculada para el documento temporal después de restaurar el original', async () => {
  session.document.load(createEmptyProject('Tráiler'));
  const blast = session.document.project.blasts[0];
  if (!blast) throw new Error('Sin voladura');
  const result = computeMuckpile(session.document.project, blast.id);
  if (!result) throw new Error('Sin resultado');
  let finish: ((r: MuckpileResult) => void) | undefined;
  const pending = new Promise<MuckpileResult>((r) => {
    finish = r;
  });
  vi.mocked(getCompute().api.computeMuckpile).mockReturnValue(pending);
  useAnalysisStore
    .getState()
    .set({ muckpile: null, muckpileComputing: false, muckpileSection: null });
  const stop = startMuckpileRunner();
  try {
    const s = useAnalysisStore.getState();
    s.set({ muckpileRequest: s.muckpileRequest + 1 });
    expect(useAnalysisStore.getState().muckpileComputing).toBe(true);
    session.document.load(createEmptyProject('Cliente'));
    finish?.(result);
    await pending;
    await Promise.resolve();
    expect(useAnalysisStore.getState().muckpile).toBeNull();
    expect(useAnalysisStore.getState().muckpileComputing).toBe(false);
  } finally {
    stop();
  }
});
