import { computeCharges, type ChargeResult } from '../charging/chargeAnalysis';
import { chargeChecks } from '../diagnostics/chargeChecks';
import { checkOptionsOf, designChecks, type DesignCheck } from '../diagnostics/designChecks';
import type { BlastId, Project } from '../model/types';
import { computeIsochrones, niceInterval, type Isochrones } from '../timing/isochrones';
import { effectiveBurden, type EffectiveBurden } from '../timing/effectiveBurden';
import { computeTiming, type TimingResult } from '../timing/timing';
import { timingChecks } from '../timing/timingChecks';
import { presplitChecks } from '../design/presplit';

/** Opciones de presentación del análisis; los parámetros de cálculo están en `blast.calcParams`. */
export interface AnalysisOptions {
  /** Intervalo de isócronas [s]; 0 = automático. */
  isochroneInterval: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = { isochroneInterval: 0 };

export interface BlastAnalysis {
  blastId: BlastId;
  charge: ChargeResult;
  timing: TimingResult;
  isochrones: Isochrones;
  /** Burden efectivo según la secuencia (G5). */
  effectiveBurden: EffectiveBurden;
  /** Revisión del diseño (reglas prácticas). */
  checks: DesignCheck[];
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
    { coincidenceWindow: blast.calcParams.micWindow },
    charge.perHole,
  );
  const range = timing.lastTime - timing.firstTime;
  const interval = options.isochroneInterval > 0 ? options.isochroneInterval : niceInterval(range);
  const isochrones = computeIsochrones(
    blast.holes.map((h) => h.collar),
    timing.fireTime,
    interval,
  );
  const eb = effectiveBurden(blast, timing.fireTime, blast.calcParams.reliefRate);
  const checkOptions = checkOptionsOf(blast);
  return {
    blastId,
    charge,
    timing,
    isochrones,
    effectiveBurden: eb,
    checks: [
      ...designChecks(blast, timing),
      ...chargeChecks(blast, project.library, checkOptions),
      ...timingChecks(blast, timing.fireTime, eb, checkOptions, blast.calcParams.delayGuide),
      ...presplitChecks(blast, project.library, rock, timing.fireTime, checkOptions),
    ],
    elapsedMs: performance.now() - t0,
  };
}
