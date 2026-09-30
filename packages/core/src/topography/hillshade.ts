import type { ImageGeoref, TinData } from './asset';

export interface HillshadeOptions {
  /** Lado mayor del ráster [px]. */
  maxSize?: number;
  /** Dirección de la luz: azimut [rad, horario desde el Norte] y altura [rad]. */
  azimuth?: number;
  altitude?: number;
}

export interface HillshadeRaster {
  width: number;
  height: number;
  /** RGBA; transparente fuera del TIN. */
  rgba: Uint8ClampedArray;
  georef: ImageGeoref;
  zMin: number;
  zMax: number;
}

/** Colores del tinte por cota (de bajo a alto), del tema de Cronos. */
const TINT: [number, number, number][] = [
  [42, 78, 84],
  [66, 110, 96],
  [138, 128, 88],
  [176, 142, 104],
  [210, 196, 176],
];

/**
 * Relieve sombreado con tinte por cota para la vista en planta: rasteriza el TIN en una grilla y
 * calcula el sombreado con las pendientes de Horn (1981, «Hill shading and the reflectance map»,
 * Proc. IEEE 69(1)). Es visualización, no una regla minera. O(píxeles): corre en el worker.
 */
export function hillshade(tin: TinData, options: HillshadeOptions = {}): HillshadeRaster | null {
  const v = tin.vertices;
  const tri = tin.triangles;
  if (tri.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i + 2 < v.length; i += 3) {
    const x = v[i] ?? 0;
    const y = v[i + 1] ?? 0;
    const z = v[i + 2] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  const maxSize = options.maxSize ?? 2048;
  const size = Math.max(maxX - minX, maxY - minY) / maxSize || 1;
  const width = Math.max(2, Math.ceil((maxX - minX) / size) + 1);
  const height = Math.max(2, Math.ceil((maxY - minY) / size) + 1);
  const z = new Float64Array(width * height).fill(NaN);
  // Rasterizado: para cada triángulo, los centros de píxel dentro de su caja envolvente.
  for (let t = 0; t < tri.length; t += 3) {
    const ia = (tri[t] ?? 0) * 3;
    const ib = (tri[t + 1] ?? 0) * 3;
    const ic = (tri[t + 2] ?? 0) * 3;
    const x1 = v[ia] ?? 0;
    const y1 = v[ia + 1] ?? 0;
    const z1 = v[ia + 2] ?? 0;
    const x2 = v[ib] ?? 0;
    const y2 = v[ib + 1] ?? 0;
    const z2 = v[ib + 2] ?? 0;
    const x3 = v[ic] ?? 0;
    const y3 = v[ic + 1] ?? 0;
    const z3 = v[ic + 2] ?? 0;
    const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (det === 0) continue;
    const c0 = Math.max(0, Math.floor((Math.min(x1, x2, x3) - minX) / size));
    const c1 = Math.min(width - 1, Math.ceil((Math.max(x1, x2, x3) - minX) / size));
    // Fila 0 = Norte (arriba).
    const r0 = Math.max(0, Math.floor((maxY - Math.max(y1, y2, y3)) / size));
    const r1 = Math.min(height - 1, Math.ceil((maxY - Math.min(y1, y2, y3)) / size));
    for (let r = r0; r <= r1; r++) {
      const y = maxY - r * size;
      for (let c = c0; c <= c1; c++) {
        const x = minX + c * size;
        const w1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
        const w2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
        const w3 = 1 - w1 - w2;
        if (w1 >= -1e-9 && w2 >= -1e-9 && w3 >= -1e-9)
          z[r * width + c] = w1 * z1 + w2 * z2 + w3 * z3;
      }
    }
  }
  const az = options.azimuth ?? (315 * Math.PI) / 180;
  const alt = options.altitude ?? (45 * Math.PI) / 180;
  const zenith = Math.PI / 2 - alt;
  const at = (r: number, c: number, fallback: number) => {
    const val =
      z[Math.min(height - 1, Math.max(0, r)) * width + Math.min(width - 1, Math.max(0, c))];
    return val === undefined || Number.isNaN(val) ? fallback : val;
  };
  const rgba = new Uint8ClampedArray(width * height * 4);
  const span = zMax - zMin || 1;
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const e = z[r * width + c] ?? NaN;
      if (Number.isNaN(e)) continue;
      // Pendientes de Horn con ventana 3×3 (bordes: el propio valor).
      const a = at(r - 1, c - 1, e);
      const b = at(r - 1, c, e);
      const cc = at(r - 1, c + 1, e);
      const d = at(r, c - 1, e);
      const f = at(r, c + 1, e);
      const g = at(r + 1, c - 1, e);
      const h = at(r + 1, c, e);
      const i = at(r + 1, c + 1, e);
      const dzdx = (cc + 2 * f + i - (a + 2 * d + g)) / (8 * size);
      const dzdy = (a + 2 * b + cc - (g + 2 * h + i)) / (8 * size); // positivo hacia el Norte
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      // Aspecto hacia donde baja el terreno, horario desde el Norte.
      const aspect = Math.atan2(-dzdx, -dzdy);
      const shade = Math.max(
        0,
        Math.cos(zenith) * Math.cos(slope) +
          Math.sin(zenith) * Math.sin(slope) * Math.cos(az - aspect),
      );
      const k = ((e - zMin) / span) * (TINT.length - 1);
      const lo = TINT[Math.floor(k)] ?? TINT[0] ?? [0, 0, 0];
      const hi = TINT[Math.min(TINT.length - 1, Math.floor(k) + 1)] ?? lo;
      const f2 = k - Math.floor(k);
      const light = 0.35 + 0.75 * shade;
      const o = (r * width + c) * 4;
      rgba[o] = (lo[0] + (hi[0] - lo[0]) * f2) * light;
      rgba[o + 1] = (lo[1] + (hi[1] - lo[1]) * f2) * light;
      rgba[o + 2] = (lo[2] + (hi[2] - lo[2]) * f2) * light;
      rgba[o + 3] = 255;
    }
  return {
    width,
    height,
    rgba,
    georef: { originX: minX, originY: maxY, pixelSizeX: size, pixelSizeY: -size, rotation: 0 },
    zMin,
    zMax,
  };
}
