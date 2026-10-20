import {
  localToWorld,
  nearestStation,
  sectionWorkings,
  stationOnAxis,
  workingAxisPoints,
  axisLength,
  type Project,
  type SectionSegment,
  type Vec3,
  type WorkingProfileSpec,
  type WorkingsData,
} from '@cronos/core';
import { t } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { loadedWorkings } from '../topography/session';
import type { FaceForm, RingForm } from './model';
import { defaultPlacements, frameOf, type Placement } from './send';
import { useUndergroundStore, type UndergroundTab, type WorkingLocation } from './store';

/**
 * «Dónde vas a trabajar»: el frente o el abanico se ubica sobre una labor real importada (o sobre
 * la galería de un diseño ya enviado) a una progresiva de su eje. De ahí salen el origen (centro
 * del piso), el azimut y la pendiente y, si la labor tiene perfil, su ancho y alto. «Ver de frente»
 * pone la cámara mirando el frente y se marca el contorno real de la labor en esa sección.
 */

/** Labor elegible para ubicar el diseño. */
export interface WorkingTarget {
  id: string;
  name: string;
  /** Levantamiento de origen (o «Diseño» para las galerías enviadas). */
  group: string;
  /** Eje al nivel del piso. */
  points: Vec3[];
  length: number;
  profile?: WorkingProfileSpec;
  /** Ancho y alto medidos en el sólido (el tipo de sección no se conoce). */
  estimated?: boolean;
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null;
}

const axesCache = new WeakMap<WorkingsData, Vec3[][]>();

function axesOf(w: WorkingsData): Vec3[][] {
  let axes = axesCache.get(w);
  if (!axes) {
    axes = w.axes.map((_, i) => workingAxisPoints(w, i));
    axesCache.set(w, axes);
  }
  return axes;
}

/** Galería de un diseño enviado: eje = centro de cada sección a la cota más baja; piel = secciones. */
function excavationTarget(
  id: string,
  name: string,
  sections: readonly (readonly Vec3[])[],
): WorkingTarget | null {
  const n = sections[0]?.length ?? 0;
  if (sections.length < 2 || n < 3 || sections.some((s) => s.length !== n)) return null;
  const points = sections.map((s) => {
    const c = s.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
    return { x: c.x / n, y: c.y / n, z: Math.min(...s.map((p) => p.z)) };
  });
  const vertices = sections.flatMap((s) => s.flatMap((p) => [p.x, p.y, p.z]));
  const triangles: number[] = [];
  for (let j = 0; j + 1 < sections.length; j++)
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      triangles.push(j * n + i, (j + 1) * n + i, (j + 1) * n + k);
      triangles.push(j * n + i, (j + 1) * n + k, j * n + k);
    }
  return {
    id,
    name,
    group: t('ug.loc.designed'),
    points,
    length: axisLength(points),
    mesh: { vertices, triangles },
  };
}

/** Labores cargadas (todas las de los levantamientos) y galerías de los diseños enviados. */
export function workingTargets(project: Project = session.document.project): WorkingTarget[] {
  const out: WorkingTarget[] = [];
  for (const { survey, workings } of loadedWorkings()) {
    const axes = axesOf(workings);
    workings.axes.forEach((meta, i) => {
      const points = axes[i] ?? [];
      if (points.length < 2) return;
      out.push({
        id: `${survey.id}:${String(i)}`,
        name: meta.name,
        group: survey.name,
        points,
        length: axisLength(points),
        ...(meta.profile ? { profile: meta.profile } : {}),
        ...(meta.estimated ? { estimated: true } : {}),
        mesh: { vertices: workings.vertices, triangles: workings.triangles },
      });
    });
  }
  project.blasts.forEach((b, bi) => {
    for (const e of b.excavations ?? []) {
      if (e.kind !== 'drive') continue;
      const name = e.tag === 'ug-ring' ? t('ug.loc.driveRing') : t('ug.loc.driveFace');
      const target = excavationTarget(`exc:${String(bi)}:${e.tag}`, name, e.sections);
      if (target) out.push(target);
    }
  });
  return out;
}

export function findTarget(id: string | undefined): WorkingTarget | undefined {
  return id ? workingTargets().find((x) => x.id === id) : undefined;
}

/** Ubicación (origen, azimut y pendiente) a la progresiva de la labor. */
export function placementOn(target: WorkingTarget, loc: WorkingLocation): Placement {
  const s = stationOnAxis(target.points, loc.station, loc.reverse);
  return {
    x: s.point.x,
    y: s.point.y,
    z: s.point.z,
    azimuthDeg: (s.azimuth * 180) / Math.PI,
    gradientPct: Math.tan(s.gradient) * 100,
  };
}

/** Sección de la labor en el formulario: perfil completo, o solo ancho y alto si se midieron. */
export function profilePatch(
  target: WorkingTarget,
  tab: UndergroundTab,
): Partial<FaceForm> | Partial<RingForm> | null {
  const p = target.profile;
  if (!p || !(p.width > 0) || !(p.height > 0)) return null;
  const width = Math.round(p.width * 100) / 100;
  const height = Math.round(p.height * 100) / 100;
  if (tab === 'ring') return { driveWidth: width, driveHeight: height };
  return target.estimated ? { width, height } : { profile: p.kind, width, height };
}

/**
 * Elige una labor y una progresiva para el diseño `tab`: mueve el origen y, si `withProfile`, toma
 * la sección de la labor.
 */
export function applyLocation(
  tab: UndergroundTab,
  target: WorkingTarget,
  loc: WorkingLocation,
  withProfile: boolean,
): Placement {
  const store = useUndergroundStore.getState();
  const station = Math.max(0, Math.min(target.length, loc.station));
  const next = { ...loc, station };
  store.setLocation(tab, next);
  const placement = placementOn(target, next);
  const all = store.placements ?? defaultPlacements(session.document.project);
  store.setPlacements({ ...all, [tab]: placement });
  if (withProfile) {
    const patch = profilePatch(target, tab);
    if (patch && tab === 'face') store.patchFace(patch);
    if (patch && tab === 'ring') store.patchRing(patch);
  }
  return placement;
}

/** Contorno real de la labor en el plano del frente: segmentos (u, v) y en coordenadas de obra. */
export function sectionOf(
  target: WorkingTarget,
  placement: Placement,
  radius: number,
): { uv: SectionSegment[]; world: Vec3[] } {
  if (!target.mesh) return { uv: [], world: [] };
  const frame = frameOf(placement);
  const uv = sectionWorkings(target.mesh.vertices, target.mesh.triangles, frame, radius);
  const world = uv.flatMap((s) => [localToWorld(frame, s.a), localToWorld(frame, s.b)]);
  return { uv, world };
}

/** Marca (o quita) el contorno de la sección en el visor. */
export function showSection(world: readonly Vec3[] | null): void {
  getEngine()?.setWorkingsSection(world && world.length > 0 ? world : null);
}

/**
 * Cámara mirando el frente de lleno: desde la galería, detrás del frente, perpendicular a él
 * (casi horizontal), con la sección completa en cuadro.
 */
export function viewFront(placement: Placement, width: number, height: number): void {
  const frame = frameOf(placement);
  const at = localToWorld(frame, { u: 0, v: height / 2 });
  useUiStore.getState().setViewMode('3d');
  getEngine()?.flyCamera({
    at,
    size: Math.max(width, height) * 1.5,
    yawDeg: (((placement.azimuthDeg + 180) % 360) + 360) % 360,
    pitchDeg: 4,
    mode: '3d',
  });
}

let cancelPick: (() => void) | null = null;

/**
 * Espera un clic en el visor sobre una labor (en 3D) o cerca de su eje (en planta) y ubica ahí el
 * diseño `tab`, en la labor más cercana al punto.
 */
export function pickLocation(tab: UndergroundTab, onDone?: () => void): void {
  const engine = getEngine();
  const ui = useUiStore.getState();
  if (!engine) return;
  cancelPick?.();
  ui.notify(t('ug.loc.pickHint'));
  cancelPick = engine.pickOnce((p) => {
    cancelPick = null;
    if (!p) {
      ui.notify(t('ug.loc.pickMiss'), 'error');
      onDone?.();
      return;
    }
    const plan = p.z === undefined;
    let best: { target: WorkingTarget; station: number; distance: number } | null = null;
    for (const target of workingTargets()) {
      const near = nearestStation(target.points, p, plan);
      // A igual distancia gana la labor real sobre la galería de un diseño enviado.
      const distance = near.distance + (target.id.startsWith('exc:') ? 0.5 : 0);
      if (!best || distance < best.distance) best = { target, station: near.station, distance };
    }
    // En planta, a más de 30 m de todo eje no se elige nada.
    if (!best || (plan && best.distance > 30)) {
      ui.notify(t('ug.loc.pickMiss'), 'error');
      onDone?.();
      return;
    }
    const prev = useUndergroundStore.getState().locations[tab];
    applyLocation(
      tab,
      best.target,
      {
        targetId: best.target.id,
        station: best.station,
        reverse: prev?.targetId === best.target.id ? prev.reverse : false,
      },
      prev?.targetId !== best.target.id,
    );
    ui.notify(
      t('ug.loc.picked', {
        name: best.target.name,
        station: best.station.toFixed(1),
      }),
    );
    onDone?.();
  });
}

export function cancelPickLocation(): void {
  cancelPick?.();
  cancelPick = null;
}
