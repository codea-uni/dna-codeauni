import type { DiffSummary } from '@cronos/core';
import { z } from 'zod';
import { mineSchema } from './organizations';
import { roleSchema } from './roles';

const id = z.string().min(1);
const isoDate = z.string();

/** Resumen de cambios respecto de la versión anterior (`diffProjects` del núcleo). */
export const diffSummarySchema = z.object({
  blastsAdded: z.number().int(),
  blastsRemoved: z.number().int(),
  holesAdded: z.number().int(),
  holesRemoved: z.number().int(),
  holesMoved: z.number().int(),
  holesGeometry: z.number().int(),
  holesCharge: z.number().int(),
  holesTiming: z.number().int(),
  holesOther: z.number().int(),
  blastFields: z.array(z.string()),
  projectFields: z.array(z.string()),
}) satisfies z.ZodType<DiffSummary>;

/** Metadatos de una versión (`ProjectVersion`); el contenido se pide aparte. */
export const versionSchema = z.object({
  id,
  projectId: id,
  /** 1, 2, 3… dentro del proyecto. */
  number: z.number().int().positive(),
  parentVersionId: id.nullable(),
  /** Si la versión restaura una anterior, cuál. */
  restoredFromVersionId: id.nullable(),
  authorId: id,
  authorName: z.string(),
  createdAt: isoDate,
  message: z.string(),
  /** Nombre del proyecto en esa versión. */
  projectName: z.string(),
  schemaVersion: z.number().int(),
  holeCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  /** SHA-256 del JSON: dos versiones con el mismo hash tienen el mismo contenido. */
  contentHash: z.string(),
  /** Cambios respecto de la versión anterior; `null` en la versión 1. */
  summary: diffSummarySchema.nullable(),
});
export type ProjectVersion = z.infer<typeof versionSchema>;
export const versionListSchema = z.object({ versions: z.array(versionSchema) });

/** Proyecto de una mina con su última versión. */
export const projectSummarySchema = z.object({
  id,
  mineId: id,
  name: z.string(),
  versionCount: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
  latest: versionSchema,
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export const projectListSchema = z.object({ projects: z.array(projectSummarySchema) });

/** `GET /projects/:id`: el proyecto, su mina y el rol de quien consulta. */
export const projectDetailSchema = z.object({
  project: projectSummarySchema,
  mine: mineSchema,
  role: roleSchema,
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/**
 * Proyecto nuevo en una mina: `file` es un ProjectFile (nuevo o importado de `.cronos.json`) que
 * el servidor migra y valida con el núcleo. El servidor le asigna un id nuevo y crea la versión 1.
 */
export const createProjectSchema = z.object({
  file: z.unknown(),
  message: z.string().trim().max(500).optional(),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

/**
 * Publicar una versión (D-14): `parentVersionId` es la versión sobre la que se trabajó. Si otro
 * publicó después, el servidor responde 409 `version_conflict` (concurrencia optimista).
 */
export const publishVersionSchema = z.object({
  parentVersionId: id,
  message: z.string().trim().min(1).max(500),
  file: z.unknown(),
});
export type PublishVersion = z.infer<typeof publishVersionSchema>;

/** Restaurar una versión anterior: crea una versión nueva con ese contenido; no borra nada. */
export const restoreVersionSchema = z.object({
  parentVersionId: id,
  message: z.string().trim().min(1).max(500),
});
export type RestoreVersion = z.infer<typeof restoreVersionSchema>;
