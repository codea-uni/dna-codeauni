import type { Vec3 } from '@cronos/core';

/**
 * Ubicación del modelo en el espacio de la sesión XR (D-19). El modelo usa Z arriba y coordenadas
 * de render (relativas al origen); WebXR usa Y arriba, −Z hacia adelante y metros del usuario.
 *
 * xr = offset + Ry(yaw) · scale · Rx(−π/2) · modelo, es decir (x, y, z) → (x, z, −y) antes de girar:
 * el Este queda a la derecha (+X), el Norte adelante (−Z) y la cota arriba (+Y).
 *
 * El vuelo a 1:1, la maqueta y la colocación en AR son la misma operación: cambiar esta ubicación;
 * la escena no se toca. El usuario no se mueve: se mueve el mundo en sentido contrario.
 */
export interface XrPlacement {
  /** Metros del usuario por metro del modelo (1 = escala real; 1/1000 = maqueta 1:1000). */
  scale: number;
  /** Giro alrededor de la vertical del usuario (+Y) [rad]. */
  yaw: number;
  /** Posición del origen de render en el espacio XR [m]. */
  offset: Vec3;
}

/** Punto del modelo (render, Z arriba) → espacio XR. */
export function toXr(p: XrPlacement, v: Vec3): Vec3 {
  const ax = v.x * p.scale;
  const ay = v.z * p.scale;
  const az = -v.y * p.scale;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return { x: p.offset.x + ax * c + az * s, y: p.offset.y + ay, z: p.offset.z - ax * s + az * c };
}

/** Punto del espacio XR → modelo (render, Z arriba). */
export function toModel(p: XrPlacement, v: Vec3): Vec3 {
  const dx = v.x - p.offset.x;
  const dy = v.y - p.offset.y;
  const dz = v.z - p.offset.z;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const ax = (dx * c - dz * s) / p.scale;
  const az = (dx * s + dz * c) / p.scale;
  return { x: ax, y: -az, z: dy / p.scale };
}

/** Dirección del espacio XR → modelo (sin traslación; conserva la escala del modelo). */
export function dirToModel(p: XrPlacement, d: Vec3): Vec3 {
  const o = toModel(p, { x: 0, y: 0, z: 0 });
  const e = toModel(p, d);
  return { x: e.x - o.x, y: e.y - o.y, z: e.z - o.z };
}

/** El usuario se desplaza `d` (espacio XR): el mundo se mueve −d. */
export function moveBy(p: XrPlacement, d: Vec3): XrPlacement {
  return { ...p, offset: { x: p.offset.x - d.x, y: p.offset.y - d.y, z: p.offset.z - d.z } };
}

/**
 * El usuario gira `angle` [rad, positivo a la izquierda] alrededor de la vertical que pasa por
 * `pivot` (espacio XR, normalmente la cabeza): el mundo gira −angle alrededor del mismo eje.
 */
export function turnAbout(p: XrPlacement, pivot: Vec3, angle: number): XrPlacement {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const dx = p.offset.x - pivot.x;
  const dz = p.offset.z - pivot.z;
  return {
    ...p,
    yaw: p.yaw - angle,
    offset: { x: pivot.x + dx * c + dz * s, y: p.offset.y, z: pivot.z - dx * s + dz * c },
  };
}

/** Ubicación en la que el punto `model` cae en `at` (espacio XR), con el giro y la escala dados. */
export function placeAt(model: Vec3, at: Vec3, yaw: number, scale: number): XrPlacement {
  const q = toXr({ scale, yaw, offset: { x: 0, y: 0, z: 0 } }, model);
  return { scale, yaw, offset: { x: at.x - q.x, y: at.y - q.y, z: at.z - q.z } };
}

/** Rumbo de la cabeza alrededor de +Y [rad] a partir de su vector adelante (espacio XR). */
export function headingOf(forward: Vec3): number {
  return Math.atan2(-forward.x, -forward.z);
}

/**
 * Arrastre con un control: el modelo sigue la traslación del control y su giro horizontal (sin
 * inclinarse), como si se tomara con la mano. `from` es el control al empezar y `p0` la ubicación
 * de ese momento; `yaw` = rumbo del control (headingOf).
 */
export function dragPlacement(
  p0: XrPlacement,
  from: { pos: Vec3; yaw: number },
  to: { pos: Vec3; yaw: number },
): XrPlacement {
  const d = to.yaw - from.yaw;
  const c = Math.cos(d);
  const s = Math.sin(d);
  const dx = p0.offset.x - from.pos.x;
  const dz = p0.offset.z - from.pos.z;
  return {
    ...p0,
    yaw: p0.yaw + d,
    offset: {
      x: to.pos.x + dx * c + dz * s,
      y: p0.offset.y + to.pos.y - from.pos.y,
      z: to.pos.z - dx * s + dz * c,
    },
  };
}

/**
 * Paso de suavizado de `from` hacia `to` (fracción `k`, 0–1) alrededor de un punto del modelo
 * (`pivot`, render): ese punto viaja en línea recta, la escala cambia en forma geométrica y el giro
 * va por el camino corto. Así un acercamiento o un cambio de vista se ven como un vuelo y no como
 * un salto (mismo criterio que FleetView: k = 1 − e^(−λ·dt)).
 */
export function blendPlacement(
  from: XrPlacement,
  to: XrPlacement,
  pivot: Vec3,
  k: number,
): XrPlacement {
  if (k >= 1) return to;
  const a = toXr(from, pivot);
  const b = toXr(to, pivot);
  const at = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  let dYaw = to.yaw - from.yaw;
  dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  const scale = from.scale * Math.pow(to.scale / from.scale, k);
  return placeAt(pivot, at, from.yaw + dYaw * k, scale);
}

/** ¿Dos ubicaciones se ven iguales (diferencia por debajo de lo perceptible)? */
export function samePlacement(a: XrPlacement, b: XrPlacement): boolean {
  return (
    Math.abs(a.offset.x - b.offset.x) < 1e-4 &&
    Math.abs(a.offset.y - b.offset.y) < 1e-4 &&
    Math.abs(a.offset.z - b.offset.z) < 1e-4 &&
    Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw))) < 1e-4 &&
    Math.abs(Math.log(a.scale / b.scale)) < 1e-4
  );
}

/**
 * Dos manos pellizcando: el modelo se escala, gira (alrededor de la vertical) y se traslada con el
 * segmento entre las manos, como estirar un mapa sobre la mesa. `a0`/`b0` son las manos en el
 * cuadro anterior y `a1`/`b1` en este (espacio XR).
 */
export function twoHandPlacement(
  p: XrPlacement,
  a0: Vec3,
  b0: Vec3,
  a1: Vec3,
  b1: Vec3,
): XrPlacement {
  const d0 = Math.hypot(b0.x - a0.x, b0.z - a0.z);
  const d1 = Math.hypot(b1.x - a1.x, b1.z - a1.z);
  if (d0 < 0.02 || d1 < 0.02) return p;
  const s = d1 / d0;
  // Rumbo del segmento con la misma convención de giro que `toXr`.
  const ang0 = Math.atan2(-(b0.z - a0.z), b0.x - a0.x);
  const ang1 = Math.atan2(-(b1.z - a1.z), b1.x - a1.x);
  let d = ang1 - ang0;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2, z: (a0.z + b0.z) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2, z: (a1.z + b1.z) / 2 };
  const c = Math.cos(d);
  const sn = Math.sin(d);
  const vx = (p.offset.x - m0.x) * s;
  const vz = (p.offset.z - m0.z) * s;
  return {
    scale: p.scale * s,
    yaw: p.yaw + d,
    offset: {
      x: m1.x + vx * c + vz * sn,
      y: m1.y + (p.offset.y - m0.y) * s,
      z: m1.z - vx * sn + vz * c,
    },
  };
}

/**
 * Ubicación a escala real con los ojos del usuario en `eye` (modelo, render) y la dirección de
 * planta `look` adelante: `eye` cae en la cabeza (`headXr`) y `look` queda con el rumbo `heading`
 * de la mirada actual (headingOf), así no hace falta girar el cuerpo para ver el objetivo.
 */
export function standPlacement(
  eye: Vec3,
  look: { x: number; y: number },
  headXr: Vec3,
  heading: number,
): XrPlacement {
  // Con yaw = 0 la dirección de planta (x, y) va a XR (x, −y): rumbo atan2(−x, y).
  const yaw = heading - Math.atan2(-look.x, look.y);
  return placeAt(eye, headXr, Math.atan2(Math.sin(yaw), Math.cos(yaw)), 1);
}

/** Avance suave 0–1 de un traslado animado (arranca y frena sin tirón: smootherstep). */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (6 * x - 15) + 10);
}

/**
 * A escala real, cuánto rinde el arrastre con la mano según la altura de los ojos sobre el terreno
 * [m]: nunca menos que ×6 (cerca del suelo, tras «acércame», no debe sentirse más lento) y desde
 * lo alto mucho más (un gesto cruza la voladura; con ×6 fijo «había que empujar constantemente»).
 */
export function walkDragGain(above: number): number {
  return Math.min(30, Math.max(6, above / 5));
}

/**
 * Dos manos a escala real (el mundo no se encoge: se sigue de pie a 1:1). Girar el segmento entre
 * las manos gira el mundo alrededor de la cabeza; correr las dos manos lo arrastra (con `gain`);
 * separarlas acerca hacia donde están las manos y juntarlas aleja (`zoomGain` m por m de mano), que
 * se siente como agrandar y achicar. `a0`/`b0` cuadro anterior, `a1`/`b1` este; espacio XR.
 */
export function walkTwoHandPlacement(
  p: XrPlacement,
  head: Vec3,
  a0: Vec3,
  b0: Vec3,
  a1: Vec3,
  b1: Vec3,
  gain: number,
  zoomGain: number,
): XrPlacement {
  const d0 = Math.hypot(b0.x - a0.x, b0.z - a0.z);
  const d1 = Math.hypot(b1.x - a1.x, b1.z - a1.z);
  if (d0 < 0.02 || d1 < 0.02) return p;
  const ang0 = Math.atan2(-(b0.z - a0.z), b0.x - a0.x);
  const ang1 = Math.atan2(-(b1.z - a1.z), b1.x - a1.x);
  let d = ang1 - ang0;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  // El mundo gira +d (como un mapa tomado con las dos manos): el usuario gira −d.
  let q = turnAbout(p, head, -d);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2, z: (a0.z + b0.z) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2, z: (a1.z + b1.z) / 2 };
  // Arrastre: el mundo sigue a las manos (el usuario va al revés).
  q = moveBy(q, {
    x: -(m1.x - m0.x) * gain,
    y: -(m1.y - m0.y) * gain,
    z: -(m1.z - m0.z) * gain,
  });
  // Acercar/alejar hacia el punto entre las manos (en 3D: mirando abajo, baja hacia el terreno).
  const dir = { x: m1.x - head.x, y: m1.y - head.y, z: m1.z - head.z };
  const l = Math.hypot(dir.x, dir.y, dir.z);
  if (l < 1e-3) return q;
  const step = (d1 - d0) * zoomGain;
  return moveBy(q, { x: (dir.x / l) * step, y: (dir.y / l) * step, z: (dir.z / l) * step });
}
