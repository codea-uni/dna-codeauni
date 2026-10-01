import { EXAMPLES } from '@cronos/core';
import * as actions from '../actions';
import { muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { useLocale, type Locale, type MessageKey } from '../i18n';
import { exampleText } from '../i18n/coreText';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { analysisReady, pileReady, playDemoSequence, terrainReady } from './runtime';

export { analysisReady } from './runtime';

/**
 * Modo demostración: un recorrido automático por las funciones de Cronos, con un subtítulo por
 * paso, pensado para grabar un video de avance. Usa «Mina sobre levantamiento DXF».
 */
export interface DemoStep {
  /** Título corto del capítulo (se muestra con su número). */
  chapter: MessageKey;
  caption: MessageKey;
  /** Duración del paso [ms] antes de pasar al siguiente. */
  ms: number;
  /** Preparación fuera del reloj del capítulo (assets, workers). */
  prepare?: (signal: AbortSignal) => void | Promise<void>;
  run: (signal: AbortSignal) => void | Promise<void>;
}

const ui = () => useUiStore.getState();
const view = () => useAnalysisStore.getState();

let localeBefore: Locale = 'es';
let mineId: string | null = null;

/**
 * Vista limpia antes de cada paso: así se puede avanzar, retroceder o saltar a cualquier paso y
 * cada uno se ve igual que en el recorrido normal.
 */
export function clean(): void {
  getEngine()?.stopSequence();
  useLocale.getState().setLocale(localeBefore);
  session.selection.set([]);
  view().set({
    sequencePlaying: false,
    sequenceTime: null,
    colorBy: 'none',
    labelBy: 'label',
    vibEnabled: false,
    energyEnabled: false,
    energyDamage: false,
    muckpileMode: 'fast',
  });
  for (const layer of [
    'isochrones',
    'displacement',
    'muckpile',
    'muckpileBefore',
    'muckpileVectors',
    'muckpileBlocks',
  ] as const)
    view().setLayer(layer, false);
  view().setLayer('labels', true);
  if (ui().viewMode !== 'plan') ui().setViewMode('plan');
}

async function loadMine(signal: AbortSignal): Promise<void> {
  if (mineId !== session.document.project.id) {
    const ex = EXAMPLES.find((e) => e.id === 'topoMine');
    if (!ex) throw new Error('Falta el ejemplo topoMine.');
    await actions.loadExample(ex.id, exampleText(ex.id, ex).name, signal);
    signal.throwIfAborted();
    mineId = session.document.project.id;
  }
  await terrainReady(session.document.project, signal);
}

const TOUR_STEPS: DemoStep[] = [
  {
    chapter: 'demo.ch.intro',
    caption: 'demo.intro',
    ms: 9000,
    run: () => {
      useUiStore.setState({ leftTab: 'design', rightTab: 'view' });
      getEngine()?.zoomToFit();
    },
  },
  {
    chapter: 'demo.ch.design',
    caption: 'demo.design',
    ms: 9000,
    run: () => {
      view().set({ colorBy: 'group' });
      useUiStore.setState({ leftTab: 'design', rightTab: 'view' });
      getEngine()?.zoomToFit();
    },
  },
  {
    chapter: 'demo.ch.charge',
    caption: 'demo.charge',
    ms: 9000,
    run: () => {
      const holes = session.document.project.blasts[0]?.holes ?? [];
      const middle = holes[Math.floor(holes.length / 2)];
      if (middle) session.selection.set([middle.id]);
      view().set({ colorBy: 'kg' });
      useUiStore.setState({ leftTab: 'charge', rightTab: 'selection' });
    },
  },
  {
    chapter: 'demo.ch.view3d',
    caption: 'demo.view3d',
    ms: 11000,
    run: () => {
      ui().setViewMode('3d');
      view().set({ colorBy: 'kg' });
      view().setLayer('labels', false);
      getEngine()?.zoomToFit();
    },
  },
  {
    chapter: 'demo.ch.timing',
    caption: 'demo.timing',
    ms: 8000,
    run: async (signal) => {
      view().set({ colorBy: 'time', labelBy: 'time' });
      view().setLayer('isochrones', true);
      useUiStore.setState({ leftTab: 'timing', rightTab: 'view' });
      await analysisReady(signal);
      getEngine()?.zoomToFit();
    },
  },
  {
    chapter: 'demo.ch.sequence',
    caption: 'demo.sequence',
    ms: 11000,
    run: async (signal) => {
      useUiStore.setState({ leftTab: 'timing', rightTab: 'view' });
      view().set({ colorBy: 'time', labelBy: 'time' });
      view().setLayer('isochrones', true);
      await playDemoSequence(signal, 9, false);
    },
  },
  {
    chapter: 'demo.ch.burden',
    caption: 'demo.burden',
    ms: 8000,
    run: () => {
      view().set({ colorBy: 'effectiveBurden' });
      useUiStore.setState({ leftTab: 'timing', rightTab: 'view' });
    },
  },
  {
    chapter: 'demo.ch.sdob',
    caption: 'demo.sdob',
    ms: 8000,
    run: () => {
      view().set({ colorBy: 'sdob' });
      useUiStore.setState({ rightTab: 'view' });
    },
  },
  {
    chapter: 'demo.ch.displacement',
    caption: 'demo.displacement',
    ms: 20000,
    prepare: pileReady,
    run: async (signal) => {
      useUiStore.setState({ leftTab: 'muckpile', rightTab: 'view' });
      ui().setViewMode('3d');
      view().set({ colorBy: 'kg', muckpileMode: 'fast' });
      view().setLayer('labels', false);
      view().setLayer('muckpileBlocks', true);
      // Incluye el destino del material y deja unos segundos para apreciar la pila final.
      getEngine()?.zoomToFit();
      await playDemoSequence(signal, 15, true);
    },
  },
  {
    chapter: 'demo.ch.muckpile',
    caption: 'demo.muckpile',
    ms: 9000,
    prepare: pileReady,
    run: () => {
      useUiStore.setState({ leftTab: 'muckpile', rightTab: 'view' });
      ui().setViewMode('3d');
      view().setLayer('labels', false);
      view().setLayer('muckpileBlocks', true);
      view().setLayer('muckpile', true);
      getEngine()?.zoomToFit();
      const { analysis, muckpile } = view();
      if (analysis && muckpile)
        getEngine()?.seekSequence(sequenceTimes(analysis), muckpileEnd(muckpile, null));
    },
  },
  {
    chapter: 'demo.ch.damage',
    caption: 'demo.damage',
    ms: 9000,
    run: () => {
      view().set({ energyEnabled: true, energyMetric: 'nearFieldPpv', energyDamage: true });
      useUiStore.setState({ leftTab: 'energy' });
    },
  },
  {
    chapter: 'demo.ch.fragmentation',
    caption: 'demo.fragmentation',
    ms: 8000,
    run: () => {
      useUiStore.setState({ leftTab: 'fragmentation' });
    },
  },
  {
    chapter: 'demo.ch.vibration',
    caption: 'demo.vibration',
    ms: 9000,
    run: () => {
      view().set({ vibEnabled: true, vibMetric: 'ppv' });
      useUiStore.setState({ leftTab: 'vibration' });
      getEngine()?.zoomToFit();
    },
  },
  {
    chapter: 'demo.ch.scenarios',
    caption: 'demo.scenarios',
    ms: 10000,
    run: async () => {
      useUiStore.setState({ leftTab: 'scenarios' });
      await actions.compareScenarios();
    },
  },
  {
    chapter: 'demo.ch.review',
    caption: 'demo.review',
    ms: 8000,
    run: () => {
      useUiStore.setState({ leftTab: 'design', rightTab: 'results' });
    },
  },
  {
    chapter: 'demo.ch.language',
    caption: 'demo.language',
    ms: 7000,
    run: () => {
      useLocale.getState().setLocale(localeBefore === 'es' ? 'en' : 'es');
    },
  },
  {
    chapter: 'demo.ch.end',
    caption: 'demo.end',
    ms: 10000,
    run: () => {
      useUiStore.setState({ leftTab: 'design', rightTab: 'results' });
      getEngine()?.zoomToFit();
    },
  },
];

export const DEMO_STEPS: DemoStep[] = TOUR_STEPS.map((step) => ({
  ...step,
  prepare: async (signal) => {
    // También permite saltar directamente a 3D o maza sin depender del primer capítulo.
    await loadMine(signal);
    await analysisReady(signal);
    await step.prepare?.(signal);
  },
}));

/** Arranca la demostración desde el primer paso, recordando el idioma del usuario. */
export function rememberLocale(): void {
  localeBefore = useLocale.getState().locale;
  mineId = null;
}
