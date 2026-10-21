import type { MinePoint, ProjectSummary } from '@cronos/api';
import { permissions } from '@cronos/api';
import {
  holeToe,
  type MonitoringPoint,
  type Project,
  type SeismographRecord,
  type UndergroundExcavation,
  type Vec3,
} from '@cronos/core';
import type { ContextLine, TunnelView } from '@cronos/engine';
import { create } from 'zustand';
import { api, serverMode } from '../server/api';
import { useProjectSession } from '../server/projectSession';
import { getCompute, getEngine, session } from '../session';
import { workingTargets } from '../underground/location';
import { setExtraTunnels } from '../underground/send';
import { excavationLabel } from '../underground/shots';

/**
 * Vibración de la mina (modo servidor): puntos de control compartidos entre sus proyectos,
 * mediciones de sismógrafo (calibración de la ley) y, como contexto 3D de solo lectura, las
 * labores, taladros y perímetros de otros proyectos de la misma mina (superficial ↔ subterránea).
 */

/** Labor (excavación) con nombre, de este proyecto o de otro de la mina. */
export interface NamedWorking {
  name: string;
  kind: UndergroundExcavation['kind'];
  sections: Vec3[][];
  /** Proyecto de la mina del que viene (null = este proyecto). */
  projectName: string | null;
  /** Marca del diseño subterráneo (`ug-face`…): el asistente también la acepta como nombre. */
  alias?: string;
}

interface ContextProject {
  name: string;
  status: 'loading' | 'ready' | 'error';
  workings: NamedWorking[];
  lines: ContextLine[];
  holes: number;
}

interface MineVibrationState {
  mineId: string | null;
  canEdit: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  points: MinePoint[];
  records: SeismographRecord[];
  /** Otros proyectos de la mina (para mostrar sus labores y diseños). */
  projects: ProjectSummary[];
  /** Proyectos de la mina mostrados como contexto 3D. */
  context: Record<string, ContextProject>;
  /** Sumar los puntos de la mina al cálculo de vibración de este proyecto. */
  useMinePoints: boolean;
  error: string | null;
  set: (patch: Partial<MineVibrationState>) => void;
}

export const useMineVibration = create<MineVibrationState>((set) => ({
  mineId: null,
  canEdit: false,
  status: 'idle',
  points: [],
  records: [],
  projects: [],
  context: {},
  useMinePoints: true,
  error: null,
  set: (patch) => {
    set(patch);
  },
}));

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Carga lo de la mina del proyecto abierto. */
export async function loadMineVibration(mineId: string): Promise<void> {
  const st = useMineVibration.getState();
  st.set({ mineId, status: 'loading', error: null });
  try {
    const [points, records, projects] = await Promise.all([
      api.minePoints(mineId),
      api.vibrationRecords(mineId),
      api.projects(mineId),
    ]);
    if (useMineVibration.getState().mineId !== mineId) return;
    const current = useProjectSession.getState().current?.projectId;
    useMineVibration.getState().set({
      status: 'ready',
      points,
      records,
      projects: projects.filter((p) => p.id !== current),
    });
  } catch (err) {
    if (useMineVibration.getState().mineId === mineId)
      useMineVibration.getState().set({ status: 'error', error: errorText(err) });
  }
}

/** Puntos de la mina que entran al cálculo (si está activado). */
export function minePointsForCalc(): MonitoringPoint[] {
  const s = useMineVibration.getState();
  return s.useMinePoints ? s.points.map((p) => p.point) : [];
}

function mineIdOrThrow(): string {
  const id = useMineVibration.getState().mineId;
  if (!id) throw new Error('Abre un proyecto de una mina del servidor.');
  return id;
}

/** Comparte (o actualiza) un punto del proyecto con la mina. */
export async function sharePoint(point: MonitoringPoint): Promise<void> {
  const mineId = mineIdOrThrow();
  const saved = await api.saveMinePoint(mineId, {
    point,
    sourceProjectId: useProjectSession.getState().current?.projectId ?? null,
  });
  const s = useMineVibration.getState();
  s.set({ points: [...s.points.filter((p) => p.point.id !== point.id), saved] });
}

export async function unsharePoint(id: string): Promise<void> {
  const mineId = mineIdOrThrow();
  await api.deleteMinePoint(mineId, id);
  const s = useMineVibration.getState();
  s.set({ points: s.points.filter((p) => p.point.id !== id) });
}

/** Guarda mediciones (nuevas o editadas) en la mina. */
export async function saveRecords(records: SeismographRecord[]): Promise<void> {
  const mineId = mineIdOrThrow();
  const all = await api.saveVibrationRecords(mineId, records);
  useMineVibration.getState().set({ records: all });
}

export async function deleteRecord(id: string): Promise<void> {
  const mineId = mineIdOrThrow();
  await api.deleteVibrationRecord(mineId, id);
  const s = useMineVibration.getState();
  s.set({ records: s.records.filter((r) => r.id !== id) });
}

// ------------------------------------------------------------------ Contexto 3D

const CONTEXT_TUNNEL = 0xc77dff;
const CONTEXT_HOLES = 0x9aa0a6;
const CONTEXT_BOUNDARY = 0xf4a259;

/** Labores, taladros (boca → fondo) y perímetros de un proyecto, como contexto de solo lectura. */
export function contextOf(project: Project, projectName: string): Omit<ContextProject, 'status'> {
  const workings: NamedWorking[] = [];
  const lines: ContextLine[] = [];
  let holes = 0;
  for (const b of project.blasts) {
    (b.excavations ?? []).forEach((e, i) => {
      workings.push({
        name: `${projectName} · ${e.tag}${i > 0 ? ` ${String(i + 1)}` : ''}`,
        kind: e.kind,
        sections: e.sections,
        projectName,
      });
    });
    for (const h of b.holes) {
      lines.push({ points: [h.collar, holeToe(h)], color: CONTEXT_HOLES });
      holes++;
    }
    for (const bd of b.boundaries) {
      const top = (bd.floorElevation ?? b.bench.floorElevation) + b.bench.height;
      lines.push({
        points: bd.polygon.map((p) => ({ x: p.x, y: p.y, z: top })),
        color: CONTEXT_BOUNDARY,
        closed: true,
      });
    }
  }
  return { name: projectName, workings, lines, holes };
}

function applyContext(): void {
  const ctx = Object.values(useMineVibration.getState().context).filter(
    (c) => c.status === 'ready',
  );
  const tunnels: TunnelView[] = ctx.flatMap((c) =>
    c.workings.map((w, i) => ({
      id: `ctx-${c.name}-${String(i)}`,
      sections: w.sections,
      color: CONTEXT_TUNNEL,
      surface: w.kind === 'drive',
      label: w.name,
    })),
  );
  setExtraTunnels(tunnels);
  getEngine()?.setContextLines(ctx.flatMap((c) => c.lines));
}

/** Muestra u oculta como contexto 3D las labores y el diseño de otro proyecto de la mina. */
export async function toggleContextProject(projectId: string, show: boolean): Promise<void> {
  const s = useMineVibration.getState();
  if (!show) {
    const next = Object.fromEntries(Object.entries(s.context).filter(([id]) => id !== projectId));
    s.set({ context: next });
    applyContext();
    return;
  }
  const name = s.projects.find((p) => p.id === projectId)?.name ?? projectId;
  s.set({
    context: {
      ...s.context,
      [projectId]: { name, status: 'loading', workings: [], lines: [], holes: 0 },
    },
  });
  try {
    const text = await api.versionContent(projectId, 'latest');
    const parsed = await getCompute().api.parseProject(text);
    if (!parsed.ok) throw new Error('No se pudo leer el proyecto');
    const data = contextOf(parsed.file.project, name);
    const cur = useMineVibration.getState();
    if (!cur.context[projectId]) return;
    cur.set({ context: { ...cur.context, [projectId]: { ...data, status: 'ready' } } });
    applyContext();
  } catch {
    const cur = useMineVibration.getState();
    const prev = cur.context[projectId];
    if (prev) cur.set({ context: { ...cur.context, [projectId]: { ...prev, status: 'error' } } });
  }
}

/** Labores con nombre: las de este proyecto y las de los proyectos de la mina mostrados. */
export function namedWorkings(): NamedWorking[] {
  const own: NamedWorking[] = [];
  for (const b of session.document.project.blasts)
    (b.excavations ?? []).forEach((e, i) => {
      own.push({
        name: e.tag.startsWith('ug-')
          ? excavationLabel(e.tag, e.kind)
          : `${e.tag} ${String(i + 1)}`,
        kind: e.kind,
        sections: e.sections,
        projectName: null,
        alias: e.tag,
      });
    });
  // Labores importadas (DXF/Surpac): el punto va al centro de su eje, al nivel del piso.
  const imported: NamedWorking[] = workingTargets()
    .filter((w) => !w.id.startsWith('exc:'))
    .map((w) => ({
      name: `${w.group} · ${w.name}`,
      kind: 'drive',
      sections: [w.points],
      projectName: null,
    }));
  const ctx = Object.values(useMineVibration.getState().context).flatMap((c) => c.workings);
  return [...own, ...imported, ...ctx];
}

/**
 * Mantiene la vibración de la mina al día con el proyecto abierto y pasa al motor los puntos de la
 * mina. Sin servidor no hace nada.
 */
export function startMineVibrationSync(): () => void {
  if (!serverMode) return () => undefined;
  let projectId: string | null = null;
  const sync = () => {
    const cur = useProjectSession.getState().current;
    const mineId = cur?.mine.id ?? null;
    const s = useMineVibration.getState();
    const canEdit = cur ? permissions.editDesign(cur.role) : false;
    if (canEdit !== s.canEdit) s.set({ canEdit });
    if (mineId === s.mineId && (cur?.projectId ?? null) === projectId) return;
    projectId = cur?.projectId ?? null;
    s.set({ mineId, points: [], records: [], projects: [], context: {}, status: 'idle' });
    applyContext();
    if (mineId) void loadMineVibration(mineId);
  };
  sync();
  const offSession = useProjectSession.subscribe(sync);
  const offPoints = useMineVibration.subscribe((st, prev) => {
    if (st.points !== prev.points || st.useMinePoints !== prev.useMinePoints)
      getEngine()?.setExtraMonitoringPoints(minePointsForCalc());
  });
  return () => {
    offSession();
    offPoints();
  };
}
