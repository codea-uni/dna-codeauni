import { create } from 'zustand';
import { session } from '../session';

/**
 * Condiciones del sitio que el agente pregunta antes de diseñar (roca, agua, terreno reactivo,
 * material y fragmentación objetivo). Lo que tiene lugar en el modelo va al documento (agua de los
 * taladros, UCS de la roca, puntos de control con su PPV admisible); el resto de la entrevista se
 * recuerda por proyecto en este navegador.
 */

export type RockMassClass = 'massive' | 'fractured' | 'very_fractured';
export type WaterCondition = 'dry' | 'wet' | 'flooded';
export type ReactiveGround = 'no' | 'suspected' | 'yes';
export type MaterialKind = 'ore' | 'waste' | 'mixed';

export interface SiteConditions {
  rockMass?: RockMassClass;
  rockType?: string;
  ucsMpa?: number;
  water?: WaterCondition;
  /** Profundidad del nivel freático bajo la boca [m], si se conoce. */
  waterDepth?: number;
  reactiveGround?: ReactiveGround;
  /** Temperatura del terreno en el taladro [°C]. */
  groundTempC?: number;
  material?: MaterialKind;
  /** P80 objetivo [cm]. */
  targetP80Cm?: number;
  /** Destino del material (chancadora, stockpile, botadero). */
  destination?: string;
  notes?: string;
}

const KEY = 'cronos.agent.site.';

function load(projectId: string): SiteConditions {
  try {
    const raw = localStorage.getItem(KEY + projectId);
    return raw ? (JSON.parse(raw) as SiteConditions) : {};
  } catch {
    return {};
  }
}

interface SiteState {
  projectId: string;
  conditions: SiteConditions;
}

export const useSiteStore = create<SiteState>(() => {
  const id = session.document.project.id;
  return { projectId: id, conditions: load(id) };
});

/** Condiciones del proyecto abierto (si cambió de proyecto, se cargan las suyas). */
export function siteConditions(): SiteConditions {
  const id = session.document.project.id;
  const s = useSiteStore.getState();
  if (s.projectId !== id) {
    const conditions = load(id);
    useSiteStore.setState({ projectId: id, conditions });
    return conditions;
  }
  return s.conditions;
}

export function updateSiteConditions(patch: SiteConditions): SiteConditions {
  const next: SiteConditions = { ...siteConditions(), ...patch };
  const id = session.document.project.id;
  useSiteStore.setState({ projectId: id, conditions: next });
  try {
    localStorage.setItem(KEY + id, JSON.stringify(next));
  } catch {
    // sin almacenamiento: queda en memoria
  }
  return next;
}

/** Lo que falta preguntar, en el orden de la entrevista. */
export function missingConditions(c: SiteConditions): string[] {
  const missing: string[] = [];
  if (!c.rockMass) missing.push('rock_mass');
  if (!c.water) missing.push('water');
  if (!c.reactiveGround) missing.push('reactive_ground');
  if (!c.material) missing.push('material');
  if (c.material !== 'waste' && c.targetP80Cm === undefined) missing.push('target_p80_cm');
  return missing;
}

/** Resumen para el modelo (va en cada turno). */
export function siteSummary() {
  const c = siteConditions();
  const points = session.document.project.monitoringPoints ?? [];
  return {
    rock_mass: c.rockMass ?? null,
    rock_type: c.rockType ?? null,
    ucs_mpa: c.ucsMpa ?? null,
    water: c.water ?? null,
    reactive_ground: c.reactiveGround ?? null,
    ground_temp_c: c.groundTempC ?? null,
    material: c.material ?? null,
    target_p80_cm: c.targetP80Cm ?? null,
    destination: c.destination ?? null,
    protected_points: points.map((p) => p.name),
    still_to_ask: missingConditions(c),
  };
}
