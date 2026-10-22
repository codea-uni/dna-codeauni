import type { Blast, Project } from '../model/types';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS } from '../vibration/vibration';
import { analyzeBlast } from './analyzeBlast';

/** Indicadores de un diseño para compararlo lado a lado (H-701). */
export interface ScenarioKpis {
  name: string;
  holes: number;
  loadedHoles: number;
  /** Explosivo [kg] sin primas, igual que el resumen de carguío y el informe PDF. */
  explosive: number;
  /** Primas [kg]. */
  primers: number;
  /** Costo de productos y productos sin precio (con alguno, el costo está incompleto). */
  cost: number;
  unpriced: string[];
  drilledLength: number;
  /**
   * kg/m³, kg/kg y J/kg con el volumen nominal B·S·H (P-06). Sin malla (taladros importados o a
   * mano) no hay B·S, y se usa el volumen cubicado (área de influencia × banco). Sin carga, null.
   */
  loadingFactor: number | null;
  powderFactor: number | null;
  energyFactor: number | null;
  /** Volumen con el que salen los factores. */
  factorBasis: 'nominal' | 'cubed' | null;
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
    // Volumen nominal si todos los taladros cargados son de una malla; si no, el cubicado.
    const useNominal =
      !!c && c.nominal.volume > 0 && c.nominal.explosive >= c.totalExplosive - 1e-6;
    const basis = !c || c.totalExplosive <= 0 ? null : useNominal ? 'nominal' : 'cubed';
    const volume = basis === 'nominal' && n ? n.volume : (c?.volume ?? 0);
    const kg = basis === 'nominal' && n ? n.explosive : (c?.totalExplosive ?? 0);
    const energy = basis === 'nominal' && n ? n.energy : (c?.totalEnergy ?? 0);
    const tonnes = volume * rho(blast);
    const t = a?.timing;
    let maxPpv: ScenarioKpis['maxPpv'] = null;
    for (const r of v.receivers)
      if (!maxPpv || r.ppv > maxPpv.value) maxPpv = { value: r.ppv, point: r.name };
    return {
      name,
      holes: blast.holes.length,
      loadedHoles: c?.loadedHoles ?? 0,
      explosive: c?.totalExplosive ?? 0,
      primers: c?.totalPrimers ?? 0,
      cost: c?.cost ?? 0,
      unpriced: c?.unpriced ?? [],
      drilledLength: c?.drilledLength ?? 0,
      loadingFactor: basis && volume > 0 ? kg / volume : null,
      powderFactor: basis && tonnes > 0 ? kg / tonnes : null,
      energyFactor: basis && tonnes > 0 ? energy / tonnes : null,
      factorBasis: basis && volume > 0 ? basis : null,
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
