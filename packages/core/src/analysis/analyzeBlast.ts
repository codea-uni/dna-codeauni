import { computeCharges, type ChargeResult } from '../charging/chargeAnalysis';
import type { BlastId, Project } from '../model/types';
import { computeIsochrones, niceInterval, type Isochrones } from '../timing/isochrones';
import { computeTiming, DEFAULT_TIMING_OPTIONS, type TimingResult } from '../timing/timing';

export interface AnalysisOptions {
  coincidenceWindow: number;
  /** Intervalo de isócronas [s]; 0 = automático. */
  isochroneInterval: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  coincidenceWindow: DEFAULT_TIMING_OPTIONS.coincidenceWindow,
  isochroneInterval: 0,
};

export interface BlastAnalysis {
  blastId: BlastId;
  charge: ChargeResult;
  timing: TimingResult;
  isochrones: Isochrones;
  /** Duración del cálculo [ms]. */
  elapsedMs: number;
}

const DEFAULT_ROCK_DENSITY = 2650;

/** Carguío + cubicación + tiempos + isócronas de una voladura (pensado para correr en el worker). */
export function analyzeBlast(
  project: Project,
  blastId: BlastId,
  options: AnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): BlastAnalysis | null {
  const t0 = performance.now();
  const blast = project.blasts.find((b) => b.id === blastId);
  if (!blast) return null;
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const charge = computeCharges(blast, project.library, rock?.density ?? DEFAULT_ROCK_DENSITY);
  const timing = computeTiming(
    blast,
    project.library,
    { coincidenceWindow: options.coincidenceWindow },
    charge.perHole,
  );
  const range = timing.lastTime - timing.firstTime;
  const interval = options.isochroneInterval > 0 ? options.isochroneInterval : niceInterval(range);
  const isochrones = computeIsochrones(
    blast.holes.map((h) => h.collar),
    timing.fireTime,
    interval,
  );
  return { blastId, charge, timing, isochrones, elapsedMs: performance.now() - t0 };
}
