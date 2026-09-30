import { z } from 'zod';
import { mineSchema } from './organizations';
import { roleSchema } from './roles';

const id = z.string().min(1);
const isoDate = z.string();

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
});
export type ProjectVersion = z.infer<typeof versionSchema>;

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
