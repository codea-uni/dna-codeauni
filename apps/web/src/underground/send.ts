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
  type UndergroundExcavation,
  type UndergroundProducts,
  type UV,
  type Vec3,
} from '@cronos/core';
import { t } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import {
  pickExplosive,
  pickFaceExplosive,
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

/** Separación por defecto entre el frente y los abanicos, perpendicular al avance [m]. */
const RING_SIDE_OFFSET = 60;

/**
 * Ubicaciones por defecto: el frente en `defaultOrigin` con avance al norte y los abanicos a
 * 60 m al este, para que los dos diseños no se encimen.
 */
export function defaultPlacements(project: Project): Record<'face' | 'ring', Placement> {
  const o = defaultOrigin(project);
  const face = { x: o.x, y: o.y, z: o.z, azimuthDeg: 0, gradientPct: 0 };
  return { face, ring: { ...face, x: o.x + RING_SIDE_OFFSET } };
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

const COLORS: Record<UndergroundExcavation['kind'], number> = {
  drive: 0x8fa3b8,
  round: 0x5b7aff,
  stope: 0xffae00,
};

let shown: readonly UndergroundExcavation[] = [];

/**
 * Pasa al motor las excavaciones de la voladura cuyos taladros sigan existiendo (deshacer o borrar
 * los taladros las oculta). Solo reconstruye si cambió lo que se ve.
 */
export function syncTunnels(force = false): void {
  const engine = getEngine();
  if (!engine) return;
  const visible: UndergroundExcavation[] = [];
  for (const b of document.project.blasts) {
    const tags = new Set(b.holes.flatMap((h) => h.tags ?? []));
    for (const e of b.excavations ?? []) if (tags.has(e.tag)) visible.push(e);
  }
  if (!force && visible.length === shown.length && visible.every((e, i) => e === shown[i])) return;
  shown = visible;
  engine.setTunnels(
    visible.map((e, i) => ({
      id: `${e.tag}-${e.kind}-${String(i)}`,
      sections: e.sections,
      color: COLORS[e.kind],
      surface: e.kind === 'drive',
      // El frente es la primera sección del avance de la ronda.
      ...(e.kind === 'round' ? { highlight: 0 } : {}),
    })),
  );
}

/** Mantiene el contexto 3D al día con el documento (cargar, deshacer, borrar). */
export function startTunnelSync(): () => void {
  syncTunnels(true);
  return document.subscribe(() => {
    syncTunnels();
  });
}

/** Op que reemplaza las excavaciones de `tag` en la voladura. */
function excavationOp(blast: Blast, tag: string, items: UndergroundExcavation[]): Op {
  return {
    type: 'blast/patch',
    blastId: blast.id,
    patch: { excavations: [...(blast.excavations ?? []).filter((e) => e.tag !== tag), ...items] },
  };
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

/** Envía la ronda del frente; devuelve los taladros creados (0 si no se pudo). */
export function sendFace(form: FaceForm, face: FaceComputation, placement: Placement): number {
  const blast = guard();
  if (!blast) return 0;
  const explosive = pickFaceExplosive(document.project.library, form);
  const prod = explosive
    ? products(document.project, explosive.id, form.contourExplosiveId ?? explosive.id)
    : null;
  if (!prod) {
    useUiStore.getState().notify(t('ug.noExplosive'), 'error');
    return 0;
  }
  const frame = frameOf(placement);
  const holes = faceRoundToHoles({
    design: face.design,
    frame,
    products: prod.products,
    delayInterval: form.delayInterval,
    tag: FACE_TAG,
  });
  const profile: ExcavationProfile = face.profile;
  const behind = 3 * face.design.kpis.advance;
  document.dispatch(
    [
      ...replaceOps(blast, FACE_TAG, holes, prod.electronic),
      excavationOp(blast, FACE_TAG, [
        { tag: FACE_TAG, kind: 'drive', sections: extrude(frame, profile.points, -behind, 0) },
        {
          tag: FACE_TAG,
          kind: 'round',
          sections: extrude(frame, profile.points, 0, face.design.depth),
        },
      ]),
    ],
    t('ug.undo.face', { n: holes.length }),
  );
  done(holes.length, prod.hasDetonator);
  const size = Math.max(profile.width, profile.height) * 2.6 + behind / 2;
  fly(frame, { u: 0, v: profile.height / 2 }, face.design.depth / 2, size, placement.azimuthDeg);
  return holes.length;
}

/** Envía los anillos; devuelve los taladros creados (0 si no se pudo). */
export function sendRings(form: RingForm, ring: RingComputation, placement: Placement): number {
  const blast = guard();
  if (!blast) return 0;
  const prod = products(document.project, form.explosiveId);
  if (!prod) {
    useUiStore.getState().notify(t('ug.noExplosive'), 'error');
    return 0;
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
  const length = (form.rings - 1) * form.burden;
  const pad = 3;
  document.dispatch(
    [
      ...replaceOps(blast, RING_TAG, holes, prod.electronic),
      excavationOp(blast, RING_TAG, [
        {
          tag: RING_TAG,
          kind: 'drive',
          sections: extrude(frame, ring.drive.points, -pad, length + pad),
        },
        {
          tag: RING_TAG,
          kind: 'stope',
          sections: extrude(frame, ring.boundary, -pad / 2, length + pad / 2),
        },
      ]),
    ],
    t('ug.undo.rings', { n: holes.length }),
  );
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
  return holes.length;
}
