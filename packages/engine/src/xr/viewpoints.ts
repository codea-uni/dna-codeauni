import { outwardNormal, type Vec2 } from '@cronos/core';

// Puntos de vista del visor a escala real (D-19): dónde pararse para ver la voladura, su cara
// libre, desde atrás, desde la cresta o desde lo alto. Son parámetros de interfaz (distancias de
// observación), no constantes mineras: van como supuestos editables en QUESTIONS §2. Todo en
// coordenadas de planta (X Este, Y Norte); los rumbos son azimuts en grados desde el Norte, en
// sentido horario (CLAUDE.md, regla 3).

const DEG = Math.PI / 180;
/** Altura de los ojos de una persona de pie sobre el terreno [m]. */
export const EYE_HEIGHT = 1.7;

/** Puntos de vista predefinidos. */
export type XrViewpointKind =
  'blast' | 'center' | 'above' | 'free_face' | 'behind' | 'crest' | 'overview';

/** Lo que hace falta de la voladura para ubicar los puntos de vista. */
export interface ViewpointScene {
  boundaries: readonly { polygon: readonly Vec2[]; freeFaceEdges: readonly number[] }[];
  holes: readonly Vec2[];
  /** Puntos protegidos (comunidad, muro, planta…). */
  points: readonly Vec2[];
}

/**
 * Pedido de traslado: pararse a `standDistance` de `target` mirando con rumbo `yawDeg` (sin rumbo,
 * desde donde está el usuario), con los ojos a `eyeHeight` sobre el terreno.
 */
export interface GoToSpec {
  target: Vec2;
  standDistance: number;
  yawDeg?: number;
  eyeHeight: number;
}

/** Marco de la voladura: centro, radio y cara libre (punto medio, normal hacia afuera, arista mayor). */
export interface BlastFrame {
  center: Vec2;
  radius: number;
  /** Radio de la zona perforada (solo taladros; sin taladros, el del perímetro) [m]. */
  holeRadius: number;
  vertices: readonly Vec2[];
  face: { mid: Vec2; normal: Vec2; a: Vec2; b: Vec2 } | null;
}

/** Azimut [°, 0–360) de una dirección de planta. */
export function azimuthOf(d: Vec2): number {
  const a = Math.atan2(d.x, d.y) / DEG;
  return (a + 360) % 360;
}

/** Dirección unitaria de planta de un azimut [°]. */
export function dirOf(azimuthDeg: number): Vec2 {
  return { x: Math.sin(azimuthDeg * DEG), y: Math.cos(azimuthDeg * DEG) };
}

/**
 * Dónde pararse: a `distance` de `target` mirándolo con rumbo `yawDeg`; sin rumbo, en la línea que
 * viene desde `from` (el usuario se acerca o se aleja sin girar el mundo), y si `from` cae sobre el
 * objetivo, con el rumbo `fallbackDeg`.
 */
export function standPoint(
  target: Vec2,
  distance: number,
  yawDeg: number | undefined,
  from: Vec2,
  fallbackDeg: number,
): { stand: Vec2; yawDeg: number } {
  let az = yawDeg;
  if (az === undefined) {
    const d = { x: target.x - from.x, y: target.y - from.y };
    az = Math.hypot(d.x, d.y) < 1e-3 ? fallbackDeg : azimuthOf(d);
  }
  const u = dirOf(az);
  return { stand: { x: target.x - u.x * distance, y: target.y - u.y * distance }, yawDeg: az };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Centro, radio y cara libre de la voladura; null si no hay taladros ni perímetros. */
export function blastFrame(scene: ViewpointScene): BlastFrame | null {
  const vertices = scene.boundaries.flatMap((b) => b.polygon);
  const core = scene.holes.length > 0 ? scene.holes : vertices;
  if (core.length === 0) return null;
  const center = {
    x: core.reduce((s, p) => s + p.x, 0) / core.length,
    y: core.reduce((s, p) => s + p.y, 0) / core.length,
  };
  let radius = 5;
  for (const p of [...scene.holes, ...vertices])
    radius = Math.max(radius, Math.hypot(p.x - center.x, p.y - center.y));
  let holeRadius = 5;
  for (const p of core)
    holeRadius = Math.max(holeRadius, Math.hypot(p.x - center.x, p.y - center.y));
  // Cara libre: punto medio y normal ponderados por largo; la arista mayor para la cresta.
  let len = 0;
  let mx = 0;
  let my = 0;
  let nx = 0;
  let ny = 0;
  let longest: { a: Vec2; b: Vec2; len: number } | null = null;
  for (const b of scene.boundaries) {
    const n = b.polygon.length;
    for (const i of b.freeFaceEdges) {
      const a = b.polygon[i];
      const c = b.polygon[(i + 1) % n];
      const normal = outwardNormal(b.polygon, i);
      if (!a || !c || !normal) continue;
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      len += l;
      mx += ((a.x + c.x) / 2) * l;
      my += ((a.y + c.y) / 2) * l;
      nx += normal.x * l;
      ny += normal.y * l;
      if (!longest || l > longest.len) longest = { a, b: c, len: l };
    }
  }
  const nl = Math.hypot(nx, ny);
  const face =
    len > 0 && nl > 1e-9 && longest
      ? {
          mid: { x: mx / len, y: my / len },
          normal: { x: nx / nl, y: ny / nl },
          a: longest.a,
          b: longest.b,
        }
      : null;
  return { center, radius, holeRadius, vertices: vertices.length > 0 ? vertices : core, face };
}

/** Distancia de observación por defecto: crece con la voladura, dentro de un rango cómodo [m]. */
const viewDistance = (radius: number, k: number, lo: number, hi: number) =>
  clamp(radius * k, lo, hi);

/**
 * Punto de vista predefinido. `from` = dónde está el usuario (planta), para no darlo vuelta sin
 * necesidad; `distance` [m] cambia la distancia por defecto y `minDistance` [m] la acota por debajo
 * (por ejemplo, el alcance de proyecciones durante la secuencia). null si falta lo necesario (sin
 * voladura, o sin cara libre para free_face, behind y crest).
 */
export function viewpoint(
  kind: XrViewpointKind,
  scene: ViewpointScene,
  opts: { from?: Vec2; distance?: number; minDistance?: number } = {},
): GoToSpec | null {
  const f = blastFrame(scene);
  if (!f) return null;
  const min = opts.minDistance ?? 0;
  const face = f.face;
  const from = opts.from ?? f.center;
  switch (kind) {
    case 'blast': {
      // En la voladura: al borde de la zona perforada (los taladros a pocos metros, la malla
      // completa adelante). En una voladura grande queda dentro, entre los taladros. Del lado donde
      // ya está el usuario; si está encima, desde la cara libre.
      const d = Math.max(min, opts.distance ?? clamp(f.holeRadius * 0.6 + 8, 10, 50));
      const inside = Math.hypot(from.x - f.center.x, from.y - f.center.y) < f.holeRadius;
      const yawDeg =
        face && inside
          ? faceAz(face)
          : standPoint(f.center, d, undefined, from, face ? faceAz(face) : 0).yawDeg;
      return { target: f.center, standDistance: d, yawDeg, eyeHeight: EYE_HEIGHT };
    }
    case 'center': {
      // De pie en el centro de la malla, mirando hacia la cara libre (o hacia donde ya miraba).
      const yawDeg = face
        ? azimuthOf(face.normal)
        : standPoint(f.center, 1, undefined, from, 0).yawDeg;
      return { target: f.center, standDistance: opts.distance ?? 0, yawDeg, eyeHeight: EYE_HEIGHT };
    }
    case 'above': {
      // Flotando sobre la voladura: a la altura que hace caber la malla al mirar hacia abajo y un
      // poco atrás del centro, para verla con la cabeza inclinada (~60°) sin mirar a los pies.
      // `distance` = altura sobre el terreno [m].
      const h = Math.max(min, opts.distance ?? clamp(f.holeRadius * 1.6, 25, 400));
      const az = face ? faceAz(face) : standPoint(f.center, 1, undefined, from, 0).yawDeg;
      return { target: f.center, standDistance: h * 0.55, yawDeg: az, eyeHeight: h };
    }
    case 'free_face': {
      if (!face) return null;
      // De pie frente a la cara libre (en el piso al que se proyecta el material), mirándola.
      const d = Math.max(min, opts.distance ?? viewDistance(f.radius, 0.8, 25, 120));
      return { target: face.mid, standDistance: d, yawDeg: faceAz(face), eyeHeight: EYE_HEIGHT };
    }
    case 'behind': {
      if (!face) return null;
      // Detrás de la voladura (lado opuesto a la cara libre), mirando hacia la cara libre.
      const back = Math.max(
        0,
        ...f.vertices.map(
          (v) => -((v.x - f.center.x) * face.normal.x + (v.y - f.center.y) * face.normal.y),
        ),
      );
      const d = Math.max(min, back + (opts.distance ?? viewDistance(f.radius, 0.3, 10, 40)));
      return {
        target: f.center,
        standDistance: d,
        yawDeg: azimuthOf(face.normal),
        eyeHeight: EYE_HEIGHT,
      };
    }
    case 'crest': {
      if (!face) return null;
      // Sobre la cresta: unos metros atrás del borde y antes de la esquina, mirando a lo largo de
      // la arista mayor de la cara libre (la voladura a un lado, el talud al otro).
      const ex = face.b.x - face.a.x;
      const ey = face.b.y - face.a.y;
      const el = Math.hypot(ex, ey) || 1;
      const back = opts.distance ?? 3;
      const before = 5;
      const start = {
        x: face.a.x - (ex / el) * before - face.normal.x * back,
        y: face.a.y - (ey / el) * before - face.normal.y * back,
      };
      const end = { x: face.b.x - face.normal.x * back, y: face.b.y - face.normal.y * back };
      return {
        target: end,
        standDistance: Math.hypot(end.x - start.x, end.y - start.y),
        yawDeg: azimuthOf({ x: end.x - start.x, y: end.y - start.y }),
        eyeHeight: EYE_HEIGHT,
      };
    }
    case 'overview': {
      // En alto, con la voladura y los puntos protegidos a la vista: desde el lado opuesto a los
      // puntos (la voladura adelante, la comunidad detrás); sin puntos, de costado a la cara libre.
      const all = [...f.vertices, ...scene.holes, ...scene.points];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of all) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const mid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const span = Math.max(f.radius, Math.hypot(maxX - minX, maxY - minY) / 2);
      let az: number;
      if (scene.points.length > 0) {
        const pc = {
          x: scene.points.reduce((s, p) => s + p.x, 0) / scene.points.length,
          y: scene.points.reduce((s, p) => s + p.y, 0) / scene.points.length,
        };
        az = azimuthOf({ x: pc.x - f.center.x, y: pc.y - f.center.y });
      } else if (face) {
        // De los dos costados de la cara libre, el más parecido a hacia dónde se mira ahora.
        const now = azimuthOf({ x: mid.x - from.x, y: mid.y - from.y });
        const a1 = (faceAz(face) + 90) % 360;
        const a2 = (faceAz(face) + 270) % 360;
        az = angleBetween(now, a1) <= angleBetween(now, a2) ? a1 : a2;
      } else az = standPoint(mid, 1, undefined, from, 0).yawDeg;
      const d = Math.max(min, opts.distance ?? span * 1.3 + 30);
      return { target: mid, standDistance: d, yawDeg: az, eyeHeight: Math.max(20, d * 0.55) };
    }
  }
}

/** Rumbo con el que se mira la cara libre (contra su normal exterior). */
function faceAz(face: { normal: Vec2 }): number {
  return azimuthOf({ x: -face.normal.x, y: -face.normal.y });
}

/** Diferencia absoluta entre dos azimuts [°, 0–180]. */
export function angleBetween(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}
