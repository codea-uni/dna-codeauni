import {
  moveBelowGround,
  moveCentroidTo,
  movePoint,
  WORKING_KINDS,
  type SurveyMove,
  type TopographySurvey,
  type WorkingKind,
} from '@cronos/core';
import { z } from 'zod';
import { session } from '../session';
import {
  isTopographyLoaded,
  loadedParts,
  surveyElevation,
  surveyWorkingKinds,
  topographyTin,
} from '../topography/session';
import {
  cloudToSurveySurface,
  exportSurveyDxf,
  frameMove,
  moveSurvey,
  setWorkingKinds,
  surveyCentroid,
} from '../topography/surveyEdit';
import { findByName, r, readOnlyGuard, ToolError, type ToolDef } from './tools';

/**
 * Herramientas del asistente sobre los levantamientos de la mina: mover/girar uno (p. ej. «baja
 * las labores 250 m bajo la topografía», «mueve la nube 100 m al este»), marcar el tipo de una
 * labor («la labor TJ-3 es un tajeo»), convertir una nube en superficie y exportar a DXF. Usan las
 * mismas funciones que el panel Topografía (todo se deshace con Ctrl+Z).
 */

const { document } = session;

/** Levantamiento por nombre; sin nombre, el único que cumple `fits` (o el más reciente). */
function surveyByName(
  name: string | undefined,
  fits: (s: TopographySurvey) => boolean,
  what: string,
): TopographySurvey {
  const all = document.project.topography.filter((s) => isTopographyLoaded(s.id));
  const candidates = all.filter(fits);
  if (name) {
    const found = findByName(all, name);
    if (!found)
      throw new ToolError(
        `No survey named "${name}". Loaded surveys: ${all.map((s) => s.name).join(', ') || 'none'}.`,
      );
    return found;
  }
  const latest = [...candidates].sort((a, b) => b.surveyDate.localeCompare(a.surveyDate))[0];
  if (!latest) throw new ToolError(`There is no loaded ${what} in the project.`);
  return latest;
}

const isWorkings = (s: TopographySurvey) => !!s.assets.workings;
const isGround = (s: TopographySurvey) => !!s.assets.tin;

/** Vértice del TIN más cercano en planta a (x, y). */
function nearestTinXY(surveyId: string, x: number, y: number): { x: number; y: number } | null {
  const tin = topographyTin(surveyId);
  if (!tin) return null;
  let best: { x: number; y: number } | null = null;
  let d0 = Infinity;
  for (let i = 0; i + 2 < tin.vertices.length; i += 3) {
    const vx = tin.vertices[i] ?? 0;
    const vy = tin.vertices[i + 1] ?? 0;
    const d = (vx - x) ** 2 + (vy - y) ** 2;
    if (d < d0) {
      d0 = d;
      best = { x: vx, y: vy };
    }
  }
  return best;
}

const moveSchema = z.object({
  survey: z
    .string()
    .optional()
    .describe(
      'Survey to move (name). Default: the most recent underground workings survey (or, if none, the most recent non-topography survey).',
    ),
  dx: z.number().optional().describe('Translation East [m] (e.g. 100 = 100 m to the east).'),
  dy: z.number().optional().describe('Translation North [m].'),
  dz: z.number().optional().describe('Translation in elevation [m] (negative = down).'),
  to_x: z.number().optional().describe('Move the centroid to this East [m] (instead of dx/dy/dz).'),
  to_y: z.number().optional().describe('Centroid target North [m].'),
  to_z: z.number().optional().describe('Centroid target elevation [m].'),
  below_topography_m: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Put the centroid this many metres below the ground of a topography (TIN) survey: «bájalas 250 m bajo la topografía» → 250.',
    ),
  topography: z
    .string()
    .optional()
    .describe(
      'Topography (TIN) survey for below_topography_m. Default: the one the blast uses or the most recent.',
    ),
  center_on_topography: z
    .boolean()
    .optional()
    .describe(
      'With below_topography_m: also move the centroid in plan to the centre of the topography (needed when the workings are not under it). Default: only if the centroid is outside the topography.',
    ),
  rotation_deg: z
    .number()
    .min(-360)
    .max(360)
    .optional()
    .describe('Rotation in plan about the centroid [°], clockwise like an azimuth.'),
});

async function moveSurveyTool(args: z.infer<typeof moveSchema>) {
  readOnlyGuard();
  const survey = surveyByName(
    args.survey,
    (s) => isWorkings(s) || (!isGround(s) && !!(s.assets.cloud ?? s.assets.blocks)),
    'workings, cloud or block model survey',
  );
  const centroid = surveyCentroid(survey.id);
  if (!centroid) throw new ToolError(`The data of "${survey.name}" is not loaded in this browser.`);
  const rotation = args.rotation_deg ?? 0;
  const pivot = { x: centroid.x, y: centroid.y };
  let move: SurveyMove | null;
  let ground: TopographySurvey | null = null;
  if (args.below_topography_m !== undefined) {
    const preferred = document.project.blasts[0]?.bench.topographyId;
    ground = args.topography
      ? surveyByName(args.topography, isGround, 'topography')
      : (document.project.topography.find(
          (s) => s.id === preferred && isGround(s) && s.id !== survey.id,
        ) ?? surveyByName(undefined, (s) => isGround(s) && s.id !== survey.id, 'topography (TIN)'));
    if (!ground.assets.tin) throw new ToolError(`"${ground.name}" has no surface (TIN).`);
    const g = ground;
    const inside = surveyElevation(g.id, centroid.x, centroid.y) !== null;
    let at: { x: number; y: number } | undefined;
    if (args.center_on_topography ?? !inside) {
      const cx = (g.bounds.minX + g.bounds.maxX) / 2;
      const cy = (g.bounds.minY + g.bounds.maxY) / 2;
      at =
        surveyElevation(g.id, cx, cy) !== null
          ? { x: cx, y: cy }
          : (nearestTinXY(g.id, cx, cy) ?? undefined);
    }
    move = moveBelowGround(
      centroid,
      args.below_topography_m,
      (x, y) => surveyElevation(g.id, x, y),
      {
        ...(at ? { at } : {}),
        rotationDeg: rotation,
      },
    );
    if (!move) throw new ToolError(`The target point is outside "${g.name}".`);
  } else if (args.to_x !== undefined || args.to_y !== undefined || args.to_z !== undefined) {
    move = moveCentroidTo(
      centroid,
      { x: args.to_x ?? centroid.x, y: args.to_y ?? centroid.y, z: args.to_z ?? centroid.z },
      rotation,
    );
  } else {
    move = { dx: args.dx ?? 0, dy: args.dy ?? 0, dz: args.dz ?? 0, rotationDeg: rotation, pivot };
  }
  const after = movePoint(centroid, move);
  const next = await moveSurvey(survey, move);
  if (!next) throw new ToolError('The survey could not be moved.');
  frameMove(survey, centroid, after);
  const groundZ = ground ? surveyElevation(ground.id, after.x, after.y) : null;
  return {
    moved: survey.name,
    new_survey: next.name,
    centroid_before: { x: r(centroid.x), y: r(centroid.y), z: r(centroid.z) },
    centroid_after: { x: r(after.x), y: r(after.y), z: r(after.z) },
    offset: { dx: r(move.dx), dy: r(move.dy), dz: r(move.dz) },
    rotation_deg: r(move.rotationDeg),
    ...(groundZ !== null ? { ground_above_m: r(groundZ), depth_m: r(groundZ - after.z) } : {}),
    undo: 'Ctrl+Z (or undo) restores the original position.',
  };
}

const kindSchema = z.object({
  survey: z.string().optional().describe('Workings survey (name). Default: the most recent one.'),
  workings: z
    .array(z.string())
    .min(1)
    .describe('Names of the workings (as in list_workings), e.g. ["TJ-3", "GAL 420"].'),
  kind: z
    .enum(WORKING_KINDS as [WorkingKind, ...WorkingKind[]])
    .describe(
      'drift = galería, crosscut = crucero, ramp = rampa, bypass = by-pass, raise = chimenea, stope = tajeo (where explosive is loaded to extract ore), access = acceso, other = otro.',
    ),
});

function setWorkingKindTool(args: z.infer<typeof kindSchema>) {
  readOnlyGuard();
  const survey = surveyByName(args.survey, isWorkings, 'workings survey');
  const w = loadedParts(survey.id)?.workings;
  if (!w) throw new ToolError(`The workings of "${survey.name}" are not loaded.`);
  const list = w.axes.map((a, i) => ({ id: String(i), name: a.name }));
  const changes = new Map<number, WorkingKind>();
  const missing: string[] = [];
  for (const name of args.workings) {
    const found = findByName(list, name);
    if (found) changes.set(Number(found.id), args.kind);
    else missing.push(name);
  }
  if (changes.size === 0)
    throw new ToolError(
      `No working matches ${missing.join(', ')}. Workings: ${list
        .slice(0, 40)
        .map((x) => x.name)
        .join(', ')}.`,
    );
  setWorkingKinds(survey, changes);
  const kinds = surveyWorkingKinds(survey.id);
  return {
    survey: survey.name,
    changed: [...changes.keys()].map((i) => w.axes[i]?.name),
    kind: args.kind,
    ...(missing.length > 0 ? { not_found: missing } : {}),
    stopes: kinds.filter((k) => k === 'stope').length,
  };
}

const surfaceSchema = z.object({
  survey: z
    .string()
    .optional()
    .describe('Point cloud survey (name). Default: the most recent cloud.'),
  cell_m: z.number().min(0.1).max(50).optional().describe('Grid cell size [m] (default 2).'),
  mode: z
    .enum(['min', 'mean', 'max'])
    .optional()
    .describe('Elevation of each cell: min = bare ground without vegetation (default), mean, max.'),
  trim: z
    .enum(['mask', 'convex'])
    .optional()
    .describe('mask = only where there are points (default); convex = convex hull.'),
});

async function cloudToSurfaceTool(args: z.infer<typeof surfaceSchema>) {
  readOnlyGuard();
  const survey = surveyByName(args.survey, (s) => !!s.assets.cloud, 'point cloud');
  if (!survey.assets.cloud) throw new ToolError(`"${survey.name}" is not a point cloud.`);
  const res = await cloudToSurveySurface(survey, {
    cell: args.cell_m ?? 2,
    mode: args.mode ?? 'min',
    trim: args.trim ?? 'mask',
  });
  if (!res) throw new ToolError('The cloud did not produce a surface.');
  return {
    new_topography: res.survey.name,
    triangles: res.survey.stats.triangles,
    cell_m: r(res.cell, 2),
    relief: { min: r(res.survey.bounds.minZ, 1), max: r(res.survey.bounds.maxZ, 1) },
    ...(res.overhangRatio > 0.75
      ? {
          warning:
            'Many cells have points at several heights (tunnel, overhang or tall vegetation): a 2.5D surface does not represent a tunnel.',
        }
      : {}),
    next: 'It works as any topography: use_topography to put the blast on it; it also gives the ground for surface vibration.',
  };
}

const dxfSchema = z.object({
  survey: z.string().describe('Survey to export (topography TIN or underground workings).'),
});

async function exportDxfTool(args: z.infer<typeof dxfSchema>) {
  const survey = surveyByName(args.survey, (s) => isGround(s) || isWorkings(s), 'survey');
  if (!survey.assets.tin && !survey.assets.workings)
    throw new ToolError(`"${survey.name}" has no surface or workings to export.`);
  await exportSurveyDxf(survey);
  return { exported: survey.name, format: 'DXF R12, 3DFACE, absolute coordinates' };
}

export const SURVEY_TOOLS: Record<string, ToolDef> = {
  move_survey: {
    description:
      'Move a survey of the mine (underground workings, point cloud, block model or topography) by a vector, to a centroid target, or below the topography, with an optional rotation in plan about its centroid. Creates a moved copy (undoable) that every view and calculation uses. For «baja las labores 250 m bajo la topografía», «mueve el levantamiento X 100 m al este y 80 m abajo», «gíralo 15°».',
    schema: moveSchema,
    run: moveSurveyTool,
  },
  set_working_kind: {
    description:
      'Set the type of imported underground workings (galería, crucero, rampa, by-pass, chimenea, tajeo, acceso). Stopes are highlighted in 3D and offered first for rings. For «marca la labor N como tajeo», «TJ-1 y TJ-2 son tajeos».',
    schema: kindSchema,
    run: setWorkingKindTool,
  },
  cloud_to_surface: {
    description:
      'Convert a point cloud into a topography surface (TIN) by gridding (min elevation = bare ground) and triangulating; it becomes a new topography survey. For «convierte la nube en superficie / triangulación».',
    schema: surfaceSchema,
    run: cloudToSurfaceTool,
  },
  export_survey_dxf: {
    description:
      'Download a topography (TIN) or the underground workings as DXF (3DFACE, absolute coordinates; one layer per working with its type).',
    schema: dxfSchema,
    run: exportDxfTool,
  },
};

export const SURVEY_READ_ONLY = ['export_survey_dxf'];
