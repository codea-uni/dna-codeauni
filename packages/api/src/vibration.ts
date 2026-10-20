import { monitoringPointSchema, seismographRecordSchema } from '@cronos/core';
import { z } from 'zod';

/**
 * Vibración de la mina: puntos de control compartidos entre sus proyectos (comunidad, taludes,
 * labores) y mediciones de sismógrafo para calibrar la ley (factor de terreno).
 */

/** Punto de control de la mina con su origen. */
export const minePointSchema = z.object({
  point: monitoringPointSchema,
  /** Proyecto desde el que se compartió (null si se borró). */
  sourceProjectId: z.string().nullable(),
  sourceProjectName: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
});
export type MinePoint = z.infer<typeof minePointSchema>;
export const minePointListSchema = z.object({ points: z.array(minePointSchema) });

/** `PUT /mines/:id/monitoring-points/:pointId`: crea o reemplaza el punto de la mina. */
export const saveMinePointSchema = z.object({
  point: monitoringPointSchema,
  sourceProjectId: z.string().nullable().optional(),
});
export type SaveMinePoint = z.infer<typeof saveMinePointSchema>;

export const vibrationRecordListSchema = z.object({ records: z.array(seismographRecordSchema) });

/** `POST /mines/:id/vibration-records`: crea o reemplaza mediciones (por id). */
export const saveVibrationRecordsSchema = z.object({
  records: z.array(seismographRecordSchema).min(1).max(5000),
});
export type SaveVibrationRecords = z.infer<typeof saveVibrationRecordsSchema>;
