import type { Bounds3 } from '../model/types';
import type { TopoWarning } from './data';

export interface TopoCheckContext {
  /** EPSG del archivo (declarado o elegido) y del proyecto o la mina. */
  sourceEpsg?: number;
  targetEpsg?: number;
  /** Zona de trabajo del proyecto (taladros o levantamientos previos), en el CRS de destino. */
  projectBounds?: Bounds3;
}

/** Distancia en planta a partir de la cual el archivo se considera lejos del proyecto [m]. */
export const FAR_FROM_PROJECT = 10_000;

/**
 * Trampas de importación de `03 §5` aplicadas a la topografía, sobre la caja envolvente de lo
 * leído (O(1)). Solo avisan: el usuario decide en la vista previa.
 */
export function checkTopography(
  bounds: Bounds3,
  count: number,
  ctx: TopoCheckContext = {},
): TopoWarning[] {
  const w: TopoWarning[] = [];
  if (count === 0) return [{ code: 'topo.empty' }];
  const geographic =
    bounds.minX >= -180 && bounds.maxX <= 180 && bounds.minY >= -90 && bounds.maxY <= 90;
  if (geographic && ctx.sourceEpsg !== 4326) w.push({ code: 'topo.degrees' });
  if (ctx.sourceEpsg === undefined && !geographic) w.push({ code: 'topo.noCrs' });
  else if (
    ctx.sourceEpsg !== undefined &&
    ctx.targetEpsg !== undefined &&
    ctx.sourceEpsg !== ctx.targetEpsg
  )
    w.push({ code: 'topo.crsDiffers', params: { from: ctx.sourceEpsg, to: ctx.targetEpsg } });
  // UTM sur: Norte de 7 cifras (hasta 10 000 000) y Este de 6 (166 000–834 000).
  const utmE = (v: number) => v >= 100_000 && v < 1_000_000;
  const utmN = (v: number) => v >= 1_000_000 && v <= 10_000_000;
  if (utmN(bounds.minX) && utmN(bounds.maxX) && utmE(bounds.minY) && utmE(bounds.maxY))
    w.push({ code: 'topo.swappedNE' });
  if (bounds.minZ === 0 && bounds.maxZ === 0) w.push({ code: 'topo.noZ' });
  const p = ctx.projectBounds;
  if (p && Number.isFinite(p.minX)) {
    const dx = Math.max(0, p.minX - bounds.maxX, bounds.minX - p.maxX);
    const dy = Math.max(0, p.minY - bounds.maxY, bounds.minY - p.maxY);
    const d = Math.hypot(dx, dy);
    if (d > FAR_FROM_PROJECT)
      w.push({ code: 'topo.farFromProject', params: { km: Math.round(d / 1000) } });
  }
  return w;
}

/** Intercambia en el lugar X e Y de coordenadas x, y, z intercaladas (Norte/Este cambiados). */
export function swapXY(xyz: Float64Array | number[]): void {
  for (let i = 0; i + 1 < xyz.length; i += 3) {
    const x = xyz[i] ?? 0;
    xyz[i] = xyz[i + 1] ?? 0;
    xyz[i + 1] = x;
  }
}
