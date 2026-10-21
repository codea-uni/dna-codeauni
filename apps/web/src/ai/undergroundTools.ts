import {
  couplingGroups,
  DEFAULT_UG_TIMING,
  faceFragmentationZones,
  isUndergroundHole,
  ringFragmentationZone,
  rockVp,
  undergroundFragmentation,
  undergroundVolumes,
  waveCutoffRisks,
  designByMethod,
  methodParams,
  MINING_METHOD_IDS,
  MINING_METHODS,
  miningMethod,
  type Explosive,
  type MethodParams,
  type MiningMethodId,
  type ProductLibrary,
} from '@cronos/core';
import { z } from 'zod';
import { formatNumber, t } from '../i18n';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import {
  cartridgeTooLarge,
  computeFace,
  computeRing,
  InputError,
  pickExplosive,
  pickFaceExplosive,
  PROFILE_CHOICES,
  type FaceForm,
  type RingForm,
} from '../underground/model';
import {
  defaultPlacements,
  FACE_TAG,
  RING_TAG,
  sendFace,
  sendRings,
  taggedHoles,
  type Placement,
} from '../underground/send';
import {
  applyLocation,
  profilePatch,
  workingTargets,
  type WorkingTarget,
} from '../underground/location';
import {
  defaultMethodPlacement,
  methodExplosive,
  methodHolesInBlast,
  sendMethod,
} from '../underground/methodSend';
import { useMethodStore } from '../underground/methodStore';
import { useUndergroundStore, type UndergroundTab } from '../underground/store';
import { faceWarningText } from '../underground/warnings';
import { pushCard } from './cards';
import { useUgAnalysisStore } from '../underground/analysisStore';
import { currentUgPile, ugPileSummary } from '../underground/pileView';
import { useAnalysisStore } from '../stores/analysisStore';
import {
  blastOrFail,
  currentAnalysis,
  findByName,
  r,
  readOnlyGuard,
  ToolError,
  type ToolDef,
} from './tools';

/**
 * Herramientas del asistente para minería subterránea: ronda de un frente de túnel (método sueco
 * de Holmberg) y abanicos de tajeo. Usan el mismo formulario y el mismo envío que el panel
 * «Subterránea» (lo que pide el agente queda en el panel para revisarlo o ajustarlo a mano).
 */

const { document } = session;
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ Comunes

const placementFields = {
  x: z.number().optional().describe('Origin East [m] (center of the drive floor at the face).'),
  y: z.number().optional().describe('Origin North [m].'),
  z: z.number().optional().describe('Origin elevation [m].'),
  azimuth_deg: z
    .number()
    .min(0)
    .max(360)
    .optional()
    .describe('Advance direction of the drive, clockwise from North.'),
  gradient_pct: z.number().min(-30).max(30).optional().describe('Drive gradient [%].'),
  working: z
    .string()
    .optional()
    .describe(
      'Name of a loaded underground working (list_workings) to place the design on: origin, azimuth and gradient come from its axis at station_m (x/y/z/azimuth/gradient are then ignored) and, unless given, the section (width/height, or drive size for rings) from its profile.',
    ),
  station_m: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Chainage along the working axis from its start [m]. Default: the end of the axis for a face (last excavated point), the start for rings.',
    ),
  reverse: z
    .boolean()
    .optional()
    .describe('true = the face advances towards the start of the axis.'),
  send: z
    .boolean()
    .optional()
    .describe(
      'true (default) = put the holes in the 3D design (replaces the previous ones of this kind, undoable); false = only compute and show it in the Subterránea panel.',
    ),
};

interface PlacementArgs {
  working?: string | undefined;
  station_m?: number | undefined;
  reverse?: boolean | undefined;
  x?: number | undefined;
  y?: number | undefined;
  z?: number | undefined;
  azimuth_deg?: number | undefined;
  gradient_pct?: number | undefined;
}

/** Labor por nombre («GAL 420», «Rampa 2», o «levantamiento nombre»). */
function workingByName(name: string): WorkingTarget {
  const targets = workingTargets();
  const named = targets.map((x) => ({ id: x.id, name: x.name, x }));
  const found =
    findByName(named, name)?.x ??
    findByName(
      targets.map((x) => ({ id: x.id, name: `${x.group} ${x.name}`, x })),
      name,
    )?.x;
  if (!found)
    throw new ToolError(
      targets.length === 0
        ? 'No underground workings are loaded: import them in Topografía («Labores subterráneas (DXF/Surpac)»).'
        : `No working "${name}". Loaded: ${targets.map((x) => x.name).join(', ')}.`,
    );
  return found;
}

/**
 * Si se nombró una labor: la ubica (origen, azimut, pendiente) y devuelve la sección de la labor
 * para el formulario (sin pisar lo que el usuario dio explícitamente).
 */
function locate(
  tab: UndergroundTab,
  a: PlacementArgs,
): { target: WorkingTarget; profile: Record<string, unknown> } | null {
  if (a.working === undefined) return null;
  const target = workingByName(a.working);
  const prev = useUndergroundStore.getState().locations[tab];
  const same = prev?.targetId === target.id;
  applyLocation(
    tab,
    target,
    {
      targetId: target.id,
      station: a.station_m ?? (same ? prev.station : tab === 'face' ? target.length : 0),
      reverse: a.reverse ?? (same ? prev.reverse : false),
    },
    false,
  );
  return { target, profile: { ...(profilePatch(target, tab) ?? {}) } };
}

function locationOut(tab: UndergroundTab) {
  const loc = useUndergroundStore.getState().locations[tab];
  const target = loc ? workingTargets().find((x) => x.id === loc.targetId) : undefined;
  return target && loc
    ? {
        working: target.name,
        station_m: r(loc.station, 1),
        working_length_m: r(target.length, 1),
        reverse: loc.reverse,
      }
    : null;
}

function placementFor(tab: UndergroundTab, a: PlacementArgs): Placement {
  const store = useUndergroundStore.getState();
  // Ubicado sobre una labor: el origen ya quedó en el store.
  if (a.working !== undefined && store.placements) return store.placements[tab];
  // Coordenadas a mano: el diseño deja de seguir la labor.
  if ([a.x, a.y, a.z, a.azimuth_deg, a.gradient_pct].some((v) => v !== undefined))
    store.setLocation(tab, null);
  const all = store.placements ?? defaultPlacements(document.project);
  const p: Placement = {
    ...all[tab],
    ...(a.x !== undefined ? { x: a.x } : {}),
    ...(a.y !== undefined ? { y: a.y } : {}),
    ...(a.z !== undefined ? { z: a.z } : {}),
    ...(a.azimuth_deg !== undefined ? { azimuthDeg: a.azimuth_deg % 360 } : {}),
    ...(a.gradient_pct !== undefined ? { gradientPct: a.gradient_pct } : {}),
  };
  store.setPlacements({ ...all, [tab]: p });
  return p;
}

function explosiveByName(lib: ProductLibrary, name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const found = findByName(lib.explosives, name);
  if (!found)
    throw new ToolError(
      `No explosive "${name}" in the project library. Available: ${lib.explosives.map((e) => e.name).join(', ')}.`,
    );
  return found.id;
}

function openPanel(tab: UndergroundTab | 'methods'): void {
  if (tab === 'methods') useMethodStore.getState().setActive(true);
  else {
    useMethodStore.getState().setActive(false);
    useUndergroundStore.getState().setTab(tab);
  }
  // Como `openWorkspacePanel('underground')`, sin importar las ventanas (ciclo de módulos).
  const ui = useUiStore.getState();
  const id = 'workspace.underground';
  if (ui.floating.some((w) => w.id === id)) ui.raiseFloating(id);
  else ui.floatPanel(id, 980);
}

const mm = (m: number) => r(m * 1000, 0);
const n = (v: number, d = 0, unit = '') => `${formatNumber(v, d)}${unit ? ` ${unit}` : ''}`;

function placementOut(p: Placement) {
  return {
    x: r(p.x),
    y: r(p.y),
    z: r(p.z),
    azimuth_deg: r(p.azimuthDeg, 1),
    gradient_pct: r(p.gradientPct, 1),
  };
}

// ------------------------------------------------------------------ Frente de túnel

const faceSchema = z.object({
  profile: z
    .enum(PROFILE_CHOICES)
    .optional()
    .describe(
      'Section: arched (D, straight walls + semicircular roof; default), horseshoe, rectangular, roundedShoulders, circular.',
    ),
  width_m: z.number().min(1).max(20).optional(),
  height_m: z.number().min(1).max(20).optional(),
  hole_diameter_mm: z.number().min(25).max(127).optional().describe('Charged holes (45 typical).'),
  relief_diameter_mm: z
    .number()
    .min(32)
    .max(400)
    .optional()
    .describe('Uncharged relief (reamer) hole(s) of the cut (102 typical).'),
  relief_holes: z.number().int().min(1).max(6).optional(),
  max_drill_m: z
    .number()
    .min(0.5)
    .max(8)
    .optional()
    .describe('Jumbo feed / drill steel length [m] (14 ft ≈ 4.0; 12 ft ≈ 3.4).'),
  cartridge_diameter_mm: z
    .number()
    .min(0)
    .max(127)
    .optional()
    .describe('Cartridge diameter (decoupled charge, e.g. 32 for 1¼″); 0 = bulk, fully coupled.'),
  explosive: z.string().optional().describe('Explosive name from the library.'),
  contour_explosive: z.string().optional().describe('Explosive for the smooth-blasting contour.'),
  smooth_blasting: z.boolean().optional().describe('Smooth blasting (recorte) on the contour.'),
  alternate_contour: z
    .boolean()
    .optional()
    .describe(
      'Pre-split / contour "uno sí, uno no": charge every other hole of the crown and walls, the others stay empty as guide holes.',
    ),
  rock_constant: z
    .number()
    .min(0.1)
    .max(2)
    .optional()
    .describe('Rock constant c [kg/m³] (0.4 typical; higher = harder to blast).'),
  delay_ms: z.number().min(1).max(1000).optional().describe('Time per delay number [ms].'),
  hole_interval_ms: z
    .number()
    .min(0)
    .max(500)
    .optional()
    .describe(
      'Minimum time between consecutive holes [ms] (electronic): continuous sequence with no two holes firing together (no coupling). 0 = all holes of the same delay number fire together. Default 25.',
    ),
  ...placementFields,
});

function designFace(args: z.infer<typeof faceSchema>) {
  const lib = document.project.library;
  const located = locate('face', args);
  const store = useUndergroundStore.getState();
  const patch: Partial<FaceForm> = {
    // La sección de la labor, salvo lo que se pidió explícitamente.
    ...(located ? located.profile : {}),
    ...(args.profile !== undefined ? { profile: args.profile } : {}),
    ...(args.width_m !== undefined ? { width: args.width_m } : {}),
    ...(args.height_m !== undefined ? { height: args.height_m } : {}),
    ...(args.hole_diameter_mm !== undefined ? { holeDiameter: args.hole_diameter_mm / 1000 } : {}),
    ...(args.relief_diameter_mm !== undefined
      ? { reliefDiameter: args.relief_diameter_mm / 1000 }
      : {}),
    ...(args.relief_holes !== undefined ? { reliefCount: args.relief_holes } : {}),
    ...(args.max_drill_m !== undefined ? { maxDrill: args.max_drill_m } : {}),
    ...(args.cartridge_diameter_mm !== undefined
      ? { cartridgeDiameter: args.cartridge_diameter_mm / 1000 }
      : {}),
    ...(args.smooth_blasting !== undefined ? { smooth: args.smooth_blasting } : {}),
    ...(args.alternate_contour !== undefined ? { alternateContour: args.alternate_contour } : {}),
    ...(args.rock_constant !== undefined ? { rockConstant: args.rock_constant } : {}),
    ...(args.delay_ms !== undefined ? { delayInterval: args.delay_ms / 1000 } : {}),
    ...(args.hole_interval_ms !== undefined ? { holeInterval: args.hole_interval_ms / 1000 } : {}),
  };
  const explosiveId = explosiveByName(lib, args.explosive);
  if (explosiveId) {
    patch.explosiveId = explosiveId;
    // Un cartucho de catálogo que entra en el taladro fija el diámetro si no se dijo otro.
    const cartridge = lib.explosives.find((e) => e.id === explosiveId)?.cartridge;
    const hole = patch.holeDiameter ?? store.face.holeDiameter;
    if (cartridge && cartridge.diameter < hole && args.cartridge_diameter_mm === undefined)
      patch.cartridgeDiameter = cartridge.diameter;
  } else if (args.cartridge_diameter_mm !== undefined && args.explosive === undefined)
    // Cambió el cartucho sin nombrar explosivo: se vuelve a elegir uno que entre.
    patch.explosiveId = null;
  const contourId = explosiveByName(lib, args.contour_explosive);
  if (contourId) patch.contourExplosiveId = contourId;
  const form: FaceForm = { ...store.face, ...patch };
  const explosive = pickFaceExplosive(lib, form);
  if (!explosive) throw new ToolError('The project library has no explosive.');
  let face;
  try {
    face = computeFace(form, explosive);
  } catch (e) {
    if (e instanceof InputError) throw new ToolError(`Invalid section or diameters: ${e.message}`);
    throw e;
  }
  store.patchFace(patch);
  const placement = placementFor('face', args);
  openPanel('face');
  const send = args.send ?? true;
  let sent = 0;
  if (send) {
    readOnlyGuard();
    blastOrFail();
    sent = sendFace(form, face, placement);
  }
  const d = face.design;
  const k = d.kpis;
  const roles: Record<string, number> = {};
  for (const h of d.holes) roles[h.role] = (roles[h.role] ?? 0) + 1;
  const warnings = d.warnings.map((w) => faceWarningText(w, t, formatNumber));
  if (cartridgeTooLarge(form, explosive) && explosive.cartridge)
    warnings.push(
      t('ug.warn.cartridgeTooLarge', {
        name: explosive.name,
        cartridge: mm(explosive.cartridge.diameter),
        hole: mm(form.holeDiameter),
      }),
    );
  const result = {
    section: `${form.profile} ${r(form.width)} × ${r(form.height)} m`,
    area_m2: r(face.profile.area, 1),
    explosive: explosive.name,
    charge:
      form.cartridgeDiameter > 0
        ? `cartridges Ø ${String(mm(form.cartridgeDiameter))} mm`
        : 'bulk (coupled)',
    holes_total: d.holes.length,
    charged_holes: k.chargedHoles,
    relief_holes: k.reliefHoles,
    ...(k.guideHoles > 0 ? { empty_guide_holes: k.guideHoles } : {}),
    holes_by_group: roles,
    cut_sections: d.squares.length,
    drill_depth_m: r(d.depth),
    advance_m: r(k.advance),
    total_charge_kg: r(k.totalCharge, 1),
    powder_factor_kg_m3: r(k.powderFactor),
    charge_per_m_advance_kg: r(k.chargePerAdvance, 1),
    drilled_m_per_m3: r(k.drilledPerVolume),
    empirical_hole_count: Math.round(k.empiricalHoleCount),
    warnings,
    in_3d: send ? sent > 0 : false,
    placed_holes: sent,
    placement: placementOut(placement),
    location: locationOut('face'),
    note: send
      ? 'Holes are in the 3D design with electronic timing (one delay number per hole group); the drawing and tables are in the Subterránea panel.'
      : 'Only computed: shown in the Subterránea panel; call again with send true to put it in 3D.',
  };
  pushCard({
    id: 'ug-face',
    title: t('ug.tab.face'),
    sub: `${result.section} · ${explosive.name}`,
    metrics: [
      { label: t('ug.kpi.holes'), value: n(result.holes_total), tone: 'accent' },
      { label: t('ug.kpi.advance'), value: n(result.advance_m, 2, 'm') },
      { label: t('ug.kpi.charge'), value: n(result.total_charge_kg, 1, 'kg') },
      { label: t('ug.kpi.powderFactor'), value: n(result.powder_factor_kg_m3, 2, 'kg/m³') },
      { label: t('ug.kpi.empirical'), value: n(result.empirical_hole_count) },
    ],
    bars: [],
    notes: warnings.map((text) => ({ text, tone: 'warn' as const })),
    t0: performance.now(),
  });
  return result;
}

// ------------------------------------------------------------------ Abanicos de tajeo

const ringSchema = z.object({
  drive_width_m: z.number().min(1).max(15).optional().describe('Drilling drive width.'),
  drive_height_m: z.number().min(1).max(15).optional(),
  stope_width_m: z.number().min(1).max(100).optional().describe('Stope width across the drive.'),
  stope_bottom_m: z
    .number()
    .min(-100)
    .max(100)
    .optional()
    .describe('Stope bottom relative to the drive floor [m] (negative = below).'),
  stope_top_m: z
    .number()
    .min(-100)
    .max(200)
    .optional()
    .describe('Stope top relative to the drive floor [m].'),
  stope_offset_m: z
    .number()
    .min(-100)
    .max(100)
    .optional()
    .describe('Stope center offset to the right of the drive axis [m].'),
  stope_dip_deg: z
    .number()
    .min(20)
    .max(90)
    .optional()
    .describe(
      'Apparent stope dip in the ring plane (90 = vertical walls). Filled automatically when the ring is placed on an imported stope.',
    ),
  stope_lean: z
    .enum(['left', 'right'])
    .optional()
    .describe('Side the stope roof shifts to when it dips (looking along the advance).'),
  pivot_height_m: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe('Drill rig pivot height above the floor.'),
  mode: z
    .enum(['toeSpacing', 'angle'])
    .optional()
    .describe('Fan by toe spacing (default) or constant angle.'),
  toe_spacing_m: z.number().min(0.2).max(10).optional(),
  angle_step_deg: z.number().min(0.5).max(45).optional(),
  max_length_m: z.number().min(1).max(60).optional(),
  dead_zone_deg: z
    .number()
    .min(0)
    .max(90)
    .optional()
    .describe('Half-width of the no-drilling zone around straight down.'),
  hole_diameter_mm: z
    .number()
    .min(38)
    .max(165)
    .optional()
    .describe('Long-hole diameter (89 typical).'),
  burden_m: z.number().min(0.5).max(6).optional().describe('Ring burden (distance between rings).'),
  rings: z.number().int().min(1).max(60).optional().describe('Number of rings to place.'),
  rock_density_t_m3: z.number().min(1).max(6).optional(),
  explosive: z.string().optional(),
  hole_delay_ms: z.number().min(0).max(1000).optional(),
  ring_delay_ms: z.number().min(0).max(5000).optional(),
  ...placementFields,
});

function designRings(args: z.infer<typeof ringSchema>) {
  const lib = document.project.library;
  const located = locate('ring', args);
  const store = useUndergroundStore.getState();
  const map: [keyof typeof args, keyof RingForm, number][] = [
    ['drive_width_m', 'driveWidth', 1],
    ['drive_height_m', 'driveHeight', 1],
    ['stope_width_m', 'stopeWidth', 1],
    ['stope_bottom_m', 'stopeBottom', 1],
    ['stope_top_m', 'stopeTop', 1],
    ['stope_offset_m', 'stopeOffset', 1],
    ['stope_dip_deg', 'stopeDip', DEG],
    ['pivot_height_m', 'pivotHeight', 1],
    ['toe_spacing_m', 'toeSpacing', 1],
    ['angle_step_deg', 'angleStep', DEG],
    ['max_length_m', 'maxLength', 1],
    ['dead_zone_deg', 'deadZone', DEG],
    ['hole_diameter_mm', 'holeDiameter', 0.001],
    ['burden_m', 'burden', 1],
    ['rings', 'rings', 1],
    ['rock_density_t_m3', 'rockDensity', 1000],
    ['hole_delay_ms', 'holeInterval', 0.001],
    ['ring_delay_ms', 'ringInterval', 0.001],
  ];
  const patch: Partial<Record<keyof RingForm, unknown>> = { ...(located?.profile ?? {}) };
  for (const [arg, key, f] of map) {
    const v = args[arg];
    if (typeof v === 'number') patch[key] = v * f;
  }
  if (args.mode) patch.mode = args.mode;
  if (args.stope_lean) patch.stopeLeanSide = args.stope_lean;
  const explosiveId = explosiveByName(lib, args.explosive);
  if (explosiveId) patch.explosiveId = explosiveId;
  const form = { ...store.ring, ...patch } as RingForm;
  const explosive: Explosive | null = pickExplosive(lib, form.explosiveId);
  if (!explosive) throw new ToolError('The project library has no explosive.');
  let ring;
  try {
    ring = computeRing(form, explosive);
  } catch (e) {
    if (e instanceof InputError) throw new ToolError(`Invalid stope or ring data: ${e.message}`);
    throw e;
  }
  if (ring.ring.holes.length === 0)
    throw new ToolError(
      'No hole reaches the stope from the pivot: check the stope limits, the max length and the dead zone.',
    );
  store.patchRing(patch as Partial<RingForm>);
  const placement = placementFor('ring', args);
  openPanel('ring');
  const send = args.send ?? true;
  let sent = 0;
  if (send) {
    readOnlyGuard();
    blastOrFail();
    sent = sendRings(form, ring, placement);
  }
  const k = ring.ring.kpis;
  const rings = Math.max(1, form.rings);
  const charged = ring.ring.holes.filter((h) => h.chargedLength > 0).length;
  const result = {
    explosive: explosive.name,
    holes_per_ring: ring.ring.holes.length,
    charged_holes_per_ring: charged,
    rings,
    holes_total: ring.ring.holes.length * rings,
    drilled_m_per_ring: r(k.drilledMeters, 1),
    charge_kg_per_ring: r(k.totalCharge, 1),
    tonnes_per_ring: r(k.tonnes, 0),
    total_charge_kg: r(k.totalCharge * rings, 0),
    total_tonnes: r(k.tonnes * rings, 0),
    powder_factor_kg_t: r(k.chargePerTonne, 3),
    drilled_m_per_t: r(k.drilledPerTonne, 3),
    in_3d: send ? sent > 0 : false,
    placed_holes: sent,
    placement: placementOut(placement),
    location: locationOut('ring'),
    note: send
      ? 'Rings are in the 3D design (uncharged collars alternate between holes), with electronic timing hole by hole and ring by ring.'
      : 'Only computed: shown in the Subterránea panel; call again with send true to put it in 3D.',
  };
  pushCard({
    id: 'ug-ring',
    title: t('ug.tab.ring'),
    sub: `${n(form.stopeWidth, 1)} × ${n(form.stopeTop - form.stopeBottom, 1)} m · ${explosive.name}`,
    metrics: [
      { label: t('ug.ringHoles'), value: n(result.holes_per_ring), tone: 'accent' },
      { label: t('ug.rings'), value: n(rings) },
      { label: t('ug.kpi.charge'), value: n(result.total_charge_kg, 0, 'kg') },
      { label: t('ug.kpi.tonnes'), value: n(result.total_tonnes, 0, 't') },
      { label: t('ug.kpi.chargePerTonne'), value: n(result.powder_factor_kg_t, 3, 'kg/t') },
    ],
    bars: [],
    notes: [],
    t0: performance.now(),
  });
  return result;
}

// ------------------------------------------------------------------ Plantillas por método de minado

const DEG_PER_RAD = 180 / Math.PI;

/** Argumento del asistente → parámetro de la plantilla y factor a SI. */
const METHOD_ARGS = [
  ['width_m', 'width', 1],
  ['height_m', 'height', 1],
  ['thickness_m', 'thickness', 1],
  ['hole_diameter_mm', 'holeDiameter', 0.001],
  ['relief_diameter_mm', 'reliefDiameter', 0.001],
  ['relief_holes', 'reliefCount', 1],
  ['cartridge_diameter_mm', 'cartridgeDiameter', 0.001],
  ['length_m', 'length', 1],
  ['dip_deg', 'dip', DEG],
  ['subdrill_m', 'subdrill', 1],
  ['burden_m', 'burden', 1],
  ['spacing_m', 'spacing', 1],
  ['rows', 'rows', 1],
  ['wall_offset_m', 'wallOffset', 1],
  ['stemming_m', 'stemming', 1],
  ['drive_width_m', 'driveWidth', 1],
  ['drive_height_m', 'driveHeight', 1],
  ['toe_spacing_m', 'toeSpacing', 1],
  ['dead_zone_deg', 'deadZone', DEG],
  ['dump_deg', 'dump', DEG],
  ['stope_bottom_m', 'stopeBottom', 1],
  ['stope_top_m', 'stopeTop', 1],
  ['lift_height_m', 'liftHeight', 1],
  ['burial_depth_m', 'burialDepth', 1],
  ['rock_constant', 'rockConstant', 1],
  ['rock_density_t_m3', 'rockDensity', 1000],
  ['deviation_pct', 'deviation', 0.01],
  ['hole_delay_ms', 'holeInterval', 0.001],
  ['row_delay_ms', 'rowInterval', 0.001],
] as const satisfies readonly (readonly [string, keyof MethodParams, number])[];

/** Parámetro de la plantilla en las unidades del asistente. */
function friendly(key: keyof MethodParams, v: MethodParams): number | string | boolean {
  const value = v[key];
  if (typeof value !== 'number') return value;
  const arg = METHOD_ARGS.find(([, k]) => k === key);
  if (!arg) return r(value, 3);
  const f = arg[2];
  return f === DEG ? r(value * DEG_PER_RAD, 1) : r(value / f, f === 0.001 ? 0 : 2);
}

function friendlyName(key: keyof MethodParams): string {
  return METHOD_ARGS.find(([, k]) => k === key)?.[0] ?? key;
}

function listMiningMethods() {
  return {
    groups: (['development', 'raise', 'stope'] as const).map((g) => ({
      group: g,
      title: t(`ugm.group.${g}`),
      methods: MINING_METHODS.filter((m) => m.group === g).map((m) => {
        const p = methodParams(m.id);
        return {
          method: m.id,
          code: m.code,
          name: t(`ugm.m.${m.id}.name`),
          use: t(`ugm.m.${m.id}.use`),
          sequence: t(`ugm.m.${m.id}.seq`),
          explosive: t(`ugm.m.${m.id}.exp`),
          powder_factor_target: `${String(m.powderFactor.min)}–${String(m.powderFactor.max)} ${m.powderFactor.unit === 'kg/t' ? 'kg/t' : 'kg/m³'}`,
          defaults: Object.fromEntries(m.params.map((k) => [friendlyName(k), friendly(k, p)])),
          ...(m.presets ? { presets: m.presets.map((x) => x.label) } : {}),
        };
      }),
    })),
    note: 'Defaults are handbook starting values (Hustrulid & Bullock 2001, López Jimeno 1995, Holmberg 1982, EXSA); burden 0 = Langefors-Kihlström automatic. Use design_by_method with the method id.',
  };
}

const methodSchema = z.object({
  method: z
    .enum(MINING_METHOD_IDS as [MiningMethodId, ...MiningMethodId[]])
    .describe(
      'Template id from list_mining_methods: driftConventional, driftMechanized, ramp, bypass, roomPillar, conventionalRaise, dropRaise, slotRaise, longholeParallel, longholeFan, narrowVein, vcr, slc, undercut, drawbell, breasting, uppers, shrinkage, roomBench, benchFill.',
    ),
  preset: z
    .string()
    .optional()
    .describe('Preset label of the template (e.g. "4,0 × 4,0", "Ø 89 mm").'),
  profile: z.enum(['arched', 'rectangular']).optional(),
  smooth_blasting: z.boolean().optional(),
  width_m: z.number().min(0.5).max(100).optional().describe('Section, vein or stope width.'),
  height_m: z
    .number()
    .min(0.5)
    .max(150)
    .optional()
    .describe('Section height, stope/raise height (downhole length) or slice height.'),
  thickness_m: z.number().min(0.5).max(30).optional().describe('Raise/slot plan thickness.'),
  hole_diameter_mm: z.number().min(25).max(250).optional(),
  relief_diameter_mm: z.number().min(32).max(2000).optional(),
  relief_holes: z.number().int().min(1).max(6).optional(),
  cartridge_diameter_mm: z.number().min(0).max(127).optional().describe('0 = bulk.'),
  length_m: z
    .number()
    .min(0.5)
    .max(60)
    .optional()
    .describe('Hole / feed length (faces, uppers, breasting) or max length (rings).'),
  dip_deg: z.number().min(30).max(90).optional().describe('Dip from horizontal (90 = vertical).'),
  subdrill_m: z.number().min(0).max(3).optional(),
  burden_m: z.number().min(0).max(8).optional().describe('0 = automatic (Langefors).'),
  spacing_m: z.number().min(0).max(10).optional(),
  rows: z.number().int().min(1).max(40).optional().describe('Rows or rings.'),
  wall_offset_m: z.number().min(0).max(5).optional(),
  stemming_m: z.number().min(0).max(10).optional(),
  drive_width_m: z.number().min(1).max(15).optional(),
  drive_height_m: z.number().min(1).max(15).optional(),
  toe_spacing_m: z.number().min(0).max(10).optional(),
  dead_zone_deg: z.number().min(0).max(170).optional(),
  dump_deg: z.number().min(0).max(30).optional(),
  stope_bottom_m: z.number().min(-100).max(100).optional(),
  stope_top_m: z.number().min(-100).max(200).optional(),
  lift_height_m: z.number().min(0.5).max(10).optional(),
  burial_depth_m: z.number().min(0.3).max(5).optional(),
  rock_constant: z.number().min(0.1).max(2).optional(),
  rock_density_t_m3: z.number().min(1).max(6).optional(),
  deviation_pct: z.number().min(0).max(10).optional(),
  hole_delay_ms: z.number().min(0).max(1000).optional(),
  row_delay_ms: z.number().min(0).max(5000).optional(),
  explosive: z.string().optional().describe('Explosive name from the library.'),
  ...placementFields,
});

function designMethod(args: z.infer<typeof methodSchema>) {
  const lib = document.project.library;
  const id = args.method;
  const m = miningMethod(id);
  const store = useMethodStore.getState();
  const patch: Partial<MethodParams> = {};
  if (args.preset !== undefined) {
    const preset = m.presets?.find(
      (p) => p.label.replace(/\s/g, '') === args.preset?.replace(/\s/g, ''),
    );
    if (!preset)
      throw new ToolError(
        `No preset "${args.preset}" for ${id}. Available: ${(m.presets ?? []).map((p) => p.label).join(', ') || 'none'}.`,
      );
    Object.assign(patch, preset.values);
  }
  for (const [arg, key, f] of METHOD_ARGS) {
    const v = args[arg];
    if (typeof v === 'number') Object.assign(patch, { [key]: v * f });
  }
  if (args.profile) patch.profile = args.profile;
  if (args.smooth_blasting !== undefined) patch.smooth = args.smooth_blasting;
  const merged = { ...store.patches[id], ...patch };
  const explosiveId = explosiveByName(lib, args.explosive) ?? store.explosives[id];
  const params = methodParams(id, merged);
  const explosive = methodExplosive(lib, id, explosiveId, params.holeDiameter);
  if (!explosive) throw new ToolError('The project library has no explosive.');
  let design;
  try {
    design = designByMethod(id, merged, explosive);
  } catch (e) {
    throw new ToolError(`Invalid data for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  store.patch(id, patch);
  if (args.explosive !== undefined) store.setExplosive(id, explosive.id);
  const base = store.placements[id] ?? defaultMethodPlacement(document.project, id);
  const placement: Placement = {
    ...base,
    ...(args.x !== undefined ? { x: args.x } : {}),
    ...(args.y !== undefined ? { y: args.y } : {}),
    ...(args.z !== undefined ? { z: args.z } : {}),
    ...(args.azimuth_deg !== undefined ? { azimuthDeg: args.azimuth_deg % 360 } : {}),
    ...(args.gradient_pct !== undefined ? { gradientPct: args.gradient_pct } : {}),
  };
  store.setPlacement(id, placement);
  store.choose(id);
  openPanel('methods');
  const send = args.send ?? true;
  let sent = 0;
  if (send) {
    readOnlyGuard();
    blastOrFail();
    sent = sendMethod(id, design, explosive, placement);
  }
  const k = design.kpis;
  const perTonne = m.powderFactor.unit === 'kg/t';
  const pf = perTonne ? k.chargePerTonne : k.powderFactor;
  const pfUnit = perTonne ? 'kg/t' : 'kg/m³';
  const roles: Record<string, number> = {};
  for (const h of design.holes) roles[h.role] = (roles[h.role] ?? 0) + 1;
  const warnings = [
    ...design.warnings.map((w) =>
      t(
        `ugm.warn.${w.code}`,
        Object.fromEntries(Object.entries(w.params ?? {}).map(([a, b]) => [a, formatNumber(b, 2)])),
      ),
    ),
    ...design.faceWarnings
      .filter((w) => w.code !== 'depthLimited')
      .map((w) => faceWarningText(w, t, formatNumber)),
  ];
  const name = t(`ugm.m.${id}.name`);
  const result = {
    method: id,
    code: m.code,
    name,
    parameters: Object.fromEntries(
      m.params.map((key) => [friendlyName(key), friendly(key, params)]),
    ),
    explosive: explosive.name,
    holes_total: k.holes,
    charged_holes: k.chargedHoles,
    relief_holes: k.reliefHoles,
    holes_by_type: roles,
    drilled_m: r(k.drilledMeters, 1),
    total_charge_kg: r(k.totalCharge, 1),
    volume_m3: r(k.volume, 0),
    tonnes: r(k.tonnes, 0),
    powder_factor: `${formatNumber(pf, 2)} ${pfUnit}`,
    powder_factor_target: `${String(m.powderFactor.min)}–${String(m.powderFactor.max)} ${pfUnit}`,
    powder_factor_status: design.powderFactorStatus,
    ...(k.advance !== undefined ? { advance_m: r(k.advance) } : {}),
    max_charge_per_delay_kg: r(k.maxChargePerDelay, 1),
    ...(design.rules
      ? {
          burden_m: r(design.rules.burden),
          spacing_m: r(design.rules.spacing),
          langefors_practical_burden_m: r(design.rules.langeforsPractical),
          empirical_burden_m: `${formatNumber(design.rules.empiricalMin, 1)}–${formatNumber(design.rules.empiricalMax, 1)}`,
        }
      : {}),
    sequence: t(`ugm.m.${id}.seq`),
    warnings,
    in_3d: send ? sent > 0 : false,
    placed_holes: sent,
    tag: m.tag,
    placement: placementOut(placement),
    note: send
      ? 'Holes are in the 3D design with their working (drive, raise or stope) and electronic timing; each template has its own tag and location, so other workings are kept. The drawing is in the Subterránea panel, tab Método de minado.'
      : 'Only computed: shown in the Subterránea panel (Método de minado); call again with send true to put it in 3D.',
  };
  pushCard({
    id: `ugm-${id}`,
    title: `${m.code} · ${name}`,
    sub: explosive.name,
    metrics: [
      { label: t('ug.kpi.holes'), value: n(k.holes), tone: 'accent' },
      { label: t('ug.kpi.drilled'), value: n(k.drilledMeters, 0, 'm') },
      { label: t('ug.kpi.charge'), value: n(k.totalCharge, 0, 'kg') },
      { label: t('ug.kpi.powderFactor'), value: n(pf, 2, pfUnit) },
    ],
    bars: [],
    notes: warnings.map((text) => ({ text, tone: 'warn' as const })),
    t0: performance.now(),
  });
  return result;
}

// ------------------------------------------------------------------ Estado

/**
 * Análisis de lo que está en 3D (pestaña «Análisis»): acoplamiento y corte por onda con los tiempos
 * del análisis vigente, cubicación subterránea y P50/P80 del diseño de las pestañas.
 */
function undergroundAnalysis() {
  const blast = document.project.blasts[0];
  const project = document.project;
  const lib = project.library;
  const ua = useUgAnalysisStore.getState();
  const rock = project.rockMasses.find((m) => m.id === blast?.rockMassId) ?? project.rockMasses[0];
  const label = new Map(blast?.holes.map((h) => [h.id, h.label]) ?? []);
  const a = currentAnalysis();
  let sequence: unknown = 'No underground holes in 3D or the analysis is not ready.';
  if (blast && a && blast.holes.some(isUndergroundHole)) {
    const idx = new Map(a.charge.holeIds.map((id, i) => [id, i]));
    const fire = Float64Array.from(
      blast.holes,
      (h) => a.timing.fireTime[idx.get(h.id) ?? -1] ?? NaN,
    );
    const window = blast.calcParams.micWindow;
    const vp = rockVp(rock);
    const groups = couplingGroups(blast.holes, fire, lib, window);
    const cut = waveCutoffRisks(blast.holes, fire, vp.value, {
      ...DEFAULT_UG_TIMING,
      window,
      shockDistance: ua.shockDistance,
    });
    sequence = {
      coupling_window_ms: r(window * 1000, 0),
      vp_m_s: r(vp.value, 0),
      vp_source: vp.source,
      coupled_groups: groups.slice(0, 10).map((g) => ({
        holes: g.holeIds.map((id) => label.get(id) ?? id),
        time_ms: r((g.time - a.timing.firstTime) * 1000, 0),
        kg: r(g.kg, 1),
      })),
      coupled_group_count: groups.length,
      wave_cutoff_pairs: cut.slice(0, 10).map((c) => ({
        first: label.get(c.firstId) ?? c.firstId,
        second: label.get(c.secondId) ?? c.secondId,
        distance_m: r(c.distance, 2),
        wave_arrival_ms: r(c.arrival * 1000, 2),
        delay_ms: r(c.delay * 1000, 0),
      })),
      wave_cutoff_count: cut.length,
      note: 'Coupling = 2+ charged holes within the window (act as one charge). Wave cut-off = the second hole fires after the first one’s wave (distance/Vp) reaches its charge, with charges closer than the cut-off distance (doubled if wet).',
    };
  }
  const volumes = blast
    ? undergroundVolumes(blast, lib, rock?.density ?? 2650, {
        advanceEfficiency: ua.advanceEfficiency,
        overbreak: ua.overbreak,
      }).map((v) => ({
        kind: v.kind,
        area_m2: r(v.area, 2),
        advance_or_length_m: r(v.length, 2),
        volume_m3: r(v.volume, 1),
        tonnes: r(v.tonnage / 1000, 1),
        explosive_kg: r(v.explosive, 1),
        powder_factor_kg_m3: r(v.loadingFactor, 2),
        powder_factor_kg_t: r(v.powderFactor * 1000, 3),
      }))
    : [];
  const frag: Record<string, unknown> = {};
  const s = useUndergroundStore.getState();
  if (rock) {
    const fe = pickFaceExplosive(lib, s.face);
    if (fe)
      try {
        const f = computeFace(s.face, fe);
        const res = undergroundFragmentation(
          faceFragmentationZones(
            f.design,
            f.profile.area * (1 + ua.overbreak),
            f.design.depth * ua.advanceEfficiency,
          ),
          rock,
          {
            rws: fe.rws,
            drillDeviation: f.design.drillingError,
            variant: ua.variant,
            calibration: ua.calibration,
          },
        );
        if (res)
          frag.face = { p50_cm: r(res.p50.swebrec * 100, 1), p80_cm: r(res.p80.swebrec * 100, 1) };
      } catch {
        // Formulario fuera de rango.
      }
    const re = pickExplosive(lib, s.ring.explosiveId);
    if (re)
      try {
        const g = computeRing(s.ring, re);
        const z = ringFragmentationZone(g.ring, s.ring.burden);
        const res = z
          ? undergroundFragmentation([z], rock, {
              rws: re.rws,
              drillDeviation: blast?.calcParams.drillDeviation ?? 0.1,
              variant: ua.variant,
              calibration: ua.calibration,
            })
          : null;
        if (res)
          frag.rings = { p50_cm: r(res.p50.swebrec * 100, 1), p80_cm: r(res.p80.swebrec * 100, 1) };
      } catch {
        // Ídem.
      }
  }
  return { sequence, volumes, fragmentation_kuz_ram_swebrec: frag };
}

/** Pila subterránea vigente (o cómo pedirla). */
function ugPileState() {
  const pile = currentUgPile();
  if (pile) return ugPileSummary(pile);
  const a = useAnalysisStore.getState();
  return a.muckpileComputing
    ? 'Computing the underground muckpile…'
    : 'Not computed for this version of the design: show_results "sequence" («simula la voladura») computes it and animates the rock flying out and piling up in the drive.';
}

function undergroundState() {
  const s = useUndergroundStore.getState();
  const blast = document.project.blasts[0];
  const lib = document.project.library;
  const f = s.face;
  const g = s.ring;
  const placements = s.placements ?? defaultPlacements(document.project);
  return {
    face: {
      profile: f.profile,
      width_m: f.width,
      height_m: f.height,
      hole_diameter_mm: mm(f.holeDiameter),
      relief_diameter_mm: mm(f.reliefDiameter),
      relief_holes: f.reliefCount,
      max_drill_m: f.maxDrill,
      cartridge_diameter_mm: mm(f.cartridgeDiameter),
      explosive: pickFaceExplosive(lib, f)?.name ?? null,
      smooth_blasting: f.smooth,
      alternate_contour: f.alternateContour,
      rock_constant: f.rockConstant,
      delay_ms: r(f.delayInterval * 1000, 0),
      hole_interval_ms: r(f.holeInterval * 1000, 0),
      placement: placementOut(placements.face),
      location: locationOut('face'),
      holes_in_3d: taggedHoles(blast, FACE_TAG).length,
    },
    rings: {
      drive_width_m: g.driveWidth,
      drive_height_m: g.driveHeight,
      stope_width_m: g.stopeWidth,
      stope_bottom_m: g.stopeBottom,
      stope_top_m: g.stopeTop,
      stope_offset_m: g.stopeOffset,
      stope_dip_deg: r(g.stopeDip / DEG, 1),
      stope_lean: g.stopeLeanSide,
      pivot_height_m: g.pivotHeight,
      mode: g.mode,
      toe_spacing_m: g.toeSpacing,
      angle_step_deg: r(g.angleStep / DEG, 1),
      max_length_m: g.maxLength,
      dead_zone_deg: r(g.deadZone / DEG, 0),
      hole_diameter_mm: mm(g.holeDiameter),
      burden_m: g.burden,
      rings: g.rings,
      rock_density_t_m3: g.rockDensity / 1000,
      explosive: pickExplosive(lib, g.explosiveId)?.name ?? null,
      placement: placementOut(placements.ring),
      location: locationOut('ring'),
      holes_in_3d: taggedHoles(blast, RING_TAG).length,
    },
    analysis: undergroundAnalysis(),
    muckpile: ugPileState(),
    workings_loaded: workingTargets().length,
    mining_method_templates_in_3d: Object.fromEntries(
      MINING_METHODS.map((m): [string, number] => [m.id, methodHolesInBlast(m.tag)]).filter(
        ([, c]) => c !== 0,
      ),
    ),
    explosives: lib.explosives.map((e) => ({
      name: e.name,
      form: e.form,
      ...(e.cartridge ? { cartridge_mm: mm(e.cartridge.diameter) } : {}),
    })),
  };
}

// ------------------------------------------------------------------ Labores

function listWorkings() {
  const workings = workingTargets().map((x) => {
    const a = x.points[0];
    const b = x.points[x.points.length - 1];
    const xyz = (p: typeof a) => (p ? { x: r(p.x), y: r(p.y), z: r(p.z) } : null);
    return {
      name: x.name,
      source: x.group,
      ...(x.kind ? { kind: x.kind } : {}),
      length_m: r(x.length, 1),
      ...(x.profile
        ? {
            section: `${x.estimated ? 'measured' : x.profile.kind} ${r(x.profile.width)} × ${r(x.profile.height)} m`,
          }
        : {}),
      start: xyz(a),
      end: xyz(b),
    };
  });
  return {
    workings,
    note:
      workings.length === 0
        ? 'No underground workings loaded: the user can import them in Topografía («Labores subterráneas (DXF/Surpac)»).'
        : 'Use design_tunnel_face / design_stope_rings with working (name) and station_m (chainage from the axis start) to place the design on a working.',
  };
}

export const UNDERGROUND_TOOLS: Record<string, ToolDef> = {
  list_workings: {
    description:
      'UNDERGROUND: list the real underground workings loaded from topography (tunnels, drives, ramps imported as DXF/Surpac solids or axes) and the drives of sent designs: name, length, section and start/end coordinates. Use their names with design_tunnel_face / design_stope_rings (working + station_m).',
    schema: z.object({}),
    run: listWorkings,
  },
  design_tunnel_face: {
    description:
      'UNDERGROUND: design the blast round of a drift/tunnel face with the Swedish method (Holmberg): parallel-hole cut with relief hole(s), stoping, walls, roof/contour (smooth blasting) and lifters, charges and electronic delays; opens the Subterránea panel with the face drawing and, unless send is false, puts the holes in 3D inside the excavated drive. Omitted values keep the current form (underground_state). Returns holes, advance, kg, powder factor, empirical hole count and warnings.',
    schema: faceSchema,
    run: designFace,
  },
  design_stope_rings: {
    description:
      'UNDERGROUND: design long-hole fan rings (abanicos) for a stope from a drilling drive: fan from the rig pivot to the stope limits by toe spacing or angle, alternating uncharged collars, N rings at the given burden, electronic timing; opens the panel and, unless send is false, puts them in 3D with the drive and the stope. Omitted values keep the current form. Returns holes per ring, kg, tonnes and kg/t.',
    schema: ringSchema,
    run: designRings,
  },
  list_mining_methods: {
    description:
      'UNDERGROUND: catalog of blast design templates by mining method (development: drifts, ramp, bypass, wide rooms; raises: conventional, drop raise, slot; stoping: parallel long holes, fan long holes, narrow vein, VCR, sublevel caving, undercut, drawbell, breasting, uppers, shrinkage, room benching, bench and fill), with typical use, sequence, suggested explosive, powder-factor target and default parameters. Read-only.',
    schema: z.object({}),
    run: listMiningMethods,
  },
  design_by_method: {
    description:
      'UNDERGROUND: design a working with a mining-method template (one per stope/raise/heading): fills the template defaults, applies the given values (omitted values keep the last ones used for that template), computes holes, charges (column, lift or spherical crater charges, alternating ring collars), delays, kg, powder factor vs target, Langefors burden check and warnings; opens the panel tab «Método de minado» with the drawings and, unless send is false, puts the holes in 3D with their own tag (other templates and the face/rings tabs are kept).',
    schema: methodSchema,
    run: designMethod,
  },
  underground_state: {
    description:
      'UNDERGROUND: current face and ring parameters, the simulated muckpile (in-situ and muckpile volume, throw from the face, max height, % of the section blocked vs distance; to simulate/animate the blast use show_results "sequence"), their 3D placement, how many underground holes are in the design, the explosives available (with cartridge sizes) and the analysis of what is in 3D: coupled holes (fire within the 8 ms window), wave cut-off pairs (second hole fires after the first one’s wave reaches it), underground volume/tonnes/powder factor (section × advance, ring area × burden) and P50/P80 (Kuz-Ram + Swebrec by zone).',
    schema: z.object({}),
    run: undergroundState,
  },
};

export const UNDERGROUND_READ_ONLY = ['underground_state', 'list_workings', 'list_mining_methods'];
