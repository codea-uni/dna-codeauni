import type { Blast, Project } from '../model/types';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS } from '../vibration/vibration';
import { analyzeBlast } from './analyzeBlast';

/** Indicadores de un diseño para compararlo lado a lado (H-701). */
export interface ScenarioKpis {
  name: string;
  holes: number;
  loadedHoles: number;
  /** Explosivo total (con primas) [kg]. */
  explosive: number;
  drilledLength: number;
  /** De diseño, con el volumen nominal B·S·H (P-06): kg/m³, kg/kg y J/kg. */
  loadingFactor: number | null;
  powderFactor: number | null;
  energyFactor: number | null;
  /** Duración de la secuencia (último − primero) [s]. */
  duration: number | null;
  /** Carga máxima por retardo [kg] y con ventana ampliada (P-10). */
  mic: number;
  micExtended: number | null;
  /** PPV máximo entre los puntos de monitoreo [m/s] y dónde. */
  maxPpv: { value: number; point: string } | null;
  /** Puntos que exceden su límite. */
  exceedances: number;
  errors: number;
  warnings: number;
}

/**
 * Analiza cada diseño con los mismos datos del proyecto (roca, catálogo, puntos, límites):
 * carguío, tiempos, revisión y vibración en los puntos (sin grilla). Pensado para el worker.
 */
export function compareScenarios(
  project: Project,
  designs: readonly { name: string; blast: Blast }[],
): ScenarioKpis[] {
  const rho = (b: Blast) => project.rockMasses.find((r) => r.id === b.rockMassId)?.density ?? NaN;
  return designs.map(({ name, blast }) => {
    const p: Project = { ...project, blasts: [blast] };
    const a = analyzeBlast(p, blast.id);
    const v = computeVibration(p, blast, { ...DEFAULT_VIBRATION_OPTIONS, skipGrid: true });
    const c = a?.charge;
    const n = c?.nominal;
    const tonnes = n ? n.volume * rho(blast) : 0;
    const t = a?.timing;
    let maxPpv: ScenarioKpis['maxPpv'] = null;
    for (const r of v.receivers)
      if (!maxPpv || r.ppv > maxPpv.value) maxPpv = { value: r.ppv, point: r.name };
    return {
      name,
      holes: blast.holes.length,
      loadedHoles: c?.loadedHoles ?? 0,
      explosive: c ? c.totalExplosive + c.totalPrimers : 0,
      drilledLength: c?.drilledLength ?? 0,
      loadingFactor: n && n.volume > 0 ? n.explosive / n.volume : null,
      powderFactor: tonnes > 0 && n ? n.explosive / tonnes : null,
      energyFactor: tonnes > 0 && n ? n.energy / tonnes : null,
      duration: t && t.initiated > 0 ? t.lastTime - t.firstTime : null,
      mic: v.mic,
      micExtended: v.micExtended?.mic ?? null,
      maxPpv,
      exceedances: v.receivers.filter((r) => r.exceeds).length,
      errors: a?.checks.filter((k) => k.severity === 'error').length ?? 0,
      warnings: a?.checks.filter((k) => k.severity === 'warning').length ?? 0,
    };
  });
}
