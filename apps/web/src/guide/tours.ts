import { projectKind } from '@cronos/core';
import { workflowOf } from '../hooks/useWorkflow';
import { t, type MessageKey } from '../i18n';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { workingTargets } from '../underground/location';
import { useGuideStore, type GuideStep } from './store';

/**
 * Recorridos por tarea («¿Qué quieres hacer hoy?»). Cada paso señala un control real y sabe cuándo
 * está hecho: lo ya hecho se salta, y al hacerlo el usuario el recorrido sigue solo. Así el mismo
 * recorrido sirve para quien empieza de cero y para quien ya va por la mitad.
 */

export type TourId =
  | 'firstBlast'
  | 'topography'
  | 'charge'
  | 'tieUp'
  | 'simulate'
  | 'results'
  | 'vibrationPoint'
  | 'save'
  | 'report'
  | 'navigate3d'
  | 'ugWorkings'
  | 'ugFace'
  | 'ugRings'
  | 'ugMethod'
  | 'ugAnalysis'
  | 'assistant';

/** «Hazlo por mí» de Simular (el módulo del visor se carga recién al pedirlo). */
const simulateBlast = () =>
  import('../viewport/quickActions').then((m) => {
    m.simulateBlast();
  });

const wf = () => workflowOf(session.document.project.blasts[0]);
const windowOpen = (id: string) =>
  useUiStore.getState().floating.some((w) => w.id === `workspace.${id}`);
const selected = (guide: string) =>
  document.querySelector(`[data-guide="${guide}"]`)?.getAttribute('aria-selected') === 'true';
const ugHoles = (prefix: string) =>
  (session.document.project.blasts[0]?.holes ?? []).some((h) =>
    h.tags?.some((tag) => tag.startsWith(prefix)),
  );
const step = (target: string | undefined, text: MessageKey, extra: Partial<GuideStep> = {}) => ({
  ...(target ? { target } : {}),
  text: t(text),
  ...extra,
});

const openWindow = (id: string, text: MessageKey, done?: () => boolean): GuideStep =>
  step(`panel.${id}`, text, { done: () => windowOpen(id) || (done?.() ?? false) });

const TOURS: Record<
  TourId,
  { title: MessageKey; kind?: 'surface' | 'underground'; steps: () => GuideStep[] }
> = {
  firstBlast: {
    title: 'guide.tour.firstBlast',
    kind: 'surface',
    steps: () => [
      step('tool.boundary', 'guide.s.boundary', { done: () => wf().boundary }),
      step('tool.freeFace', 'guide.s.freeFace', { done: () => wf().freeFace }),
      openWindow('pattern', 'guide.s.openPattern', () => wf().holes),
      step('pattern.generate', 'guide.s.generate', { done: () => wf().holes }),
      openWindow('charge', 'guide.s.openCharge', () => wf().charged),
      step('charge.applyAll', 'guide.s.chargeAll', { done: () => wf().charged }),
      openWindow('timing', 'guide.s.openTiming', () => wf().tied),
      step('timing.applyNonel', 'guide.s.tieUp', { done: () => wf().tied }),
      step('quick.simulate', 'guide.s.simulate', { doIt: simulateBlast }),
      step('ribbon.analysis', 'guide.s.results'),
    ],
  },
  topography: {
    title: 'guide.tour.topography',
    steps: () => [
      step('ribbon.home', 'guide.s.homeTab', {
        done: () => useUiStore.getState().ribbonTab === 'home',
      }),
      step('menu.import', 'guide.s.importMenu', {
        done: () =>
          document.querySelector('[data-guide="menu.import"][aria-expanded="true"]') !== null,
      }),
      step('import.topography', 'guide.s.importTopo', {
        done: () => session.document.project.topography.length > 0,
      }),
    ],
  },
  charge: {
    title: 'guide.tour.charge',
    steps: () => [
      openWindow('charge', 'guide.s.openCharge'),
      step('charge.applyAll', 'guide.s.chargeAll', { done: () => wf().charged }),
    ],
  },
  tieUp: {
    title: 'guide.tour.tieUp',
    kind: 'surface',
    steps: () => [
      openWindow('timing', 'guide.s.openTiming'),
      step('timing.applyNonel', 'guide.s.tieUp', { done: () => wf().tied }),
    ],
  },
  simulate: {
    title: 'guide.tour.simulate',
    steps: () => [step('quick.simulate', 'guide.s.simulate', { doIt: simulateBlast })],
  },
  results: {
    title: 'guide.tour.results',
    steps: () => [
      step('ribbon.analysis', 'guide.s.results', {
        done: () => useUiStore.getState().ribbonTab === 'analysis',
      }),
      openWindow('vibration', 'guide.s.openVibration'),
    ],
  },
  vibrationPoint: {
    title: 'guide.tour.vibrationPoint',
    steps: () => {
      const before = session.document.project.monitoringPoints?.length ?? 0;
      return [
        step('tool.monitor', 'guide.s.monitor', {
          done: () => (session.document.project.monitoringPoints?.length ?? 0) > before,
        }),
        openWindow('vibration', 'guide.s.openVibration'),
      ];
    },
  },
  save: {
    title: 'guide.tour.save',
    steps: () => [step('save.version', 'guide.s.saveVersion')],
  },
  report: {
    title: 'guide.tour.report',
    steps: () => [
      step('ribbon.home', 'guide.s.homeTab', {
        done: () => useUiStore.getState().ribbonTab === 'home',
      }),
      step('menu.export', 'guide.s.exportMenu', {
        done: () =>
          document.querySelector('[data-guide="menu.export"][aria-expanded="true"]') !== null,
      }),
      step('export.pdf', 'guide.s.exportPdf'),
    ],
  },
  navigate3d: {
    title: 'guide.tour.navigate3d',
    steps: () => [
      step('quick.3d', 'guide.s.view3d', { done: () => useUiStore.getState().viewMode === '3d' }),
      step('quick.bar', 'guide.s.orbit', { advanceOnClick: false }),
      step('quick.fit', 'guide.s.fit'),
      step('quick.search', 'guide.s.search'),
    ],
  },
  ugWorkings: {
    title: 'guide.tour.ugWorkings',
    kind: 'underground',
    steps: () => [
      step('ribbon.home', 'guide.s.homeTab', {
        done: () => useUiStore.getState().ribbonTab === 'home',
      }),
      step('menu.import', 'guide.s.importMenu', {
        done: () =>
          document.querySelector('[data-guide="menu.import"][aria-expanded="true"]') !== null,
      }),
      step('import.workings', 'guide.s.importWorkings'),
      step('workings.choose', 'guide.s.chooseWorkings', {
        done: () => workingTargets().length > 0,
      }),
    ],
  },
  ugFace: {
    title: 'guide.tour.ugFace',
    kind: 'underground',
    steps: () => [
      openWindow('underground', 'guide.s.openUnderground'),
      step('ug.tab.face', 'guide.s.ugFaceTab', { done: () => selected('ug.tab.face') }),
      step('ug.location', 'guide.s.ugLocation', { advanceOnClick: false }),
      step('window.underground', 'guide.s.ugForm', { advanceOnClick: false }),
      step('ug.send', 'guide.s.ugSend', { done: () => ugHoles('ug-face') }),
      step('quick.simulate', 'guide.s.simulate', { doIt: simulateBlast }),
    ],
  },
  ugRings: {
    title: 'guide.tour.ugRings',
    kind: 'underground',
    steps: () => [
      openWindow('underground', 'guide.s.openUnderground'),
      step('ug.tab.ring', 'guide.s.ugRingTab', { done: () => selected('ug.tab.ring') }),
      step('ug.location', 'guide.s.ugLocation', { advanceOnClick: false }),
      step('window.underground', 'guide.s.ugForm', { advanceOnClick: false }),
      step('ug.send', 'guide.s.ugSend', { done: () => ugHoles('ug-ring') }),
      step('quick.simulate', 'guide.s.simulate', { doIt: simulateBlast }),
    ],
  },
  ugMethod: {
    title: 'guide.tour.ugMethod',
    kind: 'underground',
    steps: () => [
      openWindow('underground', 'guide.s.openUnderground'),
      step('ug.tab.methods', 'guide.s.ugMethodTab', { done: () => selected('ug.tab.methods') }),
      step('window.underground', 'guide.s.ugForm', { advanceOnClick: false }),
    ],
  },
  ugAnalysis: {
    title: 'guide.tour.ugAnalysis',
    kind: 'underground',
    steps: () => [
      openWindow('underground', 'guide.s.openUnderground'),
      step('ug.tab.analysis', 'guide.s.ugAnalysis', { done: () => selected('ug.tab.analysis') }),
    ],
  },
  assistant: {
    title: 'guide.tour.assistant',
    steps: () => [step('ribbon.ai', 'guide.s.assistant', { done: () => windowOpen('ai') })],
  },
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];

export function tourTitle(id: TourId): string {
  return t(TOURS[id].title);
}

export function tourSteps(id: TourId): GuideStep[] {
  return TOURS[id].steps();
}

/** Recorridos que tienen sentido en esta herramienta. */
export function toursFor(kind: 'surface' | 'underground'): TourId[] {
  return TOUR_IDS.filter((id) => {
    const k = TOURS[id].kind;
    return !k || k === kind;
  });
}

/** El siguiente paso lógico según cómo va el proyecto (lo que se propone primero). */
export function suggestedTour(): TourId {
  const project = session.document.project;
  const w = wf();
  if (projectKind(project) === 'underground') {
    if (workingTargets().length === 0) return 'ugWorkings';
    if (!ugHoles('ug-')) return 'ugFace';
    if (!w.charged) return 'ugFace';
    return 'simulate';
  }
  if (!w.holes) return 'firstBlast';
  if (!w.charged) return 'charge';
  if (!w.tied) return 'tieUp';
  return 'simulate';
}

export function startTour(id: TourId): void {
  useGuideStore.getState().start(tourSteps(id), { source: 'tour', title: tourTitle(id) });
}
