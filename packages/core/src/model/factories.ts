import { benchTopElevation, lengthToFloor } from '../geometry/hole';
import { degToRad } from '../units/units';
import { newId } from './ids';
import { createDefaultLibrary } from './library';
import type {
  Bench,
  Blast,
  CalcParams,
  PpvLimit,
  Hole,
  HoleTemplate,
  PatternId,
  Project,
  RockMass,
  SubdrillConvention,
  SiteModels,
  Vec2,
} from './types';

export const DEFAULT_BENCH: Bench = {
  floorElevation: 0,
  height: 15,
  faceAngle: degToRad(75),
};

export const DEFAULT_HOLE_TEMPLATE: HoleTemplate = {
  diameter: 0.2,
  inclination: 0,
  azimuth: 0,
  subdrill: 1.5,
};

/**
 * Parámetros de cálculo por defecto (`docs/RULES.md`, `docs/QUESTIONS.md`): ventana de MIC de
 * 8 ms (DF-12, P-10), γ = 3 (DF-02), alivio 3 ms/m de burden (P-02), sobreperforación vertical
 * (P-05), taco mínimo 0,7·B y 20·Ø (DF-09, P-04), SDOB 0,4/1,2 (DF-20), A 0,8–22 (P-08).
 * Duplicado y vecindad son ⚙.
 */
export const DEFAULT_CALC_PARAMS: CalcParams = {
  micWindow: 0.008,
  detonationGamma: 3,
  reliefRate: 0.003,
  subdrillConvention: 'vertical',
  delayGuide: {
    interHole: { min: 0.003, max: 0.008 },
    interRow: { min: 0.006, max: 0.012 },
  },
  checks: {
    minStemmingRatio: 0.7,
    duplicateDistance: 0.5,
    neighborFactor: 1.5,
    // Verificaciones de cordura de docs/theory/02 §6 (CK-01 a CK-04), como advertencias.
    maxStemmingRatio: 1.3,
    stemmingDiameterRatio: { min: 15, max: 25 },
    subdrillBurdenRatio: { min: 0.2, max: 0.5 },
    minStiffness: 2,
    benchDiameterRatio: { min: 50, max: 70 },
    minStemmingDiameters: 20,
    sdob: { severe: 0.4, safe: 1.2 },
    rockFactorRange: { min: 0.8, max: 22 },
    maxEffectiveBurdenRatio: 2,
    minEffectiveBurdenRatio: 0.5,
    midEffectiveBurdenRatio: 1.5,
    presplitLead: 0.1,
  },
};

/**
 * Tabla inicial de límites de PPV: valores de curso (`docs/theory/02 §4`, DF-14), a contrastar con
 * la norma peruana vigente (P-12). Es un dato del sitio, editable.
 */
export function createCoursePpvLimits(): PpvLimit[] {
  const source = 'Material de curso (docs/theory/02 §4); por contrastar con la norma vigente';
  return [
    { from: 0, to: 90, ppvMax: 0.032, source },
    { from: 90, to: 1524, ppvMax: 0.026, source },
    { from: 1524, ppvMax: 0.019, source },
  ];
}

/** Roca genérica tipo granito (valores de referencia típicos). */
export function createDefaultRockMass(): RockMass {
  return {
    id: newId<'RockMass'>(),
    name: 'Roca genérica',
    density: 2650,
    ucs: 150e6,
    youngModulus: 50e9,
  };
}

/**
 * Modelos de sitio por defecto, a reemplazar con constantes calibradas:
 * - PPV (raíz cuadrada) con k = 1.14 m/s (1140 mm/s) y β = 1.6 (USBM, valores típicos).
 * - Sobrepresión con k = 185 kPa y β = 1.2.
 * - Lundborg: L = 260·d^(2/3) con d en pulgadas y L en m → con d en m, k = 260 / 0.0254^(2/3) ≈ 3009.
 */
export function createDefaultSiteModels(): SiteModels {
  return {
    vibrationLaws: [
      {
        id: newId<'VibrationLaw'>(),
        name: 'Genérica (USBM)',
        scaling: 'square-root',
        k: 1.14,
        beta: 1.6,
      },
    ],
    airblast: { k: 185e3, beta: 1.2 },
    flyrock: { k: 260 / Math.pow(0.0254, 2 / 3), safetyFactor: 1 },
  };
}

export function createBlast(
  name: string,
  rockMassId: RockMass['id'],
  bench: Bench = DEFAULT_BENCH,
): Blast {
  return {
    id: newId<'Blast'>(),
    name,
    status: 'design',
    bench: { ...bench },
    rockMassId,
    boundaries: [],
    freeFaces: [],
    groups: [],
    patterns: [],
    holes: [],
    initiation: { system: 'nonel', nodes: [], connections: [], initiationPoints: [] },
    calcParams: structuredClone(DEFAULT_CALC_PARAMS),
  };
}

export function createEmptyProject(name = 'Proyecto sin título', now = new Date()): Project {
  const rock = createDefaultRockMass();
  const iso = now.toISOString();
  return {
    id: newId<'Project'>(),
    name,
    createdAt: iso,
    updatedAt: iso,
    currency: 'USD',
    coordinateSystem: { origin: { x: 0, y: 0, z: 0 } },
    library: createDefaultLibrary(),
    rockMasses: [rock],
    siteModels: createDefaultSiteModels(),
    surfaces: [],
    blasts: [createBlast('Voladura 1', rock.id)],
    ppvLimits: createCoursePpvLimits(),
    displayUnits: {
      length: 'm',
      diameter: 'mm',
      mass: 'kg',
      time: 'ms',
      angle: 'deg',
      ppv: 'mm/s',
      pressure: 'dB',
    },
  };
}

export interface CreateHoleParams {
  position: Vec2;
  template: HoleTemplate;
  bench: Bench;
  label: string;
  patternId?: PatternId;
  row?: number;
  col?: number;
  /** Convención de sobreperforación de la voladura (P-05). */
  subdrillConvention?: SubdrillConvention;
}

/** Taladro de diseño con boca sobre la superficie del banco y fondo a piso + sobreperforación. */
export function createHole(params: CreateHoleParams): Hole {
  const { position, template, bench } = params;
  const collarZ = benchTopElevation(bench);
  const hole: Hole = {
    id: newId<'Hole'>(),
    label: params.label,
    collar: { x: position.x, y: position.y, z: collarZ },
    diameter: template.diameter,
    length: lengthToFloor(
      collarZ,
      bench.floorElevation,
      template.subdrill,
      template.inclination,
      params.subdrillConvention,
    ),
    inclination: template.inclination,
    azimuth: template.azimuth,
    subdrill: template.subdrill,
    decks: [],
    initiators: [],
    status: 'designed',
  };
  if (params.patternId !== undefined) hole.patternId = params.patternId;
  if (params.row !== undefined) hole.row = params.row;
  if (params.col !== undefined) hole.col = params.col;
  return hole;
}

/** Siguiente etiqueta numérica libre: máximo numérico existente + 1. */
export function nextHoleNumber(holes: readonly Pick<Hole, 'label'>[]): number {
  let max = 0;
  for (const h of holes) {
    const n = Number(h.label);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}
