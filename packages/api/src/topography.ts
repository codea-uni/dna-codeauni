import { topographySurveySchema } from '@cronos/core';
import { z } from 'zod';

/**
 * Topografía de la mina (D-16): levantamientos con fecha cuyos binarios (assets `CRTS`, por hash
 * SHA-256) guarda el servidor una sola vez por empresa. Los proyectos los referencian, no los copian.
 */

/** Hash SHA-256 en hexadecimal (identificador de contenido de un asset). */
export const assetHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Tamaño máximo de un asset [bytes] (TIN, líneas, ortofoto, nube o modelo de bloques). */
export const MAX_ASSET_BYTES = 200 * 1024 * 1024;

/** `POST /mines/:id/assets/missing`: cuáles de estos hashes aún no tiene el servidor. */
export const missingAssetsSchema = z.object({ hashes: z.array(assetHashSchema).max(1000) });
export type MissingAssets = z.infer<typeof missingAssetsSchema>;
export const missingAssetsResultSchema = z.object({ missing: z.array(assetHashSchema) });

export const assetInfoSchema = z.object({
  hash: assetHashSchema,
  kind: z.enum(['tin', 'lines', 'image', 'cloud', 'blocks', 'workings']),
  sizeBytes: z.int().nonnegative(),
});
export type AssetInfo = z.infer<typeof assetInfoSchema>;

/** Levantamiento registrado en la mina, con quién y cuándo lo subió. */
export const mineSurveySchema = z.object({
  survey: topographySurveySchema,
  createdAt: z.string(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type MineSurvey = z.infer<typeof mineSurveySchema>;
export const mineSurveyListSchema = z.object({ surveys: z.array(mineSurveySchema) });

/**
 * Perímetro guardado en un proyecto de la mina (última versión de cada proyecto). Los perímetros
 * son polígonos en planta: la cota la pone la topografía sobre la que se usan; `topography` es la
 * del banco de su voladura cuando se guardó (sobre la que se dibujó), si tenía.
 */
export const minePerimeterSchema = z.object({
  id: z.string(),
  name: z.string(),
  project: z.object({ id: z.string(), name: z.string(), kind: z.enum(['surface', 'underground']) }),
  /** Área en planta [m²]. */
  area: z.number().nonnegative(),
  vertices: z.int().nonnegative(),
  /** Contorno reducido (≤ 48 vértices) para la miniatura [m]. */
  outline: z.array(z.tuple([z.number(), z.number()])),
  floorElevation: z.number().nullable(),
  topography: z.object({ id: z.string(), name: z.string(), surveyDate: z.string() }).nullable(),
  version: z.int().positive(),
  updatedAt: z.string(),
  authorName: z.string(),
});
export type MinePerimeter = z.infer<typeof minePerimeterSchema>;
export const minePerimeterListSchema = z.object({ perimeters: z.array(minePerimeterSchema) });
