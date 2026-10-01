import { suspendAutosave } from '../persistence/autosave';
import { useProjectSession } from '../server/projectSession';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { clean, rememberLocale, type DemoStep } from './tour';
import { cleanTrailer, resetTrailer } from './trailer';

let active: AbortController | null = null;
let restore: (() => void) | null = null;

export function startDemo(demoTour: 'tour' | 'trailer' = 'tour'): void {
  if (restore) stopDemo();
  const ui = useUiStore.getState();
  const analysis = useAnalysisStore.getState();
  const selected = [...session.selection.ids];
  const version = session.document.version;
  const projectSession = useProjectSession.getState();
  const resume = suspendAutosave();
  const restoreDocument = session.document.beginPreview();
  // El ejemplo temporal no se puede publicar como una versión del proyecto del cliente.
  useProjectSession.setState({ current: null, status: 'idle', baseProject: null });
  restore = () => {
    restoreDocument();
    // Mantiene tanto un proyecto publicado limpio como uno que ya tenía cambios pendientes.
    useProjectSession.setState({
      ...projectSession,
      baseDocVersion: projectSession.baseDocVersion + session.document.version - version,
    });
    session.selection.set(selected);
    useUiStore.setState({
      leftTab: ui.leftTab,
      rightTab: ui.rightTab,
      activeBoundaryId: ui.activeBoundaryId,
    });
    useUiStore.getState().setViewMode(ui.viewMode);
    useAnalysisStore.setState({
      ...analysis,
      version: analysis.version === version ? session.document.version : -1,
      muckpileVersion: analysis.muckpileVersion === version ? session.document.version : -1,
      muckpileRequest: useAnalysisStore.getState().muckpileRequest,
      sequencePlaying: false,
      sequenceTime: null,
    });
    resume();
  };
  rememberLocale();
  resetTrailer();
  ui.setDemo({ demoTour, demoStep: 0, demoPaused: false, demoReady: false });
}

export function cancelStep(): void {
  active?.abort();
  active = null;
  getEngine()?.stopSequence();
  useAnalysisStore.getState().set({ sequencePlaying: false, sequenceTime: null });
}

/** Devuelve una cancelación ligada a esta ejecución, sin cancelar un paso posterior. */
export function runStep(step: DemoStep): { done: Promise<void>; cancel: () => void } {
  cancelStep();
  const controller = new AbortController();
  active = controller;
  if (useUiStore.getState().demoTour === 'trailer') cleanTrailer();
  else clean();
  useUiStore.getState().setDemo({ demoReady: false });
  const done = Promise.resolve().then(async () => {
    await step.prepare?.(controller.signal);
    controller.signal.throwIfAborted();
    useUiStore.getState().setDemo({ demoReady: true });
    await step.run(controller.signal);
  });
  return {
    done,
    cancel: () => {
      controller.abort();
      if (active === controller) cancelStep();
    },
  };
}

export function stopDemo(): void {
  if (!restore && useUiStore.getState().demoStep === null) return;
  cancelStep();
  cleanTrailer();
  clean();
  resetTrailer();
  restore?.();
  restore = null;
  useUiStore.getState().setDemo({ demoStep: null, demoPaused: false, demoReady: false });
}
