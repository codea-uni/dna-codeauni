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
