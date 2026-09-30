import Martini from '@mapbox/martini';
import {
  imageSize,
  parseWorldFile,
  type ImageGeoref,
  type OrthoImageData,
  type TinData,
} from '@cronos/core';
import { fromArrayBuffer, type GeoTIFFImage } from 'geotiff';

/**
 * Rásteres georreferenciados (D-16): GeoTIFF de elevación (DEM) → TIN simplificado con MARTINI
 * (Evans et al., 1997, «Right-Triangulated Irregular Networks»), y ortofotos (GeoTIFF RGB o
 * JPG/PNG con archivo de mundo) → imagen WebP de hasta 8192 px con su georreferencia.
 */

/** Tolerancia vertical de la simplificación del DEM [m]. Supuesto S-17, editable. */
export const DEFAULT_DEM_TOLERANCE = 0.5;
/** Lado máximo de la grilla del DEM (2^10 + 1): ~2 M triángulos como mucho. */
const MAX_GRID = 1025;
/** Lado máximo de la ortofoto guardada [px]. */
export const MAX_IMAGE_SIZE = 8192;

export type ImageEncoder = (
  rgba: Uint8Array,
  width: number,
  height: number,
) => Promise<{ bytes: Uint8Array; mime: string }>;

/** Codifica RGBA como WebP con `OffscreenCanvas` (solo en el navegador). */
export const encodeWebp: ImageEncoder = async (rgba, width, height) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas 2D en el worker');
  const pixels = new Uint8ClampedArray(rgba.byteLength);
  pixels.set(rgba);
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || 'image/webp' };
};

export interface GeoTiffInfo {
  kind: 'dem' | 'image';
  width: number;
  height: number;
  epsg?: number;
  georef: ImageGeoref;
  noData: number | null;
}

function info(image: GeoTIFFImage): GeoTiffInfo {
  const [ox = 0, oy = 0] = image.getOrigin();
  const [rx = 1, ry = -1] = image.getResolution();
  const keys = image.getGeoKeys() ?? {};
  const epsgKey = (keys.ProjectedCSTypeGeoKey ?? keys.GeographicTypeGeoKey) as unknown;
  const epsg = typeof epsgKey === 'number' && epsgKey > 0 && epsgKey < 32767 ? epsgKey : undefined;
  const bits = image.getBitsPerSample();
  const kind = image.getSamplesPerPixel() >= 3 && bits <= 8 ? 'image' : 'dem';
  return {
    kind,
    width: image.getWidth(),
    height: image.getHeight(),
    ...(epsg !== undefined ? { epsg } : {}),
    georef: { originX: ox, originY: oy, pixelSizeX: rx, pixelSizeY: ry, rotation: 0 },
    noData: image.getGDALNoData(),
  };
}

const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export async function inspectGeoTiff(bytes: Uint8Array): Promise<GeoTiffInfo> {
  const tiff = await fromArrayBuffer(bufferOf(bytes));
  return info(await tiff.getImage());
}

/**
 * DEM → TIN: se remuestrea a una grilla (2^k+1)² (bilineal, hasta 1025²) y MARTINI la simplifica
 * con un error vertical máximo `tolerance`. Las celdas sin dato no generan triángulos.
 */
export async function demToTin(
  bytes: Uint8Array,
  tolerance = DEFAULT_DEM_TOLERANCE,
): Promise<{ tin: TinData; info: GeoTiffInfo; grid: number }> {
  const tiff = await fromArrayBuffer(bufferOf(bytes));
  const main = await tiff.getImage();
  const meta = info(main);
  const k = Math.min(
    10,
    Math.max(1, Math.ceil(Math.log2(Math.max(meta.width, meta.height, 2) - 1))),
  );
  const s = Math.min(MAX_GRID, 2 ** k + 1);
  // Con vistas generales (overviews), se lee la más chica que alcance para la grilla.
  let source = main;
  for (let i = 1; i < (await tiff.getImageCount()); i++) {
    const ov = await tiff.getImage(i);
    if (ov.getWidth() >= s && ov.getWidth() < source.getWidth()) source = ov;
  }
  const raster = (await source.readRasters({
    samples: [0],
    width: s,
    height: s,
    resampleMethod: 'bilinear',
    interleave: true,
  })) as unknown as ArrayLike<number>;
  const grid = new Float32Array(s * s);
  const valid = new Uint8Array(s * s);
  let min = Infinity;
  for (let i = 0; i < s * s; i++) {
    const v = raster[i] ?? NaN;
    const ok = Number.isFinite(v) && (meta.noData === null || v !== meta.noData) && v > -1e30;
    valid[i] = ok ? 1 : 0;
    grid[i] = ok ? v : NaN;
    if (ok && v < min) min = v;
  }
  // MARTINI no admite huecos: se rellenan con la mínima y luego se descartan esos triángulos.
  for (let i = 0; i < s * s; i++) if (!valid[i]) grid[i] = Number.isFinite(min) ? min : 0;
  const mesh = new Martini(s).createTile(grid).getMesh(tolerance);
  const { georef } = meta;
  const cellX = (meta.width * georef.pixelSizeX) / s;
  const cellY = (meta.height * -georef.pixelSizeY) / s;
  const nv = mesh.vertices.length / 2;
  const vertices = new Float64Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const gx = mesh.vertices[v * 2] ?? 0;
    const gy = mesh.vertices[v * 2 + 1] ?? 0;
    vertices[v * 3] = georef.originX + (gx + 0.5) * cellX;
    vertices[v * 3 + 1] = georef.originY - (gy + 0.5) * cellY;
    vertices[v * 3 + 2] = grid[gy * s + gx] ?? 0;
  }
  const tri: number[] = [];
  const ok = (v: number) =>
    valid[(mesh.vertices[v * 2 + 1] ?? 0) * s + (mesh.vertices[v * 2] ?? 0)] === 1;
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const a = mesh.triangles[t] ?? 0;
    const b = mesh.triangles[t + 1] ?? 0;
    const c = mesh.triangles[t + 2] ?? 0;
    if (ok(a) && ok(b) && ok(c)) tri.push(a, b, c);
  }
  return { tin: { vertices, triangles: Uint32Array.from(tri) }, info: meta, grid: s };
}

/** Ortofoto de un GeoTIFF RGB(A): se reduce a 8192 px de lado como mucho y se codifica. */
export async function geoTiffImage(
  bytes: Uint8Array,
  encode: ImageEncoder = encodeWebp,
): Promise<{ image: OrthoImageData; info: GeoTiffInfo }> {
  const tiff = await fromArrayBuffer(bufferOf(bytes));
  const main = await tiff.getImage();
  const meta = info(main);
  const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(meta.width, meta.height));
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  const rgb = (await main.readRGB({
    interleave: true,
    width,
    height,
    enableAlpha: true,
  })) as unknown as ArrayLike<number>;
  const channels = rgb.length / (width * height);
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = rgb[p * channels] ?? 0;
    rgba[p * 4 + 1] = rgb[p * channels + 1] ?? 0;
    rgba[p * 4 + 2] = rgb[p * channels + 2] ?? 0;
    rgba[p * 4 + 3] = channels >= 4 ? (rgb[p * channels + 3] ?? 255) : 255;
  }
  const encoded = await encode(rgba, width, height);
  const georef: ImageGeoref = {
    ...meta.georef,
    pixelSizeX: meta.georef.pixelSizeX / scale,
    pixelSizeY: meta.georef.pixelSizeY / scale,
  };
  return { image: { mime: encoded.mime, width, height, georef, bytes: encoded.bytes }, info: meta };
}

/**
 * JPG/PNG con archivo de mundo: se guarda la imagen tal cual si cabe en 8192 px; si no, se
 * reduce y se codifica como WebP.
 */
export async function worldFileImage(
  imageBytes: Uint8Array,
  worldText: string,
): Promise<OrthoImageData> {
  const size = imageSize(imageBytes);
  if (!size) throw new Error('La imagen no es PNG, JPEG ni WebP');
  const georef = parseWorldFile(worldText);
  if (!georef) throw new Error('El archivo de mundo no tiene las seis líneas');
  const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(size.width, size.height));
  if (scale === 1) return { ...size, georef, bytes: imageBytes };
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const bitmap = await createImageBitmap(new Blob([imageBytes as BlobPart], { type: size.mime }), {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  return {
    mime: blob.type || 'image/webp',
    width,
    height,
    georef: {
      ...georef,
      pixelSizeX: georef.pixelSizeX / scale,
      pixelSizeY: georef.pixelSizeY / scale,
    },
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}
