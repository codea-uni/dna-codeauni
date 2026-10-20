import {
  commands,
  faceRoundToHoles,
  localToWorld,
  newId,
  offsetFrame,
  planeFrame,
  replicateRings,
  ringsToHoles,
  type Blast,
  type ExcavationProfile,
  type Hole,
  type HoleId,
  type InitiationPlan,
  type Op,
  type PlaneFrame,
  type Project,
  type UndergroundProducts,
  type UV,
  type Vec3,
} from '@cronos/core';
import type { TunnelView } from '@cronos/engine';
import { t } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import {
  pickExplosive,
  type FaceComputation,
  type FaceForm,
  type RingComputation,
  type RingForm,
} from './model';

/**
 * Paso del diseño subterráneo al documento: taladros en la voladura activa en UN dispatch
 * (deshacible), tiempos de salida con detonadores de fondo y, como contexto en 3D, la galería
 * excavada y el tajeo (capa del motor; no es parte del documento).
 */

const { document } = session;

export const FACE_TAG = 'ug-face';
export const RING_TAG = 'ug-ring';

/** Ubicación del frente: centro del piso [m], azimut de avance [°] y pendiente [%]. */
export interface Placement {
  x: number;
  y: number;
  z: number;
  azimuthDeg: number;
  gradientPct: number;
}

/**
 * Origen por defecto: el centro del levantamiento 3D (nube o bloques; cota = su mínimo), si no el
 * centroide de los taladros de la voladura activa y si no el origen del proyecto.
 */
export function defaultOrigin(project: Project): Vec3 {
  const survey = project.topography.find((s) => (s.assets.cloud ?? s.assets.blocks) !== undefined);
  if (survey) {
    const b = survey.bounds;
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: b.minZ };
  }
  const holes = project.blasts[0]?.holes ?? [];
  if (holes.length > 0) {
    const s = holes.reduce(
      (acc, h) => ({ x: acc.x + h.collar.x, y: acc.y + h.collar.y, z: acc.z + h.collar.z }),
      { x: 0, y: 0, z: 0 },
    );
    return { x: s.x / holes.length, y: s.y / holes.length, z: s.z / holes.length };
  }
  return { ...project.coordinateSystem.origin };
}

/** Taladros ya enviados con la marca `tag`: el envío los reemplaza. */
export function taggedHoles(blast: Blast | undefined, tag: string): Hole[] {
  return blast?.holes.filter((h) => h.tags?.includes(tag)) ?? [];
}

export function frameOf(p: Placement): PlaneFrame {
  return planeFrame({
    origin: { x: p.x, y: p.y, z: p.z },
    azimuth: (p.azimuthDeg * Math.PI) / 180,
    gradient: Math.atan(p.gradientPct / 100),
  });
}

function products(project: Project, explosiveId: string | null, contourId?: string | null) {
  const lib = project.library;
  const explosive = pickExplosive(lib, explosiveId);
  if (!explosive) return null;
  const detonator =
    lib.detonators.find((d) => d.type === 'electronic') ??
    lib.detonators.find((d) => d.type === 'nonel');
  const primer = [...lib.primers].sort((a, b) => a.mass - b.mass)[0];
  const out: UndergroundProducts = { explosive };
  if (contourId !== undefined) {
    const contour = pickExplosive(lib, contourId);
    if (contour) out.contourExplosive = contour;
  }
  const stemming = lib.stemmingMaterials[0];
  if (stemming) out.stemmingMaterialId = stemming.id;
  if (detonator) out.detonatorId = detonator.id;
  if (primer) out.primerId = primer.id;
  return { products: out, electronic: detonator?.type === 'electronic', hasDetonator: !!detonator };
}

function guard(): Blast | null {
  const notify = useUiStore.getState().notify;
  if (document.readOnly) {
    notify(t('ug.readOnly'), 'error');
    return null;
  }
  const blast = document.project.blasts[0];
  if (!blast) {
    notify(t('ug.noBlast'), 'error');
    return null;
  }
  return blast;
}

/**
 * Ops que reemplazan los taladros `tag` por `holes` y dejan los tiempos listos: con detonador
 * electrónico (como `set_electronic_timing`) cada taladro sale a t0 + su tiempo programado y no
 * hace falta red de superficie; con nonel de fondo, un punto de inicio a t = 0 en cada taladro.
 */
function replaceOps(blast: Blast, tag: string, holes: Hole[], electronic: boolean): Op[] {
  const old = taggedHoles(blast, tag);
  const removed = new Set<string>(old.map((h) => h.id));
  const touches = (ref: { kind: string; holeId?: HoleId }) =>
    ref.kind === 'hole' && ref.holeId !== undefined && removed.has(ref.holeId);
  const plan = blast.initiation;
  const connections = plan.connections.filter((c) => !touches(c.from) && !touches(c.to));
  const initiationPoints = plan.initiationPoints.filter((p) => !touches(p.at));
  if (!electronic)
    for (const h of holes)
      if (h.initiators.length > 0)
        initiationPoints.push({
          id: newId<'InitiationPoint'>(),
          at: { kind: 'hole', holeId: h.id },
          time: 0,
        });
  const next: InitiationPlan = {
    ...plan,
    system: electronic ? (connections.length === 0 ? 'electronic' : 'mixed') : plan.system,
    connections,
    initiationPoints,
  };
  return [
    ...(old.length > 0
      ? [{ type: 'holes/remove' as const, blastId: blast.id, ids: old.map((h) => h.id) }]
      : []),
    ...commands.addHoles(blast.id, holes),
    ...commands.setInitiation(blast.id, next),
  ];
}

// ------------------------------------------------------------------ Contexto 3D

const FACE_COLOR = 0x8fa3b8;
const ROUND_COLOR = 0x5b7aff;
const STOPE_COLOR = 0xffae00;

interface TunnelContext {
  holeIds: ReadonlySet<string>;
  views: TunnelView[];
}
const contexts = new Map<string, TunnelContext>();
let subscribed = false;

/** Muestra el contexto de un envío solo mientras sus taladros existan (deshacer lo oculta). */
function syncTunnels(): void {
  const engine = getEngine();
  if (!engine) return;
  const present = new Set<string>(document.project.blasts.flatMap((b) => b.holes.map((h) => h.id)));
  const views: TunnelView[] = [];
  for (const ctx of contexts.values())
    if ([...ctx.holeIds].some((id) => present.has(id))) views.push(...ctx.views);
  engine.setTunnels(views);
}

function setContext(tag: string, holes: Hole[], views: TunnelView[]): void {
  contexts.set(tag, { holeIds: new Set(holes.map((h) => h.id)), views });
  if (!subscribed) {
    subscribed = true;
    document.subscribe(syncTunnels);
  }
  syncTunnels();
}

/** Secciones del perfil cada ~1 m entre `from` y `to` a lo largo del eje. */
function extrude(frame: PlaneFrame, points: readonly UV[], from: number, to: number): Vec3[][] {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / 1));
  return Array.from({ length: n + 1 }, (_, i) => {
    const along = from + ((to - from) * i) / n;
    return points.map((p) => localToWorld(frame, p, along));
  });
}

function fly(frame: PlaneFrame, center: UV, along: number, size: number, azimuthDeg: number) {
  const at = localToWorld(frame, center, along);
  useUiStore.getState().setViewMode('3d');
  getEngine()?.flyCamera({
    at,
    size,
    // Desde atrás del frente (en la galería), un poco de lado para ver la profundidad.
    yawDeg: (((azimuthDeg + 180 + 35) % 360) + 360) % 360,
    pitchDeg: 22,
    mode: '3d',
  });
}

function done(n: number, hasDetonator: boolean) {
  const notify = useUiStore.getState().notify;
  notify(t('ug.sent', { n }));
  if (!hasDetonator) notify(t('ug.noDetonator'), 'error');
}

// ------------------------------------------------------------------ Envíos

export function sendFace(form: FaceForm, face: FaceComputation, placement: Placement): void {
  const blast = guard();
  if (!blast) return;
  const prod = products(document.project, form.explosiveId, form.contourExplosiveId);
  if (!prod) {
    useUiStore.getState().notify(t('ug.noExplosive'), 'error');
    return;
  }
  const frame = frameOf(placement);
  const holes = faceRoundToHoles({
    design: face.design,
    frame,
    products: prod.products,
    delayInterval: form.delayInterval,
    tag: FACE_TAG,
  });
  document.dispatch(
    replaceOps(blast, FACE_TAG, holes, prod.electronic),
    t('ug.undo.face', { n: holes.length }),
  );
  const profile: ExcavationProfile = face.profile;
  const behind = 3 * face.design.kpis.advance;
  setContext(FACE_TAG, holes, [
    {
      id: 'face-drive',
      sections: extrude(frame, profile.points, -behind, 0),
      color: FACE_COLOR,
      surface: true,
      highlight: 0,
    },
    {
      id: 'face-round',
      sections: extrude(frame, profile.points, 0, face.design.depth),
      color: ROUND_COLOR,
    },
  ]);
  done(holes.length, prod.hasDetonator);
  const size = Math.max(profile.width, profile.height) * 2.6 + behind / 2;
  fly(frame, { u: 0, v: profile.height / 2 }, face.design.depth / 2, size, placement.azimuthDeg);
}

export function sendRings(form: RingForm, ring: RingComputation, placement: Placement): void {
  const blast = guard();
  if (!blast) return;
  const prod = products(document.project, form.explosiveId);
  if (!prod) {
    useUiStore.getState().notify(t('ug.noExplosive'), 'error');
    return;
  }
  const frame = frameOf(placement);
  const placements = replicateRings(form.rings, form.burden, { ringInterval: form.ringInterval });
  const holes = ringsToHoles({
    ring: ring.ring,
    frame,
    placements,
    products: prod.products,
    tag: RING_TAG,
  });
  document.dispatch(
    replaceOps(blast, RING_TAG, holes, prod.electronic),
    t('ug.undo.rings', { n: holes.length }),
  );
  const length = (form.rings - 1) * form.burden;
  const pad = 3;
  setContext(RING_TAG, holes, [
    {
      id: 'ring-drive',
      sections: extrude(frame, ring.drive.points, -pad, length + pad),
      color: FACE_COLOR,
      surface: true,
    },
    {
      id: 'ring-stope',
      sections: extrude(frame, ring.boundary, -pad / 2, length + pad / 2),
      color: STOPE_COLOR,
    },
  ]);
  done(holes.length, prod.hasDetonator);
  const height = form.stopeTop - form.stopeBottom;
  const mid = offsetFrame(frame, length / 2);
  fly(
    mid,
    { u: form.stopeOffset, v: (form.stopeTop + form.stopeBottom) / 2 },
    0,
    Math.max(form.stopeWidth, height, length) * 1.4,
    placement.azimuthDeg,
  );
}
