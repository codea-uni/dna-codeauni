import {
  criticalPpv,
  DAMAGE_MULTIPLES,
  DEFAULT_ENERGY_OPTIONS,
  DEFAULT_NEAR_FIELD,
  DEFAULT_VIBRATION_OPTIONS,
  type EnergyOptions,
} from '@cronos/core';
import { getCompute, session } from '../session';
import { topographyTin } from '../topography/session';
import { useAnalysisStore } from '../stores/analysisStore';

const DEBOUNCE_MS = 120;

/**
 * Recalcula el análisis de la voladura activa en el worker cuando cambia el documento o las
 * opciones. Debounce + latest-wins: un resultado de una versión vieja se descarta.
 */
export function startAnalysisRunner(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requested = -1;

  const run = async () => {
    timer = null;
    const { document } = session;
    const version = document.version;
    const blast = document.project.blasts[0];
    if (!blast) return;
    requested = version;
    const { isochroneIntervalMs } = useAnalysisStore.getState();
    useAnalysisStore.getState().set({ computing: true });
    try {
      const analysis = await getCompute().api.analyzeBlast(document.project, blast.id, {
        isochroneInterval: isochroneIntervalMs / 1000,
      });
      if (requested !== version) return; // llegó otra versión mientras calculaba
      useAnalysisStore.getState().set({ analysis, version, computing: false });
    } catch (err) {
      console.error('[análisis]', err);
      useAnalysisStore.getState().set({ computing: false });
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), DEBOUNCE_MS);
  };

  const offDoc = session.document.subscribe(schedule);
  const offOptions = useAnalysisStore.subscribe((s, prev) => {
    if (s.isochroneIntervalMs !== prev.isochroneIntervalMs) schedule();
  });
  schedule();
  return () => {
    offDoc();
    offOptions();
    if (timer) clearTimeout(timer);
  };
}

/** Opciones de energía (SI) a partir del estado de UI y del proyecto. */
function energyOptions(): EnergyOptions | null {
  const blast = session.document.project.blasts[0];
  if (!blast) return null;
  const s = useAnalysisStore.getState();
  const nearField = session.document.project.siteModels.nearField ?? DEFAULT_NEAR_FIELD;
  const toSi = s.energyMetric === 'nearFieldPpv' ? 1 / 1000 : 1; // mm/s → m/s
  const rock = session.document.project.rockMasses.find((r) => r.id === blast.rockMassId);
  const vppc = criticalPpv(rock);
  const damage = s.energyDamage && s.energyMetric === 'nearFieldPpv' && vppc;
  return {
    ...DEFAULT_ENERGY_OPTIONS,
    metric: s.energyMetric,
    elevation: s.energyElevation ?? blast.bench.floorElevation + blast.bench.height / 2,
    cellSize: s.energyCellSize,
    cutoff: s.energyCutoff,
    sigma: s.energySigma,
    levels: damage
      ? DAMAGE_MULTIPLES.map((m) => m * damage.value)
      : s.energyLevels.map((l) => l * toSi),
    nearField,
  };
}

/** Recalcula la energía en el worker cuando está habilitada (debounce + latest-wins). */
export function startEnergyRunner(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;
  const run = async () => {
    timer = null;
    const s = useAnalysisStore.getState();
    if (!s.energyEnabled) return;
    const blast = session.document.project.blasts[0];
    const options = energyOptions();
    if (!blast || !options) return;
    const mine = ++token;
    s.set({ energyComputing: true });
    try {
      // Con la topografía del banco, arriba del terreno es aire (A7b).
      const tin = blast.bench.topographyId
        ? (topographyTin(blast.bench.topographyId) ?? null)
        : null;
      const energy = await getCompute().api.computeEnergy(
        session.document.project,
        blast.id,
        options,
        tin,
      );
      if (mine !== token) return;
      useAnalysisStore.getState().set({ energy, energyComputing: false });
    } catch (err) {
      console.error('[energía]', err);
      useAnalysisStore.getState().set({ energyComputing: false });
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), DEBOUNCE_MS * 2);
  };
  const offDoc = session.document.subscribe(() => {
    if (useAnalysisStore.getState().energyEnabled) schedule();
  });
  const keys = [
    'energyEnabled',
    'energyMetric',
    'energyElevation',
    'energyCellSize',
    'energyCutoff',
    'energySigma',
    'energyLevels',
    'energyDamage',
  ] as const;
  const offOptions = useAnalysisStore.subscribe((s, prev) => {
    if (keys.some((k) => s[k] !== prev[k])) {
      if (!s.energyEnabled) useAnalysisStore.getState().set({ energy: null });
      else schedule();
    }
  });
  return () => {
    offDoc();
    offOptions();
    if (timer) clearTimeout(timer);
  };
}

/** Fragmentación: entradas desde la voladura (modo automático) y Kuz-Ram + Swebrec en el worker. */
export function startFragmentationRunner(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;
  const refreshInputs = async () => {
    timer = null;
    const blast = session.document.project.blasts[0];
    if (!blast || !useAnalysisStore.getState().fragAuto) return;
    const mine = ++token;
    const inputs = await getCompute().api.fragmentationInputs(session.document.project, blast.id);
    if (mine === token && useAnalysisStore.getState().fragAuto)
      useAnalysisStore.getState().set({ fragInputs: inputs });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void refreshInputs(), DEBOUNCE_MS);
  };
  let calc = 0;
  const compute = async () => {
    const s = useAnalysisStore.getState();
    if (!s.fragInputs) {
      s.set({ frag: null });
      return;
    }
    const mine = ++calc;
    const options = {
      oversizeSize: s.fragOversize,
      finesSize: s.fragFines,
      ...(s.fragXmax ? { xmax: s.fragXmax } : {}),
    };
    const frag = await getCompute().api.fragmentation(s.fragInputs, options);
    if (mine === calc) useAnalysisStore.getState().set({ frag });
  };
  const offDoc = session.document.subscribe(schedule);
  const offStore = useAnalysisStore.subscribe((s, prev) => {
    if (s.fragAuto && !prev.fragAuto) schedule();
    if (
      s.fragInputs !== prev.fragInputs ||
      s.fragXmax !== prev.fragXmax ||
      s.fragOversize !== prev.fragOversize ||
      s.fragFines !== prev.fragFines
    ) {
      void compute();
    }
  });
  schedule();
  return () => {
    offDoc();
    offStore();
    if (timer) clearTimeout(timer);
  };
}

/** Vibración, sobrepresión y flyrock en el worker cuando está habilitada. */
export function startVibrationRunner(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;
  const run = async () => {
    timer = null;
    const s = useAnalysisStore.getState();
    const blast = session.document.project.blasts[0];
    if (!s.vibEnabled || !blast) return;
    const isPpv = s.vibMetric === 'ppv';
    // UI: mm/s o dB → SI: m/s o Pa.
    const levels = s.vibLevels.map((v) => (isPpv ? v / 1000 : 20e-6 * Math.pow(10, v / 20)));
    const mine = ++token;
    s.set({ vibComputing: true });
    try {
      const vibration = await getCompute().api.computeVibration(
        session.document.project,
        blast.id,
        {
          ...DEFAULT_VIBRATION_OPTIONS,
          metric: s.vibMetric,
          ...(s.vibLawId ? { lawId: s.vibLawId } : {}),
          extent: s.vibExtent,
          levels,
        },
      );
      if (mine !== token) return;
      useAnalysisStore.getState().set({ vibration, vibComputing: false });
    } catch (err) {
      console.error('[vibración]', err);
      useAnalysisStore.getState().set({ vibComputing: false });
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), DEBOUNCE_MS * 2);
  };
  const offDoc = session.document.subscribe(() => {
    if (useAnalysisStore.getState().vibEnabled) schedule();
  });
  const keys = ['vibEnabled', 'vibMetric', 'vibLawId', 'vibExtent', 'vibLevels'] as const;
  const offOptions = useAnalysisStore.subscribe((s, prev) => {
    if (!keys.some((k) => s[k] !== prev[k])) return;
    if (!s.vibEnabled) useAnalysisStore.getState().set({ vibration: null });
    else schedule();
  });
  return () => {
    offDoc();
    offOptions();
    if (timer) clearTimeout(timer);
  };
}

/**
 * Pila de material (A7): se calcula en el worker cuando se pide (botón «Calcular»), con la
 * topografía del banco si la voladura la usa. El perfil se rehace al trazar otra sección.
 */
export function startMuckpileRunner(): () => void {
  let token = 0;
  const run = async () => {
    const blast = session.document.project.blasts[0];
    if (!blast) return;
    const version = session.document.version;
    const tin = blast.bench.topographyId ? (topographyTin(blast.bench.topographyId) ?? null) : null;
    const mine = ++token;
    useAnalysisStore.getState().set({ muckpileComputing: true });
    try {
      const muckpile = await getCompute().api.computeMuckpile(
        session.document.project,
        blast.id,
        tin,
      );
      if (mine !== token) return;
      useAnalysisStore.getState().set({
        muckpile,
        muckpileVersion: version,
        muckpileComputing: false,
        muckpileFrames: null,
        muckpileCompare: null,
      });
    } catch (err) {
      console.error('[pila]', err);
      useAnalysisStore.getState().set({ muckpileComputing: false });
    }
  };
  let sectionToken = 0;
  const section = async () => {
    const { muckpile, muckpileSection } = useAnalysisStore.getState();
    if (!muckpile || !muckpileSection || muckpile.grids.after.nx === 0) {
      useAnalysisStore.getState().set({ muckpileProfile: null });
      return;
    }
    const mine = ++sectionToken;
    const { base, before, after } = muckpile.grids;
    const profile = await getCompute().api.muckpileSection(
      { base, before, after },
      muckpileSection.a,
      muckpileSection.b,
    );
    if (mine === sectionToken) useAnalysisStore.getState().set({ muckpileProfile: profile });
  };
  const off = useAnalysisStore.subscribe((s, prev) => {
    if (s.muckpileRequest !== prev.muckpileRequest) void run();
    if (s.muckpile !== prev.muckpile || s.muckpileSection !== prev.muckpileSection) void section();
  });
  return off;
}
