import { DEFAULT_ENERGY_OPTIONS, DEFAULT_NEAR_FIELD, type EnergyOptions } from '@blastlab/core';
import { getCompute, session } from '../session';
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
    const { coincidenceWindowMs, isochroneIntervalMs } = useAnalysisStore.getState();
    useAnalysisStore.getState().set({ computing: true });
    try {
      const analysis = await getCompute().api.analyzeBlast(document.project, blast.id, {
        coincidenceWindow: coincidenceWindowMs / 1000,
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
    if (
      s.coincidenceWindowMs !== prev.coincidenceWindowMs ||
      s.isochroneIntervalMs !== prev.isochroneIntervalMs
    )
      schedule();
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
  return {
    ...DEFAULT_ENERGY_OPTIONS,
    metric: s.energyMetric,
    elevation: s.energyElevation ?? blast.bench.floorElevation + blast.bench.height / 2,
    cellSize: s.energyCellSize,
    cutoff: s.energyCutoff,
    sigma: s.energySigma,
    levels: s.energyLevels.map((l) => l * toSi),
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
      const energy = await getCompute().api.computeEnergy(
        session.document.project,
        blast.id,
        options,
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
