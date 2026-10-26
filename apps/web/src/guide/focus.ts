import { projectKind, type Blast, type Hole, type Vec3 } from '@cronos/core';
import { resolveHole } from '../ai/holeResolution';
import { t } from '../i18n';
import { getEngine, session } from '../session';
import { topographyElevation } from '../topography/session';
import { workingTargets } from '../underground/location';
import { FACE_TAG, RING_TAG, taggedHoles } from '../underground/send';
import { fold } from './targets';
import { useGuideStore, type WorldAnchor } from './store';

/**
 * «Muéstrame el tajeo 2 / el frente / el taladro 14 / la comunidad»: la cámara vuela hasta el
 * objeto, lo resalta si se puede y la burbuja de la guía queda pegada a él en la escena.
 */

export type FocusKind = 'hole' | 'perimeter' | 'working' | 'point' | 'face' | 'rings';

export class FocusError extends Error {}

const byName = <T extends { name: string }>(list: readonly T[], name: string): T | undefined => {
  const want = fold(name);
  return (
    list.find((x) => fold(x.name) === want) ??
    list.find((x) => fold(x.name).includes(want) || want.includes(fold(x.name)))
  );
};

function groundZ(blast: Blast | undefined, x: number, y: number): number {
  if (!blast) return 0;
  const top = blast.bench.floorElevation + blast.bench.height;
  return blast.bench.topographyId
    ? (topographyElevation(x, y, blast.bench.topographyId) ?? top)
    : top;
}

function boxOf(points: readonly Vec3[]): { at: Vec3; size: number } {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  return {
    at: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    size: Math.max(12, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 1.3),
  };
}

function nearest(points: readonly Vec3[], to: Vec3): Vec3 | undefined {
  let best: Vec3 | undefined;
  let d = Infinity;
  for (const p of points) {
    const dd = (p.x - to.x) ** 2 + (p.y - to.y) ** 2 + (p.z - to.z) ** 2;
    if (dd < d) {
      d = dd;
      best = p;
    }
  }
  return best;
}

const holesBox = (holes: readonly Hole[]) => boxOf(holes.flatMap((h) => [h.collar, h.collar]));

/** Resuelve el objeto, mueve la cámara y devuelve dónde quedó (para anclar la burbuja). */
export function focusObject(kind: FocusKind, name = ''): WorldAnchor {
  const engine = getEngine();
  if (!engine) throw new FocusError('No view available.');
  const project = session.document.project;
  const blast = project.blasts[0];
  const ug = projectKind(project) === 'underground';
  let anchor: WorldAnchor;
  switch (kind) {
    case 'hole': {
      if (!blast?.holes.length) throw new FocusError('There are no holes yet.');
      const hole = resolveHole(blast.holes, name).hole;
      session.selection.set([hole.id]);
      anchor = { at: hole.collar, size: 25, name: t('guide.focus.hole', { name: hole.label }) };
      break;
    }
    case 'perimeter': {
      const list = blast?.boundaries ?? [];
      const b = name ? byName(list, name) : list[0];
      if (!b)
        throw new FocusError(
          `No perimeter "${name}". Perimeters: ${list.map((x) => x.name).join(', ') || 'none'}.`,
        );
      const pts = b.polygon.map((p) => ({ ...p, z: groundZ(blast, p.x, p.y) }));
      const box = boxOf(pts);
      anchor = { at: box.at, size: box.size, name: t('guide.focus.perimeter', { name: b.name }) };
      break;
    }
    case 'working': {
      const list = workingTargets();
      const w = byName(list, name);
      if (!w)
        throw new FocusError(
          list.length
            ? `No working "${name}". Workings: ${list.map((x) => x.name).join(', ')}.`
            : 'No underground workings are loaded (Importar → Labores subterráneas).',
        );
      const box = boxOf(w.points);
      // El anillo va sobre la labor (el centro de una rampa en espiral queda en el aire).
      const on = nearest(w.points, box.at) ?? box.at;
      anchor = { at: on, size: box.size, name: t('guide.focus.working', { name: w.name }) };
      break;
    }
    case 'point': {
      const list = project.monitoringPoints ?? [];
      const p = byName(list, name);
      if (!p)
        throw new FocusError(
          `No point "${name}". Points: ${list.map((x) => x.name).join(', ') || 'none'}.`,
        );
      anchor = {
        at: p.position,
        size: 60,
        name: t('guide.focus.point', { name: p.name }),
      };
      break;
    }
    case 'face':
    case 'rings': {
      const holes = taggedHoles(blast, kind === 'face' ? FACE_TAG : RING_TAG);
      if (!holes.length)
        throw new FocusError(
          kind === 'face'
            ? 'There is no tunnel face in 3D yet (Subterránea → Frente → Llevar al diseño 3D).'
            : 'There are no rings in 3D yet (Subterránea → Abanicos → Llevar al diseño 3D).',
        );
      session.selection.set(holes.map((h) => h.id));
      const box = holesBox(holes);
      anchor = { ...box, name: t(kind === 'face' ? 'guide.focus.face' : 'guide.focus.rings') };
      break;
    }
  }
  // Bajo tierra y para labores, siempre en 3D; en superficie, la vista en uso.
  const mode = ug || kind === 'working' || kind === 'face' || kind === 'rings' ? '3d' : undefined;
  engine.flyCamera({
    at: anchor.at,
    size: anchor.size ?? 30,
    ...(mode ? { mode } : {}),
    ...(kind === 'hole' ? { pitchDeg: 30 } : {}),
  });
  return anchor;
}

/** Enfoca y deja la burbuja de la guía pegada al objeto con `text`. */
export function showObject(kind: FocusKind, name: string, text: string): WorldAnchor {
  const anchor = focusObject(kind, name);
  useGuideStore
    .getState()
    .start([{ world: anchor, ...(anchor.name ? { title: anchor.name } : {}), text }], {
      source: 'focus',
    });
  return anchor;
}
