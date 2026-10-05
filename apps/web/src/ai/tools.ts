import {
  boundaryBench,
  commands,
  createHole,
  degToRad,
  freeFaceAlignment,
  holeBoundary,
  mmToM,
  msToS,
  newId,
  nextHoleNumber,
  outwardNormal,
  pointInPolygon,
  polygonSignedArea,
  radToDeg,
  sToMs,
  unitToAzimuth,
  withDownholeDetonator,
  type Blast,
  type BlastBoundary,
  type Deck,
  type ExplosiveId,
  type Hole,
  type HoleEdit,
  type HoleId,
  type HoleTemplate,
  type Op,
  type Pattern,
  type ProductLibrary,
  type StemmingMaterialId,
} from '@cronos/core';
import { z } from 'zod';
import * as actions from '../actions';
import { analysisReady } from '../demo/runtime';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { topographyElevation } from '../topography/session';

/**
 * Herramientas del asistente de IA (Gemini, function calling). Cada una valida sus argumentos con
 * zod (borde de IO), trabaja en unidades de obra (m, mm de diámetro, °, ms) y modifica el documento
 * con los mismos comandos que la interfaz: cada cambio es un paso de deshacer. Las respuestas van
 * al modelo (no a la interfaz), por eso su texto está en inglés.
 */

const { document, selection } = session;

/** Error que se devuelve al modelo como `{ error }` para que corrija o pregunte. */
export class ToolError extends Error {}

const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function blastOrFail(): Blast {
  const blast = document.project.blasts[0];
  if (!blast) throw new ToolError('The project has no blast.');
  return blast;
}

function readOnlyGuard(): void {
  if (document.readOnly) throw new ToolError('The project is read-only for this user.');
}

// ------------------------------------------------------------------ Perímetros

const perimeterArg = z
  .string()
  .describe('Perimeter name (e.g. "Perímetro 1"). Omit to use the active/only perimeter.');

/**
 * Perímetro a editar: el nombrado, si no el activo, si no el único. Varios sin activo, o ninguno,
 * es un error para que el modelo pregunte (o proponga crear uno).
 */
export function resolvePerimeter(blast: Blast, name?: string): BlastBoundary {
  const list = blast.boundaries;
  if (name !== undefined) {
    const key = name.trim().toLowerCase();
    const found = list.find((b) => b.id === name || b.name.trim().toLowerCase() === key);
    if (!found)
      throw new ToolError(
        `No perimeter named "${name}". Existing: ${list.map((b) => b.name).join(', ') || 'none'}.`,
      );
    return found;
  }
  const activeId = useUiStore.getState().activeBoundaryId;
  const active = list.find((b) => b.id === activeId);
  if (active) return active;
  if (list.length === 1 && list[0]) return list[0];
  if (list.length === 0)
    throw new ToolError(
      'NO_PERIMETER: the blast has no perimeter. Suggest the user draw one (Diseño → Dibujar perímetro, key B) or offer to create it with create_perimeter after they confirm its size and position.',
    );
  throw new ToolError(
    `Several perimeters and none is active: ${list.map((b) => b.name).join(', ')}. Ask which one.`,
  );
}

const CARDINALS = { N: 0, E: 90, S: 180, W: 270 } as const;
type Cardinal = keyof typeof CARDINALS;

function edgeInfo(b: BlastBoundary) {
  return b.polygon.map((a, i) => {
    const c = b.polygon[(i + 1) % b.polygon.length] ?? a;
    const n = outwardNormal(b.polygon, i);
    return {
      index: i,
      length: r(Math.hypot(c.x - a.x, c.y - a.y)),
      outward_azimuth_deg: n ? r(radToDeg(unitToAzimuth(n.x, n.y)), 1) : null,
      free_face: b.freeFaceEdges.includes(i),
    };
  });
}

/** Aristas cuya normal exterior está a menos de 45° del punto cardinal pedido. */
function edgesFacing(b: BlastBoundary, sides: readonly Cardinal[]): number[] {
  return edgeInfo(b)
    .filter((e) =>
      sides.some((s) => {
        if (e.outward_azimuth_deg === null) return false;
        const d = Math.abs(((e.outward_azimuth_deg - CARDINALS[s] + 540) % 360) - 180);
        return d < 45;
      }),
    )
    .map((e) => e.index);
}

function polygonArea(b: BlastBoundary): number {
  return Math.abs(polygonSignedArea(b.polygon));
}

// ------------------------------------------------------------------ Taladros objetivo

const targetSchema = z
  .object({
    all: z.boolean().optional().describe('All holes of the blast (or of `perimeter`).'),
    labels: z.array(z.string()).optional().describe('Hole labels, e.g. ["12", "13"].'),
    rows: z
      .array(z.number().int().min(1))
      .optional()
      .describe('Row numbers; row 1 is the row next to the free face.'),
    selection: z.boolean().optional().describe('The holes the user selected on the map.'),
    perimeter: perimeterArg.optional(),
  })
  .describe('Which holes. Criteria combine as an intersection.');
type Target = z.infer<typeof targetSchema>;

/** Taladros que cumplen todos los criterios; sin criterio es un error (no se asume «todos»). */
export function resolveTarget(blast: Blast, target: Target): Hole[] {
  const { all, labels, rows, selection: sel, perimeter } = target;
  if (!all && !labels?.length && !rows?.length && !sel && perimeter === undefined)
    throw new ToolError('Say which holes: all, labels, rows, selection or perimeter.');
  let holes = blast.holes;
  if (perimeter !== undefined) {
    const b = resolvePerimeter(blast, perimeter);
    holes = holes.filter((h) => holeBoundary(blast, h)?.id === b.id);
  }
  if (labels?.length) {
    const wanted = new Set(labels.map((l) => l.trim()));
    const missing = [...wanted].filter((l) => !blast.holes.some((h) => h.label === l));
    if (missing.length) throw new ToolError(`Unknown hole labels: ${missing.join(', ')}.`);
    holes = holes.filter((h) => wanted.has(h.label));
  }
  if (rows?.length) {
    const wanted = new Set(rows.map((n) => n - 1));
    holes = holes.filter((h) => h.row !== undefined && wanted.has(h.row));
  }
  if (sel) holes = holes.filter((h) => selection.ids.has(h.id));
  if (holes.length === 0) throw new ToolError('No hole matches those criteria.');
  return holes;
}

const idsOf = (holes: readonly Hole[]): HoleId[] => holes.map((h) => h.id);

// ------------------------------------------------------------------ Productos

/** Producto por id o nombre (exacto, sin mayúsculas; si no, el único que lo contiene). */
export function findProduct<T extends { id: string; name: string }>(
  list: readonly T[],
  query: string,
  kind: string,
): T {
  const q = query.trim().toLowerCase();
  const exact = list.find((p) => p.id === query || p.name.trim().toLowerCase() === q);
  if (exact) return exact;
  const partial = list.filter((p) => p.name.toLowerCase().includes(q));
  if (partial.length === 1 && partial[0]) return partial[0];
  throw new ToolError(
    `${partial.length > 1 ? 'Ambiguous' : 'Unknown'} ${kind} "${query}". Available: ${list.map((p) => p.name).join('; ')}.`,
  );
}

/** Conector por nombre o por retardo en ms (el del mismo retardo nominal). */
function findConnector(lib: ProductLibrary, value: string | number) {
  // «17», «17 ms» o «17,5 ms» (dictado por voz): por retardo; si no, por nombre.
  const spoken =
    typeof value === 'string' ? /^\s*(\d+(?:[.,]\d+)?)\s*(?:ms)?\s*$/i.exec(value) : null;
  if (typeof value === 'number' || spoken) {
    const ms = typeof value === 'number' ? value : Number(spoken?.[1]?.replace(',', '.'));
    const match = lib.surfaceConnectors.filter((c) => Math.abs(sToMs(c.delay) - ms) < 0.01);
    if (match[0]) return match[0];
    throw new ToolError(
      `No surface connector of ${ms} ms. Available: ${lib.surfaceConnectors.map((c) => `${c.name} (${r(sToMs(c.delay), 1)} ms)`).join('; ')}.`,
    );
  }
  return findProduct(lib.surfaceConnectors, value, 'surface connector');
}

function libraryOverview(lib: ProductLibrary) {
  return {
    explosives: lib.explosives.map((e) => ({
      name: e.name,
      family: e.family,
      density_kg_m3: e.density,
      water_resistance: e.waterResistance,
    })),
    stemming_materials: lib.stemmingMaterials.map((m) => m.name),
    primers: lib.primers.map((p) => p.name),
    detonators: lib.detonators.map((d) => ({
      name: d.name,
      type: d.type,
      nominal_delay_ms: r(sToMs(d.nominalDelay), 1),
    })),
    surface_connectors: lib.surfaceConnectors.map((c) => ({
      name: c.name,
      delay_ms: r(sToMs(c.delay), 1),
    })),
  };
}

// ------------------------------------------------------------------ Lectura

function chargeOf(h: Hole, lib: ProductLibrary) {
  return h.decks.map((d) => ({
    type: d.kind,
    product:
      d.kind === 'explosive'
        ? (lib.explosives.find((e) => e.id === d.explosiveId)?.name ?? '?')
        : d.kind === 'stemming'
          ? (lib.stemmingMaterials.find((m) => m.id === d.materialId)?.name ?? '?')
          : null,
    length: r(d.length),
  }));
}

function holeRow(h: Hole, lib: ProductLibrary, extra: { kg?: number; fireMs?: number }) {
  const init = h.initiators[0];
  return {
    label: h.label,
    row: h.row !== undefined ? h.row + 1 : null,
    col: h.col ?? null,
    x: r(h.collar.x),
    y: r(h.collar.y),
    z: r(h.collar.z),
    diameter_mm: r(h.diameter * 1000, 1),
    length: r(h.length),
    subdrill: r(h.subdrill),
    inclination_deg: r(radToDeg(h.inclination), 1),
    azimuth_deg: r(radToDeg(h.azimuth), 1),
    charge_bottom_to_collar: chargeOf(h, lib),
    explosive_kg: extra.kg !== undefined ? r(extra.kg, 1) : null,
    detonator: init ? (lib.detonators.find((d) => d.id === init.detonatorId)?.name ?? '?') : null,
    downhole_delay_ms: init ? r(sToMs(init.delay), 1) : null,
    firing_time_ms:
      extra.fireMs !== undefined && Number.isFinite(extra.fireMs) ? r(extra.fireMs, 1) : null,
  };
}

/** Análisis vigente (el del documento actual), si el worker ya lo terminó. */
function currentAnalysis() {
  const s = useAnalysisStore.getState();
  return s.analysis && s.version === document.version && !s.computing ? s.analysis : null;
}

function patternInfo(p: Pattern, blast: Blast) {
  return {
    name: p.name,
    perimeter: blast.boundaries.find((b) => b.id === p.boundaryId)?.name ?? null,
    kind: p.kind,
    burden: r(p.burden),
    spacing: r(p.spacing),
    row_azimuth_deg: r(radToDeg(p.rowAzimuth), 1),
    rows: p.rows,
    holes_per_row: p.holesPerRow,
    holes: blast.holes.filter((h) => h.patternId === p.id).length,
    hole_template: {
      diameter_mm: r(p.holeTemplate.diameter * 1000, 1),
      inclination_deg: r(radToDeg(p.holeTemplate.inclination), 1),
      azimuth_deg: r(radToDeg(p.holeTemplate.azimuth), 1),
      subdrill: r(p.holeTemplate.subdrill),
    },
  };
}

/** Resumen corto del diseño: va en cada turno dentro de la instrucción de sistema. */
export function designSummary() {
  const blast = document.project.blasts[0];
  if (!blast) return { blast: null };
  const activeId = useUiStore.getState().activeBoundaryId;
  return {
    blast: blast.name,
    perimeters: blast.boundaries.map((b) => ({
      name: b.name,
      active: b.id === activeId,
      vertices: b.polygon.length,
      area_m2: r(polygonArea(b), 0),
      free_face_edges: b.freeFaceEdges.length,
    })),
    patterns: blast.patterns.map((p) => ({
      name: p.name,
      kind: p.kind,
      burden: r(p.burden),
      spacing: r(p.spacing),
    })),
    holes: blast.holes.length,
    charged_holes: blast.holes.filter((h) => h.decks.some((d) => d.kind === 'explosive')).length,
    holes_with_detonator: blast.holes.filter((h) => h.initiators.length > 0).length,
    surface_connections: blast.initiation.connections.length,
    initiation_system: blast.initiation.system,
    selected_holes: selection.ids.size,
    read_only: document.readOnly,
  };
}

function getDesign() {
  const blast = blastOrFail();
  const activeId = useUiStore.getState().activeBoundaryId;
  const center = getEngine()?.getViewCenter();
  const rows = new Set(blast.holes.map((h) => h.row).filter((v) => v !== undefined));
  return {
    conventions:
      'x = East, y = North (project coordinates, m). Inclination from vertical, azimuth clockwise from North. Diameter in mm, delays in ms. Row 1 = next to the free face.',
    view_center: center ? { x: r(center.x), y: r(center.y) } : null,
    bench: {
      floor_elevation: r(blast.bench.floorElevation),
      height: r(blast.bench.height),
      face_angle_deg: r(radToDeg(blast.bench.faceAngle), 1),
      on_topography: blast.bench.topographyId !== undefined,
    },
    perimeters: blast.boundaries.map((b) => ({
      name: b.name,
      active: b.id === activeId,
      vertices: b.polygon.map((p) => [r(p.x), r(p.y)]),
      area_m2: r(polygonArea(b), 1),
      floor_elevation: b.floorElevation ?? null,
      edges: edgeInfo(b),
      holes: blast.holes.filter((h) => holeBoundary(blast, h)?.id === b.id).length,
    })),
    patterns: blast.patterns.map((p) => patternInfo(p, blast)),
    holes: {
      count: blast.holes.length,
      rows: rows.size,
      charged: blast.holes.filter((h) => h.decks.some((d) => d.kind === 'explosive')).length,
      with_detonator: blast.holes.filter((h) => h.initiators.length > 0).length,
    },
    initiation: {
      system: blast.initiation.system,
      surface_connections: blast.initiation.connections.length,
      initiation_points: blast.initiation.initiationPoints.length,
    },
    selected_holes: selection.ids.size,
    library: libraryOverview(document.project.library),
  };
}

function listHoles(args: { target?: Target | undefined; limit?: number | undefined }) {
  const blast = blastOrFail();
  const holes = args.target ? resolveTarget(blast, args.target) : blast.holes;
  const a = currentAnalysis();
  const index = new Map<string, number>(a?.charge.holeIds.map((id, i) => [id, i]) ?? []);
  const limit = args.limit ?? 80;
  const lib = document.project.library;
  return {
    total: holes.length,
    shown: Math.min(limit, holes.length),
    holes: holes.slice(0, limit).map((h) => {
      const i = index.get(h.id);
      const extra: { kg?: number; fireMs?: number } = {};
      if (a && i !== undefined) {
        extra.kg = a.charge.perHole[i] ?? 0;
        extra.fireMs = sToMs(a.timing.fireTime[i] ?? NaN);
      }
      return holeRow(h, lib, extra);
    }),
  };
}

async function getAnalysis() {
  const blast = blastOrFail();
  if (blast.holes.length === 0) return { holes: 0, note: 'No holes yet.' };
  await analysisReady(AbortSignal.timeout(20_000));
  const a = currentAnalysis();
  if (!a) throw new ToolError('The analysis is not ready yet; try again.');
  const label = new Map<string, string>(blast.holes.map((h) => [h.id, h.label]));
  const c = a.charge;
  const t = a.timing;
  return {
    holes: blast.holes.length,
    total_explosive_kg: r(c.totalExplosive, 1),
    loading_factor_kg_m3: r(c.loadingFactor, 3),
    powder_factor_kg_t: r(c.powderFactor * 1000, 3),
    volume_m3: r(c.volume, 0),
    tonnage_t: r(c.tonnage / 1000, 0),
    drilled_m: r(c.drilledLength, 1),
    first_firing_ms: r(sToMs(t.firstTime), 1),
    last_firing_ms: r(sToMs(t.lastTime), 1),
    holes_not_initiated: t.notInitiated,
    coincident_groups: t.coincidentGroups.length,
    max_holes_per_window: t.maxHolesPerWindow,
    max_charge_per_window_kg: r(t.maxChargePerWindow, 1),
    checks: a.checks.map((k) => ({
      severity: k.severity,
      title: k.title,
      detail: k.detail,
      holes: k.holes.slice(0, 12).map((id) => label.get(id) ?? id),
    })),
  };
}

// ------------------------------------------------------------------ Malla

const patternSchema = z.object({
  kind: z
    .enum(['square', 'rectangular', 'staggered'])
    .describe('square, rectangular, or staggered (triangular / tresbolillo / quincunx).'),
  burden: z.number().positive().optional().describe('Burden [m]. Default: current pattern.'),
  spacing: z
    .number()
    .positive()
    .optional()
    .describe('Spacing [m]. Ignored for square. Default: current pattern.'),
  diameter_mm: z.number().positive().optional(),
  subdrill: z.number().min(0).optional().describe('Subdrill [m].'),
  inclination_deg: z.number().min(0).max(45).optional().describe('From vertical.'),
  azimuth_deg: z.number().min(0).max(360).optional().describe('Hole dip direction.'),
  row_azimuth_deg: z
    .number()
    .min(0)
    .max(360)
    .optional()
    .describe('Row direction. Default: parallel to the free face.'),
  front_offset: z
    .number()
    .min(0)
    .optional()
    .describe('Distance from the free face to row 1 [m]. Default: current or burden/2.'),
  perimeter: perimeterArg.optional(),
});

async function generatePattern(args: z.infer<typeof patternSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const boundary = resolvePerimeter(blast, args.perimeter);
  const current = blast.patterns.find((p) => p.boundaryId === boundary.id);
  const burden = args.burden ?? current?.burden;
  if (burden === undefined) throw new ToolError('Ask the user for the burden (m).');
  const spacing = args.kind === 'square' ? burden : (args.spacing ?? current?.spacing);
  if (spacing === undefined) throw new ToolError('Ask the user for the spacing (m).');
  const base: HoleTemplate = current?.holeTemplate ?? useUiStore.getState().holeTemplate;
  const template: HoleTemplate = {
    ...base,
    diameter: args.diameter_mm !== undefined ? mmToM(args.diameter_mm) : base.diameter,
    subdrill: args.subdrill ?? base.subdrill,
    inclination:
      args.inclination_deg !== undefined ? degToRad(args.inclination_deg) : base.inclination,
    azimuth: args.azimuth_deg !== undefined ? degToRad(args.azimuth_deg) : base.azimuth,
  };
  const alignment = freeFaceAlignment(boundary) ?? {
    rowAzimuth: current?.rowAzimuth ?? Math.PI / 2,
    rowAdvance: current?.rowAdvance ?? (polygonSignedArea(boundary.polygon) > 0 ? 'left' : 'right'),
  };
  const result = await actions.generatePattern(
    {
      kind: args.kind,
      burden,
      spacing,
      rows: 1,
      holesPerRow: 1,
      rowAzimuth:
        args.row_azimuth_deg !== undefined ? degToRad(args.row_azimuth_deg) : alignment.rowAzimuth,
      rowAdvance: alignment.rowAdvance,
      boundaryId: boundary.id,
      frontOffset: args.front_offset ?? burden / 2,
    },
    { confirm: false, template },
  );
  if (!result) throw new ToolError('The pattern could not be generated (see the app message).');
  return {
    perimeter: boundary.name,
    pattern: result.name,
    kind: args.kind,
    burden: r(burden),
    spacing: r(spacing),
    holes: result.holes,
    replaced_holes: result.replacedHoles,
    free_face: result.hasFreeFace,
    holes_outside_topography: result.outside,
    note:
      result.replacedHoles > 0
        ? 'The new holes have no charge or tie-up: re-apply them if the user wants the previous ones.'
        : undefined,
  };
}

// ------------------------------------------------------------------ Edición de taladros

const editSchema = z.object({
  target: targetSchema,
  diameter_mm: z.number().positive().optional(),
  subdrill: z.number().min(0).optional().describe('[m]; length is recomputed to floor + subdrill.'),
  inclination_deg: z.number().min(0).max(60).optional(),
  azimuth_deg: z.number().min(0).max(360).optional(),
  length: z.number().positive().optional().describe('Total hole length [m] (overrides floor).'),
  collar_z: z.number().optional().describe('Collar elevation [m].'),
});

function editHoles(args: z.infer<typeof editSchema>) {
  readOnlyGuard();
  const holes = resolveTarget(blastOrFail(), args.target);
  const edit: HoleEdit = {};
  if (args.diameter_mm !== undefined) edit.diameter = mmToM(args.diameter_mm);
  if (args.subdrill !== undefined) edit.subdrill = args.subdrill;
  if (args.inclination_deg !== undefined) edit.inclination = degToRad(args.inclination_deg);
  if (args.azimuth_deg !== undefined) edit.azimuth = degToRad(args.azimuth_deg);
  if (args.length !== undefined) edit.length = args.length;
  if (args.collar_z !== undefined) edit.z = args.collar_z;
  if (Object.keys(edit).length === 0) throw new ToolError('Nothing to change.');
  document.dispatch(
    commands.editHoles(document, idsOf(holes), edit),
    `IA: editar ${holes.length} taladros`,
  );
  return { edited_holes: holes.length };
}

const moveSchema = z.object({
  target: targetSchema,
  dx: z.number().default(0).describe('East offset [m].'),
  dy: z.number().default(0).describe('North offset [m].'),
});

function moveHoles(args: z.infer<typeof moveSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const holes = resolveTarget(blast, args.target);
  const ground = blast.bench.topographyId
    ? (x: number, y: number) => topographyElevation(x, y, blast.bench.topographyId)
    : undefined;
  document.dispatch(
    commands.moveHoles(document, idsOf(holes), args.dx, args.dy, ground),
    `IA: mover ${holes.length} taladros`,
  );
  return { moved_holes: holes.length, dx: args.dx, dy: args.dy };
}

const addSchema = z.object({
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .min(1)
    .max(500)
    .describe('Collar positions (x = East, y = North) [m].'),
  diameter_mm: z.number().positive().optional(),
  subdrill: z.number().min(0).optional(),
  inclination_deg: z.number().min(0).max(60).optional(),
  azimuth_deg: z.number().min(0).max(360).optional(),
});

function addHoles(args: z.infer<typeof addSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const base = useUiStore.getState().holeTemplate;
  const template: HoleTemplate = {
    ...base,
    diameter: args.diameter_mm !== undefined ? mmToM(args.diameter_mm) : base.diameter,
    subdrill: args.subdrill ?? base.subdrill,
    inclination:
      args.inclination_deg !== undefined ? degToRad(args.inclination_deg) : base.inclination,
    azimuth: args.azimuth_deg !== undefined ? degToRad(args.azimuth_deg) : base.azimuth,
  };
  let number = nextHoleNumber(blast.holes);
  const holes = args.points.map((p) => {
    const own = blast.boundaries.find((b) => pointInPolygon(p.x, p.y, b.polygon));
    const ground = blast.bench.topographyId
      ? topographyElevation(p.x, p.y, blast.bench.topographyId)
      : null;
    return createHole({
      position: p,
      template,
      bench: boundaryBench(blast.bench, own),
      label: String(number++),
      subdrillConvention: blast.calcParams.subdrillConvention,
      ...(ground !== null ? { collarZ: ground } : {}),
    });
  });
  document.dispatch(commands.addHoles(blast.id, holes), `IA: agregar ${holes.length} taladros`);
  return { added: holes.map((h) => h.label) };
}

const targetOnly = z.object({ target: targetSchema });

function deleteHoles(args: z.infer<typeof targetOnly>) {
  readOnlyGuard();
  const holes = resolveTarget(blastOrFail(), args.target);
  document.dispatch(
    commands.deleteHoles(document, idsOf(holes)),
    `IA: borrar ${holes.length} taladros`,
  );
  return { deleted: holes.map((h) => h.label) };
}

function selectHoles(args: z.infer<typeof targetOnly>) {
  const holes = resolveTarget(blastOrFail(), args.target);
  actions.focusHoles(idsOf(holes));
  return { selected: holes.length };
}

// ------------------------------------------------------------------ Carguío

const chargeSchema = z.object({
  target: targetSchema,
  column_explosive: z.string().describe('Column explosive name from the library.'),
  stemming: z.number().min(0).describe('Stemming length at the collar [m].'),
  bottom_explosive: z.string().optional().describe('Optional bottom (toe) charge explosive.'),
  bottom_length: z.number().min(0).optional().describe('Bottom charge length [m].'),
  air_deck: z.number().min(0).optional().describe('Air deck between column and stemming [m].'),
  stemming_material: z.string().optional(),
  primer: z.string().optional().describe('Booster/primer name.'),
  detonator: z
    .string()
    .optional()
    .describe("Downhole detonator name. Omit to keep each hole's detonator and delay."),
  delay_ms: z.number().min(0).optional().describe('Downhole delay [ms] (default: nominal).'),
});

/** Columna de carga de fondo a boca: fondo, columna (lo que sobra), aire y taco. */
export function chargeDecks(
  length: number,
  plan: {
    columnId: ExplosiveId;
    stemming: number;
    bottom?: { id: ExplosiveId; length: number };
    air?: number;
    stemmingMaterialId: StemmingMaterialId;
  },
): Deck[] {
  const stem = Math.min(plan.stemming, length);
  const air = Math.min(plan.air ?? 0, length - stem);
  const bottom = Math.min(plan.bottom?.length ?? 0, length - stem - air);
  const column = Math.max(0, length - stem - air - bottom);
  const decks: Deck[] = [];
  if (plan.bottom && bottom > 0)
    decks.push({
      id: newId<'Deck'>(),
      kind: 'explosive',
      explosiveId: plan.bottom.id,
      length: bottom,
    });
  if (column > 0)
    decks.push({
      id: newId<'Deck'>(),
      kind: 'explosive',
      explosiveId: plan.columnId,
      length: column,
    });
  if (air > 0) decks.push({ id: newId<'Deck'>(), kind: 'air', length: air });
  if (stem > 0)
    decks.push({
      id: newId<'Deck'>(),
      kind: 'stemming',
      materialId: plan.stemmingMaterialId,
      length: stem,
    });
  return decks;
}

function setCharge(args: z.infer<typeof chargeSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const lib = document.project.library;
  const holes = resolveTarget(blast, args.target);
  const column = findProduct(lib.explosives, args.column_explosive, 'explosive');
  const bottom = args.bottom_explosive
    ? findProduct(lib.explosives, args.bottom_explosive, 'explosive')
    : undefined;
  if (bottom && !args.bottom_length)
    throw new ToolError('Give bottom_length for the bottom charge.');
  const material = args.stemming_material
    ? findProduct(lib.stemmingMaterials, args.stemming_material, 'stemming material')
    : lib.stemmingMaterials[0];
  if (!material) throw new ToolError('The library has no stemming material.');
  const primer = args.primer ? findProduct(lib.primers, args.primer, 'primer') : undefined;
  const det = args.detonator ? findProduct(lib.detonators, args.detonator, 'detonator') : undefined;
  const short: string[] = [];
  const next = holes.map((h): Hole => {
    const decks = chargeDecks(h.length, {
      columnId: column.id,
      stemming: args.stemming,
      ...(bottom && args.bottom_length
        ? { bottom: { id: bottom.id, length: args.bottom_length } }
        : {}),
      ...(args.air_deck !== undefined ? { air: args.air_deck } : {}),
      stemmingMaterialId: material.id,
    });
    if (!decks.some((d) => d.kind === 'explosive')) short.push(h.label);
    const depth = Math.max(0, h.length - 0.5);
    let initiators = det
      ? withDownholeDetonator(
          h,
          det.id,
          args.delay_ms !== undefined ? msToS(args.delay_ms) : det.nominalDelay,
        )
      : h.initiators;
    // El primer va al fondo de la columna nueva, junto al detonador.
    initiators = initiators.map((i) => ({
      ...i,
      depth,
      ...(primer ? { primerId: primer.id } : {}),
    }));
    return { ...h, decks, initiators };
  });
  document.dispatch(
    [{ type: 'holes/replace', blastId: blast.id, holes: next }],
    `IA: cargar ${holes.length} taladros`,
  );
  return {
    charged_holes: holes.length,
    column: column.name,
    bottom: bottom ? `${bottom.name} ${args.bottom_length ?? 0} m` : null,
    stemming_m: args.stemming,
    primer: primer?.name ?? null,
    detonator: det?.name ?? 'kept',
    without_explosive: short.length ? short : undefined,
    holes_without_detonator: next.filter((h) => h.initiators.length === 0).length,
  };
}

function clearCharge(args: z.infer<typeof targetOnly>) {
  readOnlyGuard();
  const holes = resolveTarget(blastOrFail(), args.target);
  document.dispatch(
    commands.clearCharge(document, idsOf(holes)),
    `IA: descargar ${holes.length} taladros`,
  );
  return { cleared_holes: holes.length };
}

// ------------------------------------------------------------------ Tiempos

const startSchema = {
  start: z
    .enum(['center', 'left', 'right'])
    .optional()
    .describe(
      'Where row 1 starts: center (V), left or right end. Default: center for v, left otherwise.',
    ),
  start_label: z.string().optional().describe('Exact start hole (overrides start).'),
  perimeter: perimeterArg.optional(),
};

/** Malla a amarrar (la del perímetro, o la única) y el taladro de inicio. */
function tieUpTarget(
  blast: Blast,
  args: {
    start?: 'center' | 'left' | 'right' | undefined;
    start_label?: string | undefined;
    perimeter?: string | undefined;
  },
  fallback: 'center' | 'left',
) {
  const boundary = blast.boundaries.length ? resolvePerimeter(blast, args.perimeter) : undefined;
  const pattern =
    blast.patterns.find((p) => p.boundaryId === boundary?.id) ??
    (blast.patterns.length === 1 ? blast.patterns[0] : undefined);
  if (!pattern) throw new ToolError('There is no pattern to tie up; generate one first.');
  const holes = blast.holes.filter((h) => h.patternId === pattern.id && h.row !== undefined);
  if (holes.length === 0) throw new ToolError('The pattern has no holes.');
  if (args.start_label) {
    const h = holes.find((x) => x.label === args.start_label);
    if (!h) throw new ToolError(`Hole ${args.start_label} is not in pattern ${pattern.name}.`);
    return { pattern, startRow: h.row ?? 0, startCol: h.col ?? 0, holes };
  }
  const front = Math.min(...holes.map((h) => h.row ?? 0));
  const cols = holes.filter((h) => h.row === front).map((h) => h.col ?? 0);
  const min = Math.min(...cols);
  const max = Math.max(...cols);
  const where = args.start ?? fallback;
  const startCol = where === 'left' ? min : where === 'right' ? max : Math.round((min + max) / 2);
  return { pattern, startRow: front, startCol, holes };
}

const tieUpSchema = z.object({
  mode: z.enum(['v', 'line', 'echelon']).describe('v (chevron), line (row by row) or echelon.'),
  inter_hole: z
    .union([z.string(), z.number()])
    .describe('Connector between holes in a row: library name or delay in ms (e.g. 17).'),
  inter_row: z
    .union([z.string(), z.number()])
    .describe('Connector between rows: library name or delay in ms (e.g. 42).'),
  downhole_detonator: z
    .string()
    .optional()
    .describe(
      'Nonel downhole detonator to set; default keeps nonel ones and replaces electronic/missing ones.',
    ),
  ...startSchema,
});

function setTieUp(args: z.infer<typeof tieUpSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const lib = document.project.library;
  const { pattern, startRow, startCol, holes } = tieUpTarget(
    blast,
    args,
    args.mode === 'v' ? 'center' : 'left',
  );
  const ih = findConnector(lib, args.inter_hole);
  const ir = findConnector(lib, args.inter_row);
  // Un amarre de superficie necesita detonador no electrónico en el taladro.
  const det = args.downhole_detonator
    ? findProduct(lib.detonators, args.downhole_detonator, 'detonator')
    : lib.detonators.find((d) => d.type === 'nonel');
  const typeOf = (id: string) => lib.detonators.find((d) => d.id === id)?.type;
  const needs = holes.filter(
    (h) =>
      args.downhole_detonator !== undefined ||
      h.initiators.length === 0 ||
      h.initiators.some((i) => typeOf(i.detonatorId) === 'electronic'),
  );
  if (needs.length && !det) throw new ToolError('The library has no nonel detonator.');
  const extra: Op[] =
    needs.length && det
      ? commands.setDownholeDetonator(document, idsOf(needs), det.id, det.nominalDelay)
      : [];
  const n = actions.generateRowTieUp(
    {
      patternId: pattern.id,
      startRow,
      startCol,
      ...(args.mode === 'echelon' ? { mode: 'echelon' as const } : {}),
    },
    ih.id,
    ir.id,
    extra,
  );
  if (n === 0) throw new ToolError('No connections could be made (holes without row/column).');
  const start = holes.find((h) => h.row === startRow && h.col === startCol);
  return {
    pattern: pattern.name,
    mode: args.mode,
    connections: n,
    inter_hole: ih.name,
    inter_row: ir.name,
    start_hole: start?.label ?? null,
    downhole_detonator_set_on: needs.length ? `${needs.length} holes (${det?.name ?? ''})` : 'none',
  };
}

const electronicSchema = z.object({
  inter_hole_ms: z.number().min(0),
  inter_row_ms: z.number().min(0),
  offset_ms: z.number().min(0).default(0).describe('Time of the first hole [ms].'),
  detonator: z
    .string()
    .optional()
    .describe('Electronic detonator name (default: first electronic).'),
  ...startSchema,
});

function setElectronic(args: z.infer<typeof electronicSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const lib = document.project.library;
  const det = args.detonator
    ? findProduct(lib.detonators, args.detonator, 'detonator')
    : lib.detonators.find((d) => d.type === 'electronic');
  if (det?.type !== 'electronic') throw new ToolError('Choose an electronic detonator.');
  const { pattern, startRow, startCol, holes } = tieUpTarget(blast, args, 'left');
  const n = actions.assignElectronicTimes(
    { patternId: pattern.id, startRow, startCol },
    det.id,
    msToS(args.inter_hole_ms),
    msToS(args.inter_row_ms),
    msToS(args.offset_ms),
  );
  if (n === 0) throw new ToolError('No hole could be programmed (holes without row/column).');
  const start = holes.find((h) => h.row === startRow && h.col === startCol);
  return {
    pattern: pattern.name,
    programmed_holes: n,
    detonator: det.name,
    start_hole: start?.label ?? null,
  };
}

const delaysSchema = z.object({
  delays: z
    .array(z.object({ label: z.string(), delay_ms: z.number().min(0) }))
    .min(1)
    .describe('Downhole delay (electronic: programmed time) per hole.'),
  detonator: z.string().optional().describe("Detonator to set; default keeps each hole's."),
});

function setHoleDelays(args: z.infer<typeof delaysSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const lib = document.project.library;
  const det = args.detonator ? findProduct(lib.detonators, args.detonator, 'detonator') : undefined;
  const byLabel = new Map(blast.holes.map((h) => [h.label, h]));
  const next = args.delays.map(({ label, delay_ms }) => {
    const h = byLabel.get(label);
    if (!h) throw new ToolError(`Unknown hole label ${label}.`);
    const detId = det?.id ?? h.initiators[0]?.detonatorId;
    if (!detId) throw new ToolError(`Hole ${label} has no detonator: pass detonator.`);
    return { ...h, initiators: withDownholeDetonator(h, detId, msToS(delay_ms)) };
  });
  document.dispatch(
    [{ type: 'holes/replace', blastId: blast.id, holes: next }],
    `IA: retardos de ${next.length} taladros`,
  );
  return { updated_holes: next.length };
}

function clearTieUp() {
  readOnlyGuard();
  actions.clearConnections(false);
  return { cleared: true };
}

// ------------------------------------------------------------------ Perímetro y cara libre

const perimeterSchema = z.object({
  vertices: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .min(3)
    .optional()
    .describe('Polygon vertices in order (x = East, y = North) [m].'),
  rectangle: z
    .object({
      width: z.number().positive().describe('Along East before rotation [m].'),
      depth: z.number().positive().describe('Along North before rotation [m].'),
      center_x: z.number().optional().describe('Default: view center.'),
      center_y: z.number().optional(),
      rotation_deg: z.number().default(0).describe('Clockwise rotation.'),
    })
    .optional(),
  free_face_sides: z
    .array(z.enum(['N', 'S', 'E', 'W']))
    .optional()
    .describe('Mark as free face the edges facing these directions.'),
  free_face_edges: z.array(z.number().int().min(0)).optional(),
});

function createPerimeter(args: z.infer<typeof perimeterSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  let polygon = args.vertices;
  if (!polygon && args.rectangle) {
    const { width, depth, rotation_deg } = args.rectangle;
    const center = getEngine()?.getViewCenter() ?? { x: 0, y: 0 };
    const cx = args.rectangle.center_x ?? center.x;
    const cy = args.rectangle.center_y ?? center.y;
    const a = degToRad(rotation_deg);
    polygon = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ].map(([x = 0, y = 0]) => ({
      x: cx + x * Math.cos(a) + y * Math.sin(a),
      y: cy - x * Math.sin(a) + y * Math.cos(a),
    }));
  }
  if (!polygon) throw new ToolError('Give vertices or rectangle.');
  const boundary = commands.makeBoundary(blast, polygon);
  const edges = [
    ...(args.free_face_edges ?? []),
    ...(args.free_face_sides ? edgesFacing(boundary, args.free_face_sides) : []),
  ].filter((i) => i < polygon.length);
  boundary.freeFaceEdges = [...new Set(edges)].sort((x, y) => x - y);
  document.dispatch(commands.addBoundary(document, blast.id, boundary), `IA: ${boundary.name}`);
  useUiStore.getState().setActiveBoundary(boundary.id);
  return {
    perimeter: boundary.name,
    area_m2: r(polygonArea(boundary), 1),
    edges: edgeInfo(boundary),
  };
}

const freeFaceSchema = z.object({
  perimeter: perimeterArg.optional(),
  edges: z.array(z.number().int().min(0)).optional().describe('Edge indices (see get_design).'),
  sides: z
    .array(z.enum(['N', 'S', 'E', 'W']))
    .optional()
    .describe('Edges facing these directions.'),
});

function setFreeFace(args: z.infer<typeof freeFaceSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const b = resolvePerimeter(blast, args.perimeter);
  const edges = [...(args.edges ?? []), ...(args.sides ? edgesFacing(b, args.sides) : [])].filter(
    (i) => i < b.polygon.length,
  );
  if (edges.length === 0) throw new ToolError('No edge matches; give edges or sides.');
  document.dispatch(
    commands.setFreeFaceEdges(document, blast.id, b.id, edges),
    `IA: cara libre de ${b.name}`,
  );
  const updated = document.project.blasts[0]?.boundaries.find((x) => x.id === b.id) ?? b;
  return { perimeter: b.name, edges: edgeInfo(updated) };
}

// ------------------------------------------------------------------ Deshacer

const undoSchema = z.object({ steps: z.number().int().min(1).max(20).default(1) });

function undoSteps(args: z.infer<typeof undoSchema>) {
  const undone: string[] = [];
  for (let i = 0; i < args.steps; i++) {
    const label = document.undoLabel;
    if (!label) break;
    document.undo();
    undone.push(label);
  }
  return { undone };
}

// ------------------------------------------------------------------ Registro

interface ToolDef {
  description: string;
  schema: z.ZodType;
  run: (args: never) => unknown;
}

const TOOLS: Record<string, ToolDef> = {
  get_design: {
    description:
      'Full design state: bench, perimeters (vertices, edges, free faces), patterns, hole counts, tie-up and the product library. Call it before acting when unsure.',
    schema: z.object({}),
    run: getDesign,
  },
  list_holes: {
    description: 'Hole table (geometry, charge, detonator, delay, firing time).',
    schema: z.object({
      target: targetSchema.optional(),
      limit: z.number().int().min(1).max(400).optional(),
    }),
    run: listHoles,
  },
  get_analysis: {
    description:
      'Results of the current design: explosive, loading/powder factor, firing times, coincident delays and design checks. Use it to verify changes.',
    schema: z.object({}),
    run: getAnalysis,
  },
  generate_pattern: {
    description:
      'Generate (or replace) the drill pattern inside a perimeter, aligned with its free face. Unspecified values keep the current pattern.',
    schema: patternSchema,
    run: generatePattern,
  },
  edit_holes: {
    description:
      'Change diameter, subdrill, inclination, azimuth, length or collar elevation of holes.',
    schema: editSchema,
    run: editHoles,
  },
  move_holes: { description: 'Move holes by an offset.', schema: moveSchema, run: moveHoles },
  add_holes: {
    description: 'Add individual holes at given positions.',
    schema: addSchema,
    run: addHoles,
  },
  delete_holes: { description: 'Delete holes.', schema: targetOnly, run: deleteHoles },
  select_holes: {
    description: 'Select holes on the map and zoom to them (to show the user).',
    schema: targetOnly,
    run: selectHoles,
  },
  set_charge: {
    description:
      'Load holes: optional bottom charge, column explosive (fills the rest), optional air deck, stemming at the collar, primer and downhole detonator.',
    schema: chargeSchema,
    run: setCharge,
  },
  clear_charge: {
    description: 'Remove charge and detonators from holes.',
    schema: targetOnly,
    run: clearCharge,
  },
  set_tie_up: {
    description:
      'Surface tie-up (nonel) of a pattern: V, line by line or echelon, with connectors between holes and between rows. Replaces the previous tie-up of that pattern.',
    schema: tieUpSchema,
    run: setTieUp,
  },
  set_electronic_timing: {
    description:
      'Program electronic detonators hole by hole (inter-hole and inter-row ms) and remove the surface network of the pattern.',
    schema: electronicSchema,
    run: setElectronic,
  },
  set_hole_delays: {
    description: 'Set the downhole delay (or electronic time) of specific holes.',
    schema: delaysSchema,
    run: setHoleDelays,
  },
  clear_tie_up: {
    description: 'Remove all surface connections and initiation points.',
    schema: z.object({}),
    run: clearTieUp,
  },
  create_perimeter: {
    description:
      'Create a new perimeter (polygon or rectangle) and make it active. ONLY after the user explicitly agreed; prefer the user drawing it.',
    schema: perimeterSchema,
    run: createPerimeter,
  },
  set_free_face: {
    description: 'Set which edges of a perimeter are free face (by index or by facing direction).',
    schema: freeFaceSchema,
    run: setFreeFace,
  },
  undo: {
    description: "Undo the last changes (any change, also the user's).",
    schema: undoSchema,
    run: undoSteps,
  },
};

/** Herramientas que no modifican el documento (no cuentan como cambio en la interfaz). */
export const READ_ONLY_TOOLS = new Set([
  'get_design',
  'list_holes',
  'get_analysis',
  'select_holes',
]);

// ------------------------------------------------------------------ Gemini

type JsonSchema = Record<string, unknown>;

/** JSON Schema de zod → subconjunto OpenAPI que acepta Gemini en `parameters`. */
export function toGeminiSchema(s: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  // Unión string | number (conectores: nombre o ms): Gemini la recibe como texto ("17" o un nombre).
  if (Array.isArray(s.type) || s.anyOf) out.type = 'STRING';
  else if (typeof s.type === 'string') out.type = s.type.toUpperCase();
  if (typeof s.description === 'string') out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  for (const k of ['minimum', 'maximum'] as const)
    if (typeof s[k] === 'number' && Math.abs(s[k]) < 1e12) out[k] = s[k];
  for (const k of ['minItems', 'maxItems'] as const) if (typeof s[k] === 'number') out[k] = s[k];
  if (s.properties && typeof s.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(s.properties as Record<string, JsonSchema>).map(([k, v]) => [
        k,
        toGeminiSchema(v),
      ]),
    );
    if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  }
  if (s.items && typeof s.items === 'object') out.items = toGeminiSchema(s.items as JsonSchema);
  return out;
}

export const AI_FUNCTION_DECLARATIONS = Object.entries(TOOLS).map(([name, def]) => {
  const params = toGeminiSchema(z.toJSONSchema(def.schema, { io: 'input' }));
  const hasParams = Object.keys((params.properties as object | undefined) ?? {}).length > 0;
  return { name, description: def.description, ...(hasParams ? { parameters: params } : {}) };
});

/** Ejecuta una herramienta pedida por el modelo; los errores vuelven como `{ error }`. */
export async function runTool(
  name: string,
  args: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const def = TOOLS[name];
  if (!def) return { ok: false, error: `Unknown tool ${name}.` };
  const parsed = def.schema.safeParse(args ?? {});
  if (!parsed.success)
    return { ok: false, error: `Invalid arguments: ${z.prettifyError(parsed.error)}` };
  try {
    return { ok: true, result: await def.run(parsed.data as never) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
