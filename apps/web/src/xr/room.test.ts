import type { BlastAnalysis } from '@cronos/core';
import type { Engine } from '@cronos/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalysisStore } from '../stores/analysisStore';
import { followSequence } from './room';

vi.mock('../analysis/muckpileActions', () => ({ requestMuckpile: vi.fn() }));
vi.mock('../session', async () => {
  const { createEditorSession } = await import('@cronos/core');
  return { session: createEditorSession(), getEngine: () => null };
});

// Análisis mínimo: dos taladros a 0,5 s y 0,9 s (solo lo que lee sequenceTimes).
const analysis = {
  charge: { holeIds: ['a', 'b'] },
  timing: { fireTime: [0.5, 0.9], firstTime: 0.5, lastTime: 0.9 },
} as unknown as BlastAnalysis;

function fakeEngine() {
  return {
    playSequence: vi.fn(),
    seekSequence: vi.fn(),
    stopSequence: vi.fn(),
  };
}
const asEngine = (e: ReturnType<typeof fakeEngine>) => e as unknown as Engine;

describe('el espectador sigue la secuencia del presentador (D-19)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({
      analysis,
      muckpile: null,
      sequencePlaying: false,
      sequenceTime: null,
    });
  });

  it('arranca desde el tiempo y la velocidad del presentador', () => {
    const e = fakeEngine();
    followSequence(asEngine(e), { playing: true, t: 0.6, speed: 0.2 });
    expect(e.playSequence).toHaveBeenCalledWith(expect.any(Map), 0.2, 0.6, 0.9 + 0.3);
    expect(useAnalysisStore.getState()).toMatchObject({
      sequencePlaying: true,
      sequenceSpeed: 0.2,
    });
  });

  it('no corrige desvíos chicos; sí los mayores a 0,1 s', () => {
    const e = fakeEngine();
    useAnalysisStore.setState({ sequencePlaying: true, sequenceTime: 0.65 });
    followSequence(asEngine(e), { playing: true, t: 0.7, speed: 0.2 });
    expect(e.playSequence).not.toHaveBeenCalled();
    followSequence(asEngine(e), { playing: true, t: 0.8, speed: 0.2 });
    expect(e.playSequence).toHaveBeenCalledTimes(1);
  });

  it('pausa en el mismo instante y se detiene cuando el presentador reinicia', () => {
    const e = fakeEngine();
    useAnalysisStore.setState({ sequencePlaying: true, sequenceTime: 0.7 });
    followSequence(asEngine(e), { playing: false, t: 0.72, speed: 0.2 });
    expect(e.seekSequence).toHaveBeenCalledWith(expect.any(Map), 0.72);
    useAnalysisStore.setState({ sequencePlaying: false, sequenceTime: 0.72 });
    followSequence(asEngine(e), { playing: false, t: null, speed: 0.2 });
    expect(e.stopSequence).toHaveBeenCalled();
  });
});
