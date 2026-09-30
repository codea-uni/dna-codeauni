import type { LineRole } from './asset';

/** Aviso de importación: `code` estable (la web lo traduce, D-11) y parámetros. */
export interface TopoWarning {
  code: string;
  params?: Record<string, string | number>;
}

/** Polilínea 3D de referencia leída de un archivo (x, y, z intercalados). */
export interface TopoLine {
  coords: number[];
  role: LineRole;
  closed: boolean;
}

/**
 * Contenido topográfico leído de un archivo, antes de armar el levantamiento: puntos sueltos,
 * líneas de referencia y, si el archivo ya trae triangulación, sus caras.
 */
export interface TopoData {
  /** x (Este), y (Norte), z intercalados [m] (Float64Array para nubes grandes). */
  points: number[] | Float64Array;
  lines: TopoLine[];
  faces?: { vertices: Float64Array; triangles: Uint32Array };
  /** EPSG declarado en el propio archivo (GeoTIFF, LandXML), si lo hay. */
  epsg?: number;
  warnings: TopoWarning[];
}

export const emptyTopo = (): TopoData => ({ points: [], lines: [], warnings: [] });
