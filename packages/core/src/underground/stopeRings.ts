import type { Meters, Radians, Vec3, WorkingKind } from '../model/types';
import { planeFrame } from './transform';
import { axisLength, nearestStation, sectionWorkings, stationOnAxis } from './workings';

/**
 * Abanicos en un tajeo importado (A9, prueba de usabilidad): el eje que se estima de un sólido de
 * tajeo sigue su dimensión mayor, que en un tajeo inclinado baja con el buzamiento (p. ej. «Az 90°,
 * pendiente −143 %»). Los anillos no se perforan a lo largo de ese eje sino desde una galería o
 * subnivel de perforación casi horizontal junto al tajeo: los anillos son verticales y
 * perpendiculares a ESA galería. El ancho y el alto del tajeo se miden en el plano del anillo
 * cortando el sólido.
 */

/** Tipos de labor desde los que se perforan abanicos (galería, crucero, acceso/ventana, by-pass). */
export const RING_DRIVE_KINDS: readonly WorkingKind[] = ['drift', 'crosscut', 'access', 'bypass'];

/** Pendiente máxima razonable de una galería de perforación [fracción] (supuesto R0, aviso). */
export const MAX_RING_DRIVE_GRADE = 0.2;

/** Distancia máxima del centro del tajeo a la galería de perforación [m] (supuesto R0). */
const MAX_DRIVE_DISTANCE: Meters = 40;

export interface StopeSolid {
  /** Eje estimado del sólido (al piso). */
  points: readonly Vec3[];
  /** Malla de las labores y los triángulos (índices de triángulo) que son de este tajeo. */
  vertices: ArrayLike<number>;
  triangles: ArrayLike<number>;
  stopeTriangles: readonly number[];
}

export interface DriveCandidate {
  points: readonly Vec3[];
  kind: WorkingKind;
}

/** Sección del tajeo en el plano del anillo, relativa al centro del piso de la galería [m]. */
export interface StopeSection {
  width: Meters;
  /** Corrimiento del centro del tajeo a la derecha del avance. */
  offset: Meters;
  bottom: Meters;
  top: Meters;
}

export interface StopeRingSetup {
  /** Galería de perforación elegida (índice en `drives`) o null si no hay ninguna cerca. */
  driveIndex: number | null;
  /** Progresiva del primer anillo sobre la galería (o sobre el eje del tajeo, sin galería). */
  station: Meters;
  origin: Vec3;
  azimuth: Radians;
  /** Pendiente del avance [rad]: la de la galería, o 0 sin galería (anillos verticales). */
  gradient: Radians;
  /** Distancia del centro del tajeo a la galería [m]. */
  distance: Meters;
  /** Sección del tajeo cortada en el plano del anillo del medio; null si el plano no lo corta. */
  section: StopeSection | null;
}

function centroidOf(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  ids: readonly number[],
) {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const t of ids)
    for (let k = 0; k < 3; k++) {
      const v = triangles[3 * t + k] ?? 0;
      x += vertices[3 * v] ?? 0;
      y += vertices[3 * v + 1] ?? 0;
      z += vertices[3 * v + 2] ?? 0;
      n++;
    }
  return n > 0 ? { x: x / n, y: y / n, z: z / n } : null;
}

/**
 * Dónde y cómo van los anillos de un tajeo importado: en la galería de perforación más cercana a su
 * centro (a menos de 40 m), centrados en el tajeo (`rings` anillos a `burden`), con su azimut y su
 * pendiente; sin galería cerca, sobre la proyección horizontal del eje del tajeo con pendiente 0.
 * Mide la sección del tajeo en el plano del anillo del medio.
 */
export function stopeRingSetup(
  stope: StopeSolid,
  drives: readonly DriveCandidate[],
  options: { rings: number; burden: Meters },
): StopeRingSetup {
  const c = centroidOf(stope.vertices, stope.triangles, stope.stopeTriangles) ??
    stope.points[Math.floor(stope.points.length / 2)] ?? { x: 0, y: 0, z: 0 };
  const span = Math.max(0, options.rings - 1) * options.burden;
  let best: { i: number; station: number; distance: number } | null = null;
  drives.forEach((d, i) => {
    if (!RING_DRIVE_KINDS.includes(d.kind) || d.points.length < 2) return;
    const near = nearestStation(d.points, c);
    if (near.distance <= MAX_DRIVE_DISTANCE && (!best || near.distance < best.distance))
      best = { i, station: near.station, distance: near.distance };
  });
  let setup: Omit<StopeRingSetup, 'section'>;
  const chosen = best as { i: number; station: number; distance: number } | null;
  const drive = chosen ? drives[chosen.i] : undefined;
  if (chosen && drive) {
    const length = axisLength(drive.points);
    // El primer anillo media serie antes del punto más cercano al centro del tajeo.
    const station = Math.max(0, Math.min(length, chosen.station - span / 2));
    const s = stationOnAxis(drive.points, station);
    setup = {
      driveIndex: chosen.i,
      station: s.station,
      origin: s.point,
      azimuth: s.azimuth,
      gradient: s.gradient,
      distance: chosen.distance,
    };
  } else {
    // Sin galería: dirección horizontal del eje del tajeo, al piso del tajeo, anillos verticales.
    const pts = stope.points;
    const a = pts[0] ?? c;
    const b = pts[pts.length - 1] ?? c;
    let azimuth = Math.atan2(b.x - a.x, b.y - a.y);
    if (azimuth < 0) azimuth += 2 * Math.PI;
    const floor = Math.min(...pts.map((p) => p.z));
    const dir = { x: Math.sin(azimuth), y: Math.cos(azimuth) };
    setup = {
      driveIndex: null,
      station: 0,
      origin: { x: c.x - (dir.x * span) / 2, y: c.y - (dir.y * span) / 2, z: floor },
      azimuth,
      gradient: 0,
      distance: 0,
    };
  }
  // Sección del tajeo en el plano del anillo del medio.
  const frame = planeFrame({
    origin: setup.origin,
    azimuth: setup.azimuth,
    gradient: setup.gradient,
  });
  const mid = {
    ...frame,
    origin: {
      x: frame.origin.x + (frame.forward.x * span) / 2,
      y: frame.origin.y + (frame.forward.y * span) / 2,
      z: frame.origin.z + (frame.forward.z * span) / 2,
    },
  };
  const tris: number[] = [];
  for (const t of stope.stopeTriangles)
    tris.push(
      stope.triangles[3 * t] ?? 0,
      stope.triangles[3 * t + 1] ?? 0,
      stope.triangles[3 * t + 2] ?? 0,
    );
  const segs = sectionWorkings(stope.vertices, tris, mid, Infinity);
  let section: StopeSection | null = null;
  if (segs.length > 0) {
    const us = segs.flatMap((s) => [s.a.u, s.b.u]);
    const vs = segs.flatMap((s) => [s.a.v, s.b.v]);
    const minU = Math.min(...us);
    const maxU = Math.max(...us);
    section = {
      width: maxU - minU,
      offset: (maxU + minU) / 2,
      bottom: Math.min(...vs),
      top: Math.max(...vs),
    };
  }
  return { ...setup, section };
}
