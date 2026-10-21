import { resolveHole } from './holeResolution';
import { showHoleDetail } from './holeDetail';
import type { PresetStep } from '@cronos/api';
import {
  commands,
  degToRad,
  outwardNormal,
  radToDeg,
  unitToAzimuth,
  type Blast,
  type BlastBoundary,
  type Vec2,
} from '@cronos/core';
import { z } from 'zod';
import { getEngine, session } from '../session';
import { api } from '../server/api';
import { useProjectSession } from '../server/projectSession';
import { useUiStore } from '../stores/uiStore';
import { topographyElevation } from '../topography/session';
import { pushCard, type AgentCard } from './cards';
import { serverProjectId } from './knowledge';
import { recordedSteps } from './steps';
import {
  blastOrFail,
  findByName,
  r,
  readOnlyGuard,
  resolvePerimeter,
  runTool,
  ToolError,
  type ToolDef,
} from './tools';

/**
 * Herramientas de escena y de trabajo con el diseño que pedía el uso real (registros de
 * conversación del visor y la web): mover la cámara a donde se pida, editar o renombrar
 * perímetros, borrar o editar puntos a proteger, escenarios del proyecto, presets reutilizables
 * (empresa o sitio) y listas de opciones para elegir con el dedo, el mouse o el rayo del mando.
 */

const document = session.document;

const DIRS = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 } as const;
const dirSchema = z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

function centroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, poly.length), y: y / Math.max(1, poly.length) };
}

function extent(poly: readonly Vec2[]): number {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
}

function groundZ(blast: Blast, x: number, y: number): number {
  const top = blast.bench.floorElevation + blast.bench.height;
  return blast.bench.topographyId
    ? (topographyElevation(x, y, blast.bench.topographyId) ?? top)
    : top;
}

/** Azimut exterior medio de las caras libres de un perímetro [°], o null si no tiene. */
function freeFaceAzimuth(b: BlastBoundary): number | null {
  let sx = 0;
  let sy = 0;
  for (const i of b.freeFaceEdges) {
    const n = outwardNormal(b.polygon, i);
    if (n) {
      sx += n.x;
      sy += n.y;
    }
  }
  if (sx === 0 && sy === 0) return null;
  return radToDeg(unitToAzimuth(sx, sy));
}

function maybePerimeter(blast: Blast, name?: string): BlastBoundary | null {
  try {
    return resolvePerimeter(blast, name);
  } catch (e) {
    if (name !== undefined) throw e;
    return blast.boundaries[0] ?? null;
  }
}

// ------------------------------------------------------------------ Cámara (escritorio)

const cameraSchema = z.object({
  target: z
    .enum([
      'blast',
      'perimeter',
      'hole',
      'point',
      'free_face',
      'behind',
      'overview',
      'xy',
      'models',
    ])
    .describe(
      'What to frame: models (the imported point clouds and block models, in 3D; use it to show them), blast (all perimeters), perimeter, hole (label), point (protected point name), free_face (looking at the free face from outside), behind (from behind the blast toward the free face), overview (blast and protected points from high), xy (a position).',
    ),
  perimeter: z.string().optional(),
  hole: z.string().optional().describe('Hole label for target hole.'),
  point: z.string().optional().describe('Protected point name for target point.'),
  x: z.number().optional(),
  y: z.number().optional(),
  view: z
    .enum(['plan', '3d'])
    .optional()
    .describe('Plan (2D) or 3D. Default: 3D for free_face/behind/hole, current otherwise.'),
  from: dirSchema.optional().describe('Look from this direction (3D), e.g. "desde el norte".'),
  size_m: z.number().positive().optional().describe('How much must fit [m]; smaller = closer.'),
  pitch_deg: z.number().min(5).max(90).optional().describe('3D elevation angle (90 = from above).'),
});

function setCamera(args: z.infer<typeof cameraSchema>) {
  const engine = getEngine();
  if (!engine) throw new ToolError('No view available.');
  if (engine.xrMode)
    throw new ToolError('The user is in VR: use vr_view (go_to / focus_*) to move them instead.');
  if (args.target === 'models') {
    if (!engine.frameModels3d())
      throw new ToolError(
        'No point cloud or block model is loaded (Topografía → Nube de puntos o modelo de bloques).',
      );
    return { framed: 'models', view: '3d' };
  }
  const blast = blastOrFail();
  const allPoly = blast.boundaries.flatMap((b) => b.polygon);
  const mode = args.view;
  let at: Vec2;
  let size = args.size_m;
  let yaw: number | undefined = args.from ? DIRS[args.from] : undefined;
  let pitch = args.pitch_deg;
  let view = mode;
  switch (args.target) {
    case 'blast':
    case 'overview': {
      if (!allPoly.length) throw new ToolError('There is no perimeter yet.');
      const pts = [...allPoly];
      if (args.target === 'overview')
        for (const p of document.project.monitoringPoints ?? [])
          pts.push({ x: p.position.x, y: p.position.y });
      at = centroid(pts);
      size ??= extent(pts) * 1.15;
      if (args.target === 'overview') pitch ??= 60;
      break;
    }
    case 'perimeter': {
      const b = resolvePerimeter(blast, args.perimeter);
      at = centroid(b.polygon);
      size ??= extent(b.polygon) * 1.2;
      break;
    }
    case 'hole': {
      const h = resolveHole(blast.holes, args.hole ?? '').hole;
      at = { x: h.collar.x, y: h.collar.y };
      size ??= 15;
      view ??= '3d';
      pitch ??= 30;
      break;
    }
    case 'point': {
      const list = document.project.monitoringPoints ?? [];
      const p = findByName(list, args.point ?? '');
      if (!p)
        throw new ToolError(
          `No protected point "${args.point ?? ''}". Points: ${list.map((x) => x.name).join(', ') || 'none'}.`,
        );
      at = { x: p.position.x, y: p.position.y };
      size ??= 60;
      break;
    }
    case 'free_face':
    case 'behind': {
      const b = maybePerimeter(blast, args.perimeter);
      if (!b) throw new ToolError('There is no perimeter yet.');
      const az = freeFaceAzimuth(b);
      if (az === null) throw new ToolError(`${b.name} has no free face set (set_free_face).`);
      at = centroid(b.polygon);
      size ??= extent(b.polygon) * 1.3;
      yaw ??= args.target === 'free_face' ? az : (az + 180) % 360;
      pitch ??= args.target === 'free_face' ? 18 : 30;
      view ??= '3d';
      break;
    }
    case 'xy': {
      if (args.x === undefined || args.y === undefined) throw new ToolError('Give x and y.');
      at = { x: args.x, y: args.y };
      size ??= 50;
      break;
    }
  }
  engine.flyCamera({
    at: { ...at, z: groundZ(blast, at.x, at.y) },
    size,
    ...(yaw !== undefined ? { yawDeg: yaw } : {}),
    ...(pitch !== undefined ? { pitchDeg: pitch } : {}),
    ...(view ? { mode: view } : {}),
  });
  return {
    framed: args.target,
    x: r(at.x),
    y: r(at.y),
    size_m: r(size, 0),
    view: view ?? 'current',
    ...(args.target === 'hole'
      ? showHoleDetail(resolveHole(blast.holes, args.hole ?? '').hole, 'explicit', true)
      : {}),
  };
}

// ------------------------------------------------------------------ Perímetros

const editPerimeterSchema = z.object({
  perimeter: z.string().optional().describe('Name; default the active one.'),
  rename: z.string().min(1).max(80).optional(),
  move_dx: z.number().optional().describe('Move the whole perimeter East (+) / West (−) [m].'),
  move_dy: z.number().optional().describe('Move North (+) / South (−) [m].'),
  vertex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Vertex number to move (1 = P1, as labelled on the map).'),
  vertex_dx: z.number().optional(),
  vertex_dy: z.number().optional(),
  vertex_x: z.number().optional().describe('Absolute position for the vertex instead of dx/dy.'),
  vertex_y: z.number().optional(),
  rotate_deg: z.number().optional().describe('Rotate around its center, clockwise.'),
});

function editPerimeter(args: z.infer<typeof editPerimeterSchema>) {
  readOnlyGuard();
  const blast = blastOrFail();
  const b = resolvePerimeter(blast, args.perimeter);
  let polygon = b.polygon.map((p) => ({ ...p }));
  const changes: string[] = [];
  if (args.move_dx || args.move_dy) {
    polygon = polygon.map((p) => ({ x: p.x + (args.move_dx ?? 0), y: p.y + (args.move_dy ?? 0) }));
    changes.push('moved');
  }
  if (args.rotate_deg) {
    const c = centroid(polygon);
    const a = degToRad(args.rotate_deg);
    polygon = polygon.map((p) => {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      return {
        x: c.x + dx * Math.cos(a) + dy * Math.sin(a),
        y: c.y - dx * Math.sin(a) + dy * Math.cos(a),
      };
    });
    changes.push('rotated');
  }
  if (args.vertex !== undefined) {
    const i = args.vertex - 1;
    const v = polygon[i];
    if (!v)
      throw new ToolError(`${b.name} has ${polygon.length} vertices (P1–P${polygon.length}).`);
    polygon[i] = {
      x: args.vertex_x ?? v.x + (args.vertex_dx ?? 0),
      y: args.vertex_y ?? v.y + (args.vertex_dy ?? 0),
    };
    changes.push(`vertex P${args.vertex}`);
  }
  const renamed = args.rename?.trim();
  const name = renamed !== undefined && renamed !== '' ? renamed : b.name;
  if (name !== b.name) changes.push('renamed');
  if (!changes.length) throw new ToolError('Say what to change (rename, move, vertex, rotate).');
  const next: BlastBoundary = { ...b, name, polygon };
  // Un solo cambio de la lista: se reemplaza en su sitio conservando id, caras libres y piso.
  // (`removeBoundary` + `addBoundary` leen la misma lista: el segundo dejaba el original y cada
  // edición sumaba una copia; la pila contaba el volumen dos y tres veces.)
  document.dispatch(
    [
      {
        type: 'blast/patch',
        blastId: blast.id,
        // Las copias que dejó ese fallo (mismo id) se quitan aquí.
        patch: {
          boundaries: blast.boundaries
            .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
            .map((x) => (x.id === b.id ? next : x)),
        },
      },
    ],
    `IA: ${name}`,
  );
  useUiStore.getState().setActiveBoundary(b.id);
  const holes = blast.holes.length;
  return {
    perimeter: name,
    changes,
    vertices: polygon.map((p, k) => ({ label: `P${k + 1}`, x: r(p.x), y: r(p.y) })),
    ...(holes && changes.some((c) => c !== 'renamed')
      ? {
          note: 'Holes did not move: regenerate the pattern (and charge/timing) if the user wants it to follow the new outline.',
        }
      : {}),
  };
}

// ------------------------------------------------------------------ Puntos a proteger

const pointSchema = z.object({
  name: z.string().describe('Protected point name, or "all".'),
  delete: z.boolean().optional(),
  rename: z.string().optional(),
  ppv_limit_mm_s: z.number().positive().optional(),
  move_dx: z.number().optional(),
  move_dy: z.number().optional(),
});

function editProtected(args: z.infer<typeof pointSchema>) {
  readOnlyGuard();
  const list = document.project.monitoringPoints ?? [];
  if (!list.length) throw new ToolError('There are no protected points.');
  if (args.delete && /^(all|todos?)$/i.test(args.name.trim())) {
    document.dispatch(
      [{ type: 'project/patch', patch: { monitoringPoints: [] } }],
      'IA: borrar puntos de control',
    );
    return { deleted: list.map((p) => p.name) };
  }
  const p = findByName(list, args.name);
  if (!p)
    throw new ToolError(
      `No protected point "${args.name}". Points: ${list.map((x) => x.name).join(', ')}.`,
    );
  if (args.delete) {
    document.dispatch(commands.removeMonitoringPoint(document, p.id), `IA: borrar ${p.name}`);
    return { deleted: [p.name] };
  }
  document.dispatch(
    commands.updateMonitoringPoint(document, p.id, {
      ...(args.rename ? { name: args.rename } : {}),
      ...(args.ppv_limit_mm_s !== undefined ? { ppvLimit: args.ppv_limit_mm_s / 1000 } : {}),
      ...(args.move_dx || args.move_dy
        ? {
            position: {
              ...p.position,
              x: p.position.x + (args.move_dx ?? 0),
              y: p.position.y + (args.move_dy ?? 0),
            },
          }
        : {}),
    }),
    `IA: ${p.name}`,
  );
  return { point: args.rename ?? p.name, updated: true };
}

// ------------------------------------------------------------------ Escenarios del proyecto

const scenarioSchema = z.object({
  action: z.enum(['save', 'list', 'load', 'delete']),
  name: z.string().optional().describe('Scenario name (save: new name; load/delete: existing).'),
});

function choiceCard(
  id: string,
  title: string,
  sub: string,
  choices: { id: string; label: string; hint?: string }[],
): void {
  const card: AgentCard = {
    id,
    title,
    sub,
    metrics: [],
    bars: [],
    notes: [],
    choices,
    t0: performance.now(),
  };
  pushCard(card);
}

function scenarios(args: z.infer<typeof scenarioSchema>) {
  const blast = blastOrFail();
  const list = document.project.scenarios ?? [];
  if (args.action === 'list') {
    if (list.length)
      choiceCard(
        'scenarios',
        'Escenarios guardados',
        'Elige uno para cargarlo',
        list.map((s) => ({ id: s.id, label: s.name, hint: `${s.blast.holes.length} taladros` })),
      );
    return {
      scenarios: list.map((s) => ({
        name: s.name,
        saved: s.savedAt.slice(0, 16),
        holes: s.blast.holes.length,
      })),
      ...(list.length
        ? { note: 'A card with the list is on screen; the user can tap one or say its name.' }
        : {}),
    };
  }
  readOnlyGuard();
  if (args.action === 'save') {
    const given = args.name?.trim();
    const name =
      given !== undefined && given !== '' ? given : `Escenario ${String(list.length + 1)}`;
    document.dispatch(commands.saveScenario(document, blast.id, name), `IA: guardar ${name}`);
    return { saved: name, holes: blast.holes.length };
  }
  const s = findByName(list, args.name ?? '');
  if (!s)
    throw new ToolError(
      `No scenario "${args.name ?? ''}". Saved: ${list.map((x) => x.name).join(', ') || 'none'}.`,
    );
  if (args.action === 'delete') {
    document.dispatch(commands.removeScenario(document, s.id), `IA: borrar ${s.name}`);
    return { deleted: s.name };
  }
  document.dispatch(commands.loadScenario(document, blast.id, s.id), `IA: cargar ${s.name}`);
  return { loaded: s.name, holes: s.blast.holes.length };
}

/** Carga un escenario elegido en una tarjeta (sin pasar por el modelo). */
export function loadScenarioById(id: string): string | null {
  const blast = document.project.blasts[0];
  const s = document.project.scenarios?.find((x) => x.id === id);
  if (!blast || !s) return null;
  document.dispatch(commands.loadScenario(document, blast.id, s.id), `Cargar ${s.name}`);
  return s.name;
}

// ------------------------------------------------------------------ Presets (empresa o sitio)

const presetSchema = z.object({
  action: z.enum(['save', 'list', 'apply', 'delete']),
  name: z.string().optional().describe('Preset name (save: new; apply/delete: existing).'),
  scope: z
    .enum(['company', 'site'])
    .optional()
    .describe('save: for the whole company or only this site/mine (default site).'),
  description: z.string().optional(),
  perimeter: z.string().optional().describe('apply: perimeter to apply it on (default active).'),
});

function requireServer(): string {
  const id = serverProjectId();
  if (!id) throw new ToolError('Presets need a project opened from the server (accounts mode).');
  return id;
}

/** Pasos para guardar: lo que aplicó el asistente o, si no, la malla del perímetro activo. */
function stepsToSave(blast: Blast): PresetStep[] {
  const steps = recordedSteps();
  if (steps.length) return steps;
  const b = maybePerimeter(blast);
  const pattern = blast.patterns.find((p) => p.boundaryId === b?.id) ?? blast.patterns[0];
  if (!pattern) return [];
  return [
    {
      tool: 'generate_pattern',
      args: {
        kind: pattern.kind,
        burden: r(pattern.burden),
        spacing: r(pattern.spacing),
        diameter_mm: r(pattern.holeTemplate.diameter * 1000, 0),
        subdrill: r(pattern.holeTemplate.subdrill),
      },
    },
  ];
}

export async function applyPresetSteps(steps: readonly PresetStep[], perimeter?: string) {
  readOnlyGuard();
  const blast = blastOrFail();
  const b = resolvePerimeter(blast, perimeter);
  const done: { tool: string; ok: boolean; error?: string }[] = [];
  for (const s of steps) {
    const args: Record<string, unknown> = { ...s.args };
    if (
      [
        'generate_pattern',
        'design_presplit',
        'design_buffer',
        'set_tie_up',
        'set_electronic_timing',
      ].includes(s.tool)
    )
      args.perimeter = b.name;
    // El preset ya lo eligió el usuario: el amarre se aplica, no se vuelve a proponer, y la malla
    // reemplaza la del perímetro sin preguntar (el preset trae su propia carga y amarre).
    if (s.tool === 'set_tie_up' || s.tool === 'generate_pattern') args.confirmed = true;
    if (s.tool === 'set_charge') args.target = { ...(args.target as object), perimeter: b.name };
    const out = await runTool(s.tool, args);
    done.push(out.ok ? { tool: s.tool, ok: true } : { tool: s.tool, ok: false, error: out.error });
  }
  return { perimeter: b.name, steps: done };
}

async function presets(args: z.infer<typeof presetSchema>) {
  const projectId = requireServer();
  const list = await api.presets(projectId);
  if (args.action === 'list') {
    if (list.length)
      choiceCard(
        'presets',
        'Presets de diseño',
        'Elige uno para aplicarlo al polígono activo',
        list.map((p) => ({
          id: p.id,
          label: p.name,
          hint: p.mineName ? `sitio ${p.mineName}` : 'empresa',
        })),
      );
    return {
      presets: list.map((p) => ({
        name: p.name,
        scope: p.mineName ? `site ${p.mineName}` : 'company',
        description: p.description,
        steps: p.steps.map((s) => s.tool),
        by: p.createdBy,
      })),
      ...(list.length
        ? { note: 'A card with the list is on screen: the user can tap/point one or say its name.' }
        : { note: 'No presets yet. Offer to save the current design as one.' }),
    };
  }
  if (args.action === 'save') {
    readOnlyGuard();
    const blast = blastOrFail();
    const steps = stepsToSave(blast);
    if (!steps.length) throw new ToolError('Nothing to save yet: design a pattern first.');
    const mineId = useProjectSession.getState().current?.mine.id ?? null;
    const given = args.name?.trim();
    const name = given !== undefined && given !== '' ? given : `Preset ${String(list.length + 1)}`;
    const p = await api.createPreset(projectId, {
      name,
      description: args.description ?? null,
      mineId: args.scope === 'company' ? null : mineId,
      steps,
    });
    return {
      saved: p.name,
      scope: p.mineName ? `site ${p.mineName}` : 'company',
      steps: steps.map((s) => s.tool),
    };
  }
  const p = findByName(list, args.name ?? '');
  if (!p)
    throw new ToolError(
      `No preset "${args.name ?? ''}". Presets: ${list.map((x) => x.name).join(', ') || 'none'}.`,
    );
  if (args.action === 'delete') {
    readOnlyGuard();
    await api.deletePreset(p.id);
    return { deleted: p.name };
  }
  const res = await applyPresetSteps(p.steps, args.perimeter);
  return { applied: p.name, ...res };
}

/** Aplica un preset elegido en una tarjeta. */
export async function applyPresetById(id: string): Promise<string | null> {
  const projectId = serverProjectId();
  if (!projectId) return null;
  const p = (await api.presets(projectId)).find((x) => x.id === id);
  if (!p) return null;
  await applyPresetSteps(p.steps);
  return p.name;
}

// ------------------------------------------------------------------ Opciones para elegir

const choicesSchema = z.object({
  title: z.string().max(80),
  options: z.array(z.string().min(1).max(80)).min(2).max(8),
  subtitle: z.string().max(120).optional(),
});

/** Muestra una lista de opciones (web y visor) además de decirlas: el usuario toca una o la dice. */
function showChoices(args: z.infer<typeof choicesSchema>) {
  choiceCard(
    `ask:${args.title}`,
    args.title,
    args.subtitle ?? 'Toca una opción o dila',
    args.options.map((o, i) => ({ id: `o${String(i)}`, label: o })),
  );
  return { shown: args.options.length };
}

export const SCENE_TOOLS: Record<string, ToolDef> = {
  set_camera: {
    description:
      'Move the desktop camera (not VR) to what the user asks: the blast, a perimeter, a hole, a protected point, from the free face, from behind, an overview, in plan or 3D, from a direction, closer/farther (size_m). Smooth flight.',
    schema: cameraSchema,
    run: setCamera,
  },
  edit_perimeter: {
    description:
      'Rename, move, rotate a perimeter or move one of its vertices (P1, P2… as on the map). Never create a new perimeter to do this. Undoable.',
    schema: editPerimeterSchema,
    run: editPerimeter,
  },
  edit_protected_point: {
    description:
      'Delete (one or "all"), rename, move or change the PPV limit of protected points (PC1, PS2, communities, walls).',
    schema: pointSchema,
    run: editProtected,
  },
  scenarios: {
    description:
      'Project scenarios (full snapshots of this blast): save the current design with a name, list them (shows a card to pick), load one (replaces the design, undoable) or delete.',
    schema: scenarioSchema,
    run: scenarios,
  },
  presets: {
    description:
      'Design presets reusable across projects (company-wide or per site): save the current configuration (pattern, charge, tie-up, site conditions), list them (shows a card to pick), apply one by name on a perimeter (runs pattern → charge → timing), or delete. Use for "precarga la configuración anterior", "usa el preset…", "guárdalo como preset".',
    schema: presetSchema,
    run: presets,
  },
  show_choices: {
    description:
      'Show a short list of options on screen and in VR so the user can tap/point one (e.g. which explosive, which tie-up, which perimeter). Use it whenever you offer 2–8 alternatives; still say them briefly.',
    schema: choicesSchema,
    run: showChoices,
  },
};

export const SCENE_READ_ONLY = ['set_camera', 'show_choices'];
