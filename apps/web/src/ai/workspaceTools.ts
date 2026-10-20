import type { ProjectSummary } from '@cronos/api';
import {
  createEmptyProject,
  holeBoundary,
  newId,
  type Blast,
  type BlastBoundary,
  type Bounds3,
  type Project,
  type ProjectKind,
  type TopographySurvey,
} from '@cronos/core';
import { z } from 'zod';
import { APP_VERSION, getCompute, getEngine, session } from '../session';
import { api, useWorkspace } from '../server/api';
import { appNavigate } from '../server/deviceSync';
import { hasUnpublished, useProjectSession, type OpenProject } from '../server/projectSession';
import { uploadMissingAssets } from '../server/topographyAssets';
import { projectPath } from '../product/product';
import { useUiStore } from '../stores/uiStore';
import { benchOnSurveyOps, onTopographyChange, topographyTin } from '../topography/session';
import { pushCard } from './cards';
import { blastOrFail, findByName, r, readOnlyGuard, ToolError, type ToolDef } from './tools';

/**
 * El espacio de trabajo desde la conversación: qué minas, proyectos, topografías y perímetros hay,
 * abrir otro proyecto, usar una topografía de la mina, trabajar sobre un perímetro ya hecho (de
 * este proyecto o de otro de la mina) y publicar la versión. Así la demo va entera por voz, en la
 * web y en el visor (el proyecto que se abre en un dispositivo lo siguen los demás de la cuenta).
 */

const document = session.document;

function current(): OpenProject {
  const cur = useProjectSession.getState().current;
  if (!cur) throw new ToolError('No project is open from the server (accounts mode).');
  return cur;
}

function blastCenter(blast: Blast | undefined): { x: number; y: number } | null {
  const pts = blast?.boundaries.flatMap((b) => b.polygon) ?? [];
  if (!pts.length) return null;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/** Centro y tamaño de algo para la cámara del escritorio (en el visor se usa vr_view). */
function frame(at: { x: number; y: number }, size: number): string | null {
  const engine = getEngine();
  if (!engine) return null;
  if (engine.xrMode)
    return 'In VR: call vr_view (focus_blast or go_to) to bring it in front of the user.';
  engine.flyCamera({ at, size, mode: '3d', pitchDeg: 45 });
  return null;
}

function boundsFrame(b: Bounds3): string | null {
  return frame(
    { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1.05,
  );
}

function polyExtent(poly: readonly { x: number; y: number }[]): number {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function area(poly: readonly { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (p && q) a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

/** Lista con opciones para tocar (web y visor); al elegir, `designWatch` hace la acción. */
function listCard(
  kind: string,
  title: string,
  sub: string,
  items: { id: string; label: string }[],
): void {
  if (items.length === 0) return;
  pushCard({
    id: `ws-${kind}`,
    title,
    sub,
    metrics: [],
    bars: [],
    notes: [],
    choices: items.slice(0, 8),
    t0: performance.now(),
  });
}

// ------------------------------------------------------------------ Datos de la mina

async function mineProjects(mineId: string): Promise<ProjectSummary[]> {
  return (await api.projects(mineId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function mineSurveys(mineId: string): Promise<TopographySurvey[]> {
  return (await api.surveys(mineId)).map((s) => s.survey);
}

async function projectContent(projectId: string): Promise<Project> {
  const text = await api.versionContent(projectId, 'latest');
  const parsed = await getCompute().api.parseProject(text);
  if (!parsed.ok) throw new ToolError('That project could not be read.');
  return parsed.file.project;
}

function findMine(name?: string) {
  const mines = useWorkspace.getState().mines ?? [];
  if (name === undefined) return current().mine;
  const m = findByName(mines, name);
  if (!m)
    throw new ToolError(
      `No mine "${name}". Mines: ${mines.map((x) => x.name).join(', ') || 'none'}.`,
    );
  return m;
}

function findProject(list: readonly ProjectSummary[], name: string): ProjectSummary {
  const p = findByName(list, name);
  if (!p)
    throw new ToolError(
      `No project "${name}" in this mine. Projects: ${list.map((x) => x.name).join(', ') || 'none'}.`,
    );
  return p;
}

// ------------------------------------------------------------------ workspace

const workspaceSchema = z.object({
  show: z
    .enum(['all', 'mines', 'projects', 'topographies', 'perimeters'])
    .optional()
    .describe('What to list (default all). Also shows a card to pick from on screen and in VR.'),
  mine: z.string().optional().describe('Mine name (default the current one).'),
  other_projects: z
    .boolean()
    .optional()
    .describe('perimeters: also list the perimeters of the other projects of the mine.'),
});

async function workspace(args: z.infer<typeof workspaceSchema>) {
  const cur = current();
  const mine = findMine(args.mine);
  const show = args.show ?? 'all';
  const project = document.project;
  const blast = project.blasts[0];
  const out: Record<string, unknown> = {
    mine: mine.name,
    project: project.name,
    unpublished_changes: hasUnpublished(),
  };

  if (show === 'all' || show === 'mines') {
    const mines = useWorkspace.getState().mines ?? [];
    out.mines = mines.map((m) => ({ name: m.name, current: m.id === cur.mine.id }));
    if (show === 'mines')
      listCard(
        'mine',
        'Minas',
        'Toca una o dila',
        mines.map((m) => ({ id: m.id, label: m.name })),
      );
  }

  if (show === 'all' || show === 'projects') {
    const list = await mineProjects(mine.id);
    out.projects = list.map((p) => ({
      name: p.name,
      type: p.kind,
      current: p.id === cur.projectId,
      versions: p.versionCount,
      updated: p.updatedAt.slice(0, 10),
    }));
    if (show === 'projects')
      listCard(
        'project',
        `Proyectos · ${mine.name}`,
        'Toca uno para abrirlo o dilo',
        list.map((p) => ({
          id: p.id,
          label: p.kind === 'underground' ? `${p.name} · Underground` : p.name,
        })),
      );
  }

  if (show === 'all' || show === 'topographies') {
    const inProject = new Set(project.topography.map((s) => s.id as string));
    const fromMine = mine.id === cur.mine.id ? await mineSurveys(mine.id).catch(() => []) : [];
    const all = [...project.topography];
    for (const s of fromMine) if (!inProject.has(s.id)) all.push(s);
    all.sort((a, b) => b.surveyDate.localeCompare(a.surveyDate));
    out.topographies = all.map((s) => ({
      name: s.name,
      date: s.surveyDate,
      in_project: inProject.has(s.id),
      in_use: blast?.bench.topographyId === s.id,
      size_m: [r(s.bounds.maxX - s.bounds.minX, 0), r(s.bounds.maxY - s.bounds.minY, 0)],
      elevation_m: [r(s.bounds.minZ, 1), r(s.bounds.maxZ, 1)],
    }));
    if (show === 'topographies')
      listCard(
        'topo',
        'Topografías',
        'Toca una para trabajar sobre ella',
        all.map((s) => ({ id: s.id, label: `${s.name} · ${s.surveyDate}` })),
      );
  }

  if (show === 'all' || show === 'perimeters') {
    const activeId = useUiStore.getState().activeBoundaryId;
    out.perimeters = (blast?.boundaries ?? []).map((b) => ({
      name: b.name,
      active: b.id === activeId,
      area_m2: r(area(b.polygon), 0),
      free_face: b.freeFaceEdges.length > 0,
      holes: blast?.holes.filter((h) => holeBoundary(blast, h)?.id === b.id).length ?? 0,
    }));
    const choices = (blast?.boundaries ?? []).map((b) => ({ id: `here:${b.id}`, label: b.name }));
    if (args.other_projects) {
      const others = (await mineProjects(mine.id))
        .filter((p) => p.id !== cur.projectId)
        .slice(0, 12);
      const loaded = await Promise.all(
        others.map(async (p) => ({ p, project: await projectContent(p.id).catch(() => null) })),
      );
      out.other_projects_perimeters = loaded
        .filter((x) => x.project?.blasts[0]?.boundaries.length)
        .map(({ p, project: other }) => ({
          project: p.name,
          perimeters: (other?.blasts[0]?.boundaries ?? []).map((b) => {
            choices.push({ id: `copy:${p.id}:${b.id}`, label: `${b.name} (${p.name})` });
            return { name: b.name, area_m2: r(area(b.polygon), 0) };
          }),
        }));
    }
    if (show === 'perimeters')
      listCard('perim', 'Polígonos', 'Toca uno para trabajar en él', choices);
  }
  return out;
}

// ------------------------------------------------------------------ open_project

const openSchema = z.object({
  project: z.string().optional().describe('Project name (in the mine given or the current one).'),
  mine: z.string().optional().describe('Mine name, if it is another mine.'),
  create: z
    .string()
    .optional()
    .describe(
      'Create a new EMPTY project (no topography, polígono or holes; nothing is copied from the open one) with this name in the mine and open it.',
    ),
  type: z
    .enum(['surface', 'underground'])
    .optional()
    .describe(
      'Type of the project to create: "surface" = Cronos Open Pit (benches), "underground" = Cronos Underground (tunnel faces, stope rings). Default: the tool in use.',
    ),
  tool: z
    .enum(['surface', 'underground'])
    .optional()
    .describe(
      'Tool to open it from. Default: the tool in use, so a project of the other type opens VIEW-ONLY. To work on it ("trabajemos en el subterráneo", "llévame a Underground") pass the project\'s own type.',
    ),
  discard_unpublished: z
    .boolean()
    .optional()
    .describe(
      'Only after the user agreed: leave this project with unpublished changes (they stay as a local draft).',
    ),
});

/** Espera a que el editor termine de abrir el proyecto (máx. 30 s), en la herramienta pedida. */
function waitOpen(projectId: string, tool?: ProjectKind): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      off();
      resolve(ok);
    };
    const check = () => {
      const s = useProjectSession.getState();
      if (
        s.current?.projectId === projectId &&
        s.status === 'ready' &&
        (tool === undefined || s.current.tool === tool)
      )
        done(true);
      else if (s.status === 'error') done(false);
    };
    const timer = setTimeout(() => {
      done(false);
    }, 30_000);
    const off = useProjectSession.subscribe(check);
    check();
  });
}

export async function openProjectById(
  projectId: string,
  view?: { kind: ProjectKind; tool: ProjectKind },
): Promise<boolean> {
  const path = view ? projectPath(projectId, view.kind, view.tool) : `/projects/${projectId}`;
  if (!appNavigate(path)) return false;
  return waitOpen(projectId, view?.tool);
}

async function openProject(args: z.infer<typeof openSchema>) {
  const cur = current();
  const mine = findMine(args.mine);
  if (hasUnpublished() && !args.discard_unpublished)
    throw new ToolError(
      'This project has unpublished changes. Ask the user: publish them first (save_version) or leave them as a local draft (call again with discard_unpublished true).',
    );
  let target: { id: string; name: string; kind: ProjectKind };
  // Herramienta desde la que se abre: la que está en uso, salvo que se pida otra.
  const tool: ProjectKind = args.tool ?? cur.tool;
  if (args.create) {
    const kind: ProjectKind = args.type ?? args.tool ?? cur.tool;
    const project = createEmptyProject(args.create.trim(), new Date(), kind);
    if (mine.epsg) project.coordinateSystem = { ...project.coordinateSystem, epsg: mine.epsg };
    const json = await getCompute().api.serializeProject(project, { appVersion: APP_VERSION });
    const created = await api.createProjectFromText(
      mine.id,
      json,
      'Proyecto creado por el asistente',
    );
    target = { id: created.id, name: created.name, kind };
  } else {
    if (!args.project) throw new ToolError('Say which project (or create).');
    const p = findProject(await mineProjects(mine.id), args.project);
    target = { id: p.id, name: p.name, kind: p.kind };
  }
  // Un proyecto creado se abre en su herramienta (para trabajar en él).
  const viewTool = args.create ? target.kind : tool;
  if (target.id === cur.projectId && viewTool === cur.tool)
    return { opened: target.name, already_open: true };
  const ok = await openProjectById(target.id, { kind: target.kind, tool: viewTool });
  if (!ok) throw new ToolError(`Could not open "${target.name}".`);
  const project = document.project;
  const blast = project.blasts[0];
  const c = blastCenter(blast);
  const hint = c
    ? frame(c, polyExtent(blast?.boundaries.flatMap((b) => b.polygon) ?? []) * 1.3)
    : null;
  return {
    opened: target.name,
    mine: mine.name,
    created: Boolean(args.create),
    type: target.kind,
    tool: viewTool === 'underground' ? 'Cronos Underground' : 'Cronos Open Pit',
    ...(viewTool !== target.kind
      ? {
          view_only: `This is a ${target.kind} project opened from the ${viewTool} tool: the user can see it but not change it. To work on it, open_project again with tool "${target.kind}".`,
        }
      : {}),
    read_only: document.readOnly,
    topographies: project.topography.map((s) => ({
      name: s.name,
      date: s.surveyDate,
      in_use: blast?.bench.topographyId === s.id,
    })),
    perimeters: blast?.boundaries.map((b) => b.name) ?? [],
    holes: blast?.holes.length ?? 0,
    other_devices: 'Other sessions of this account follow to this project automatically.',
    ...(hint ? { note: hint } : {}),
    ...(args.create
      ? {
          next: 'New EMPTY project (nothing was copied from the previous one). Tell the user it is open and empty, then start with the topography: workspace show topographies and ask which one to use (use_topography). After that, the polígono.',
        }
      : {}),
  };
}

// ------------------------------------------------------------------ use_topography

const topoSchema = z.object({
  topography: z
    .string()
    .describe('Survey name (or date, e.g. "2026-09-15"), from this project or the mine.'),
  bench: z
    .boolean()
    .optional()
    .describe('Seat the bench and drape the holes on it (default true). false = only add/show it.'),
});

function waitTin(id: string, ms = 30_000): Promise<boolean> {
  if (topographyTin(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve(false);
    }, ms);
    const off = onTopographyChange(() => {
      if (!topographyTin(id)) return;
      clearTimeout(timer);
      off();
      resolve(true);
    });
  });
}

export async function applyTopographyById(
  id: string,
  bench = true,
): Promise<Record<string, unknown>> {
  readOnlyGuard();
  const blast = blastOrFail();
  let survey = document.project.topography.find((s) => s.id === id);
  let added = false;
  if (!survey) {
    const cur = current();
    survey = (await mineSurveys(cur.mine.id)).find((s) => s.id === id);
    if (!survey) throw new ToolError('That topography is not in this mine.');
    document.dispatch(
      [{ type: 'project/patch', patch: { topography: [...document.project.topography, survey] } }],
      `Traer ${survey.name}`,
    );
    added = true;
  }
  const loaded = await waitTin(survey.id);
  // Una topografía que no cubre la voladura no se le pone debajo: los taladros quedarían en el
  // aire y se perdería el terreno que sí tenían. Se agrega al proyecto y se avisa.
  const pts = [...blast.boundaries.flatMap((b) => b.polygon), ...blast.holes.map((h) => h.collar)];
  const b = survey.bounds;
  const apart =
    pts.length > 0 &&
    !pts.some((p) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY);
  if (apart) {
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const bc = blastCenter(blast) ?? pts[0] ?? c;
    const km = Math.hypot(c.x - bc.x, c.y - bc.y) / 1000;
    const inVr = Boolean(getEngine()?.xrMode);
    const hint = inVr ? null : boundsFrame(b);
    return {
      topography: survey.name,
      date: survey.surveyDate,
      brought_from_mine: added,
      terrain_loaded: loaded,
      in_use: false,
      covers_blast: false,
      distance_from_blast_km: r(km, 1),
      center: { x: r(c.x, 0), y: r(c.y, 0) },
      next: `This topography does not cover the current blast (it is ${r(km, 1).toString()} km away), so the blast keeps its terrain. Tell the user plainly. Offer: go see it (${inVr ? 'vr_view go_to target xy with this center' : 'shown now'}), or design there: open_project create a new project and use_topography + create_perimeter at this center.`,
      ...(hint ? { note: hint } : {}),
    };
  }
  let result: Record<string, unknown> = {};
  if (bench) {
    const now = blastOrFail();
    const rb = await benchOnSurveyOps(now, survey, topographyTin(survey.id));
    document.dispatch(rb.ops, `Usar ${survey.name}`);
    result = {
      bench_floor_m: rb.floor !== null ? r(rb.floor, 2) : null,
      holes_draped: rb.draped,
      holes_outside: rb.outside,
    };
  }
  const hint = blast.boundaries.length
    ? frame(
        blastCenter(document.project.blasts[0]) ?? { x: 0, y: 0 },
        polyExtent(blast.boundaries.flatMap((b) => b.polygon)) * 2,
      )
    : boundsFrame(survey.bounds);
  return {
    topography: survey.name,
    date: survey.surveyDate,
    brought_from_mine: added,
    terrain_loaded: loaded,
    in_use: bench,
    extent: {
      x: [r(survey.bounds.minX, 0), r(survey.bounds.maxX, 0)],
      y: [r(survey.bounds.minY, 0), r(survey.bounds.maxY, 0)],
      z: [r(survey.bounds.minZ, 1), r(survey.bounds.maxZ, 1)],
    },
    center: {
      x: r((survey.bounds.minX + survey.bounds.maxX) / 2, 0),
      y: r((survey.bounds.minY + survey.bounds.maxY) / 2, 0),
    },
    ...result,
    ...(blast.boundaries.length === 0
      ? {
          next: 'No perimeter yet: create_perimeter near the center (it is drawn on this terrain) or use_perimeter from another project.',
        }
      : {}),
    ...(hint ? { note: hint } : {}),
  };
}

async function useTopography(args: z.infer<typeof topoSchema>) {
  const cur = current();
  const inProject = document.project.topography;
  const ids = new Set(inProject.map((s) => s.id as string));
  const all = [
    ...inProject,
    ...(await mineSurveys(cur.mine.id).catch(() => [])).filter((s) => !ids.has(s.id)),
  ];
  const key = args.topography.trim();
  const survey = all.find((s) => s.surveyDate === key) ?? findByName(all, key);
  if (!survey)
    throw new ToolError(
      `No topography "${key}". Available: ${all.map((s) => `${s.name} (${s.surveyDate})`).join('; ') || 'none'}.`,
    );
  return applyTopographyById(survey.id, args.bench ?? true);
}

// ------------------------------------------------------------------ use_perimeter

const perimSchema = z.object({
  perimeter: z.string().describe('Perimeter name.'),
  from_project: z
    .string()
    .optional()
    .describe('Copy it from this other project of the mine (it is added to this blast).'),
});

function activate(b: BlastBoundary): string | null {
  useUiStore.getState().setActiveBoundary(b.id);
  const xs = b.polygon;
  const c = {
    x: xs.reduce((s, p) => s + p.x, 0) / xs.length,
    y: xs.reduce((s, p) => s + p.y, 0) / xs.length,
  };
  return frame(c, polyExtent(xs) * 1.4);
}

function uniqueName(blast: Blast, name: string): string {
  const used = new Set(blast.boundaries.map((b) => b.name.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++)
    if (!used.has(`${name} (${String(i)})`.toLowerCase())) return `${name} (${String(i)})`;
}

export async function copyPerimeter(
  projectId: string,
  boundaryId: string,
): Promise<Record<string, unknown>> {
  readOnlyGuard();
  const blast = blastOrFail();
  const other = await projectContent(projectId);
  const src = other.blasts[0]?.boundaries.find((b) => b.id === boundaryId);
  if (!src) throw new ToolError('That perimeter no longer exists.');
  const copy: BlastBoundary = {
    ...structuredClone(src),
    id: newId<'Boundary'>(),
    name: uniqueName(blast, src.name),
  };
  document.dispatch(
    [
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { boundaries: [...blast.boundaries, copy] },
      },
    ],
    `Traer polígono ${copy.name}`,
  );
  const hint = activate(copy);
  // La topografía que usaba ese proyecto, por si conviene traerla también.
  const srcSurvey = other.topography.find((s) => s.id === other.blasts[0]?.bench.topographyId);
  const here = new Set(document.project.topography.map((s) => s.id as string));
  return {
    perimeter: copy.name,
    copied_from: other.name,
    active: true,
    area_m2: r(area(copy.polygon), 0),
    free_face_edges: copy.freeFaceEdges.length,
    ...(srcSurvey && blast.bench.topographyId !== srcSurvey.id
      ? {
          source_topography: srcSurvey.name,
          suggestion: here.has(srcSurvey.id)
            ? `It was designed on "${srcSurvey.name}" (already in this project): offer use_topography.`
            : `It was designed on "${srcSurvey.name}": offer use_topography to bring it.`,
        }
      : {}),
    ...(hint ? { note: hint } : {}),
  };
}

async function usePerimeter(args: z.infer<typeof perimSchema>) {
  if (args.from_project) {
    const cur = current();
    const list = await mineProjects(cur.mine.id);
    const p = findProject(list, args.from_project);
    const other = await projectContent(p.id);
    const bs = other.blasts[0]?.boundaries ?? [];
    const b = findByName(bs, args.perimeter);
    if (!b)
      throw new ToolError(
        `No perimeter "${args.perimeter}" in ${p.name}. It has: ${bs.map((x) => x.name).join(', ') || 'none'}.`,
      );
    return copyPerimeter(p.id, b.id);
  }
  const blast = blastOrFail();
  const b = findByName(blast.boundaries, args.perimeter);
  if (!b)
    throw new ToolError(
      `No perimeter "${args.perimeter}" here. Perimeters: ${blast.boundaries.map((x) => x.name).join(', ') || 'none'}. For another project use from_project.`,
    );
  const hint = activate(b);
  return {
    perimeter: b.name,
    active: true,
    area_m2: r(area(b.polygon), 0),
    free_face_edges: b.freeFaceEdges.length,
    holes: blast.holes.filter((h) => holeBoundary(blast, h)?.id === b.id).length,
    ...(hint ? { note: hint } : {}),
  };
}

// ------------------------------------------------------------------ save_version

const saveSchema = z.object({
  message: z.string().min(1).max(200).describe('Short description of what changed (Spanish).'),
});

async function saveVersion(args: z.infer<typeof saveSchema>) {
  const cur = current();
  if (cur.viewingOld || document.readOnly) throw new ToolError('This version is read-only.');
  if (!hasUnpublished()) return { published: false, reason: 'No changes since the last version.' };
  const project = document.project;
  await uploadMissingAssets(cur.mine.id, project);
  const text = await getCompute().api.serializeProject(project, { appVersion: APP_VERSION });
  try {
    const version = await api.publishVersionFromText(
      cur.projectId,
      cur.base.id,
      args.message,
      text,
    );
    useProjectSession.getState().published(version, project);
    useUiStore.getState().notify(`Versión ${String(version.number)} publicada.`);
    return { published: true, version: version.number };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'version_conflict')
      throw new ToolError(
        'Someone published a newer version meanwhile: the user must publish from the Publish button to resolve it.',
      );
    throw err;
  }
}

export const WORKSPACE_TOOLS: Record<string, ToolDef> = {
  workspace: {
    description:
      'What the user has: mines, projects of the mine, topographies (of this project and the ones loaded in the mine) and perimeters (of this blast, optionally of the other projects). Use for "¿qué topografías tengo?", "¿qué proyectos hay?", "¿qué perímetros hay?"; it also shows a card to pick from (tap or say).',
    schema: workspaceSchema,
    run: workspace,
  },
  open_project: {
    description:
      "Open another project of the mine (or of another mine), or create a new empty one (type surface = Cronos Open Pit, underground = Cronos Underground) and open it. A project of the other type opens view-only from the tool in use unless tool is its own type. The view, voice and VR session stay; the user's other devices follow. Ask before leaving unpublished changes.",
    schema: openSchema,
    run: openProject,
  },
  use_topography: {
    description:
      'Work on a topography: brings it from the mine if it is not in the project, seats the bench on it and drapes the holes (one undo each), and frames it. "Trabajemos sobre la topografía de septiembre".',
    schema: topoSchema,
    run: useTopography,
  },
  use_perimeter: {
    description:
      'Work on an existing perimeter: make one of this blast active and frame it, or copy one from another project of the mine (from_project) into this blast. Prefer this over create_perimeter when the user mentions a perimeter that already exists.',
    schema: perimSchema,
    run: usePerimeter,
  },
  save_version: {
    description:
      'Publish the current design as a new version of the project on the server ("guárdalo", "publica la versión"). Changes are only on this device and shared live until published.',
    schema: saveSchema,
    run: saveVersion,
  },
};

export const WORKSPACE_READ_ONLY = ['workspace'];
