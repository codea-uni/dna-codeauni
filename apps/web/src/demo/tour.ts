import { EXAMPLES } from '@cronos/core';
import * as actions from '../actions';
import { sequenceTimes } from '../analysis/visualize';
import { t, useLocale, type Locale, type MessageKey } from '../i18n';
import { exampleText } from '../i18n/coreText';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';

/**
 * Modo demostración: un recorrido automático por las funciones de Cronos, con un subtítulo por
 * paso, pensado para grabar un video de avance. Usa el ejemplo «Producción estándar».
 */
export interface DemoStep {
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

export const DEMO_STEPS: DemoStep[] = [
  {
    caption: 'demo.intro',
    ms: 8000,
    run: async () => {
      localeBefore = useLocale.getState().locale;
      const ex = EXAMPLES.find((e) => e.id === 'production');
      if (ex) await actions.loadExample(ex.id, exampleText(ex.id, ex).name);
      view().set({ colorBy: 'none', labelBy: 'label', sequencePlaying: false });
      useUiStore.setState({ leftTab: 'design', rightTab: 'view', viewMode: 'plan' });
      getEngine()?.zoomToFit();
    },
  },
  {
    caption: 'demo.design',
    ms: 9000,
    run: () => {
      view().set({ colorBy: 'group' });
      useUiStore.setState({ leftTab: 'design' });
    },
  },
  {
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
    caption: 'demo.view3d',
    ms: 8000,
    run: () => {
      session.selection.set([]);
      view().set({ colorBy: 'none' });
      ui().setViewMode('3d');
    },
  },
  {
    caption: 'demo.timing',
    ms: 8000,
    run: async () => {
      ui().setViewMode('plan');
      view().set({ colorBy: 'time', labelBy: 'time' });
      view().setLayer('isochrones', true);
      useUiStore.setState({ leftTab: 'timing', rightTab: 'view' });
      await analysisReady();
      getEngine()?.zoomToFit();
    },
  },
  {
    caption: 'demo.sequence',
    ms: 11000,
    run: async () => {
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
    caption: 'demo.burden',
    ms: 8000,
    run: () => {
      getEngine()?.stopSequence();
      view().set({
        sequencePlaying: false,
        sequenceTime: null,
        colorBy: 'effectiveBurden',
        labelBy: 'label',
      });
      view().setLayer('isochrones', false);
    },
  },
  {
    caption: 'demo.sdob',
    ms: 8000,
    run: () => {
      view().set({ colorBy: 'sdob' });
    },
  },
  {
    caption: 'demo.displacement',
    ms: 9000,
    run: () => {
      view().set({ colorBy: 'none' });
      view().setLayer('displacement', true);
    },
  },
  {
    caption: 'demo.vibration',
    ms: 9000,
    run: () => {
      view().setLayer('displacement', false);
      view().set({ colorBy: 'none', vibEnabled: true, vibMetric: 'ppv' });
      useUiStore.setState({ leftTab: 'vibration' });
      getEngine()?.zoomToFit();
    },
  },
  {
    caption: 'demo.damage',
    ms: 9000,
    run: () => {
      view().set({
        vibEnabled: false,
        energyEnabled: true,
        energyMetric: 'nearFieldPpv',
        energyDamage: true,
      });
      useUiStore.setState({ leftTab: 'energy' });
    },
  },
  {
    caption: 'demo.scenarios',
    ms: 10000,
    run: async () => {
      view().set({ vibEnabled: false, energyEnabled: false, energyDamage: false });
      useUiStore.setState({ leftTab: 'scenarios' });
      await actions.compareScenarios();
    },
  },
  {
    caption: 'demo.review',
    ms: 8000,
    run: () => {
      useUiStore.setState({ leftTab: 'design', rightTab: 'results' });
    },
  },
  {
    caption: 'demo.language',
    ms: 7000,
    run: () => {
      useLocale.getState().setLocale(useLocale.getState().locale === 'es' ? 'en' : 'es');
    },
  },
  {
    caption: 'demo.end',
    ms: 7000,
    run: () => {
      useLocale.getState().setLocale(localeBefore);
    },
  },
];

/** Deja la vista en un estado limpio al salir de la demostración. */
export function stopDemo(): void {
  getEngine()?.stopSequence();
  view().set({ sequencePlaying: false, sequenceTime: null });
  useLocale.getState().setLocale(localeBefore);
  ui().setDemo({ demoStep: null, demoPaused: false });
}

export const demoCaption = (step: number): string => {
  const s = DEMO_STEPS[step];
  return s ? t(s.caption) : '';
};
