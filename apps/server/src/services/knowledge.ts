import type { KnowledgeHit, KnowledgeLayer } from '@cronos/api';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/schema';

/** Largo objetivo de un trozo [caracteres]: cabe en la respuesta de una herramienta sin saturarla. */
export const CHUNK_CHARS = 1400;

export interface Chunk {
  heading: string | null;
  text: string;
}

/**
 * Parte un texto (Markdown o plano) en trozos para la búsqueda: cada título de Markdown abre una
 * sección (el trozo lleva la ruta de títulos, «Agua > Matriz agua → producto») y una sección
 * larga se corta entre párrafos (o entre frases si un párrafo solo ya es muy largo).
 */
export function chunkText(content: string, max = CHUNK_CHARS): Chunk[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const path: string[] = [];
  const sections: { heading: string | null; body: string[] }[] = [{ heading: null, body: [] }];
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h?.[1] && h[2]) {
      const level = h[1].length;
      path.length = Math.min(path.length, level - 1);
      while (path.length < level - 1) path.push('');
      path.push(h[2]);
      sections.push({ heading: path.filter(Boolean).join(' > '), body: [] });
    } else {
      sections[sections.length - 1]?.body.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const s of sections) {
    const paragraphs = s.body
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => (p.length <= max ? [p] : splitLong(p, max)));
    let current = '';
    for (const p of paragraphs) {
      if (current && current.length + p.length + 2 > max) {
        chunks.push({ heading: s.heading, text: current });
        current = '';
      }
      current = current ? `${current}\n\n${p}` : p;
    }
    if (current) chunks.push({ heading: s.heading, text: current });
  }
  return chunks;
}

/** Corta un párrafo largo entre frases (o a la fuerza si no hay puntos). */
function splitLong(p: string, max: number): string[] {
  const sentences = p.match(/[^.!?\n]+[.!?]*\s*/g) ?? [p];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
    while (cur.length > max) {
      out.push(cur.slice(0, max).trim());
      cur = cur.slice(max);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Guarda (o reemplaza) los trozos de un documento. */
export async function writeChunks(
  db: Kysely<Database>,
  docId: string,
  content: string,
): Promise<number> {
  await db.deleteFrom('knowledge_chunk').where('docId', '=', docId).execute();
  const chunks = chunkText(content);
  // Por tandas: un libro largo son miles de trozos y Postgres limita los parámetros por consulta.
  for (let i = 0; i < chunks.length; i += 500) {
    await db
      .insertInto('knowledge_chunk')
      .values(
        chunks
          .slice(i, i + 500)
          .map((c, k) => ({ docId, ordinal: i + k, heading: c.heading, text: c.text })),
      )
      .execute();
  }
  return chunks.length;
}

/** Peso de cada capa en el orden de resultados: la más cercana al diseño manda (D: capas). */
export const LAYER_BOOST: Record<KnowledgeLayer, number> = {
  project: 1.6,
  mine: 1.4,
  organization: 1.2,
  general: 1,
};

/** Dónde busca un proyecto: la capa general, su empresa, su mina y él mismo. */
export interface SearchScope {
  organizationId: string;
  mineId: string;
  projectId: string;
}

/**
 * Busca en las capas que alcanzan al proyecto (texto completo en español, sin tildes). Cualquier
 * palabra de la pregunta suma (OR), así una pregunta hablada larga también encuentra resultados.
 */
export async function searchKnowledge(
  db: Kysely<Database>,
  scope: SearchScope,
  q: string,
  options: { layer?: KnowledgeLayer; limit?: number } = {},
): Promise<KnowledgeHit[]> {
  const limit = options.limit ?? 6;
  const query = sql`nullif(replace(plainto_tsquery('spanish', cronos_fold(${q}))::text, '&', '|'), '')::tsquery`;
  const boost = sql`case d."layer" when 'project' then ${LAYER_BOOST.project}::float8 when 'mine' then ${LAYER_BOOST.mine}::float8 when 'organization' then ${LAYER_BOOST.organization}::float8 else 1.0::float8 end`;
  const layerFilter = options.layer ? sql`and d."layer" = ${options.layer}` : sql``;
  const rows = await sql<{
    docId: string;
    layer: KnowledgeLayer;
    owner: string | null;
    category: KnowledgeHit['category'];
    title: string;
    heading: string | null;
    source: string | null;
    text: string;
    score: number;
  }>`
    select c."docId", d."layer", d."category", d."title", c."heading", d."source", c."text",
      coalesce(o."name", m."name", p."name") as "owner",
      (ts_rank_cd(c."search", ${query}) * ${boost})::float8 as "score"
    from "knowledge_chunk" c
    join "knowledge_doc" d on d."id" = c."docId"
    left join "organization" o on o."id" = d."organizationId"
    left join "mine" m on m."id" = d."mineId"
    left join "project" p on p."id" = d."projectId"
    where c."search" @@ ${query}
      and (d."layer" = 'general'
        or d."organizationId" = ${scope.organizationId}
        or d."mineId" = ${scope.mineId}
        or d."projectId" = ${scope.projectId})
      ${layerFilter}
    order by "score" desc, d."layer", c."ordinal"
    limit ${limit}`.execute(db);
  return rows.rows.map((r) => ({ ...r, score: Math.round(r.score * 1e4) / 1e4 }));
}
