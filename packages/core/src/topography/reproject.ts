import proj4 from 'proj4';

/**
 * Sistemas de coordenadas cargados (definiciones del registro EPSG en sintaxis PROJ). PSAD56 usa
 * la transformación a WGS 84 para Perú del registro EPSG (traslación −288, 175, −376 m).
 */
export const CRS_DEFS: Record<number, { name: string; proj4: string }> = {
  4326: { name: 'WGS 84 (lat/lon)', proj4: '+proj=longlat +datum=WGS84 +no_defs' },
  32717: {
    name: 'WGS 84 / UTM 17S',
    proj4: '+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs',
  },
  32718: {
    name: 'WGS 84 / UTM 18S',
    proj4: '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs',
  },
  32719: {
    name: 'WGS 84 / UTM 19S',
    proj4: '+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs',
  },
  24877: {
    name: 'PSAD56 / UTM 17S',
    proj4: '+proj=utm +zone=17 +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs',
  },
  24878: {
    name: 'PSAD56 / UTM 18S',
    proj4: '+proj=utm +zone=18 +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs',
  },
  24879: {
    name: 'PSAD56 / UTM 19S',
    proj4: '+proj=utm +zone=19 +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs',
  },
};

export const isKnownCrs = (epsg: number): boolean => epsg in CRS_DEFS;
export const crsName = (epsg: number): string => CRS_DEFS[epsg]?.name ?? `EPSG ${String(epsg)}`;

function defOf(epsg: number): string {
  const def = CRS_DEFS[epsg];
  if (!def) throw new Error(`Sistema de coordenadas no soportado: EPSG ${String(epsg)}`);
  return def.proj4;
}

/**
 * Reproyecta en el lugar coordenadas x, y, z intercaladas (Este/lon, Norte/lat). La cota no se
 * toca: los datos de mina usan cotas ortométricas y el cambio de datum horizontal no las altera.
 */
export function reprojectXyz(xyz: Float64Array | number[], from: number, to: number): void {
  if (from === to) return;
  const conv = proj4(defOf(from), defOf(to));
  for (let i = 0; i + 1 < xyz.length; i += 3) {
    const [x, y] = conv.forward([xyz[i] ?? 0, xyz[i + 1] ?? 0]);
    xyz[i] = x;
    xyz[i + 1] = y;
  }
}

/** Punto de control de una grilla local de mina: coordenadas locales y de destino. */
export interface ControlPoint {
  local: [number, number, number];
  target: [number, number, number];
}

/**
 * Transformación de similitud 2D (Helmert: escala, giro y traslación) más un desplazamiento de
 * cota: `x' = a·x − b·y + tx`, `y' = b·x + a·y + ty`, `z' = z + dz`.
 */
export interface LocalGridTransform {
  a: number;
  b: number;
  tx: number;
  ty: number;
  dz: number;
  /** Residuo máximo en planta de los puntos de control [m]. */
  maxResidual: number;
}

/** Ajuste por mínimos cuadrados de la grilla local; necesita 2 puntos de control o más. */
export function fitLocalGrid(points: readonly ControlPoint[]): LocalGridTransform {
  const n = points.length;
  if (n < 2) throw new Error('La grilla local necesita al menos 2 puntos de control');
  let cx = 0,
    cy = 0,
    cX = 0,
    cY = 0,
    dz = 0;
  for (const p of points) {
    cx += p.local[0];
    cy += p.local[1];
    cX += p.target[0];
    cY += p.target[1];
    dz += p.target[2] - p.local[2];
  }
  cx /= n;
  cy /= n;
  cX /= n;
  cY /= n;
  dz /= n;
  let sxx = 0,
    sab = 0,
    sba = 0;
  for (const p of points) {
    const x = p.local[0] - cx,
      y = p.local[1] - cy;
    const X = p.target[0] - cX,
      Y = p.target[1] - cY;
    sxx += x * x + y * y;
    sab += x * X + y * Y;
    sba += x * Y - y * X;
  }
  if (sxx === 0) throw new Error('Los puntos de control coinciden en planta');
  const a = sab / sxx;
  const b = sba / sxx;
  const tx = cX - (a * cx - b * cy);
  const ty = cY - (b * cx + a * cy);
  let maxResidual = 0;
  for (const p of points) {
    const X = a * p.local[0] - b * p.local[1] + tx;
    const Y = b * p.local[0] + a * p.local[1] + ty;
    maxResidual = Math.max(maxResidual, Math.hypot(X - p.target[0], Y - p.target[1]));
  }
  return { a, b, tx, ty, dz, maxResidual };
}

/** Aplica en el lugar la grilla local a coordenadas x, y, z intercaladas. */
export function applyLocalGrid(xyz: Float64Array | number[], t: LocalGridTransform): void {
  for (let i = 0; i + 2 < xyz.length; i += 3) {
    const x = xyz[i] ?? 0;
    const y = xyz[i + 1] ?? 0;
    xyz[i] = t.a * x - t.b * y + t.tx;
    xyz[i + 1] = t.b * x + t.a * y + t.ty;
    xyz[i + 2] = (xyz[i + 2] ?? 0) + t.dz;
  }
}
