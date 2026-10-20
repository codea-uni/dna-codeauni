import type { Vec2, Vec3 } from '../model/types';
import type {
  BlockModelData,
  LineSetData,
  OrthoImageData,
  PointCloudData,
  TinData,
  WorkingsData,
} from './asset';
import type { SurveyParts } from './survey';

/**
 * Mover un levantamiento (labores, nube, modelo de bloques, topografía): giro en planta alrededor
 * de un pivote (el centroide) y traslación por un vector, horneados en los datos. Así todo lo que
 * los usa (3D, ubicación del frente, vibración, roca por bloque, pila) ve las coordenadas nuevas
 * sin saber que se movieron. Funciones puras: devuelven copias, no tocan la entrada.
 */
export interface SurveyMove {
  /** Traslación [m] (Este, Norte, cota). */
  dx: number;
  dy: number;
  dz: number;
  /** Giro en planta [°], horario como el azimut, alrededor de `pivot` (antes de trasladar). */
  rotationDeg: number;
  pivot: Vec2;
}

export const IDENTITY_MOVE: SurveyMove = {
  dx: 0,
  dy: 0,
  dz: 0,
  rotationDeg: 0,
  pivot: { x: 0, y: 0 },
};

/** ¿Cambia algo? (traslación de menos de 1 mm y giro de menos de 0,001° no cuentan). */
export function isIdentityMove(m: SurveyMove): boolean {
  return (
    Math.abs(m.dx) < 1e-3 &&
    Math.abs(m.dy) < 1e-3 &&
    Math.abs(m.dz) < 1e-3 &&
    Math.abs(m.rotationDeg) < 1e-3
  );
}

/** Aplicador de un movimiento: gira (horario) alrededor del pivote y traslada. */
function mover(m: SurveyMove): (x: number, y: number, z: number) => [number, number, number] {
  const a = (m.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const { x: px, y: py } = m.pivot;
  if (a === 0) return (x, y, z) => [x + m.dx, y + m.dy, z + m.dz];
  return (x, y, z) => {
    const u = x - px;
    const v = y - py;
    // Horario: el Norte (0, 1) gira hacia el Este (sin, cos).
    return [px + u * cos + v * sin + m.dx, py - u * sin + v * cos + m.dy, z + m.dz];
  };
}

/** Un punto movido. */
export function movePoint(p: Vec3, m: SurveyMove): Vec3 {
  const [x, y, z] = mover(m)(p.x, p.y, p.z);
  return { x, y, z };
}

/** Coordenadas x, y, z intercaladas, movidas (copia en float64). */
export function moveXyz(xyz: ArrayLike<number>, m: SurveyMove): Float64Array {
  const f = mover(m);
  const out = new Float64Array(xyz.length);
  for (let i = 0; i + 2 < xyz.length; i += 3) {
    const [x, y, z] = f(xyz[i] ?? 0, xyz[i + 1] ?? 0, xyz[i + 2] ?? 0);
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  }
  return out;
}

export function moveTin(tin: TinData, m: SurveyMove): TinData {
  return { vertices: moveXyz(tin.vertices, m), triangles: tin.triangles.slice() };
}

export function moveLines(lines: LineSetData, m: SurveyMove): LineSetData {
  return {
    coords: moveXyz(lines.coords, m),
    offsets: lines.offsets.slice(),
    roles: lines.roles.slice(),
    closed: lines.closed.slice(),
  };
}

/**
 * Nube: los puntos son float32 relativos a `origin`; se mueven en float64 y se vuelven a guardar
 * relativos al origen movido (redondeado al metro, como al importar).
 */
export function moveCloud(cloud: PointCloudData, m: SurveyMove): PointCloudData {
  const f = mover(m);
  const [ox, oy, oz] = cloud.origin;
  const o = f(ox, oy, oz);
  const origin: [number, number, number] = [Math.floor(o[0]), Math.floor(o[1]), Math.floor(o[2])];
  const p = cloud.positions;
  const positions = new Float32Array(p.length);
  for (let i = 0; i + 2 < p.length; i += 3) {
    const [x, y, z] = f(ox + (p[i] ?? 0), oy + (p[i + 1] ?? 0), oz + (p[i + 2] ?? 0));
    positions[i] = x - origin[0];
    positions[i + 1] = y - origin[1];
    positions[i + 2] = z - origin[2];
  }
  return {
    origin,
    positions,
    ...(cloud.colors ? { colors: cloud.colors.slice() } : {}),
    sourcePoints: cloud.sourcePoints,
  };
}

/** Modelo de bloques: centros movidos; el giro del modelo (antihorario) resta el giro horario. */
export function moveBlocks(blocks: BlockModelData, m: SurveyMove): BlockModelData {
  return {
    ...blocks,
    centers: moveXyz(blocks.centers, m),
    sizes: blocks.sizes.slice(),
    rotation: blocks.rotation - (m.rotationDeg * Math.PI) / 180,
    numeric: blocks.numeric.map((a) => ({ name: a.name, values: a.values.slice() })),
    categorical: blocks.categorical.map((a) => ({
      name: a.name,
      categories: [...a.categories],
      codes: a.codes.slice(),
    })),
  };
}

/** Labores: malla y ejes movidos; nombres, perfiles y orden de los ejes se conservan. */
export function moveWorkings(w: WorkingsData, m: SurveyMove): WorkingsData {
  return {
    vertices: moveXyz(w.vertices, m),
    triangles: w.triangles.slice(),
    axisCoords: moveXyz(w.axisCoords, m),
    axisOffsets: w.axisOffsets.slice(),
    axes: w.axes.map((a) => ({ ...a, ...(a.profile ? { profile: { ...a.profile } } : {}) })),
  };
}

/** Ortofoto: la esquina superior izquierda se mueve y el giro (horario) se suma. */
export function moveImage(image: OrthoImageData, m: SurveyMove): OrthoImageData {
  const [x, y] = mover(m)(image.georef.originX, image.georef.originY, 0);
  return {
    ...image,
    georef: {
      ...image.georef,
      originX: x,
      originY: y,
      rotation: image.georef.rotation + (m.rotationDeg * Math.PI) / 180,
    },
    bytes: image.bytes.slice(),
  };
}

/** Todas las partes de un levantamiento, movidas. */
export function moveSurveyParts(parts: SurveyParts, m: SurveyMove): SurveyParts {
  return {
    ...(parts.tin ? { tin: moveTin(parts.tin, m) } : {}),
    ...(parts.lines ? { lines: moveLines(parts.lines, m) } : {}),
    ...(parts.image ? { image: moveImage(parts.image, m) } : {}),
    ...(parts.cloud ? { cloud: moveCloud(parts.cloud, m) } : {}),
    ...(parts.blocks ? { blocks: moveBlocks(parts.blocks, m) } : {}),
    ...(parts.workings ? { workings: moveWorkings(parts.workings, m) } : {}),
  };
}

/** Promedio de x, y, z intercalados (null si no hay puntos). */
function meanXyz(xyz: ArrayLike<number>, offset: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 | null {
  const n = Math.floor(xyz.length / 3);
  if (n === 0) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < n; i++) {
    sx += xyz[i * 3] ?? 0;
    sy += xyz[i * 3 + 1] ?? 0;
    sz += xyz[i * 3 + 2] ?? 0;
  }
  return { x: offset.x + sx / n, y: offset.y + sy / n, z: offset.z + sz / n };
}

/**
 * Centroide de un levantamiento: promedio de los vértices de las labores (o de sus ejes si no hay
 * malla), de los puntos de la nube, de los centros de los bloques o de los vértices del TIN (o de
 * las líneas). null si no hay datos.
 */
export function surveyPartsCentroid(parts: SurveyParts): Vec3 | null {
  if (parts.workings) return meanXyz(parts.workings.vertices) ?? meanXyz(parts.workings.axisCoords);
  if (parts.cloud) {
    const [x, y, z] = parts.cloud.origin;
    return meanXyz(parts.cloud.positions, { x, y, z });
  }
  if (parts.blocks) return meanXyz(parts.blocks.centers);
  if (parts.tin) return meanXyz(parts.tin.vertices);
  if (parts.lines) return meanXyz(parts.lines.coords);
  if (parts.image) {
    const g = parts.image.georef;
    return {
      x: g.originX + (g.pixelSizeX * parts.image.width) / 2,
      y: g.originY + (g.pixelSizeY * parts.image.height) / 2,
      z: 0,
    };
  }
  return null;
}

/** Movimiento que lleva el centroide `from` a `to`, girando `rotationDeg` alrededor de él. */
export function moveCentroidTo(from: Vec3, to: Vec3, rotationDeg = 0): SurveyMove {
  return {
    dx: to.x - from.x,
    dy: to.y - from.y,
    dz: to.z - from.z,
    rotationDeg,
    pivot: { x: from.x, y: from.y },
  };
}

/**
 * «Bajar bajo la topografía»: el centroide queda `depth` metros debajo del terreno en planta del
 * punto (x, y) de destino (por defecto, el mismo del centroide). `groundAt` da la cota del
 * terreno; null si el punto cae fuera de la topografía.
 */
export function moveBelowGround(
  centroid: Vec3,
  depth: number,
  groundAt: (x: number, y: number) => number | null,
  options: { at?: Vec2; rotationDeg?: number } = {},
): SurveyMove | null {
  const at = options.at ?? { x: centroid.x, y: centroid.y };
  const ground = groundAt(at.x, at.y);
  if (ground === null || !Number.isFinite(ground)) return null;
  return moveCentroidTo(centroid, { x: at.x, y: at.y, z: ground - depth }, options.rotationDeg);
}
