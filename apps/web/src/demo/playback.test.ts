import { commands, createEmptyProject, type Project } from '@cronos/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { runStep, startDemo, stopDemo } from './playback';
import { TRAILER_STEPS } from './trailer';

vi.mock('../actions', () => ({ loadExample: vi.fn(), compareScenarios: vi.fn() }));
vi.mock('../session', async () => {
  const { createEditorSession, analyzeBlast } = await import('@cronos/core');
  return {
    session: createEditorSession(),
    getEngine: () => null,
    getCompute: () => ({ api: { analyzeBlast: vi.fn(analyzeBlast) } }),
  };
});
vi.mock('../server/projectSession', async () => {
  const { create } = await import('zustand');
  return {
    useProjectSession: create(() => ({
      status: 'idle',
      current: null,
      baseProject: null,
      baseDocVersion: 0,
    })),
  };
});
vi.mock('../persistence/autosave', () => ({ suspendAutosave: () => vi.fn() }));

afterEach(() => {
  stopDemo();
  vi.useRealTimers();
  vi.restoreAllMocks();
  session.document.setReadOnly(false);
});

describe('reproductor de videos', () => {
  it('Esc restaura el proyecto y cancela una preparación que todavía espera al worker', async () => {
    session.document.load(createEmptyProject('Proyecto del cliente'));
    session.document.setReadOnly(true);
    const before = session.document.project;
    startDemo('trailer');
    let resolve: (() => void) | undefined;
    const preparing = new Promise<void>((r) => {
      resolve = r;
    });
    const run = vi.fn();
    const step = runStep({
      chapter: 'demo.trailer.terrain',
      caption: 'demo.trailer.terrainCaption',
      ms: 1000,
      prepare: () => preparing,
      run,
    });
    const rejected = expect(step.done).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    stopDemo();
    resolve?.();
    await rejected;
    expect(run).not.toHaveBeenCalled();
    expect(session.document.project).toBe(before);
    expect(session.document.readOnly).toBe(true);
    expect(useUiStore.getState().demoStep).toBeNull();
    expect(useUiStore.getState().demoReady).toBe(false);
  });

  it('la perforación se pausa y al salir no quedan taladros tardíos en el proyecto original', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    const { loadExample } = await import('../actions');
    const { EXAMPLE_SPECS, buildExample } = await import('@cronos/core');
    const example = buildExample(EXAMPLE_SPECS.muckpile);
    vi.mocked(loadExample).mockImplementation((_id, _name, signal, prepare) => {
      if (!signal?.aborted) session.document.load(prepare ? prepare(example) : example);
      return Promise.resolve();
    });
    session.document.load(createEmptyProject('Original'));
    const before: Project = session.document.project;
    const blast = before.blasts[0];
    if (!blast) throw new Error('Sin voladura');
    session.document.dispatch(
      commands.setInitiation(blast.id, blast.initiation),
      'Cambio anterior',
    );
    const changed = session.document.project;
    startDemo('trailer');
    const drilling = TRAILER_STEPS[1];
    if (!drilling) throw new Error('Sin perforación');
    const running = runStep(drilling);
    const rejected = expect(running.done).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(2000);
    const count = session.document.project.blasts[0]?.holes.length ?? 0;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(example.blasts[0]?.holes.length ?? 0);
    useUiStore.getState().setDemo({ demoPaused: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.document.project.blasts[0]?.holes).toHaveLength(count);
    stopDemo();
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(session.document.project).toBe(changed);
    expect(session.document.undoLabel).toBe('Cambio anterior');
    expect(useAnalysisStore.getState().layers.muckpileBlocks).toBe(true);
    session.document.undo();
    expect(session.document.project).toEqual(before);
  });
});
