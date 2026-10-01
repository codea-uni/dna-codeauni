import { commands, EXAMPLES, type Project } from '@cronos/core';
import { loadExample } from '../actions';
import { requestMuckpile } from '../analysis/muckpileActions';
import { muckpileEnd, scalarValues, sequenceTimes } from '../analysis/visualize';
import { exampleText } from '../i18n/coreText';
import { getCompute, getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { topographyTin } from '../topography/session';
import { analysisReady, type DemoStep } from './tour';

let full: Project | null = null;
let chargeColors: { values: ReturnType<typeof scalarValues>; min: number; max: number } | null =
  null;
const view = () => useAnalysisStore.getState();
const ui = () => useUiStore.getState();
const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 25));

export function resetTrailer(): void {
  full = null;
  chargeColors = null;
}

export function cleanTrailer(): void {
  getEngine()?.stopSequence();
  session.selection.clear();
  view().set({
    sequencePlaying: false,
    sequenceTime: null,
    vibEnabled: false,
    energyEnabled: false,
    energyDamage: false,
    muckpileMode: 'fast',
  });
  for (const layer of [
    'muckpile',
    'muckpileBefore',
    'muckpileVectors',
    'muckpileBlocks',
    'isochrones',
    'displacement',
  ] as const)
    view().setLayer(layer, false);
  view().setLayer('labels', true);
}

/** El reloj de las animaciones también se congela con la pausa del reproductor. */
async function reveal(
  count: number,
  ms: number,
  signal: AbortSignal,
  show: (n: number) => void,
): Promise<void> {
  let elapsed = 0;
  let last = performance.now();
  let shown = 0;
  while (shown < count) {
    signal.throwIfAborted();
    const now = performance.now();
    if (!ui().demoPaused) elapsed += now - last;
    last = now;
    const n = Math.min(count, Math.floor((elapsed / ms) * count));
    while (shown < n) show(++shown);
    if (shown < count) await sleep();
  }
}

async function mine(signal: AbortSignal): Promise<Project> {
  if (full) return full;
  const ex = EXAMPLES.find((e) => e.id === 'topoMine');
  if (!ex) throw new Error('Falta el ejemplo topoMine.');
  const prepared: { project?: Project } = {};
  await loadExample(ex.id, exampleText(ex.id, ex).name, signal, (project) => {
    prepared.project = structuredClone(project);
    return {
      ...project,
      scenarios: [],
      blasts: project.blasts.map((blast) => ({
        ...blast,
        holes: [],
        initiation: { ...blast.initiation, connections: [], initiationPoints: [] },
      })),
    };
  });
  signal.throwIfAborted();
  const project = prepared.project;
  if (!project) throw new Error('No se pudo cargar la mina del tráiler.');
  const topoId = project.blasts[0]?.bench.topographyId;
  const start = performance.now();
  while (topoId && !topographyTin(topoId)) {
    signal.throwIfAborted();
    if (performance.now() - start > 15000)
      throw new Error('El levantamiento no estuvo listo a tiempo.');
    await sleep();
  }
  const blast = project.blasts[0];
  if (blast) {
    const analysis = await getCompute().api.analyzeBlast(project, blast.id, {
      isochroneInterval: 0,
    });
    signal.throwIfAborted();
    if (!analysis) throw new Error('No se pudo analizar la carga del ejemplo.');
    const values = scalarValues(analysis, 'kg');
    chargeColors = { values, min: Math.min(...values.values()), max: Math.max(...values.values()) };
  }
  full = project;
  return project;
}

function frame(project: Project): void {
  const points = project.blasts[0]?.boundaries[0]?.polygon ?? [];
  const holes = project.blasts[0]?.holes ?? [];
  const xs = [...points.map((p) => p.x), ...holes.map((h) => h.collar.x)];
  const ys = [...points.map((p) => p.y), ...holes.map((h) => h.collar.y)];
  if (!xs.length) return;
  getEngine()?.fitBounds({
    minX: Math.min(...xs) - 35,
    minY: Math.min(...ys) - 65,
    maxX: Math.max(...xs) + 35,
    maxY: Math.max(...ys) + 30,
  });
}

async function stage(signal: AbortSignal, holes: boolean, ties: boolean): Promise<Project> {
  const project = await mine(signal);
  signal.throwIfAborted();
  const blast = project.blasts[0];
  if (!blast) throw new Error('El ejemplo no tiene voladura.');
  session.document.load({
    ...project,
    scenarios: [],
    blasts: [
      {
        ...blast,
        holes: holes ? blast.holes : [],
        initiation: ties
          ? blast.initiation
          : { ...blast.initiation, connections: [], initiationPoints: [] },
      },
    ],
  });
  ui().setViewMode('plan');
  useUiStore.setState({ leftTab: 'design', rightTab: 'view' });
  frame(project);
  return project;
}

async function pileReady(signal: AbortSignal): Promise<void> {
  if (view().muckpileVersion !== session.document.version && !view().muckpileComputing)
    requestMuckpile();
  const start = performance.now();
  while (
    !view().muckpile ||
    view().muckpileVersion !== session.document.version ||
    view().muckpileComputing
  ) {
    signal.throwIfAborted();
    if (!view().muckpileComputing && view().muckpileVersion !== session.document.version)
      requestMuckpile();
    if (performance.now() - start > 30000) throw new Error('La maza no estuvo lista a tiempo.');
    await sleep();
  }
}

async function sequence(signal: AbortSignal, seconds: number, pile: boolean): Promise<void> {
  await analysisReady(signal);
  if (pile) await pileReady(signal);
  signal.throwIfAborted();
  const analysis = view().analysis;
  const engine = getEngine();
  if (!analysis || !engine) throw new Error('Falta el análisis de la secuencia.');
  const result = view().muckpile;
  const end = pile && result ? muckpileEnd(result, null) : analysis.timing.lastTime + 0.3;
  const from = analysis.timing.firstTime - 0.05;
  const speed = Math.max(0.001, (end - from) / seconds);
  view().set({ sequenceSpeed: speed, sequencePlaying: true });
  engine.playSequence(sequenceTimes(analysis), speed, from, end);
  if (ui().demoPaused) engine.pauseSequence();
}

async function completeDesign(signal: AbortSignal): Promise<void> {
  const project = await mine(signal);
  const expected = project.blasts[0];
  const current = session.document.project.blasts[0];
  if (
    current?.holes.length !== expected?.holes.length ||
    current?.initiation.connections.length !== expected?.initiation.connections.length
  )
    await stage(signal, true, true);
}

export const TRAILER_STEPS: DemoStep[] = [
  {
    chapter: 'demo.trailer.terrain',
    caption: 'demo.trailer.terrainCaption',
    ms: 5000,
    prepare: async (signal) => {
      await stage(signal, false, false);
    },
    run: () => {
      view().set({ colorBy: 'kg', labelBy: 'label' });
    },
  },
  {
    chapter: 'demo.trailer.drilling',
    caption: 'demo.trailer.drillingCaption',
    ms: 10000,
    prepare: async (signal) => {
      await stage(signal, false, false);
    },
    run: async (signal) => {
      const project = await mine(signal);
      const blast = project.blasts[0];
      if (!blast) return;
      view().set({ colorBy: 'kg' });
      getEngine()?.setHoleScalars(chargeColors);
      const holes = [...blast.holes].sort(
        (a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0),
      );
      // No se reconstruye el plano: el motor recibe un ChangeSet incremental por taladro.
      await reveal(holes.length, 8000, signal, (n) => {
        const hole = holes[n - 1];
        if (hole)
          session.document.dispatch(commands.addHoles(blast.id, [hole]), 'Tráiler · perforación');
      });
    },
  },
  {
    chapter: 'demo.trailer.tieUp',
    caption: 'demo.trailer.tieUpCaption',
    ms: 10000,
    prepare: async (signal) => {
      await stage(signal, true, false);
    },
    run: async (signal) => {
      const project = await mine(signal);
      const blast = project.blasts[0];
      if (!blast) return;
      view().set({ colorBy: 'kg' });
      const plan = blast.initiation;
      await reveal(plan.connections.length, 8000, signal, (n) => {
        session.document.dispatch(
          commands.setInitiation(blast.id, { ...plan, connections: plan.connections.slice(0, n) }),
          'Tráiler · amarre',
        );
      });
      requestMuckpile();
    },
  },
  {
    chapter: 'demo.trailer.firing',
    caption: 'demo.trailer.firingCaption',
    ms: 9000,
    prepare: async (signal) => {
      await completeDesign(signal);
      await analysisReady(signal);
    },
    run: async (signal) => {
      if (view().muckpileVersion !== session.document.version && !view().muckpileComputing)
        requestMuckpile();
      ui().setViewMode('plan');
      view().set({ colorBy: 'time', labelBy: 'time' });
      view().setLayer('isochrones', true);
      await sequence(signal, 7, false);
    },
  },
  {
    chapter: 'demo.trailer.muckpile',
    caption: 'demo.trailer.muckpileCaption',
    ms: 17000,
    prepare: async (signal) => {
      await completeDesign(signal);
      await analysisReady(signal);
      await pileReady(signal);
    },
    run: async (signal) => {
      ui().setViewMode('3d');
      view().set({ colorBy: 'kg', labelBy: 'label', muckpileMode: 'fast' });
      view().setLayer('labels', false);
      view().setLayer('muckpileBlocks', true);
      await sequence(signal, 14, true);
    },
  },
  {
    chapter: 'demo.trailer.end',
    caption: 'demo.trailer.endCaption',
    ms: 7000,
    prepare: async (signal) => {
      await completeDesign(signal);
      await analysisReady(signal);
      await pileReady(signal);
    },
    run: () => {
      ui().setViewMode('3d');
      view().setLayer('labels', false);
      view().setLayer('muckpileBlocks', true);
      view().setLayer('muckpile', true);
      const { analysis, muckpile } = view();
      if (analysis && muckpile)
        getEngine()?.seekSequence(sequenceTimes(analysis), muckpileEnd(muckpile, null));
    },
  },
];
