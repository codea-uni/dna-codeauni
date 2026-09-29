import { EXAMPLES } from '@cronos/core';
import * as actions from '../actions';
import { sequenceTimes } from '../analysis/visualize';
import { useLocale, type Locale, type MessageKey } from '../i18n';
import { exampleText } from '../i18n/coreText';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';

/**
 * Modo demostración: un recorrido automático por las funciones de Cronos, con un subtítulo por
 * paso, pensado para grabar un video de avance. Usa el ejemplo «Producción estándar».
 */
export interface DemoStep {
  /** Título corto del capítulo (se muestra con su número). */
  chapter: MessageKey;
  caption: MessageKey;
  /** Duración del paso [ms] antes de pasar al siguiente. */
  ms: number;
  run: () => void | Promise<void>;
}

const ui = () => useUiStore.getState();
const view = () => useAnalysisStore.getState();

/** Espera a que el worker termine el análisis del documento actual (máx. 8 s). */
async function analysisReady(): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < 8000) {
    const a = view();
    if (a.analysis && a.version === session.document.version && !a.computing) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

let localeBefore: Locale = 'es';

/**
 * Vista limpia antes de cada paso: así se puede avanzar, retroceder o saltar a cualquier paso y
 * cada uno se ve igual que en el recorrido normal.
 */
function clean(): void {
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
  });
  view().setLayer('isochrones', false);
  view().setLayer('displacement', false);
  if (ui().viewMode !== 'plan') ui().setViewMode('plan');
}

async function loadProduction(): Promise<void> {
  const ex = EXAMPLES.find((e) => e.id === 'production');
  if (ex) await actions.loadExample(ex.id, exampleText(ex.id, ex).name);
}

export const DEMO_STEPS: DemoStep[] = [
  {
    chapter: 'demo.ch.intro',
    caption: 'demo.intro',
    ms: 9000,
    run: async () => {
      await loadProduction();
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
    ms: 8000,
    run: () => {
      ui().setViewMode('3d');
    },
  },
  {
    chapter: 'demo.ch.timing',
    caption: 'demo.timing',
    ms: 8000,
    run: async () => {
      view().set({ colorBy: 'time', labelBy: 'time' });
      view().setLayer('isochrones', true);
      useUiStore.setState({ leftTab: 'timing', rightTab: 'view' });
      await analysisReady();
      getEngine()?.zoomToFit();
    },
  },
  {
    chapter: 'demo.ch.sequence',
    caption: 'demo.sequence',
    ms: 11000,
    run: async () => {
      useUiStore.setState({ leftTab: 'timing', rightTab: 'view' });
      await analysisReady();
      const a = view().analysis;
      const engine = getEngine();
      if (!a || !engine) return;
      // ≈ 1 s de secuencia real en ≈ 9 s de video
      const speed = Math.max(0.02, (a.timing.lastTime - a.timing.firstTime) / 9);
      view().set({ sequenceSpeed: speed, sequencePlaying: true });
      engine.playSequence(sequenceTimes(a), speed);
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
    ms: 9000,
    run: () => {
      view().setLayer('displacement', true);
      useUiStore.setState({ rightTab: 'view' });
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

/** Arranca la demostración desde el primer paso, recordando el idioma del usuario. */
export function startDemo(): void {
  localeBefore = useLocale.getState().locale;
  ui().setDemo({ demoStep: 0, demoPaused: false });
}

/** Ejecuta un paso: primero la vista limpia y luego lo propio del paso. */
export async function runStep(step: DemoStep): Promise<void> {
  clean();
  await step.run();
}

/** Deja la vista en un estado limpio al salir de la demostración. */
export function stopDemo(): void {
  clean();
  ui().setDemo({ demoStep: null, demoPaused: false });
}
