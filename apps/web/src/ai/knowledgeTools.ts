import { knowledgeCategorySchema, KNOWLEDGE_LAYERS } from '@cronos/api';
import { commands, newId, type Explosive } from '@cronos/core';
import { z } from 'zod';
import { session } from '../session';
import { api } from '../server/api';
import { useProjectSession } from '../server/projectSession';
import { loadKnowledge, serverProjectId } from './knowledge';
import { readOnlyGuard, ToolError, type ToolDef } from './tools';

/** Herramientas del agente sobre las capas de conocimiento (ver `knowledge.ts`). */

function requireServerProject(): string {
  const id = serverProjectId();
  if (!id)
    throw new ToolError(
      'Knowledge layers need a project opened from the server (Cronos with accounts). In local mode only the built-in blasting skill is available.',
    );
  return id;
}

// ------------------------------------------------------------------ Herramientas

const layerSchema = z.enum(KNOWLEDGE_LAYERS);

const searchSchema = z.object({
  query: z
    .string()
    .min(2)
    .describe('What to look for, in Spanish keywords (e.g. "procedimiento carguío taladros con agua").'),
  layer: layerSchema
    .optional()
    .describe('Only one layer: general (theory, specialists), organization (company procedures), mine (site procedures, geology), project.'),
});

async function searchKnowledge(args: z.infer<typeof searchSchema>) {
  const projectId = requireServerProject();
  const hits = await api.searchKnowledge(projectId, args.query, {
    ...(args.layer ? { layer: args.layer } : {}),
    limit: 6,
  });
  if (!hits.length)
    return {
      hits: [],
      note: 'Nothing found in the knowledge layers. Say so; use only the built-in skill rules or ask the engineer.',
    };
  return {
    hits: hits.map((h) => ({
      layer: h.layer,
      owner: h.owner,
      document: h.title,
      section: h.heading,
      source: h.source,
      text: h.text.length > 900 ? `${h.text.slice(0, 900)}…` : h.text,
    })),
  };
}

const LAYER_FIELDS = (e: Explosive) => ({
  name: e.name,
  manufacturer: e.manufacturer ?? null,
  family: e.family,
  form: e.form,
  density_kg_m3: e.density,
  vod_m_s: e.vod,
  rws: e.rws,
  water_resistance: e.waterResistance,
});

async function companyExplosives() {
  requireServerProject();
  const orgId = useProjectSession.getState().current?.mine.organizationId;
  if (!orgId) throw new ToolError('No company for this project.');
  const list = await api.companyExplosives(orgId);
  const enabled = new Set(
    session.document.project.library.explosives.map((e) => e.name.toLowerCase()),
  );
  return {
    company_catalog: list.map((c) => ({
      ...LAYER_FIELDS(c.explosive),
      enabled_in_project: enabled.has(c.explosive.name.toLowerCase()),
    })),
    project_explosives: session.document.project.library.explosives.map((e) => e.name),
    ...(list.length === 0
      ? { note: 'The company has no explosive catalog loaded yet (Conocimiento → Explosivos).' }
      : {}),
  };
}

const enableSchema = z.object({
  name: z.string().min(1).describe('Explosive name from the company catalog.'),
});

/** Habilita en el proyecto un explosivo del catálogo de la empresa (copia la ficha; se deshace). */
async function enableExplosive(args: z.infer<typeof enableSchema>) {
  readOnlyGuard();
  const orgId = useProjectSession.getState().current?.mine.organizationId;
  requireServerProject();
  if (!orgId) throw new ToolError('No company for this project.');
  const list = (await api.companyExplosives(orgId)).map((c) => c.explosive);
  const q = args.name.trim().toLowerCase();
  const found =
    list.find((e) => e.name.toLowerCase() === q) ??
    (() => {
      const partial = list.filter((e) => e.name.toLowerCase().includes(q));
      return partial.length === 1 ? partial[0] : undefined;
    })();
  if (!found)
    throw new ToolError(
      `"${args.name}" is not in the company catalog. Catalog: ${list.map((e) => e.name).join('; ') || '(empty)'}.`,
    );
  const library = session.document.project.library;
  if (library.explosives.some((e) => e.name.toLowerCase() === found.name.toLowerCase()))
    return { enabled: found.name, note: 'It was already enabled in this project.' };
  // Id nuevo: la ficha del proyecto es una copia (la de la empresa puede cambiar después).
  session.document.dispatch(
    commands.setLibrary({
      ...library,
      explosives: [...library.explosives, { ...found, id: newId<'Explosive'>() }],
    }),
    `IA: habilitar ${found.name}`,
  );
  return { enabled: found.name, project_explosives: [...library.explosives.map((e) => e.name), found.name] };
}

const noteSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(2).describe('The note in plain Spanish, with the numbers and conditions.'),
  category: knowledgeCategorySchema.optional().describe('lesson (default), procedure, geology, parameters, other.'),
});

/** Guarda una nota o lección en la capa del proyecto (para próximas conversaciones). */
async function saveProjectNote(args: z.infer<typeof noteSchema>) {
  readOnlyGuard();
  const projectId = requireServerProject();
  const doc = await api.createKnowledgeDoc({
    layer: 'project',
    ownerId: projectId,
    category: args.category ?? 'lesson',
    title: args.title,
    source: 'Conversación con el asistente',
    content: args.content,
  });
  void loadKnowledge(true);
  return { saved: doc.title, layer: 'project' };
}

export const KNOWLEDGE_TOOLS: Record<string, ToolDef> = {
  search_knowledge: {
    description:
      'Search the knowledge layers of this project: general blasting theory and specialist recommendations, the company procedures and explosives, the site (mine) procedures, geology and parameters, and project notes. Use it before answering procedure/site questions or proposing a design when those layers have documents; cite layer and document.',
    schema: searchSchema,
    run: searchKnowledge,
  },
  company_explosives: {
    description:
      'List the company explosive catalog (name, family, density, VOD, RWS, water resistance) and which ones are enabled in this project.',
    schema: z.object({}),
    run: companyExplosives,
  },
  enable_explosive: {
    description:
      'Enable in this project an explosive from the company catalog (copies its data sheet into the design library so it can be used to charge holes). Undoable.',
    schema: enableSchema,
    run: enableExplosive,
  },
  save_project_note: {
    description:
      'Save a note or lesson learned in the project knowledge layer (e.g. what happened in a blast, a site condition the engineer told you). Only when the user asks to remember/save it.',
    schema: noteSchema,
    run: saveProjectNote,
  },
};

export const KNOWLEDGE_READ_ONLY = ['search_knowledge', 'company_explosives', 'save_project_note'];
