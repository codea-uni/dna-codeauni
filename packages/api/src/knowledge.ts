import { explosiveSchema } from '@cronos/core';
import { z } from 'zod';

/**
 * Capas de conocimiento del agente de voladura. Cada capa se suma a la anterior y la más cercana
 * al diseño manda cuando dicen cosas distintas:
 * - `general`: marco teórico, conceptos prácticos, transcripciones y recomendaciones de
 *   especialistas; la mantiene la plataforma y la leen todas las empresas.
 * - `organization`: la empresa que usa el software (p. ej. la de explosivos que da el servicio):
 *   sus procedimientos y su catálogo de explosivos.
 * - `mine`: el sitio (la mina cliente): procedimientos de sitio, condiciones geológicas y
 *   parámetros.
 * - `project`: el proyecto: notas y lecciones propias; sus topografías y los explosivos
 *   habilitados (un subconjunto del catálogo de la empresa) viven en el diseño.
 */
export const KNOWLEDGE_LAYERS = ['general', 'organization', 'mine', 'project'] as const;
export const knowledgeLayerSchema = z.enum(KNOWLEDGE_LAYERS);
export type KnowledgeLayer = z.infer<typeof knowledgeLayerSchema>;

export const KNOWLEDGE_CATEGORIES = [
  'theory',
  'practice',
  'transcript',
  'recommendation',
  'procedure',
  'geology',
  'parameters',
  'explosives',
  'lesson',
  'other',
] as const;
export const knowledgeCategorySchema = z.enum(KNOWLEDGE_CATEGORIES);
export type KnowledgeCategory = z.infer<typeof knowledgeCategorySchema>;

/** Texto máximo de un documento (≈ un libro corto en Markdown). */
export const MAX_KNOWLEDGE_CHARS = 2_000_000;

/** Documento de una capa (sin el texto, para listas). */
export const knowledgeDocSchema = z.object({
  id: z.string(),
  layer: knowledgeLayerSchema,
  /** Dueño según la capa: empresa, mina o proyecto (`null` en la general). */
  ownerId: z.string().nullable(),
  category: knowledgeCategorySchema,
  title: z.string(),
  source: z.string().nullable(),
  chars: z.int().nonnegative(),
  chunks: z.int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type KnowledgeDoc = z.infer<typeof knowledgeDocSchema>;
export const knowledgeDocListSchema = z.object({
  docs: z.array(knowledgeDocSchema),
  canWrite: z.boolean(),
});
export const knowledgeDocDetailSchema = z.object({
  doc: knowledgeDocSchema,
  content: z.string(),
});
export type KnowledgeDocDetail = z.infer<typeof knowledgeDocDetailSchema>;

/** `GET /knowledge?layer=&ownerId=`. */
export const knowledgeQuerySchema = z.object({
  layer: knowledgeLayerSchema,
  ownerId: z.string().min(1).optional(),
});
export type KnowledgeQuery = z.infer<typeof knowledgeQuerySchema>;

/** `POST /knowledge`. */
export const createKnowledgeDocSchema = z.object({
  layer: knowledgeLayerSchema,
  ownerId: z.string().min(1).nullable(),
  category: knowledgeCategorySchema,
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().max(500).nullable().optional(),
  content: z.string().trim().min(1).max(MAX_KNOWLEDGE_CHARS),
});
export type CreateKnowledgeDoc = z.infer<typeof createKnowledgeDocSchema>;

/** `PATCH /knowledge/:id`. */
export const updateKnowledgeDocSchema = z.object({
  category: knowledgeCategorySchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().max(500).nullable().optional(),
  content: z.string().trim().min(1).max(MAX_KNOWLEDGE_CHARS).optional(),
});
export type UpdateKnowledgeDoc = z.infer<typeof updateKnowledgeDocSchema>;

/** `GET /projects/:id/knowledge/search?q=&layer=&limit=`. */
export const knowledgeSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  layer: knowledgeLayerSchema.optional(),
  limit: z.coerce.number().int().min(1).max(12).optional(),
});

export const knowledgeHitSchema = z.object({
  docId: z.string(),
  layer: knowledgeLayerSchema,
  /** Nombre del dueño de la capa (empresa, mina o proyecto). */
  owner: z.string().nullable(),
  category: knowledgeCategorySchema,
  title: z.string(),
  heading: z.string().nullable(),
  source: z.string().nullable(),
  text: z.string(),
  score: z.number(),
});
export type KnowledgeHit = z.infer<typeof knowledgeHitSchema>;
export const knowledgeSearchResultSchema = z.object({ hits: z.array(knowledgeHitSchema) });

/** Resumen de las capas que alcanzan a un proyecto (va en el contexto del agente). */
export const knowledgeLayerSummarySchema = z.object({
  layer: knowledgeLayerSchema,
  owner: z.string().nullable(),
  docs: z.array(z.object({ title: z.string(), category: knowledgeCategorySchema })),
});
export const projectKnowledgeSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  mine: z.object({ id: z.string(), name: z.string() }),
  project: z.object({ id: z.string(), name: z.string() }),
  layers: z.array(knowledgeLayerSummarySchema),
  /** Catálogo de explosivos de la empresa (nombres). */
  companyExplosives: z.array(z.string()),
});
export type ProjectKnowledge = z.infer<typeof projectKnowledgeSchema>;

/** Explosivo del catálogo de la empresa: la ficha del núcleo más quién y cuándo. */
export const companyExplosiveSchema = z.object({
  explosive: explosiveSchema,
  updatedAt: z.string(),
});
export type CompanyExplosive = z.infer<typeof companyExplosiveSchema>;
export const companyExplosiveListSchema = z.object({ explosives: z.array(companyExplosiveSchema) });
export const putCompanyExplosiveSchema = z.object({ explosive: explosiveSchema });

/** Paso de un preset: una herramienta del agente con sus argumentos (sin perímetro ni taladros). */
export const presetStepSchema = z.object({
  tool: z.string().min(1).max(60),
  args: z.record(z.string(), z.unknown()),
});
export type PresetStep = z.infer<typeof presetStepSchema>;

/** Preset de diseño: de la empresa (`mineId` null) o de un sitio. */
export const designPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  mineId: z.string().nullable(),
  mineName: z.string().nullable(),
  steps: z.array(presetStepSchema),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});
export type DesignPreset = z.infer<typeof designPresetSchema>;
export const designPresetListSchema = z.object({ presets: z.array(designPresetSchema) });

export const createDesignPresetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  /** Mina (sitio) a la que pertenece; null = de toda la empresa. */
  mineId: z.string().nullable(),
  steps: z.array(presetStepSchema).min(1).max(20),
});
export type CreateDesignPreset = z.infer<typeof createDesignPresetSchema>;
