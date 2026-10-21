import { resolveHole } from './holeResolution';
import { setHoleFocusHandler, showHoleDetail } from './holeDetail';
import {
  boundaryBench,
  clipPolygonHalfPlane,
  commands,
  createHole,
  cutoffRisks,
  degToRad,
  fragmentation,
  holeBoundary,
  konyaWalterBurden,
  mmToM,
  newId,
  nextHoleNumber,
  outwardNormal,
  pointInPolygon,
  polygonBounds,
  presplitChargeDiameter,
  presplitDecoupling,
  radToDeg,
  rockFactor,
  segmentOnSegment,
  sToMs,
  unitToAzimuth,
  type Blast,
  type BlastBoundary,
  type BlastDomain,
  type Deck,
  type Explosive,
  type Hole,
  type HoleGroup,
  type HoleWater,
  type KuzRamInputs,
  type Op,
  type RockMass,
  type Vec2,
} from '@cronos/core';
import { z } from 'zod';
import { analysisReady, pileReady, playDemoSequence } from '../demo/runtime';
import {
  autoPileTarget,
  currentUgPile,
  playUndergroundPile,
  ugPileSummary,
} from '../underground/pileView';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { loadedSurveys, topographyElevation } from '../topography/session';
import {
  missingConditions,
  siteConditions,
  updateSiteConditions,
  type MaterialKind,
  type RockMassClass,
  type SiteConditions,
  type WaterCondition,
} from './site';
import {
  CUTOFF,
  KD_DEFAULT,
  MATERIAL_SCALE,
  OXYGEN_BALANCE,
  PATTERN_RATIOS,
  REACTIVE_GROUND,
  ROCK_CLASSES,
  WATER_NEEDS,
} from './skill/rules';
import {
  blastOrFail,
  chargeDecks,
  currentAnalysis,
  edgesFacing,
  findProduct,
  r,
  readOnlyGuard,
  resolvePerimeter,
  resolveTarget,
  targetSchema,
  ToolError,
  type Cardinal,
  type ToolDef,
} from './tools';

/**
 * Herramientas de criterio de voladura del agente (`docs/agent/`): condiciones del sitio,
 * propuesta de malla y carga, precorte y buffer, zonas de mineral y desmonte, predicción de
 * resultados (P80, PPV, flyrock, tiros cortados, gases) y la vista para mostrarlos. Las reglas
 * guía vienen de `skill/rules.ts` con su fuente; los resultados, de los cálculos de la app.
 * Importante: este módulo solo usa lo de `tools.ts` dentro de las funciones (import circular).
 */

const { document } = session;
const CARDINAL = z.enum(['N', 'S', 'E', 'W']);

// ------------------------------------------------------------------ Utilidades

function rockOf(blast: Blast): RockMass | undefined {
  return document.project.rockMasses.find((m) => m.id === blast.rockMassId);
}

function centroid(points: readonly Vec2[]): Vec2 {
  const n = Math.max(1, points.length);
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

function blastCenter(blast: Blast): Vec2 {
  if (blast.holes.length) return centroid(blast.holes.map((h) => h.collar));
  const poly = blast.boundaries.flatMap((b) => b.polygon);
  if (poly.length) return centroid(poly);
  return getEngine()?.getViewCenter() ?? { x: 0, y: 0 };
}

const HOLE_WATER: Record<WaterCondition, HoleWater> = {
  dry: 'dry',
  wet: 'static',
  flooded: 'dynamic',
};

/** Espera a que el store cumpla una condición (los resultados se calculan en workers). */
async function until(check: () => boolean, ms: number): Promise<boolean> {
  const t0 = performance.now();
  while (!check()) {
    if (performance.now() - t0 > ms) return false;
    await new Promise((res) => setTimeout(res, 120));
  }
  return true;
}

/** Explosivos de la biblioteca aptos para el agua y el terreno; el resto con su motivo. */
function explosiveFit(c: SiteConditions) {
  const lib = document.project.library.explosives;
  const water = c.water ?? 'dry';
  const accepts = WATER_NEEDS[water].accepts;
  const reactive = c.reactiveGround === 'yes' || c.reactiveGround === 'suspected';
  return lib.map((e) => {
    const reasons: string[] = [];
    if (!accepts.includes(e.waterResistance))
      reasons.push(`water resistance "${e.waterResistance}" not enough for ${water} holes`);
    if (reactive && REACTIVE_GROUND.avoid.includes(e.family))
      reasons.push('AN-based bulk product in reactive ground');
    return { e, ok: reasons.length === 0, reasons };
  });
}

/** Elige el explosivo de columna: el apto de mayor potencia por volumen (RWS·ρ). */
function pickExplosive(c: SiteConditions, name?: string): { e: Explosive; warnings: string[] } {
  const lib = document.project.library.explosives;
  if (name) {
    const e = findProduct(lib, name, 'explosive');
    const fit = explosiveFit(c).find((f) => f.e.id === e.id);
    return { e, warnings: fit?.reasons ?? [] };
  }
  const ok = explosiveFit(c)
    .filter((f) => f.ok)
    .map((f) => f.e)
    .sort((a, b) => b.rws * b.density - a.rws * a.density);
  // En seco se prefiere el más económico (ANFO) si está; si no, el de mayor potencia.
  const dry = (c.water ?? 'dry') === 'dry' && c.reactiveGround !== 'yes';
  const anfo = dry ? ok.find((e) => e.family === 'anfo') : undefined;
  const chosen = anfo ?? ok[0];
  if (chosen) return { e: chosen, warnings: [] };
  const first = lib[0];
  if (!first) throw new ToolError('The library has no explosives.');
  return { e: first, warnings: ['No explosive in the library fits the water/ground conditions.'] };
}

// ------------------------------------------------------------------ Condiciones del sitio

const siteSchema = z.object({
  rock_mass: z
    .enum(['massive', 'fractured', 'very_fractured'])
    .optional()
    .describe('massive = continuous rock; fractured = discontinuous/jointed; very_fractured.'),
  rock_type: z.string().optional().describe('e.g. andesita, granodiorita, caliza.'),
  ucs_mpa: z.number().positive().optional().describe('Uniaxial compressive strength [MPa].'),
  density_t_m3: z.number().positive().optional().describe('Rock density [t/m³].'),
  water: z
    .enum(['dry', 'wet', 'flooded'])
    .optional()
    .describe('dry; wet = static water or damp; flooded = full of water / recharging.'),
  water_depth_m: z.number().min(0).optional().describe('Water table depth below collar [m].'),
  reactive_ground: z.enum(['no', 'suspected', 'yes']).optional(),
  ground_temp_c: z.number().optional(),
  material: z
    .enum(['ore', 'waste', 'mixed'])
    .optional()
    .describe('ore = mineral to plant/crusher; waste = waste/stripping (desmonte, desbroce).'),
  target_p80_cm: z.number().positive().optional(),
  destination: z.string().optional().describe('chancadora, stockpile, botadero…'),
  notes: z.string().optional(),
});

function setSite(args: z.infer<typeof siteSchema>) {
  const patch: SiteConditions = {};
  if (args.rock_mass) patch.rockMass = args.rock_mass;
  if (args.rock_type) patch.rockType = args.rock_type;
  if (args.ucs_mpa !== undefined) patch.ucsMpa = args.ucs_mpa;
  if (args.water) patch.water = args.water;
  if (args.water_depth_m !== undefined) patch.waterDepth = args.water_depth_m;
  if (args.reactive_ground) patch.reactiveGround = args.reactive_ground;
  if (args.ground_temp_c !== undefined) patch.groundTempC = args.ground_temp_c;
  if (args.material) patch.material = args.material;
  if (args.target_p80_cm !== undefined) patch.targetP80Cm = args.target_p80_cm;
  if (args.destination) patch.destination = args.destination;
  if (args.notes) patch.notes = args.notes;
  const c = updateSiteConditions(patch);
  const applied: string[] = [];
  const blast = document.project.blasts[0];
  if (blast && !document.readOnly) {
    const ops: Op[] = [];
    // Agua de los taladros (filtra productos por resistencia al agua, RM-02).
    if (args.water && blast.holes.length) {
      const water = HOLE_WATER[args.water];
      ops.push({
        type: 'holes/replace',
        blastId: blast.id,
        holes: blast.holes.map((h) => ({ ...h, water })),
      });
      applied.push(`water=${water} on ${blast.holes.length} holes`);
    }
    // Roca: UCS, densidad y descripción del macizo (factor de roca de Kuz-Ram).
    const rock = rockOf(blast);
    if (rock && (args.ucs_mpa !== undefined || args.density_t_m3 !== undefined || args.rock_mass)) {
      const next: RockMass = { ...rock };
      if (args.ucs_mpa !== undefined) next.ucs = args.ucs_mpa * 1e6;
      if (args.density_t_m3 !== undefined) next.density = args.density_t_m3 * 1000;
      if (args.rock_mass) {
        const k = ROCK_CLASSES[args.rock_mass];
        const eGpa = next.youngModulus / 1e9;
        next.blastability = {
          rmd: k.rmd,
          jps: k.jps,
          jpa: k.jpa,
          rdi: 0.025 * next.density - 50,
          hf: eGpa < 50 ? eGpa / 3 : next.ucs / 1e6 / 5,
        };
        delete next.rockFactor;
      }
      if (args.rock_type) next.name = args.rock_type;
      ops.push(
        ...commands.setRockMasses(
          document.project.rockMasses.map((m) => (m.id === rock.id ? next : m)),
        ),
      );
      applied.push(`rock mass updated (rock factor A = ${r(rockFactor(next), 1)})`);
    }
    if (ops.length) document.dispatch(ops, 'IA: condiciones del sitio');
  }
  return {
    saved: c,
    applied_to_design: applied,
    still_to_ask: missingConditions(c),
    water_note: c.water ? WATER_NEEDS[c.water].note : undefined,
    reactive_note:
      c.reactiveGround === 'yes' || c.reactiveGround === 'suspected'
        ? `${REACTIVE_GROUND.note} (${REACTIVE_GROUND.source})`
        : undefined,
    hot_ground:
      c.groundTempC !== undefined && c.groundTempC > REACTIVE_GROUND.tempLimitC
        ? `Ground at ${c.groundTempC} °C is over ${REACTIVE_GROUND.tempLimitC} °C: hot ground procedure (${REACTIVE_GROUND.source}).`
        : undefined,
  };
}

// ------------------------------------------------------------------ Puntos a proteger

const AZIMUTH: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

const protectSchema = z.object({
  name: z.string().describe('e.g. "Talud final norte", "Casa comunidad", "Chancadora".'),
  kind: z.enum(['wall', 'facility', 'house', 'other']),
  distance_m: z.number().positive().optional().describe('Distance from the blast center [m].'),
  direction: z
    .enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
    .optional()
    .describe('Direction from the blast.'),
  azimuth_deg: z.number().min(0).max(360).optional(),
  x: z.number().optional().describe('Exact position (East) instead of distance + direction.'),
  y: z.number().optional(),
  ppv_limit_mm_s: z
    .number()
    .positive()
    .optional()
    .describe('Admissible PPV at the point [mm/s] if the user gives it.'),
});

function addProtected(args: z.infer<typeof protectSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  let pos: Vec2;
  if (args.x !== undefined && args.y !== undefined) pos = { x: args.x, y: args.y };
  else {
    if (args.distance_m === undefined)
      throw new ToolError('Give distance_m and direction (or x, y).');
    const az = degToRad(args.azimuth_deg ?? AZIMUTH[args.direction ?? 'N'] ?? 0);
    const c = blastCenter(blast);
    pos = { x: c.x + args.distance_m * Math.sin(az), y: c.y + args.distance_m * Math.cos(az) };
  }
  const z0 = blast.bench.topographyId
    ? (topographyElevation(pos.x, pos.y, blast.bench.topographyId) ??
      blast.bench.floorElevation + blast.bench.height)
    : blast.bench.floorElevation + blast.bench.height;
  const { point } = commands.addMonitoringPoint(document, { ...pos, z: z0 }, args.name);
  const structure = { wall: 'talud', facility: 'instalación', house: 'vivienda', other: 'otro' }[
    args.kind
  ];
  const withPatch = {
    ...point,
    structure,
    ...(args.ppv_limit_mm_s !== undefined ? { ppvLimit: args.ppv_limit_mm_s / 1000 } : {}),
  };
  const list = document.project.monitoringPoints ?? [];
  document.dispatch(
    [{ type: 'project/patch', patch: { monitoringPoints: [...list, withPatch] } }],
    `IA: punto de control ${args.name}`,
  );
  // La vibración se calcula solo si está habilitada.
  useAnalysisStore.getState().set({ vibEnabled: true });
  return {
    point: args.name,
    x: r(pos.x),
    y: r(pos.y),
    distance_m: r(Math.hypot(pos.x - blastCenter(blast).x, pos.y - blastCenter(blast).y), 0),
    ppv_limit_mm_s: args.ppv_limit_mm_s ?? null,
    note:
      args.ppv_limit_mm_s === undefined
        ? 'No PPV limit given: the project PPV limit table applies (if any). Ask the user for the limit if it matters.'
        : undefined,
  };
}

// ------------------------------------------------------------------ Propuesta de diseño

const recommendSchema = z.object({
  diameter_mm: z.number().positive().optional().describe('Default: current hole template.'),
  explosive: z.string().optional().describe('Column explosive; default: best fit for the site.'),
  kind: z.enum(['square', 'staggered']).optional().describe('Default staggered.'),
  target_p80_cm: z.number().positive().optional().describe('Default: site target.'),
});

/** Entradas de Kuz-Ram de una malla propuesta (columna simple, cálculo trivial). */
function proposalInputs(p: {
  burden: number;
  spacing: number;
  diameter: number;
  height: number;
  subdrill: number;
  stemming: number;
  explosive: Explosive;
  rock: RockMass;
  staggered: boolean;
  drillDeviation: number;
}): KuzRamInputs {
  const length = p.height + p.subdrill;
  const chargeLength = Math.max(0, length - p.stemming);
  const kg = p.explosive.density * (Math.PI / 4) * p.diameter ** 2 * chargeLength;
  return {
    rockFactor: rockFactor(p.rock),
    loadingFactor: kg / (p.burden * p.spacing * p.height),
    chargePerHole: kg,
    rws: p.explosive.rws,
    burden: p.burden,
    spacing: p.spacing,
    diameter: p.diameter,
    drillDeviation: p.drillDeviation,
    chargeLength,
    bottomChargeLength: chargeLength,
    columnChargeLength: 0,
    benchHeight: p.height,
    patternFactor: p.staggered ? 1.1 : 1,
    ...(p.rock.swebrecB !== undefined ? { swebrecB: p.rock.swebrecB } : {}),
  };
}

function recommendDesign(args: z.infer<typeof recommendSchema>) {
  const blast = blastOrFail();
  const c = siteConditions();
  const missing = missingConditions(c);
  const rock = rockOf(blast);
  if (!rock) throw new ToolError('The blast has no rock mass.');
  const template = blast.patterns[0]?.holeTemplate ?? useUiStore.getState().holeTemplate;
  const diameter = args.diameter_mm !== undefined ? mmToM(args.diameter_mm) : template.diameter;
  const { e, warnings } = pickExplosive(c, args.explosive);
  const rockClass: RockMassClass = c.rockMass ?? 'fractured';
  const ks = ROCK_CLASSES[rockClass].ks;
  const material: MaterialKind = c.material ?? 'ore';
  const kw = konyaWalterBurden(diameter, e.density, rock.density, KD_DEFAULT.value, ks);
  const staggered = (args.kind ?? 'staggered') === 'staggered';
  const ratio = staggered ? PATTERN_RATIOS.spacing.staggered : PATTERN_RATIOS.spacing.square;
  const points = document.project.monitoringPoints ?? [];
  const sensitive = points.some((p) => p.structure === 'vivienda' || p.structure === 'instalación');
  const H = blast.bench.height;
  const build = (scale: number) => {
    const burden = kw * MATERIAL_SCALE[material].factor * scale;
    const spacing = burden * ratio;
    const stemming =
      burden * (sensitive ? PATTERN_RATIOS.stemming.max : PATTERN_RATIOS.stemming.min);
    const subdrill = burden * PATTERN_RATIOS.subdrill.value;
    const inputs = proposalInputs({
      burden,
      spacing,
      diameter,
      height: H,
      subdrill,
      stemming,
      explosive: e,
      rock,
      staggered,
      drillDeviation: blast.calcParams.drillDeviation,
    });
    const frag = fragmentation(inputs, { oversizeSize: 1, finesSize: 0.01 });
    return { burden, spacing, stemming, subdrill, inputs, p80: frag.p80.swebrec, x50: frag.x50 };
  };
  let best = build(1);
  const target = args.target_p80_cm ?? c.targetP80Cm;
  let tuned = false;
  if (target !== undefined && material !== 'waste') {
    // Bisección del factor de escala de la malla (P80 crece con la malla).
    let lo = 0.5;
    let hi = 1.6;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (build(mid).p80 * 100 > target) hi = mid;
      else lo = mid;
    }
    best = build(lo);
    tuned = true;
  }
  const fit = explosiveFit(c);
  return {
    missing_conditions: missing,
    assumptions: missing.length
      ? `Missing site data (${missing.join(', ')}): proposal assumes ${rockClass} rock, ${c.water ?? 'dry'} holes, ${material}.`
      : undefined,
    proposal: {
      kind: staggered ? 'staggered' : 'square',
      diameter_mm: r(diameter * 1000, 0),
      burden_m: r(best.burden, 1),
      spacing_m: r(best.spacing, 1),
      stemming_m: r(best.stemming, 1),
      subdrill_m: r(best.subdrill, 1),
      column_explosive: e.name,
      kg_per_hole: r(best.inputs.chargePerHole, 0),
      powder_factor_kg_m3: r(best.inputs.loadingFactor, 2),
      predicted_p80_cm: r(best.p80 * 100, 1),
      predicted_x50_cm: r(best.x50 * 100, 1),
      target_p80_cm: target ?? null,
      tuned_to_target: tuned,
    },
    explosive_warnings: warnings,
    other_suitable_explosives: fit.filter((f) => f.ok && f.e.id !== e.id).map((f) => f.e.name),
    not_suitable: fit.filter((f) => !f.ok).map((f) => `${f.e.name}: ${f.reasons.join('; ')}`),
    rationale: [
      `Burden from Konya–Walter with Ks = ${ks} (${ROCK_CLASSES[rockClass].label}); ${ROCK_CLASSES[rockClass].source}.`,
      `Scaled ×${MATERIAL_SCALE[material].factor} for ${material}: ${MATERIAL_SCALE[material].note}`,
      `Spacing ${ratio}·B (${PATTERN_RATIOS.spacing.source}); stemming ${sensitive ? PATTERN_RATIOS.stemming.max : PATTERN_RATIOS.stemming.min}·B and subdrill ${PATTERN_RATIOS.subdrill.value}·B (${PATTERN_RATIOS.stemming.source}).`,
      'P80 predicted with the app Kuz-Ram + Swebrec for this proposal; confirm with predict_results once applied.',
    ],
    next: 'Apply with generate_pattern (kind, burden, spacing, diameter_mm, subdrill) and set_charge (column_explosive, stemming), then tie-up, then predict_results.',
  };
}

// ------------------------------------------------------------------ Explosivo y gases

const fumesSchema = z.object({
  explosive: z.string().optional().describe('Library explosive name.'),
  fuel_oil_pct: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .describe('Fuel oil mass % in an AN/FO mix (ANFO is 5.5–6).'),
});

/** Balance de oxígeno de una mezcla AN/FO (fracción; > 0 sobra oxígeno → NOx, < 0 → CO). */
export function anfoOxygenBalance(fuelOilFraction: number): number {
  return (1 - fuelOilFraction) * OXYGEN_BALANCE.an + fuelOilFraction * OXYGEN_BALANCE.fuelOil;
}

function evaluateExplosive(args: z.infer<typeof fumesSchema>) {
  const c = siteConditions();
  const out: Record<string, unknown> = {};
  if (args.explosive) {
    const lib = document.project.library.explosives;
    const e = findProduct(lib, args.explosive, 'explosive');
    const fit = explosiveFit(c).find((f) => f.e.id === e.id);
    out.explosive = {
      name: e.name,
      family: e.family,
      water_resistance: e.waterResistance,
      density_kg_m3: e.density,
      vod_m_s: e.vod,
      rws: e.rws,
      suitable_for_site: fit?.ok ?? true,
      reasons: fit?.reasons ?? [],
    };
  }
  if (args.fuel_oil_pct !== undefined) {
    const ob = anfoOxygenBalance(args.fuel_oil_pct / 100);
    out.oxygen_balance_pct = r(ob * 100, 1);
    out.fumes =
      ob > 0.005
        ? 'Positive oxygen balance (too little fuel): risk of NOx, orange/red fumes, toxic.'
        : ob < -0.005
          ? 'Negative oxygen balance (too much fuel): risk of CO and lower energy.'
          : 'Near zero: balanced mix, minimum toxic fumes.';
    out.source = OXYGEN_BALANCE.source;
  }
  if (c.water && c.water !== 'dry')
    out.water_note = `${WATER_NEEDS[c.water].note} ANFO wetted by water loses fuel balance and produces NOx.`;
  if (c.reactiveGround === 'yes' || c.reactiveGround === 'suspected')
    out.reactive_note = `${REACTIVE_GROUND.note} (${REACTIVE_GROUND.source})`;
  return out;
}

// ------------------------------------------------------------------ Resultados

function fumesRisk(blast: Blast) {
  const lib = new Map(document.project.library.explosives.map((e) => [e.id, e]));
  const c = siteConditions();
  const wetAnfo: string[] = [];
  const reactive: string[] = [];
  const isReactive = c.reactiveGround === 'yes' || c.reactiveGround === 'suspected';
  for (const h of blast.holes) {
    const wet =
      (h.water !== undefined && h.water !== 'dry') || (c.water !== undefined && c.water !== 'dry');
    for (const d of h.decks) {
      if (d.kind !== 'explosive') continue;
      const e = lib.get(d.explosiveId);
      if (!e) continue;
      if (wet && e.waterResistance === 'none') wetAnfo.push(h.label);
      if (isReactive && REACTIVE_GROUND.avoid.includes(e.family)) reactive.push(h.label);
    }
  }
  const uniq = (a: string[]) => [...new Set(a)];
  return {
    nox_risk_holes: uniq(wetAnfo).slice(0, 20),
    nox_risk_count: uniq(wetAnfo).length,
    nox_note: wetAnfo.length
      ? 'Non water-resistant explosive in wet holes: energy loss and NOx (orange fumes). Change to emulsion/heavy ANFO or line the holes.'
      : undefined,
    reactive_ground_holes: uniq(reactive).length,
    reactive_note: reactive.length ? REACTIVE_GROUND.note : undefined,
  };
}

async function predictResults() {
  const blast = blastOrFail();
  if (blast.holes.length === 0) return { note: 'No holes yet.' };
  const store = useAnalysisStore.getState;
  if (!store().vibEnabled) store().set({ vibEnabled: true });
  await analysisReady(AbortSignal.timeout(20_000));
  const a = currentAnalysis();
  if (!a) throw new ToolError('The analysis is not ready yet; try again.');
  const version = document.version;
  await until(() => store().frag !== null || !store().fragInputs, 6000);
  await until(() => !store().vibComputing && store().vibration !== null, 8000);
  const c = siteConditions();
  const s = store();
  const label = new Map(blast.holes.map((h) => [h.id, h.label]));

  // Tiros cortados (frente de superficie vs. detonación de vecinos).
  const lib = document.project.library;
  const electronic = new Set(
    lib.detonators.filter((d) => d.type === 'electronic').map((d) => d.id),
  );
  const burden = blast.patterns[0]?.burden ?? 5;
  const cut = cutoffRisks(
    blast.holes,
    a.timing.surfaceTime,
    a.timing.fireTime,
    { radius: CUTOFF.radiusInBurdens * burden, minLead: CUTOFF.minLeadMs / 1000 },
    blast.holes.map((h) => h.initiators.some((i) => electronic.has(i.detonatorId))),
  );

  const frag = s.frag;
  const p80 = frag ? frag.p80.swebrec * 100 : null;
  const vib = s.vibration;
  return {
    stale: document.version !== version,
    holes: blast.holes.length,
    total_explosive_kg: r(a.charge.totalExplosive, 0),
    powder_factor_kg_m3: r(a.charge.loadingFactor, 3),
    tonnage_t: r(a.charge.tonnage / 1000, 0),
    firing_span_ms: r(sToMs(a.timing.lastTime - a.timing.firstTime), 0),
    max_charge_per_8ms_kg: r(a.timing.maxChargePerWindow, 0),
    fragmentation: frag
      ? {
          p80_cm: r(p80 ?? 0, 1),
          x50_cm: r(frag.p50.swebrec * 100, 1),
          oversize_pct: r(frag.oversize.swebrec * 100, 1),
          oversize_size_m: frag.oversize.size,
          target_p80_cm: c.targetP80Cm ?? null,
          vs_target:
            c.targetP80Cm !== undefined && p80 !== null
              ? p80 > c.targetP80Cm * 1.05
                ? 'coarser than target: tighten pattern or raise powder factor'
                : p80 < c.targetP80Cm * 0.8
                  ? 'finer than needed: the pattern can open (saves drilling and explosive)'
                  : 'on target'
              : null,
        }
      : 'Fragmentation needs charged holes.',
    vibration: vib
      ? {
          protected_points: vib.receivers.map((p) => {
            const limit = (document.project.monitoringPoints ?? []).find(
              (m) => m.id === p.id,
            )?.ppvLimit;
            return {
              name: p.name,
              distance_m: r(p.distance, 0),
              ppv_mm_s: r(p.ppv * 1000, 1),
              limit_mm_s: limit !== undefined ? r(limit * 1000, 1) : null,
              over_limit: limit !== undefined ? p.ppv > limit : null,
              airblast_db: r(p.airblastDb, 0),
              governing_hole: p.governingHole ? (label.get(p.governingHole) ?? null) : null,
            };
          }),
          flyrock_range_m: r(vib.flyrock.range, 0),
          note: vib.receivers.length
            ? undefined
            : 'No protected points: add them with add_protected_point to get PPV.',
        }
      : 'Vibration not computed (no vibration law or no charge).',
    cutoff_risk: {
      holes: cut.length,
      worst: cut
        .sort((x, y) => x.lead - y.lead)
        .slice(0, 8)
        .map((k) => ({
          hole: label.get(k.holeId) ?? k.holeId,
          fires_first: label.get(k.neighborId) ?? k.neighborId,
          signal_margin_ms: r(k.lead * 1000, 0),
          distance_m: r(k.distance, 1),
        })),
      fix: cut.length
        ? 'Raise the in-hole delay (e.g. 400–500 ms) or shorten surface delays so the surface signal reaches every hole before its neighbours fire; electronic detonators avoid it.'
        : undefined,
      rule: CUTOFF.source,
    },
    fumes: fumesRisk(blast),
    checks: a.checks
      .filter((k) => k.severity !== 'info')
      .slice(0, 10)
      .map((k) => ({
        severity: k.severity,
        title: k.title,
        holes: k.holes.slice(0, 8).map((id) => label.get(id) ?? id),
      })),
  };
}

// ------------------------------------------------------------------ Precorte y buffer

/** Aristas «de pared»: las que no son cara libre y miran en contra de ella (o las pedidas). */
function wallEdges(b: BlastBoundary, sides?: Cardinal[], edges?: number[]): number[] {
  if (edges?.length) return edges.filter((i) => i < b.polygon.length);
  if (sides?.length) return edgesFacing(b, sides);
  const free = b.freeFaceEdges
    .map((i) => outwardNormal(b.polygon, i))
    .filter((n): n is Vec2 => !!n);
  if (free.length === 0)
    throw new ToolError('No free face marked: say which side is the final wall (sides).');
  const f = centroid(free);
  return b.polygon
    .map((_, i) => i)
    .filter((i) => {
      if (b.freeFaceEdges.includes(i)) return false;
      const n = outwardNormal(b.polygon, i);
      return n !== null && n.x * f.x + n.y * f.y < -0.5;
    });
}

/** Grupo de un tipo (lo crea si falta); devuelve el grupo y la op para agregarlo. */
function groupFor(blast: Blast, kind: HoleGroup['kind'], name: string, color: string) {
  const found = blast.groups.find((g) => g.kind === kind);
  if (found) return { group: found, ops: [] as Op[] };
  const group: HoleGroup = { id: newId<'HoleGroup'>(), name, kind, color };
  return {
    group,
    ops: [
      { type: 'blast/patch', blastId: blast.id, patch: { groups: [...blast.groups, group] } },
    ] as Op[],
  };
}

/** Puntos cada `spacing` a lo largo de la arista, desplazados `offset` hacia dentro. */
function pointsAlongEdge(b: BlastBoundary, i: number, spacing: number, offset: number): Vec2[] {
  const a = b.polygon[i];
  const c = b.polygon[(i + 1) % b.polygon.length];
  const n = outwardNormal(b.polygon, i);
  if (!a || !c || !n) return [];
  const len = Math.hypot(c.x - a.x, c.y - a.y);
  const count = Math.max(1, Math.round(len / spacing));
  const out: Vec2[] = [];
  for (let k = 0; k <= count; k++) {
    const t = k / count;
    out.push({
      x: a.x + t * (c.x - a.x) - n.x * offset,
      y: a.y + t * (c.y - a.y) - n.y * offset,
    });
  }
  return out;
}

const presplitSchema = z.object({
  perimeter: z.string().optional(),
  sides: z.array(CARDINAL).optional().describe('Wall side(s); default: opposite the free face.'),
  edges: z.array(z.number().int().min(0)).optional(),
  diameter_mm: z.number().positive().optional().describe('Default: current hole diameter.'),
  spacing_m: z.number().positive().optional().describe('Default: 10·D (guide 8–12·D).'),
  inclination_deg: z.number().min(0).max(45).optional().describe('From vertical; default 0.'),
  explosive: z.string().optional().describe('Low-energy product; default lowest density.'),
  stemming_m: z.number().min(0).optional().describe('Default 1 m.'),
  clearance_m: z
    .number()
    .min(0)
    .optional()
    .describe('Delete production holes closer than this to the presplit line; default 0.5·B.'),
});

function designPresplit(args: z.infer<typeof presplitSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const b = resolvePerimeter(blast, args.perimeter);
  const edges = wallEdges(b, args.sides, args.edges);
  if (edges.length === 0) throw new ToolError('No wall edge found; give sides or edges.');
  const base =
    blast.patterns.find((p) => p.boundaryId === b.id)?.holeTemplate ??
    useUiStore.getState().holeTemplate;
  const D = args.diameter_mm !== undefined ? mmToM(args.diameter_mm) : base.diameter;
  const E = args.spacing_m ?? 10 * D;
  const lib = document.project.library;
  const c = siteConditions();
  const wet = c.water !== undefined && c.water !== 'dry';
  // Por defecto: un producto de precorte apto para el agua y el terreno; si no hay, el apto de
  // menor energía. (Antes era el de menor energía sin mirar el agua: ANFO en taladros con agua.)
  const fit = explosiveFit(c);
  const apt = fit.filter((f) => f.ok).map((f) => f.e);
  const byEnergy = (list: typeof lib.explosives) =>
    [...list].sort((x, y) => x.density * x.rws - y.density * y.rws)[0];
  const explosive = args.explosive
    ? findProduct(lib.explosives, args.explosive, 'explosive')
    : (apt.find((e) => /precorte|presplit|corte/i.test(e.name)) ??
      byEnergy(apt) ??
      byEnergy(lib.explosives));
  if (!explosive) throw new ToolError('The library has no explosives.');
  const unfit = fit.find((f) => f.e.id === explosive.id && !f.ok);
  const material = lib.stemmingMaterials[0];
  if (!material) throw new ToolError('The library has no stemming material.');
  const rock = rockOf(blast);
  // Inclinación hacia la voladura (la pared final queda detrás).
  const points = edges.flatMap((i) => {
    const n = outwardNormal(b.polygon, i);
    const az = n ? unitToAzimuth(-n.x, -n.y) : 0;
    return pointsAlongEdge(b, i, E, 0).map((p) => ({ p, az }));
  });
  // Sin repetir esquinas compartidas.
  const unique = points.filter(
    (q, k) => points.findIndex((o) => Math.hypot(o.p.x - q.p.x, o.p.y - q.p.y) < E * 0.3) === k,
  );
  const { group, ops } = groupFor(blast, 'presplit', 'Precorte', '#d7263d');
  const bench = boundaryBench(blast.bench, b);
  let number = nextHoleNumber(blast.holes);
  const stemming = args.stemming_m ?? 1;
  const decoupled: { diameter: number | null } = { diameter: null };
  const holes: Hole[] = unique.map(({ p, az }) => {
    const ground = blast.bench.topographyId
      ? topographyElevation(p.x, p.y, blast.bench.topographyId)
      : null;
    const h = createHole({
      position: p,
      template: {
        ...base,
        diameter: D,
        subdrill: 0,
        inclination: degToRad(args.inclination_deg ?? 0),
        azimuth: az,
      },
      bench,
      label: String(number++),
      subdrillConvention: blast.calcParams.subdrillConvention,
      ...(ground !== null ? { collarZ: ground } : {}),
    });
    const decks: Deck[] = chargeDecks(h.length, {
      columnId: explosive.id,
      stemming,
      stemmingMaterialId: material.id,
    });
    // Carga desacoplada: el diámetro que da Pb = UCS (R1 F26), si se conoce la UCS.
    if (rock) {
      const charged = decks.filter((d) => d.kind === 'explosive').reduce((s, d) => s + d.length, 0);
      const dc = presplitChargeDiameter(
        presplitDecoupling(rock.ucs, explosive.density, explosive.vod, wet),
        D,
        charged,
        h.length,
      );
      if (Number.isFinite(dc) && dc > 0 && dc < D) {
        decoupled.diameter = dc;
        for (const d of decks) if (d.kind === 'explosive') d.effectiveDiameter = dc;
      }
    }
    return { ...h, groupId: group.id, decks, ...(c.water ? { water: HOLE_WATER[c.water] } : {}) };
  });
  // Taladros de producción demasiado pegados a la línea de precorte (criterio del diseñador).
  const B = blast.patterns.find((p) => p.boundaryId === b.id)?.burden ?? 4;
  const clearance = args.clearance_m ?? 0.5 * B;
  const close = blast.holes.filter(
    (h) =>
      h.groupId !== group.id &&
      holeBoundary(blast, h)?.id === b.id &&
      holes.some((n) => Math.hypot(n.collar.x - h.collar.x, n.collar.y - h.collar.y) < clearance),
  );
  document.dispatch(
    [
      ...ops,
      ...(close.length
        ? commands.deleteHoles(
            document,
            close.map((h) => h.id),
          )
        : []),
      ...commands.addHoles(blast.id, holes),
    ],
    `IA: precorte (${holes.length} taladros)`,
  );
  return {
    presplit_holes: holes.length,
    labels: holes.length ? `${holes[0]?.label ?? ''}–${holes[holes.length - 1]?.label ?? ''}` : '',
    spacing_m: r(E, 2),
    diameter_mm: r(D * 1000, 0),
    explosive: explosive.name,
    ...(unfit
      ? { explosive_warning: `${explosive.name}: ${unfit.reasons.join('; ')}. Tell the user.` }
      : {}),
    decoupled_charge_diameter_mm:
      decoupled.diameter !== null ? r(decoupled.diameter * 1000, 0) : null,
    removed_close_production_holes: close.map((h) => h.label),
    timing_note:
      'These holes have NO detonator yet: set_electronic_timing / set_tie_up only program the production pattern. The presplit must fire at least 100 ms before the production holes (app check presplitLead), or as a separate shot: give it detonator and delays with set_hole_delays, and tell the user it is pending.',
    source: 'R1 F26 (Pb = 110·f^n·ρ·VOD², Pb ≈ UCS), spacing guide 8–12·D',
  };
}

const bufferSchema = z.object({
  perimeter: z.string().optional(),
  sides: z.array(CARDINAL).optional(),
  edges: z.array(z.number().int().min(0)).optional(),
  distance_m: z
    .number()
    .positive()
    .optional()
    .describe('Distance from the wall (presplit) line [m]; default 0.5·B of production.'),
  spacing_m: z.number().positive().optional().describe('Default 0.8·S of production.'),
  clearance_m: z.number().min(0).optional().describe('Remove production holes closer than this.'),
});

function designBuffer(args: z.infer<typeof bufferSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const b = resolvePerimeter(blast, args.perimeter);
  const edges = wallEdges(b, args.sides, args.edges);
  const pattern = blast.patterns.find((p) => p.boundaryId === b.id);
  const B = pattern?.burden ?? 4;
  const S = pattern?.spacing ?? B;
  const d = args.distance_m ?? 0.5 * B;
  const sp = args.spacing_m ?? 0.8 * S;
  const base = pattern?.holeTemplate ?? useUiStore.getState().holeTemplate;
  const { group, ops } = groupFor(blast, 'buffer', 'Buffer', '#f46036');
  const bench = boundaryBench(blast.bench, b);
  let number = nextHoleNumber(blast.holes);
  const raw = edges.flatMap((i) => pointsAlongEdge(b, i, sp, d));
  const inside = raw.filter(
    (p, k) =>
      pointInPolygon(p.x, p.y, b.polygon) &&
      raw.findIndex((o) => Math.hypot(o.x - p.x, o.y - p.y) < sp * 0.3) === k,
  );
  const holes: Hole[] = inside.map((p) => {
    const ground = blast.bench.topographyId
      ? topographyElevation(p.x, p.y, blast.bench.topographyId)
      : null;
    const h = createHole({
      position: p,
      template: base,
      bench,
      label: String(number++),
      subdrillConvention: blast.calcParams.subdrillConvention,
      ...(ground !== null ? { collarZ: ground } : {}),
    });
    return { ...h, groupId: group.id };
  });
  const clearance = args.clearance_m ?? 0.6 * Math.min(B, sp);
  const close = blast.holes
    .filter(
      (h) =>
        h.groupId === undefined ||
        (blast.groups.find((g) => g.id === h.groupId)?.kind !== 'presplit' &&
          h.groupId !== group.id),
    )
    .filter(
      (h) =>
        holeBoundary(blast, h)?.id === b.id &&
        holes.some((n) => Math.hypot(n.collar.x - h.collar.x, n.collar.y - h.collar.y) < clearance),
    );
  document.dispatch(
    [
      ...ops,
      ...(close.length
        ? commands.deleteHoles(
            document,
            close.map((h) => h.id),
          )
        : []),
      ...commands.addHoles(blast.id, holes),
    ],
    `IA: fila buffer (${holes.length} taladros)`,
  );
  return {
    buffer_holes: holes.length,
    distance_from_wall_m: r(d, 1),
    spacing_m: r(sp, 1),
    removed_close_production_holes: close.map((h) => h.label),
    note: 'Buffer holes have no charge: load them lighter than production (e.g. set_charge with a shorter column or more stemming).',
    source: 'R1 A.2 (buffer: B_buf, S_buf = 1,15·B_buf); distances here are starting guides',
  };
}

// ------------------------------------------------------------------ Zonas de mineral y desmonte

const zoneSchema = z.object({
  perimeter: z.string().optional(),
  side: CARDINAL.describe('Side of the perimeter where the zone is (e.g. E = east part).'),
  fraction: z
    .number()
    .min(0.05)
    .max(0.95)
    .describe('Fraction of the perimeter width taken by the zone from that side (0.5 = half).'),
  zone_material: z.enum(['ore', 'waste']).describe('Material of that zone.'),
  rest_material: z.enum(['ore', 'waste']).describe('Material of the rest.'),
});

function splitZone(args: z.infer<typeof zoneSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const b = resolvePerimeter(blast, args.perimeter);
  const box = polygonBounds(b.polygon);
  const dir: Record<Cardinal, Vec2> = {
    N: { x: 0, y: 1 },
    S: { x: 0, y: -1 },
    E: { x: 1, y: 0 },
    W: { x: -1, y: 0 },
  };
  const n = dir[args.side];
  const far = { N: box.maxY, S: -box.minY, E: box.maxX, W: -box.minX }[args.side];
  const width = args.side === 'N' || args.side === 'S' ? box.maxY - box.minY : box.maxX - box.minX;
  const cut = far - args.fraction * width;
  const point = { x: n.x * cut, y: n.y * cut };
  const zonePoly = clipPolygonHalfPlane(b.polygon, point, n);
  const restPoly = clipPolygonHalfPlane(b.polygon, point, { x: -n.x, y: -n.y });
  if (zonePoly.length < 3 || restPoly.length < 3)
    throw new ToolError('The split leaves an empty part; use another fraction.');
  const freeSegs = b.freeFaceEdges.flatMap((i) => {
    const a = b.polygon[i];
    const c = b.polygon[(i + 1) % b.polygon.length];
    return a && c ? [[a, c] as const] : [];
  });
  const name = (m: 'ore' | 'waste') => `${b.name} · ${m === 'ore' ? 'mineral' : 'desmonte'}`;
  const make = (poly: Vec2[], m: 'ore' | 'waste'): BlastBoundary => {
    const nb = commands.makeBoundary(blast, poly);
    nb.name = name(m);
    nb.freeFaceEdges = poly
      .map((_, i) => i)
      .filter((i) => {
        const a = poly[i] as Vec2;
        const c = poly[(i + 1) % poly.length] as Vec2;
        return freeSegs.some(([p, q]) => segmentOnSegment(a, c, p, q, 1e-4));
      });
    if (b.floorElevation !== undefined) nb.floorElevation = b.floorElevation;
    if (b.faceAngle !== undefined) nb.faceAngle = b.faceAngle;
    return nb;
  };
  const zone = make(zonePoly, args.zone_material);
  const rest = make(restPoly, args.rest_material);
  const oldPatterns = blast.patterns.filter((p) => p.boundaryId === b.id).map((p) => p.id);
  const oldHoles = blast.holes.filter((h) => holeBoundary(blast, h)?.id === b.id);
  const domain = (poly: Vec2[], m: 'ore' | 'waste'): BlastDomain => ({
    id: newId<'Domain'>(),
    name: m === 'ore' ? 'Mineral' : 'Desmonte',
    polygon: poly,
    material: m === 'ore' ? 'Mineral' : 'Desmonte',
    color: m === 'ore' ? '#e0a526' : '#7a8a99',
  });
  const domains = [
    ...(blast.domains ?? []),
    domain(zonePoly, args.zone_material),
    domain(restPoly, args.rest_material),
  ];
  const ops: Op[] = [
    ...(oldHoles.length
      ? commands.deleteHoles(
          document,
          oldHoles.map((h) => h.id),
        )
      : []),
    ...(oldPatterns.length ? commands.removePatterns(document, blast.id, oldPatterns) : []),
  ];
  // Las dos zonas en un solo cambio de la lista de perímetros: dos `addBoundary` sobre la misma
  // lista hacían que la segunda pisara a la primera (se perdía la zona de desmonte).
  ops.push({
    type: 'blast/patch',
    blastId: blast.id,
    patch: { boundaries: [...blast.boundaries.filter((x) => x.id !== b.id), zone, rest], domains },
  });
  document.dispatch(ops, `IA: zonas ${zone.name} y ${rest.name}`);
  return {
    perimeters: [zone.name, rest.name],
    removed_holes: oldHoles.length,
    note: 'Now generate a pattern in each perimeter (tighter in ore, wider in waste) with generate_pattern(perimeter=...), then charge and tie-up. Domains were added so the muckpile shows ore/waste mixing.',
  };
}

// ------------------------------------------------------------------ Movimiento de bloques

const trackSchema = z.object({
  block_size_m: z.number().positive().optional().describe('Operating block size [m]; default 10.'),
});

async function trackBlocks(args: z.infer<typeof trackSchema>) {
  const blast = blastOrFail();
  await pileReady(AbortSignal.timeout(40_000));
  const m = useAnalysisStore.getState().muckpile;
  if (!m) throw new ToolError('The muckpile could not be computed.');
  const size = args.block_size_m ?? 10;
  const cells = new Map<string, { v: number; dx: number; dy: number; x: number; y: number }>();
  const { blocks } = m;
  for (let k = 0; k < blocks.count; k++) {
    const ox = blocks.origin[3 * k] ?? 0;
    const oy = blocks.origin[3 * k + 1] ?? 0;
    const v = blocks.volume[k] ?? 0;
    const key = `${Math.floor(ox / size)}:${Math.floor(oy / size)}`;
    const c = cells.get(key) ?? { v: 0, dx: 0, dy: 0, x: 0, y: 0 };
    c.v += v;
    c.dx += v * ((blocks.destination[3 * k] ?? ox) - ox);
    c.dy += v * ((blocks.destination[3 * k + 1] ?? oy) - oy);
    c.x += v * ox;
    c.y += v * oy;
    cells.set(key, c);
  }
  const list = [...cells.values()]
    .filter((c) => c.v > 0)
    .map((c) => ({
      x: c.x / c.v,
      y: c.y / c.v,
      dx: c.dx / c.v,
      dy: c.dy / c.v,
    }));
  const moves = list.map((c) => Math.hypot(c.dx, c.dy));
  const mean = moves.reduce((s, v) => s + v, 0) / Math.max(1, moves.length);
  const st = m.stats;
  // Mezcla de dominios en la pila: fracción de celdas con material mezclado.
  const purity = m.grids.domainPurity;
  let mixed = 0;
  let withMaterial = 0;
  for (let i = 0; i < purity.length; i++) {
    const p = purity[i] ?? NaN;
    if (!Number.isFinite(p) || (m.grids.domain[i] ?? -1) < 0) continue;
    withMaterial++;
    if (p < 0.9) mixed++;
  }
  // Muestra la pila con sus vectores.
  const s = useAnalysisStore.getState();
  s.setLayer('muckpile', true);
  s.setLayer('muckpileVectors', true);
  return {
    operating_blocks: list.length,
    block_size_m: size,
    mean_block_displacement_m: r(mean, 1),
    max_block_displacement_m: r(Math.max(0, ...moves), 1),
    direction_deg: r(radToDeg(unitToAzimuth(st.direction.x, st.direction.y)), 0),
    throw_m: r(st.throw, 1),
    swell_volume_ratio: r(st.pileVolume / Math.max(1, st.inSituVolume), 2),
    max_pile_height_m: r(st.maxHeight, 1),
    domains: (blast.domains ?? []).map((d) => d.name),
    mixed_cells_pct: withMaterial ? r((100 * mixed) / withMaterial, 0) : null,
    note: 'Each operating block keeps its in-situ identity: the vectors show where it went (stake the dig lines from them).',
  };
}

// ------------------------------------------------------------------ Vista

const showSchema = z.object({
  what: z
    .enum([
      'sequence',
      'vibration',
      'energy',
      'displacement',
      'muckpile',
      'flyrock',
      'timing',
      'clear',
    ])
    .describe(
      'sequence = animate the firing (with muckpile flight; underground: the rock flying out of the face/stope and piling up in the drive, «simula la voladura»); vibration/energy maps; displacement arrows; muckpile; flyrock zone; timing = color holes by firing time; clear = hide maps.',
    ),
  view: z.enum(['plan', '3d']).optional(),
});

async function showResults(args: z.infer<typeof showSchema>) {
  const s = useAnalysisStore.getState();
  const engine = getEngine();
  // En el visor siempre es 3D, y lo que se muestra se trae al frente para verlo entero.
  const xr = engine?.xrMode ? engine : null;
  const inXr = xr !== null;
  if (args.view && !inXr) useUiStore.getState().setViewMode(args.view);
  // A escala real la secuencia se mira desde un lugar seguro (ver abajo); el resto se trae al frente.
  const walking = xr?.xrState()?.view === 'walk';
  if (
    xr &&
    args.what !== 'clear' &&
    args.what !== 'timing' &&
    !(walking && args.what === 'sequence')
  )
    xr.focusXr();
  switch (args.what) {
    case 'clear':
      for (const l of RESULT_LAYERS) s.setLayer(l, false);
      s.set({ colorBy: 'none' });
      getEngine()?.stopSequence();
      return {
        shown: 'none',
        hidden: [...RESULT_LAYERS],
        note: 'Only result overlays were hidden; perimeters, holes and topography stay. Use set_layers or delete_perimeter for those.',
      };
    case 'vibration':
      s.set({ vibEnabled: true });
      s.setLayer('vibration', true);
      break;
    case 'energy':
      s.set({ energyEnabled: true });
      s.setLayer('energy', true);
      break;
    case 'flyrock':
      s.set({ vibEnabled: true });
      s.setLayer('flyrock', true);
      break;
    case 'displacement':
      s.setLayer('displacement', true);
      break;
    case 'timing':
      s.set({ colorBy: 'time' });
      break;
    case 'muckpile':
      await pileReady(AbortSignal.timeout(40_000));
      s.setLayer('muckpile', true);
      break;
    case 'sequence': {
      await analysisReady(AbortSignal.timeout(20_000));
      // Sin tiempos de disparo no hay nada que animar: se dice por qué en vez de quedar quieta.
      const a = currentAnalysis();
      const blast = blastOrFail();
      const fired = a ? a.timing.fireTime.filter((t) => Number.isFinite(t)).length : 0;
      if (!a || fired === 0)
        throw new ToolError(
          'No firing times: the holes have no detonator or are not tied up, so the firing cannot be animated. Tie up with set_tie_up (nonel) or set_electronic_timing, then try again.',
        );
      useUiStore.getState().setViewMode(inXr ? '3d' : (args.view ?? '3d'));
      // Subterránea (en pantalla): la roca sale del frente y se amontona en la galería, con la
      // cámara de costado al túnel (la misma de «Simular voladura» de la pestaña Análisis).
      if (!xr && autoPileTarget() === 'underground') {
        let withPile = true;
        try {
          await pileReady(AbortSignal.timeout(20_000));
        } catch {
          withPile = false;
        }
        if (withPile && playUndergroundPile()) {
          const pile = currentUgPile();
          return {
            shown: 'sequence',
            underground_muckpile: pile ? ugPileSummary(pile) : null,
            ...(blast.holes.length > fired
              ? {
                  warnings: [
                    `${blast.holes.length - fired} holes have no firing time and do not fire in the animation.`,
                  ],
                }
              : {}),
          };
        }
      }
      let moved: ReturnType<typeof xrSequenceSpot> = null;
      if (xr) {
        // En el visor se ven las dos cosas: el disparo y el vuelo de la pila (al entrar al visor
        // la pila empieza apagada).
        s.setLayer('muckpile', true);
        s.setLayer('muckpileBlocks', true);
        if (walking) moved = xrSequenceSpot(blast);
      }
      // La pila acompaña al disparo si está a tiempo; si no, se anima sin ella (no se hace esperar).
      let withPile = true;
      try {
        await pileReady(AbortSignal.timeout(10_000));
      } catch {
        withPile = false;
      }
      await playDemoSequence(AbortSignal.timeout(20_000), 12, withPile);
      if (moved)
        return {
          shown: 'sequence',
          view_spot: moved,
          ...(withPile
            ? {}
            : { muckpile: 'still computing; the firing played without the muckpile flight' }),
          ...(blast.holes.length > fired
            ? {
                warnings: [
                  `${blast.holes.length - fired} holes have no firing time (no detonator or not tied up) and do not fire in the animation; tie them up.`,
                ],
              }
            : {}),
        };
      const missing = blast.holes.length - fired;
      if (missing > 0)
        return {
          shown: 'sequence',
          warnings: [
            `${missing} holes have no firing time (no detonator or not tied up) and do not fire in the animation; tie them up.`,
          ],
        };
      break;
    }
  }
  return { shown: args.what, view: useUiStore.getState().viewMode };
}

// ------------------------------------------------------------------ Capas y perímetros

/** Capas de resultados (lo que oculta `show_results clear`). */
const RESULT_LAYERS = [
  'energy',
  'vibration',
  'flyrock',
  'displacement',
  'isochrones',
  'muckpile',
  'muckpileBefore',
  'muckpileVectors',
  'muckpileBlocks',
] as const;

/** Nombres de capa para el modelo → capas del engine. */
const LAYER_GROUPS = {
  results: RESULT_LAYERS,
  labels: ['labels'],
  hole_traces: ['traces'],
  tie_up: ['connections'],
  isochrones: ['isochrones'],
  energy: ['energy'],
  vibration: ['vibration'],
  flyrock: ['flyrock'],
  displacement: ['displacement'],
  as_drilled: ['asDrilled'],
  muckpile: ['muckpile', 'muckpileBefore', 'muckpileVectors'],
  material_blocks: ['muckpileBlocks'],
  ore_waste_zones: ['domains'],
  slope_faces: ['faces'],
  bench_surfaces: ['benchPlanes'],
  topography: ['topoImage', 'topoShade', 'topoContours', 'topoLines'],
} as const;
type LayerName = keyof typeof LAYER_GROUPS;
const layerNames = Object.keys(LAYER_GROUPS) as [LayerName, ...LayerName[]];
const TOPO_OPACITY_3D = 0.85;

const layersSchema = z.object({
  show: z.array(z.enum(layerNames)).optional(),
  hide: z.array(z.enum(layerNames)).optional(),
});

function setLayers(args: z.infer<typeof layersSchema>) {
  const s = useAnalysisStore.getState();
  const apply = (names: readonly LayerName[] | undefined, visible: boolean) => {
    for (const name of names ?? []) {
      for (const layer of LAYER_GROUPS[name]) s.setLayer(layer, visible);
      // En 3D (y el visor) la topografía es una superficie: se oculta con su opacidad.
      if (name === 'topography') s.set({ topoOpacity3d: visible ? TOPO_OPACITY_3D : 0 });
    }
  };
  apply(args.hide, false);
  apply(args.show, true);
  if (!args.show?.length && !args.hide?.length)
    throw new ToolError('Say which layers to show or hide.');
  // Prender una capa vacía no muestra nada: se avisa para no decir que se ve algo que no existe.
  const warnings: string[] = [];
  const shows = (n: LayerName) => args.show?.includes(n) ?? false;
  if (loadedSurveys().some((x) => x.survey.assets.cloud ?? x.survey.assets.blocks))
    warnings.push(
      'Point clouds / block models are loaded: they are 3D context in UTM (not terrain, not the bench). To show them call set_camera target "models"; do not use use_topography for them.',
    );
  else if (shows('topography') && !loadedSurveys().some((x) => x.tin))
    warnings.push(
      'NO TOPOGRAPHY in this project: there is no survey loaded, so there is no relief to show (the flat gray plane is the bench top at a fixed elevation). Tell the user plainly. Topography = the surveyed real terrain; it is NOT the muckpile/material (the simulated broken-rock pile after the blast). To get relief: upload a survey in the Topografía tab, or open a project that has one (e.g. "Demo · Banco sobre topografía", mine Cuajone).',
    );
  if ((shows('muckpile') || shows('material_blocks')) && !s.muckpile)
    warnings.push(
      'No muckpile computed yet: use show_results "muckpile" (or track_blocks) first, then it can be shown.',
    );
  return {
    shown: args.show ?? [],
    hidden: args.hide ?? [],
    ...(warnings.length ? { warnings } : {}),
  };
}

const spotlightSchema = z.object({
  show: z
    .array(z.enum([...layerNames, 'holes']))
    .optional()
    .describe(
      'What to keep visible; everything else is hidden. tie_up = the tie-up/firing network ("quiero ver el amarre"), holes = only the holes (with their charge in 3D and their labels), plus any layer name.',
    ),
  holes: targetSchema
    .optional()
    .describe(
      'Show only these holes in 3D/VR, with their labels: {group:"precorte"} = "muéstrame el precorte", {explosive:"ANFO"} = "los taladros con ANFO", {no_detonator:true}, {labels:[...]}, {rows:[1]}.',
    ),
  seconds: z
    .number()
    .min(3)
    .max(120)
    .optional()
    .describe('Only if the user asks for a timed peek; by default it stays until restore.'),
  restore: z
    .boolean()
    .optional()
    .describe('Back to the general view: every layer and every hole as before the spotlight.'),
});

let spotlightTimer: ReturnType<typeof setTimeout> | null = null;
let spotlightRestore: (() => void) | null = null;

function endSpotlight(): boolean {
  if (spotlightTimer) clearTimeout(spotlightTimer);
  spotlightTimer = null;
  const restore = spotlightRestore;
  spotlightRestore = null;
  getEngine()?.setHoleFocus(null);
  restore?.();
  return restore !== null;
}

/**
 * Foco: deja a la vista solo lo pedido (el amarre, los taladros, el precorte, los de ANFO, la
 * vibración…) y queda así hasta que el usuario quiera volver a la vista general (`restore`): él
 * decide cuánto mira. Un foco nuevo reemplaza al anterior sin perder el estado original.
 */
function spotlight(args: z.infer<typeof spotlightSchema>) {
  if (args.restore) {
    const was = endSpotlight();
    return { restored: true, ...(was ? {} : { note: 'There was no spotlight active.' }) };
  }
  const blast = blastOrFail();
  const picked = args.holes ? resolveTarget(blast, args.holes) : null;
  const show = new Set(args.show ?? []);
  // Los taladros se miran con su numeración.
  if (picked || show.has('holes')) {
    show.add('holes');
    show.add('labels');
  }
  if (show.size === 0) throw new ToolError('Say what to show (layers or holes), or restore.');
  const s = useAnalysisStore.getState();
  if (!spotlightRestore) {
    const saved = { layers: { ...s.layers }, topoOpacity3d: s.topoOpacity3d };
    spotlightRestore = () => {
      const now = useAnalysisStore.getState();
      for (const [k, v] of Object.entries(saved.layers))
        now.setLayer(k as keyof typeof saved.layers, v);
      now.set({ topoOpacity3d: saved.topoOpacity3d });
    };
  }
  if (spotlightTimer) clearTimeout(spotlightTimer);
  spotlightTimer = null;
  const keep = new Set<string>();
  for (const name of show) if (name !== 'holes') for (const l of LAYER_GROUPS[name]) keep.add(l);
  for (const layer of Object.keys(s.layers) as (keyof typeof s.layers)[])
    s.setLayer(layer, keep.has(layer));
  s.set({ topoOpacity3d: show.has('topography') ? TOPO_OPACITY_3D : 0 });
  getEngine()?.setHoleFocus(picked ? new Set(picked.map((h) => h.id)) : null);
  if (args.seconds) spotlightTimer = setTimeout(endSpotlight, args.seconds * 1000);
  const labels = picked?.map((h) => h.label) ?? [];
  return {
    showing_only: [...show],
    ...(picked
      ? {
          holes: picked.length,
          labels: labels.length > 30 ? `${labels.slice(0, 30).join(', ')}…` : labels.join(', '),
        }
      : {}),
    ...(args.seconds
      ? { seconds: args.seconds, note: `Everything comes back in ${String(args.seconds)} s.` }
      : {
          note: 'It stays like this until the user is done: ask "¿Quieres hacer algo más en esta vista o volvemos a la vista general?" and call spotlight restore when they want the general view.',
        }),
  };
}

// Al pedir un taladro, la topografía, la malla y las capas no lo tapan: queda solo él, con su
// carga y su etiqueta, hasta que el usuario pida la vista general (spotlight restore).
setHoleFocusHandler((hole) => {
  spotlight({ holes: { labels: [hole.label] } });
  return {
    spotlight:
      'Only this hole is visible now (topography and other layers hidden so nothing covers it). When the user is done, ask «¿Volvemos a la vista general?» and call spotlight restore.',
  };
});

const deletePerimeterSchema = z.object({
  perimeter: z.string().optional().describe('Perimeter name to delete with its holes and pattern.'),
  all: z
    .boolean()
    .optional()
    .describe('Delete EVERY perimeter, hole, pattern and ore/waste zone: start the design over.'),
});

/** Borra un perímetro con sus taladros y su malla (o todo el diseño): un solo paso deshacible. */
function deletePerimeter(args: z.infer<typeof deletePerimeterSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const targets = args.all ? blast.boundaries : [resolvePerimeter(blast, args.perimeter)];
  if (targets.length === 0) throw new ToolError('There are no perimeters to delete.');
  const ids = new Set(targets.map((b) => b.id));
  const holes = args.all
    ? blast.holes
    : blast.holes.filter((h) => {
        const id = holeBoundary(blast, h)?.id;
        return id !== undefined && ids.has(id);
      });
  const patterns = blast.patterns.filter((p) => p.boundaryId && ids.has(p.boundaryId));
  const ops: Op[] = [
    ...(holes.length
      ? commands.deleteHoles(
          document,
          holes.map((h) => h.id),
        )
      : []),
    ...(patterns.length
      ? commands.removePatterns(
          document,
          blast.id,
          patterns.map((p) => p.id),
        )
      : []),
  ];
  // Perímetros (y zonas, si se borra todo) en un solo cambio: un «deshacer» lo recupera entero.
  ops.push({
    type: 'blast/patch',
    blastId: blast.id,
    patch: {
      boundaries: blast.boundaries.filter((b) => !ids.has(b.id)),
      ...(args.all ? { domains: [] } : {}),
    },
  });
  document.dispatch(ops, `IA: borrar ${targets.map((b) => b.name).join(', ')}`);
  if (ids.has(useUiStore.getState().activeBoundaryId ?? ('' as never)))
    useUiStore.getState().setActiveBoundary(null);
  // Sin diseño, los resultados viejos (pila, vibración…) ya no corresponden.
  if (args.all) for (const l of RESULT_LAYERS) useAnalysisStore.getState().setLayer(l, false);
  return {
    deleted_perimeters: targets.map((b) => b.name),
    deleted_holes: holes.length,
    remaining_perimeters: document.project.blasts[0]?.boundaries.map((b) => b.name) ?? [],
  };
}

// ------------------------------------------------------------------ Visor (VR)

const VR_TARGETS = [
  'blast',
  'hole',
  'point',
  'free_face',
  'behind',
  'crest',
  'overview',
  'center',
  'above',
  'xy',
] as const;

const vrSchema = z.object({
  action: z
    .enum([
      'go_to',
      'state',
      'table',
      'walk',
      'model',
      'place',
      'zoom_in',
      'zoom_out',
      'focus_blast',
      'focus_hole',
      'focus_point',
      'higher',
      'lower',
      'height',
      'exit',
    ])
    .describe(
      'go_to = take the user somewhere at full scale, standing on the terrain and facing it, with a smooth flight (use it for "llévame a…", "ponme…", "vista desde…"); state = where the user is now, what scale, and what is in front of them (call it before describing what they see or when unsure where they are); table = model on the real table; walk = enter the blast at full scale (default start point); model = isolated model; place = put the model on the table; zoom_in/zoom_out = closer/farther (at full scale it steps forward/back along the gaze: 10 m by default, distance_m for «aléjame 50 m»; on the model, a small scale step); focus_blast = bring the whole blast in front of the user; focus_hole = show a hole (model: brings it close; walk: stands next to it), marks it and shows its card; focus_point = frame a protected point together with the blast (at full scale: from above, to the side; it sets the height itself, so never add higher/lower or another view in the same turn; use it for "¿dónde está la comunidad?", "muéstrame la comunidad"; NOT for "acércame / llévame a la comunidad": that is go_to target point with distance_m 40 (then height if they ask for a height)); higher/lower = rise or descend from where the user is ("más arriba", "bájame"; distance_m = meters, default about half the current height); height = put the eyes exactly distance_m above the ground where the user is ("déjame a 10 m del terreno", "ponme a 50 m de altura"); exit = leave VR. "Centra la voladura" at full scale = go_to blast.',
    ),
  target: z
    .enum(VR_TARGETS)
    .optional()
    .describe(
      'For go_to. blast = standing on the ground at the edge of the drilled area, holes a few meters ahead ("llévame al terreno / a la voladura / centra la voladura"); center = standing in the middle of the pattern ("ponme dentro de la malla"); above = floating above the blast looking down at the whole pattern ("por encima de la voladura / encima del plano / vista de pájaro"; distance_m = height); overview = high and far, blast plus protected points (only "vista general" with the community); hole = next to a hole (needs `hole`; "llévame al taladro 12"); point = at a protected point looking at the blast (needs `point`; "llévame a la comunidad"); free_face = on the floor in front of the free face, looking at it ("vista desde la cara libre"); behind = behind the blast looking toward the free face ("ponme detrás de la voladura"); crest = on the bench crest looking along it;  xy = a coordinate (needs `x`, `y`).',
    ),
  hole: z.string().optional().describe('Hole label for focus_hole and go_to hole.'),
  point: z
    .string()
    .optional()
    .describe('Protected point name (or part of it) for focus_point and go_to point.'),
  x: z.number().optional().describe('Project X (East) [m] for go_to xy.'),
  y: z.number().optional().describe('Project Y (North) [m] for go_to xy.'),
  distance_m: z
    .number()
    .positive()
    .max(5000)
    .optional()
    .describe(
      'go_to: how far from the target to stand [m] (default depends on the target). zoom_in/zoom_out at full scale: how many meters to move (default 10). higher/lower: meters up/down.',
    ),
});

const r1 = (v: number) => Math.round(v * 10) / 10;
const xyz = (p: { x: number; y: number; z: number }) => ({ x: r1(p.x), y: r1(p.y), z: r1(p.z) });
/** Azimut [°] de a hacia b (desde el Norte, horario). */
const azimuthTo = (a: Vec2, b: Vec2) =>
  ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;

/** Punto protegido por nombre exacto, parcial o el único que hay. */
function vrPoint(name?: string) {
  const points = document.project.monitoringPoints ?? [];
  const key = name?.trim().toLowerCase() ?? '';
  const p =
    points.find((x) => x.name.toLowerCase() === key) ??
    points.find((x) => key !== '' && x.name.toLowerCase().includes(key)) ??
    (points.length === 1 ? points[0] : undefined);
  if (!p)
    throw new ToolError(
      `Unknown point ${name ?? ''}. Existing: ${points.map((x) => x.name).join(', ') || 'none'}.`,
    );
  return p;
}

function vrHole(label?: string) {
  return resolveHole(blastOrFail().holes, label ?? '').hole;
}

/** Centro de los taladros (o del perímetro) y radio que los contiene [m]. */
function blastDisc(blast: Blast): { c: Vec2; radius: number } {
  const c = blastCenter(blast);
  const pts = blast.holes.length
    ? blast.holes.map((h) => h.collar)
    : blast.boundaries.flatMap((b) => b.polygon);
  return { c, radius: Math.max(5, ...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) };
}

/** Normal exterior media de la cara libre (ponderada por largo), o null si no hay cara libre. */
function freeFaceNormal(blast: Blast): Vec2 | null {
  let nx = 0;
  let ny = 0;
  for (const b of blast.boundaries)
    for (const i of b.freeFaceEdges) {
      const a = b.polygon[i];
      const c = b.polygon[(i + 1) % b.polygon.length];
      const n = outwardNormal(b.polygon, i);
      if (!a || !c || !n) continue;
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      nx += n.x * l;
      ny += n.y * l;
    }
  const l = Math.hypot(nx, ny);
  return l > 1e-9 ? { x: nx / l, y: ny / l } : null;
}

/** Distancia de la vista de la secuencia al borde de la voladura [m] (pedido del usuario). */
const SEQUENCE_VIEW_M = 60;

/**
 * Durante la secuencia a escala real se mira en isométrico: a SEQUENCE_VIEW_M del borde de la
 * voladura, de costado a la cara libre y a ~35° de altura, para ver el disparo y el vuelo del
 * material de cerca. (Antes se salía de la zona de proyecciones: con ~1 km de alcance la voladura
 * quedaba tan lejos que no se veía.) El alcance de proyecciones se informa aparte.
 */
function xrSequenceSpot(blast: Blast) {
  const engine = getEngine();
  const st = engine?.xrState();
  if (!engine || st?.view !== 'walk') return null;
  const { c, radius } = blastDisc(blast);
  const fly = useAnalysisStore.getState().vibration?.flyrock;
  const range = fly && Number.isFinite(fly.range) ? fly.range : 0;
  const n = freeFaceNormal(blast);
  // De los dos costados de la cara libre, el más parecido a hacia dónde mira el usuario.
  let yawDeg = azimuthTo(st.head, c);
  if (n) {
    const side = (k: 1 | -1) => (azimuthTo({ x: 0, y: 0 }, n) + 90 * k + 360) % 360;
    const diff = (a: number) => Math.abs(((a - st.headingDeg + 540) % 360) - 180);
    yawDeg = diff(side(1)) <= diff(side(-1)) ? side(1) : side(-1);
  }
  const standDistance = radius + SEQUENCE_VIEW_M;
  const res = engine.goToXr(c, {
    standDistance,
    yawDeg,
    eyeHeight: standDistance * 0.7,
    lookAt: c,
  });
  return res
    ? {
        view: `isometric, ${SEQUENCE_VIEW_M.toString()} m from the blast edge`,
        standing_at: xyz(res.eye),
        distance_to_blast_center_m: r(standDistance, 0),
        ...(range > 0
          ? {
              flyrock_range_m: r(range, 0),
              note: 'This is a viewing spot only; in reality the people stay outside the flyrock range.',
            }
          : {}),
      }
    : null;
}

/** Dirección de un objeto respecto de la mirada: adelante, a la izquierda, a la derecha o atrás. */
function relativeSide(from: Vec2, heading: number, to: Vec2) {
  const rel = ((azimuthTo(from, to) - heading + 540) % 360) - 180;
  const side =
    Math.abs(rel) <= 35 ? 'ahead' : Math.abs(rel) >= 145 ? 'behind' : rel > 0 ? 'right' : 'left';
  return { side, relative_deg: Math.round(rel) };
}

function vrState() {
  const engine = getEngine();
  const st = engine?.xrState();
  if (!st) throw new ToolError('The user is not in VR.');
  const blast = document.project.blasts[0];
  const walk = st.view === 'walk';
  const base = {
    view: st.view,
    scale: walk ? '1:1 (full scale)' : `1:${Math.round(1 / st.scale)}`,
  };
  if (!walk || !blast)
    return {
      ...base,
      note: walk
        ? 'No blast.'
        : 'Looking at a model in front of the user; use go_to to stand in the real place.',
    };
  const head = st.head;
  const { c, radius } = blastDisc(blast);
  const dist = (p: Vec2) => r(Math.hypot(p.x - head.x, p.y - head.y), 0);
  let nearest: { label: string; d: number } | null = null;
  for (const h of blast.holes) {
    const d = Math.hypot(h.collar.x - head.x, h.collar.y - head.y);
    if (!nearest || d < nearest.d) nearest = { label: h.label, d };
  }
  const things = [
    { name: 'blast center', at: c },
    ...(document.project.monitoringPoints ?? []).map((p) => ({ name: p.name, at: p.position })),
  ].map((t) => ({
    name: t.name,
    distance_m: dist(t.at),
    ...relativeSide(head, st.headingDeg, t.at),
  }));
  const n = freeFaceNormal(blast);
  return {
    ...base,
    position: xyz(head),
    eye_above_ground_m: st.groundZ === null ? null : r1(head.z - st.groundZ),
    facing_azimuth_deg: Math.round(st.headingDeg),
    on_blast: Math.hypot(head.x - c.x, head.y - c.y) <= radius,
    nearest_hole: nearest ? { label: nearest.label, distance_m: r(nearest.d, 0) } : null,
    in_front: things.filter((t) => t.side === 'ahead').map((t) => t.name),
    around: things,
    free_face_outward_azimuth_deg: n ? Math.round(azimuthTo({ x: 0, y: 0 }, n)) : null,
  };
}

function vrGoTo(args: z.infer<typeof vrSchema>) {
  const engine = getEngine();
  if (!engine) throw new ToolError('No view.');
  const target = args.target ?? 'blast';
  const report = (
    res: { eye: { x: number; y: number; z: number }; yawDeg: number } | null,
    extra: Record<string, unknown> = {},
  ) => {
    if (!res) throw new ToolError('The user is not in VR.');
    const st = engine.xrState();
    return {
      done: 'go_to',
      target,
      ...extra,
      standing_at: xyz(res.eye),
      facing_azimuth_deg: Math.round(res.yawDeg),
      eye_above_ground_m: st && st.groundZ !== null ? r1(res.eye.z - st.groundZ) : null,
    };
  };
  switch (target) {
    case 'hole': {
      const h = vrHole(args.hole);
      engine.setXrHole(h.id);
      const d = args.distance_m ?? 10;
      const result = report(engine.goToXr(h.collar, { standDistance: d }), {
        hole: h.label,
        distance_m: r(d, 0),
      });
      return { ...result, ...showHoleDetail(h, 'explicit', true) };
    }
    case 'point': {
      const p = vrPoint(args.point);
      const blast = document.project.blasts[0];
      const back = args.distance_m ?? 10;
      if (!blast || (blast.holes.length === 0 && blast.boundaries.length === 0))
        return report(engine.goToXr(p.position, { standDistance: back }), { point: p.name });
      // Unos metros detrás del punto (del lado contrario a la voladura), mirando la voladura.
      const c = blastCenter(blast);
      return report(
        engine.goToXr(p.position, {
          standDistance: back,
          yawDeg: azimuthTo(p.position, c),
          lookAt: c,
        }),
        {
          point: p.name,
          distance_to_blast_m: r(Math.hypot(p.position.x - c.x, p.position.y - c.y), 0),
        },
      );
    }
    case 'xy': {
      if (args.x === undefined || args.y === undefined)
        throw new ToolError('go_to xy needs x and y (project coordinates).');
      return report(
        engine.goToXr({ x: args.x, y: args.y }, { standDistance: args.distance_m ?? 0 }),
      );
    }
    default: {
      const res = engine.goToXrViewpoint(
        target,
        args.distance_m !== undefined ? { distance: args.distance_m } : {},
      );
      if (!res) {
        if (!engine.xrMode) throw new ToolError('The user is not in VR.');
        throw new ToolError(
          target === 'free_face' || target === 'behind' || target === 'crest'
            ? 'The blast has no free face marked: mark it with set_free_face, or use go_to blast.'
            : 'There is no blast or perimeter to go to.',
        );
      }
      return report(res, { distance_m: r(res.distance, 0) });
    }
  }
}

function vrView(args: z.infer<typeof vrSchema>) {
  const engine = getEngine();
  if (!engine?.xrMode)
    throw new ToolError('The user is not in VR; this tool only works in the headset.');
  switch (args.action) {
    case 'go_to':
      return vrGoTo(args);
    case 'higher':
    case 'lower':
    case 'height': {
      const st = engine.xrState();
      if (st?.view !== 'walk')
        throw new ToolError('Only at full scale: use go_to above to float over the blast.');
      const now = st.groundZ === null ? 1.7 : st.head.z - st.groundZ;
      if (args.action === 'height' && args.distance_m === undefined)
        throw new ToolError('height needs distance_m (meters above the ground).');
      const step = args.distance_m ?? Math.max(10, now * 0.5);
      const target =
        args.action === 'height' ? step : now + (args.action === 'higher' ? step : -step);
      const eye = Math.min(1500, Math.max(1.7, target));
      const res = engine.goToXr(
        { x: st.head.x, y: st.head.y },
        { standDistance: 0, yawDeg: st.headingDeg, eyeHeight: eye },
      );
      if (!res) throw new ToolError('The user is not in VR.');
      return { done: args.action, eye_above_ground_m: r1(eye) };
    }
    case 'state':
      return vrState();
    case 'table':
    case 'walk':
    case 'model':
      engine.setXrView(args.action);
      break;
    case 'place':
      engine.placeXrOnTable();
      break;
    // Pasos suaves: «estoy demasiado cerca» llegaba con dos pasos de ×1,4.
    case 'zoom_in':
    case 'zoom_out': {
      const st = engine.xrState();
      if (st?.view === 'walk') {
        // A escala real: un paso hacia adelante o atrás según la mirada, a la misma altura sobre
        // el terreno (10 m por defecto; «aléjame 50 m» = distance_m 50).
        const step = (args.distance_m ?? 10) * (args.action === 'zoom_in' ? 1 : -1);
        const a = (st.headingDeg * Math.PI) / 180;
        const eye = st.groundZ === null ? 1.7 : Math.max(1.7, st.head.z - st.groundZ);
        engine.goToXr(
          { x: st.head.x + Math.sin(a) * step, y: st.head.y + Math.cos(a) * step },
          { standDistance: 0, yawDeg: st.headingDeg, eyeHeight: eye },
        );
        return { done: args.action, moved_m: Math.abs(step) };
      }
      // Sobre la maqueta: pasos suaves de escala.
      engine.zoomXr(args.action === 'zoom_in' ? 1.2 : 1 / 1.2);
      break;
    }
    case 'focus_blast':
      engine.focusXr();
      break;
    case 'focus_hole': {
      const h = vrHole(args.hole);
      engine.setXrHole(h.id);
      if (engine.xrState()?.view === 'walk') {
        if (!engine.goToXr(h.collar, { standDistance: 12 }))
          throw new ToolError(
            'No se pudo llevar al usuario junto al taladro. Vuelve a entrar al visor.',
          );
      }
      // En la maqueta: el taladro y sus vecinos (~60 m) ocupan el frente, sin pegarse.
      else engine.focusXr(h.collar, 60);
      return { done: 'focus_hole', ...showHoleDetail(h, 'explicit', true) };
    }
    case 'focus_point': {
      const p = vrPoint(args.point);
      // Se encuadra el punto junto con la voladura: se ve dónde está respecto de ella.
      const holes = blastOrFail().holes;
      if (holes.length === 0) {
        engine.focusXr(p.position, 80);
        return { done: 'focus_point', point: p.name };
      }
      const xs = holes.map((h) => h.collar.x);
      const ys = holes.map((h) => h.collar.y);
      const c = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
      const dist = Math.hypot(p.position.x - c.x, p.position.y - c.y);
      const st = engine.xrState();
      if (st?.view === 'walk') {
        // A escala real: de costado a la línea voladura–punto, en alto, mirando el medio; así
        // entran los dos (antes quedaba al ras del terreno y el punto no se veía). Fija su propia
        // altura: no hace falta (ni conviene) pedir `higher` en el mismo turno.
        const mid = { x: (c.x + p.position.x) / 2, y: (c.y + p.position.y) / 2 };
        const along = azimuthTo(c, p.position);
        const diff = (a: number) => Math.abs(((a - st.headingDeg + 540) % 360) - 180);
        const yawDeg = [90, -90]
          .map((k) => (along + k + 360) % 360)
          .reduce((a, b) => (diff(a) <= diff(b) ? a : b));
        const standDistance = dist * 0.75 + 80;
        const res = engine.goToXr(mid, {
          standDistance,
          yawDeg,
          eyeHeight: standDistance * 0.45,
          lookAt: mid,
        });
        if (!res) throw new ToolError('The user is not in VR.');
        return {
          done: 'focus_point',
          point: p.name,
          distance_m: r(dist, 0),
          standing_at: xyz(res.eye),
          note: 'The user sees the blast and the point side by side from above (the point has a tall green pole with its name).',
        };
      }
      engine.focusXr(
        { x: (c.x + p.position.x) / 2, y: (c.y + p.position.y) / 2 },
        dist * 1.25 + 60,
      );
      return { done: 'focus_point', point: p.name, distance_m: r(dist, 0) };
    }
    case 'exit':
      engine.exitXr();
      break;
  }
  return { done: args.action };
}

// ------------------------------------------------------------------ Registro

export const BLAST_TOOLS: Record<string, ToolDef> = {
  set_site_conditions: {
    description:
      'Save the site conditions the engineer gives (rock mass, rock type, UCS, water, reactive/hot ground, ore/waste, target P80, destination). Applies water to the holes and UCS/rock mass to the design. Call it as soon as you get each answer.',
    schema: siteSchema,
    run: setSite,
  },
  add_protected_point: {
    description:
      'Add something to protect from vibration (final wall, facility, community house) at a distance and direction from the blast, with its PPV limit if known. PPV is then computed there.',
    schema: protectSchema,
    run: addProtected,
  },
  recommend_design: {
    description:
      'Propose pattern (burden, spacing, stemming, subdrill), column explosive and powder factor for the site conditions, tuned to the target P80 with the app Kuz-Ram. Does not change the design.',
    schema: recommendSchema,
    run: recommendDesign,
  },
  predict_results: {
    description:
      'Predicted results of the current design: P80/X50 vs target, PPV at protected points vs limits, flyrock range, cut-off (tiro cortado) risk, NOx/reactive-ground risks and the main design warnings.',
    schema: z.object({}),
    run: predictResults,
  },
  evaluate_explosive: {
    description:
      'Check an explosive against the site (water resistance, reactive ground) and/or the oxygen balance of an AN/FO mix (fuel oil %) for NOx/CO fume risk.',
    schema: fumesSchema,
    run: evaluateExplosive,
  },
  design_presplit: {
    description:
      'Create the presplit line along the final wall edge(s) of a perimeter (default: opposite the free face): holes every 8–12·D with a light decoupled charge (Pb ≈ UCS), group "Precorte", and remove production holes too close to it.',
    schema: presplitSchema,
    run: designPresplit,
  },
  design_buffer: {
    description:
      'Create a buffer (amortiguación) row parallel to the wall / presplit, group "Buffer", removing production holes too close to it.',
    schema: bufferSchema,
    run: designBuffer,
  },
  split_zone: {
    description:
      'Split a perimeter into an ore zone and a waste zone (side and fraction), so each gets its own pattern (tighter in ore, wider in waste) and the muckpile tracks ore/waste mixing. Deletes the holes of that perimeter: confirm first.',
    schema: zoneSchema,
    run: splitZone,
  },
  track_blocks: {
    description:
      'Simulate the muckpile and report how the operating blocks (default 10 m) moved toward the free face: mean/max displacement, direction, throw, swell and ore/waste mixing. Shows the vectors.',
    schema: trackSchema,
    run: trackBlocks,
  },
  set_layers: {
    description:
      'Show or hide map/3D/VR layers (the design is not changed): results (all result overlays), labels, hole_traces, tie_up, isochrones, energy, vibration, flyrock, displacement, as_drilled (measured as-drilled hole paths from the deviation survey), muckpile, material_blocks (the colored muckpile blocks), ore_waste_zones, slope_faces, bench_surfaces (bench top/floor planes), topography. Perimeters and holes are not layers: to remove them use delete_perimeter / delete_holes.',
    schema: layersSchema,
    run: setLayers,
  },
  spotlight: {
    description:
      'Focus mode: show ONLY what the user wants to see (the tie-up "quiero ver el amarre", only the holes, only the presplit holes, the holes charged with ANFO, the holes without detonator, the vibration map), with hole labels. It STAYS until the user is done (no timer): then ask whether to do something else in this view or go back to the general view, and call it with restore: true for "vista general / muéstrame todo". Works on screen and in VR.',
    schema: spotlightSchema,
    run: spotlight,
  },
  delete_perimeter: {
    description:
      'Delete a perimeter together with its holes and pattern (or all: true to start the design over). Undoable. Confirm first unless the user clearly asked to delete it.',
    schema: deletePerimeterSchema,
    run: deletePerimeter,
  },
  vr_view: {
    description:
      'Drive the VR headset view (only in VR). go_to takes the user anywhere at full scale, standing on the terrain and facing the target, with a smooth flight: blast, hole, protected point (community), free face, behind the blast, bench crest, overview from above, or x/y. state says where the user is, the scale and what is in front. Also: table / walk / isolated model, place on the table, gentle zoom, focus a hole (marks it and shows its card), exit VR.',
    schema: vrSchema,
    run: vrView,
  },
  show_results: {
    description:
      'Show results on screen / in VR: animate the firing sequence, vibration or energy maps, displacement, muckpile, flyrock zone, timing colors, or clear.',
    schema: showSchema,
    run: showResults,
  },
};

export const BLAST_READ_ONLY = [
  'spotlight',
  'recommend_design',
  'predict_results',
  'evaluate_explosive',
  'track_blocks',
  'show_results',
  'set_layers',
  'vr_view',
];
