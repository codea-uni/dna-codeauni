import { projectKind } from '@cronos/core';
import type { EngineLayer } from '@cronos/engine';
import { requestMuckpile } from '../analysis/muckpileActions';
import { isUndergroundPile, muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { t, type MessageKey } from '../i18n';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { playUndergroundPile, shotTimes } from '../underground/pileView';

/**
 * Acciones rápidas del visor (barra tipo Unity y buscador Ctrl+K): lo que antes había que buscar
 * en cada módulo, a un clic.
 */

/** Opacidad de la topografía en 3D cuando se muestra (la misma que usa el asistente). */
const TOPO_OPACITY_3D = 0.85;

/** Capas que se prenden y apagan juntas desde la barra. */
export interface QuickLayer {
  id: string;
  label: MessageKey;
  layers: readonly EngineLayer[];
  group: 'design' | 'site';
}

export const QUICK_LAYERS: readonly QuickLayer[] = [
  { id: 'labels', label: 'quick.layer.labels', layers: ['labels'], group: 'design' },
  { id: 'connections', label: 'quick.layer.connections', layers: ['connections'], group: 'design' },
  { id: 'traces', label: 'quick.layer.traces', layers: ['traces'], group: 'design' },
  { id: 'isochrones', label: 'quick.layer.isochrones', layers: ['isochrones'], group: 'design' },
  { id: 'energy', label: 'quick.layer.energy', layers: ['energy'], group: 'design' },
  { id: 'vibration', label: 'quick.layer.vibration', layers: ['vibration'], group: 'design' },
  {
    id: 'muckpile',
    label: 'quick.layer.muckpile',
    layers: ['muckpile', 'muckpileBlocks', 'muckpileVectors'],
    group: 'design',
  },
  { id: 'asDrilled', label: 'quick.layer.asDrilled', layers: ['asDrilled'], group: 'design' },
  {
    id: 'topography',
    label: 'quick.layer.topography',
    layers: ['topoImage', 'topoShade', 'topoContours', 'topoLines'],
    group: 'site',
  },
  { id: 'pointClouds', label: 'quick.layer.pointClouds', layers: ['pointClouds'], group: 'site' },
  { id: 'blockModels', label: 'quick.layer.blockModels', layers: ['blockModels'], group: 'site' },
  { id: 'workings', label: 'quick.layer.workings', layers: ['workings'], group: 'site' },
];

/** Una capa rápida está visible si lo está su primera capa (y, la topografía, también en 3D). */
export function quickLayerOn(
  q: QuickLayer,
  s: ReturnType<typeof useAnalysisStore.getState>,
): boolean {
  const first = q.layers[0];
  const on = first ? s.layers[first] : false;
  return q.id === 'topography' ? on && s.topoOpacity3d > 0 : on;
}

export function setQuickLayer(q: QuickLayer, visible: boolean): void {
  const s = useAnalysisStore.getState();
  for (const layer of q.layers) s.setLayer(layer, visible);
  // En 3D la topografía es una superficie: se oculta con su opacidad.
  if (q.id === 'topography')
    s.set({ topoOpacity3d: visible ? Math.max(s.topoOpacity3d, TOPO_OPACITY_3D) : 0 });
}

const notify = (text: string, kind: 'info' | 'error' = 'info') => {
  useUiStore.getState().notify(text, kind);
};

/** Espera la pila pedida al runner y reproduce; se cancela si se pide otra cosa. */
let waitingPile: (() => void) | null = null;

/**
 * Simula la voladura (botón ▶ como en Unity): pasa a 3D y reproduce la secuencia de salida con el
 * movimiento del material. Si la pila no está calculada para esta versión, la pide y reproduce al
 * llegar. En Subterránea usa la pila del disparo (o la secuencia sola si no se pudo calcular).
 */
export function simulateBlast(): void {
  const project = session.document.project;
  const a = useAnalysisStore.getState();
  const ui = useUiStore.getState();
  const engine = getEngine();
  if (!engine) return;
  if (!project.blasts.some((b) => b.holes.length > 0)) {
    notify(t('quick.simulateNoHoles'), 'error');
    return;
  }
  // Reanudar una simulación en pausa.
  if (a.sequenceTime !== null && !a.sequencePlaying) {
    engine.resumeSequence();
    a.set({ sequencePlaying: true });
    return;
  }
  const times = a.analysis ? sequenceTimes(a.analysis) : new Map();
  if (times.size === 0) {
    notify(t('quick.simulateNoTimes'), 'error');
    ui.setRibbonTab('timing');
    return;
  }
  if (ui.viewMode !== '3d') ui.setViewMode('3d');
  const underground = projectKind(project) === 'underground';
  const fresh = () => {
    const s = useAnalysisStore.getState();
    return (
      s.muckpile !== null &&
      s.muckpileVersion === session.document.version &&
      isUndergroundPile(s.muckpile) === underground
    );
  };
  const play = () => {
    const s = useAnalysisStore.getState();
    if (!s.analysis) return;
    if (underground) {
      if (playUndergroundPile()) return;
      const st = shotTimes(sequenceTimes(s.analysis));
      if (st.size === 0) return;
      getEngine()?.playSequence(st, s.sequenceSpeed, Math.min(...st.values()) - 0.02);
      s.set({ sequencePlaying: true });
      return;
    }
    const r = s.muckpile;
    s.setLayer('muckpileBlocks', true);
    // Encuadra toda la voladura con la pila (el material sale por delante del banco).
    getEngine()?.zoomToFit();
    const end = r
      ? muckpileEnd(r, s.muckpileMode === 'physics' ? s.muckpileFrames : null)
      : undefined;
    getEngine()?.playSequence(sequenceTimes(s.analysis), s.sequenceSpeed, undefined, end);
    s.set({ sequencePlaying: true });
  };
  if (fresh()) {
    play();
    return;
  }
  waitingPile?.();
  notify(t('quick.simulateComputing'));
  requestMuckpile(underground ? 'underground' : 'bench');
  const started = Date.now();
  const unsubscribe = useAnalysisStore.subscribe((s) => {
    if (s.muckpileComputing) return;
    // Llegó la pila, o no se pudo calcular: se reproduce igual (sin material si falta).
    if (fresh() || Date.now() - started > 1500) {
      stopWaiting();
      play();
    }
  });
  const timer = setTimeout(() => {
    stopWaiting();
  }, 120_000);
  const stopWaiting = () => {
    unsubscribe();
    clearTimeout(timer);
    waitingPile = null;
  };
  waitingPile = stopWaiting;
}

export function pauseSimulation(): void {
  getEngine()?.pauseSequence();
  useAnalysisStore.getState().set({ sequencePlaying: false });
}

export function stopSimulation(): void {
  waitingPile?.();
  getEngine()?.stopSequence();
  useAnalysisStore.getState().set({ sequencePlaying: false, sequenceTime: null });
}

/** F: en 3D centra lo seleccionado (si hay); si no, encuadra todo. */
export function frameSelectionOrAll(): void {
  const engine = getEngine();
  if (!engine) return;
  if (useUiStore.getState().viewMode === '3d') {
    if (engine.frameSelection3d()) return;
    const picked = useUiStore.getState().picked3d;
    if (picked && picked.kind !== 'holes') {
      engine.focus3d(picked.point, 40);
      return;
    }
    engine.zoomToFit();
    return;
  }
  engine.zoomToFit(session.selection.size > 0);
}
