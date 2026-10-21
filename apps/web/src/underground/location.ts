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
  type WorkingDip,
  type WorkingKind,
  workingKinds,
  workingTriangleOwners,
  stopeRingSetup,
  WORKING_KINDS,
} from '@cronos/core';
import { t } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { loadedWorkings, surveyWorkingDips } from '../topography/session';
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
  /** Tipo de labor importada (galería, tajeo…); falta en las galerías de un diseño. */
  kind?: WorkingKind;
  /** Buzamiento medido en el sólido (tajeos importados). */
  dip?: WorkingDip;
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> } | null;
}

/**
 * Orden de los tipos en la lista de labores: para los abanicos (métodos de tajeo) primero los
 * tajeos; para el frente de avance, las labores de desarrollo y los tajeos al final.
 */
export function kindOrder(tab: UndergroundTab): WorkingKind[] {
  const rest = WORKING_KINDS.filter((k) => k !== 'stope');
  return tab === 'ring' ? ['stope', ...rest] : [...rest, 'stope'];
}

/** Labores agrupadas por tipo (en el orden de `kindOrder`) y, al final, las de los diseños. */
export function groupTargets(
  targets: readonly WorkingTarget[],
  tab: UndergroundTab,
): { kind: WorkingKind | null; targets: WorkingTarget[] }[] {
  const out: { kind: WorkingKind | null; targets: WorkingTarget[] }[] = [];
  for (const kind of kindOrder(tab)) {
    const list = targets.filter((x) => x.kind === kind);
    if (list.length > 0) out.push({ kind, targets: list });
  }
  const designed = targets.filter((x) => !x.kind);
  if (designed.length > 0) out.push({ kind: null, targets: designed });
  return out;
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
    const kinds = workingKinds(workings, survey.workingKinds);
    const dips = surveyWorkingDips(survey.id);
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
        kind: kinds[i] ?? 'other',
        ...(dips[i] ? { dip: dips[i] } : {}),
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
  // La sección medida en un tajeo es la del tajeo, no la de la galería de perforación.
  if (tab === 'ring' && target.kind === 'stope') return null;
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
  // Abanicos en un tajeo importado: desde la galería de perforación junto a él, no sobre el eje
  // del sólido (que baja con el buzamiento), y con el ancho y el alto del sólido.
  if (tab === 'ring' && target.kind === 'stope' && withProfile) {
    const fromStope = placeRingsInStope(target);
    if (fromStope) return fromStope;
  }
  // Abanico en un tajeo inclinado (o en la galería bajo él): su buzamiento aparente en el plano
  // del anillo.
  if (tab === 'ring') {
    const dip = target.dip ?? nearestStopeDip(placement);
    if (dip) store.patchRing(stopeLeanFor(dip, placement.azimuthDeg));
  }
  return placement;
}

const ownersCache = new WeakMap<WorkingsData, Int32Array>();

/** Labores importadas de las que salen los abanicos de un tajeo (sin los diseños enviados). */
function importedTargets(): WorkingTarget[] {
  return workingTargets().filter((x) => x.kind !== undefined);
}

/**
 * Abanicos en el tajeo `target`: busca la galería de perforación más cercana (ventana, galería,
 * crucero) y ubica ahí los anillos centrados en el tajeo; toma el ancho, el alto y el corrimiento
 * del tajeo cortando el sólido en el plano del anillo. Sin galería cerca, los anillos van en la base
 * del tajeo con pendiente 0 (coordenadas a mano) y se avisa. Devuelve null si no es un sólido.
 */
function placeRingsInStope(target: WorkingTarget): Placement | null {
  const [surveyId, index] = target.id.split(':');
  const entry = loadedWorkings().find((x) => x.survey.id === surveyId);
  if (!entry || index === undefined) return null;
  const w = entry.workings;
  let owners = ownersCache.get(w);
  if (!owners) {
    owners = workingTriangleOwners(w);
    ownersCache.set(w, owners);
  }
  const axisIndex = Number(index);
  const stopeTriangles: number[] = [];
  owners.forEach((o, t) => {
    if (o === axisIndex) stopeTriangles.push(t);
  });
  if (stopeTriangles.length === 0) return null;
  const store = useUndergroundStore.getState();
  const form = store.ring;
  const drives = importedTargets().filter((x) => x.id !== target.id);
  const setup = stopeRingSetup(
    { points: target.points, vertices: w.vertices, triangles: w.triangles, stopeTriangles },
    drives.map((d) => ({ points: d.points, kind: d.kind ?? 'other' })),
    { rings: form.rings, burden: form.burden },
  );
  const placement: Placement = {
    x: setup.origin.x,
    y: setup.origin.y,
    z: setup.origin.z,
    azimuthDeg: (setup.azimuth * 180) / Math.PI,
    gradientPct: Math.tan(setup.gradient) * 100,
  };
  const drive = setup.driveIndex !== null ? drives[setup.driveIndex] : undefined;
  store.setLocation(
    'ring',
    drive
      ? { targetId: drive.id, station: setup.station, reverse: false, stopeId: target.id }
      : null,
  );
  const all = store.placements ?? defaultPlacements(session.document.project);
  store.setPlacements({ ...all, ring: placement });
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const sec = setup.section;
  if (sec)
    store.patchRing({
      stopeWidth: r1(sec.width),
      stopeOffset: r1(sec.offset),
      stopeBottom: r1(sec.bottom),
      stopeTop: r1(sec.top),
    });
  if (target.dip) store.patchRing(stopeLeanFor(target.dip, placement.azimuthDeg));
  const ui = useUiStore.getState();
  const size = sec ? { w: r1(sec.width).toFixed(1), h: r1(sec.top - sec.bottom).toFixed(1) } : null;
  if (drive)
    ui.notify(
      t('ug.loc.stopeDrive', {
        stope: target.name,
        drive: drive.name,
        size: size ? t('ug.loc.stopeSize', size) : '',
      }),
    );
  else ui.notify(t('ug.loc.stopeNoDrive', { stope: target.name }), 'error');
  return placement;
}

/** Distancia de un punto a una polilínea 3D. */
function distanceToAxis(p: Vec3, axis: readonly Vec3[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < axis.length; i++) {
    const a = axis[i];
    const b = axis[i + 1];
    if (!a || !b) continue;
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const l2 = d.x * d.x + d.y * d.y + d.z * d.z;
    const t =
      l2 > 0
        ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / l2))
        : 0;
    best = Math.min(
      best,
      Math.hypot(a.x + t * d.x - p.x, a.y + t * d.y - p.y, a.z + t * d.z - p.z),
    );
  }
  return best;
}

/** Buzamiento del tajeo importado más cercano al punto (a menos de 40 m de su eje), si hay. */
function nearestStopeDip(p: Vec3): WorkingDip | undefined {
  let best: { d: number; dip: WorkingDip } | null = null;
  for (const x of workingTargets()) {
    if (x.kind !== 'stope' || !x.dip) continue;
    const d = distanceToAxis(p, x.points);
    if (d <= 40 && (!best || d < best.d)) best = { d, dip: x.dip };
  }
  return best?.dip;
}

/**
 * Buzamiento aparente de un tajeo en el plano de un anillo de azimut `azimuthDeg` (el plano lo
 * forman la vertical y la derecha del avance) y hacia qué lado se corre el techo.
 */
export function stopeLeanFor(
  dip: WorkingDip,
  azimuthDeg: number,
): Pick<RingForm, 'stopeDip' | 'stopeLeanSide'> {
  const a = (azimuthDeg * Math.PI) / 180;
  // El techo se corre hacia arriba del buzamiento: −(dirección de buzamiento) · derecha.
  const across = -(Math.sin(dip.dipAzimuth) * Math.cos(a) - Math.cos(dip.dipAzimuth) * Math.sin(a));
  // Casi paralelo al rumbo, las paredes laterales del anillo son las cabeceras: verticales.
  if (!(Math.abs(across) > 0.3) || dip.dip > Math.PI / 2 - 1e-3)
    return { stopeDip: Math.PI / 2, stopeLeanSide: 'right' };
  // Buzamiento aparente en un corte vertical: tan(aparente) = tan(real) · cos(ángulo al buzamiento).
  return {
    stopeDip: Math.max(20 * (Math.PI / 180), Math.atan(Math.tan(dip.dip) * Math.abs(across))),
    stopeLeanSide: across > 0 ? 'right' : 'left',
  };
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
