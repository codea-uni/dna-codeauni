import type { Project } from '@cronos/core';
import { requestMuckpile } from '../analysis/muckpileActions';
import { muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { topographyTin } from '../topography/session';

const view = () => useAnalysisStore.getState();

/** Preparación cancelable, fuera del reloj del capítulo y ligada al documento vigente. */
async function waitUntil(
  ready: () => boolean,
  signal: AbortSignal,
  timeout: number,
  message: string,
): Promise<void> {
  const start = performance.now();
  for (;;) {
    signal.throwIfAborted();
    if (ready()) return;
    if (performance.now() - start > timeout) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function terrainReady(project: Project, signal: AbortSignal): Promise<void> {
  const id = project.blasts[0]?.bench.topographyId;
  await waitUntil(
    () => !id || !!topographyTin(id),
    signal,
    15000,
    'El levantamiento no estuvo listo a tiempo.',
  );
}

export async function analysisReady(signal: AbortSignal): Promise<void> {
  await waitUntil(
    () => !!view().analysis && view().version === session.document.version && !view().computing,
    signal,
    15000,
    'El análisis de la voladura no estuvo listo a tiempo.',
  );
}

export async function pileReady(signal: AbortSignal): Promise<void> {
  let requestedVersion = -1;
  await waitUntil(
    () => {
      const state = view();
      const version = session.document.version;
      if (state.muckpile && state.muckpileVersion === version && !state.muckpileComputing)
        return true;
      if (!state.muckpileComputing && requestedVersion !== version) {
        requestedVersion = version;
        requestMuckpile();
      }
      return false;
    },
    signal,
    30000,
    'La maza no estuvo lista a tiempo.',
  );
}

export async function playDemoSequence(
  signal: AbortSignal,
  seconds: number,
  pile: boolean,
): Promise<void> {
  await analysisReady(signal);
  if (pile) await pileReady(signal);
  signal.throwIfAborted();
  const { analysis, muckpile } = view();
  const engine = getEngine();
  if (!analysis || !engine) throw new Error('Falta el análisis de la secuencia.');
  const end = pile && muckpile ? muckpileEnd(muckpile, null) : analysis.timing.lastTime + 0.3;
  const from = analysis.timing.firstTime - 0.05;
  const speed = Math.max(0.001, (end - from) / seconds);
  view().set({ sequenceSpeed: speed, sequencePlaying: true });
  engine.playSequence(sequenceTimes(analysis), speed, from, end);
  if (useUiStore.getState().demoPaused) engine.pauseSequence();
}
