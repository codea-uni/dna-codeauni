import type { Bounds3 } from '@cronos/core';

/**
 * Qué encuadra la cámara («Encuadrar», abrir un proyecto, pasar a 3D). El diseño (taladros,
 * perímetros) puede estar en coordenadas locales cerca de (0, 0) y los levantamientos (nubes,
 * modelos de bloques, labores, topografía) en UTM a miles de km: unirlos daba un encuadre gigante
 * («al infinito»). Reglas:
 *  - con diseño, se encuadra el diseño;
 *  - sin diseño, los levantamientos: el primero y los que están a menos de `FRAME_NEAR_M` de él
 *    (de la mina se pueden cargar levantamientos de sectores a cientos de km entre sí);
 *  - nunca una caja con infinitos ni NaN.
 */

/** Separación [m] a partir de la cual dos cosas ya no se encuadran juntas. */
export const FRAME_NEAR_M = 5_000;

/** ¿Caja utilizable (finita y no invertida)? */
export function isFiniteBox(b: Bounds3 | null | undefined): b is Bounds3 {
  return (
    b !== null &&
    b !== undefined &&
    Number.isFinite(b.minX) &&
    Number.isFinite(b.minY) &&
    Number.isFinite(b.minZ) &&
    Number.isFinite(b.maxX) &&
    Number.isFinite(b.maxY) &&
    Number.isFinite(b.maxZ) &&
    b.minX <= b.maxX &&
    b.minY <= b.maxY &&
    b.minZ <= b.maxZ
  );
}

/** Unión de dos cajas. */
export function unionBox(a: Bounds3, b: Bounds3): Bounds3 {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

/** Distancia entre dos cajas (0 si se tocan o se solapan). */
export function boxGap(a: Bounds3, b: Bounds3): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dy, dz);
}

/**
 * La primera caja válida y todas las que quedan a menos de `near` del grupo (encadenadas). Las
 * lejanas se descartan. null si no hay ninguna válida.
 */
export function clusterBoxes(
  boxes: readonly (Bounds3 | null | undefined)[],
  near = FRAME_NEAR_M,
): Bounds3 | null {
  const pending = boxes.filter(isFiniteBox);
  const first = pending.shift();
  if (!first) return null;
  let group = first;
  let grew = true;
  while (grew && pending.length > 0) {
    grew = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const b = pending[i];
      if (b && boxGap(group, b) <= near) {
        group = unionBox(group, b);
        pending.splice(i, 1);
        grew = true;
      }
    }
  }
  return group;
}

/**
 * Caja a encuadrar: el diseño si lo hay; si no, el grupo de levantamientos (ver arriba). null si
 * no hay nada.
 */
export function frameBox(
  design: Bounds3 | null | undefined,
  surveys: readonly (Bounds3 | null | undefined)[],
  near = FRAME_NEAR_M,
): Bounds3 | null {
  if (isFiniteBox(design)) return design;
  return clusterBoxes(surveys, near);
}

/**
 * Lo que se dibuja cerca de `focus` (lo encuadrado): `focus` más las cajas a menos de `near`. Sirve
 * para el plano lejano de la cámara: lo que está cerca debe verse entero, lo de otro sector no.
 */
export function sceneNear(
  focus: Bounds3,
  boxes: readonly (Bounds3 | null | undefined)[],
  near = FRAME_NEAR_M,
): Bounds3 {
  let b = focus;
  for (const x of boxes) if (isFiniteBox(x) && boxGap(focus, x) <= near) b = unionBox(b, x);
  return b;
}

/** Distancia del punto `p` a la esquina más lejana de la caja. */
export function farthestCorner(p: { x: number; y: number; z: number }, b: Bounds3): number {
  const dx = Math.max(Math.abs(p.x - b.minX), Math.abs(p.x - b.maxX));
  const dy = Math.max(Math.abs(p.y - b.minY), Math.abs(p.y - b.maxY));
  const dz = Math.max(Math.abs(p.z - b.minZ), Math.abs(p.z - b.maxZ));
  return Math.hypot(dx, dy, dz);
}

/**
 * Planos de recorte de la cámara 3D de escritorio. `near` sigue a la distancia de la órbita (la
 * precisión del depth buffer depende de él); `far` alcanza lo que se dibuja cerca (`reach`, la
 * esquina más lejana de la escena cercana) sin pasar de 200 km.
 */
export function clipPlanes(distance: number, reach = 0): { near: number; far: number } {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 100;
  const near = Math.max(0.1, d / 2000);
  const want = Math.max(d * 50, Number.isFinite(reach) ? reach * 1.2 : 0);
  return { near, far: Math.min(Math.max(want, near * 10), 200_000) };
}

/**
 * Radio mínimo visible [m] de un taladro a `distance` de la cámara: `px` píxeles con un campo
 * vertical `fovRad` en un visor de `heightPx` de alto. Así un taladro lejano no desaparece y uno
 * cercano se dibuja con su diámetro real (× el factor), sin un mínimo fijo en metros que lo engorde.
 */
export function minRadiusAt(distance: number, fovRad: number, heightPx: number, px = 1): number {
  if (!(distance > 0) || !(heightPx > 0)) return 0;
  return ((2 * distance * Math.tan(fovRad / 2)) / heightPx) * px;
}
