import {
  FEEDBACK_CONTEXT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MAX_CHARS,
  feedbackContextBytes,
  feedbackQuerySchema,
  sendFeedbackSchema,
  updateFeedbackSchema,
  type FeedbackCreated,
  type FeedbackDetail,
  type FeedbackItem,
  type FeedbackList,
  type FeedbackSummary,
  type FeedbackTheme,
} from '@cronos/api';
import { uuidv7 } from '@cronos/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppDeps } from '../app';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser } from '../http/session';
import { userOrganization } from '../services/access';
import { HourlyLimiter } from './ai';
import { requireSuperAdmin } from './platform';

/** Pedidos por persona y hora: de sobra para el uso normal, corta el spam. */
export const FEEDBACK_PER_HOUR = 20;
/** Pedidos abiertos que se mandan a la IA para agrupar. */
const SUMMARIZE_MAX = 200;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_LITE_MODEL = 'gemini-flash-lite-latest';

type Req = FastifyRequest<{ Params: Record<string, string> }>;

/** Consulta base del buzón: el pedido con su empresa y su autor (sin la captura). */
function baseQuery(db: Db) {
  return db
    .selectFrom('guide_feedback as f')
    .leftJoin('organization as o', 'o.id', 'f.organizationId')
    .leftJoin('user as u', 'u.id', 'f.userId')
    .select([
      'f.id',
      'f.createdAt',
      'f.updatedAt',
      'f.organizationId',
      'o.name as organizationName',
      'f.userId',
      'u.name as userName',
      'u.email as userEmail',
      'f.mineId',
      'f.projectId',
      'f.kind',
      'f.text',
      'f.status',
      'f.theme',
      'f.adminNote',
      sql<string | null>`f."context"->>'screen'`.as('screen'),
      sql<string | null>`f."context"->>'tool'`.as('tool'),
      sql<boolean>`f."screenshot" is not null`.as('hasScreenshot'),
    ]);
}

type ItemRow = Awaited<ReturnType<ReturnType<typeof baseQuery>['executeTakeFirstOrThrow']>>;

function toItem(r: ItemRow): FeedbackItem {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    organizationId: r.organizationId,
    organizationName: r.organizationName,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    mineId: r.mineId,
    projectId: r.projectId,
    kind: r.kind,
    text: r.text,
    status: r.status,
    theme: r.theme,
    adminNote: r.adminNote,
    screen: r.screen,
    tool: r.tool,
    hasScreenshot: r.hasScreenshot,
  };
}

const emptyToNull = (v: string | null | undefined): string | null =>
  v === undefined || v === null || v === '' ? null : v;

/** `%`, `_` y `\` literales en un patrón ILIKE. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Mina y proyecto del pedido solo si son de la empresa de quien lo envía; si no (proyecto local o
 * de otra empresa), quedan en null. El pedido se guarda igual.
 */
async function ownedScope(
  db: Db,
  organizationId: string | null,
  mineId: string | null | undefined,
  projectId: string | null | undefined,
): Promise<{ mineId: string | null; projectId: string | null }> {
  if (!organizationId) return { mineId: null, projectId: null };
  let mine: string | null = null;
  let project: string | null = null;
  if (projectId) {
    const row = await db
      .selectFrom('project')
      .innerJoin('mine', 'mine.id', 'project.mineId')
      .select(['project.id', 'mine.id as mineId'])
      .where('project.id', '=', projectId)
      .where('mine.organizationId', '=', organizationId)
      .executeTakeFirst();
    if (row) {
      project = row.id;
      mine = row.mineId;
    }
  }
  if (!mine && mineId) {
    const row = await db
      .selectFrom('mine')
      .select('id')
      .where('id', '=', mineId)
      .where('organizationId', '=', organizationId)
      .executeTakeFirst();
    mine = row?.id ?? null;
  }
  return { mineId: mine, projectId: project };
}

/** Respuesta de la IA al agrupar (se valida: lo que no calza se descarta). */
const aiThemesSchema = z.object({
  themes: z.array(
    z.object({
      theme: z.string().min(1),
      summary: z.string().default(''),
      ids: z.array(z.string()).default([]),
      suggestion: z.string().default(''),
    }),
  ),
});

const SUMMARIZE_INSTRUCTION = `Eres quien ordena el buzón de mejoras de Cronos, una aplicación web de diseño y simulación de voladuras mineras (Open Pit y Underground).
Recibes pedidos de usuarios: kind = bug (algo no funciona), idea (quisiera que hiciera algo) o question (no entiende algo), con la pantalla y la herramienta donde estaban.
Agrúpalos en temas: pedidos que apuntan al mismo problema o a la misma mejora van juntos. Cada pedido va en un solo tema; un pedido suelto puede ser su propio tema.
Responde solo JSON con esta forma: {"themes":[{"theme":"título corto","summary":"qué piden, en 1 o 2 frases","ids":["id1","id2"],"suggestion":"qué conviene programar o explicar, en 1 frase"}]}.
Todo en español. Ordena los temas de más pedidos a menos. Usa solo ids de la lista.`;

/** Pedido recortado para la IA: texto, tipo y lo esencial del contexto. */
function compactForAi(r: {
  id: string;
  kind: string;
  text: string;
  context: Record<string, unknown>;
}): Record<string, unknown> {
  const c = r.context;
  const errors = Array.isArray(c.recentErrors)
    ? c.recentErrors
        .slice(-2)
        .map((e: unknown) =>
          typeof e === 'object' && e && 'message' in e ? String(e.message).slice(0, 160) : '',
        )
        .filter(Boolean)
    : [];
  return {
    id: r.id,
    kind: r.kind,
    text: r.text.slice(0, 600),
    ...(typeof c.screen === 'string' ? { screen: c.screen.slice(0, 120) } : {}),
    ...(typeof c.tool === 'string' ? { tool: c.tool } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * Buzón de mejoras: cualquier persona con sesión envía pedidos (`POST /feedback`) y el
 * superadministrador los revisa en la consola de la plataforma (`/platform/feedback`). Nada de
 * esto cambia el producto: solo ordena lo que se decide programar.
 */
export function feedbackRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;
  const limiter = new HourlyLimiter(FEEDBACK_PER_HOUR);

  // La captura llega como data URL: el límite deja pasar ~1,5 MB y la ruta da el error claro.
  app.post(
    '/feedback',
    { bodyLimit: 2 * 1024 * 1024 + FEEDBACK_CONTEXT_MAX_BYTES },
    async (req, reply) => {
      const user = await requireUser(deps.auth, db, req, reply);
      if (!user) return reply;
      const parsed = sendFeedbackSchema.safeParse(req.body);
      if (!parsed.success) return sendError(reply, 400, 'invalid_body', parsed.error.message);
      const body = parsed.data;
      if (feedbackContextBytes(body.context) > FEEDBACK_CONTEXT_MAX_BYTES)
        return sendError(reply, 413, 'context_too_large', 'Context is larger than 64 KB');
      if (body.screenshot && body.screenshot.length > FEEDBACK_SCREENSHOT_MAX_CHARS)
        return sendError(reply, 413, 'screenshot_too_large', 'Screenshot is larger than 1.5 MB');
      if (!limiter.take(user.id))
        return sendError(reply, 429, 'feedback_rate_limited', 'Too many requests this hour');
      const org = await userOrganization(db, user.id);
      const organizationId = org?.id ?? null;
      const scope = await ownedScope(db, organizationId, body.mineId, body.projectId);
      const id = uuidv7();
      const row = await db
        .insertInto('guide_feedback')
        .values({
          id,
          organizationId,
          userId: user.id,
          ...scope,
          kind: body.kind,
          text: body.text,
          context: JSON.stringify(body.context),
          screenshot: body.screenshot ?? null,
          adminNote: null,
          theme: null,
        })
        .returning('createdAt')
        .executeTakeFirstOrThrow();
      const created: FeedbackCreated = { id, createdAt: row.createdAt.toISOString() };
      return reply.code(201).send(created);
    },
  );

  app.get('/platform/feedback', async (req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    const parsed = feedbackQuerySchema.safeParse(req.query);
    if (!parsed.success) return sendError(reply, 400, 'invalid_query', parsed.error.message);
    const { status, kind, organizationId, q, ids, limit, offset } = parsed.data;
    let query = baseQuery(db);
    if (status) query = query.where('f.status', '=', status);
    if (kind) query = query.where('f.kind', '=', kind);
    if (organizationId) query = query.where('f.organizationId', '=', organizationId);
    if (ids) {
      const list = ids.split(',').filter(Boolean);
      query = list.length > 0 ? query.where('f.id', 'in', list) : query;
    }
    if (q) {
      const pattern = likePattern(q);
      query = query.where((eb) =>
        eb.or([
          eb('f.text', 'ilike', pattern),
          eb('f.theme', 'ilike', pattern),
          eb('f.adminNote', 'ilike', pattern),
          eb('u.name', 'ilike', pattern),
          eb('u.email', 'ilike', pattern),
        ]),
      );
    }
    const [rows, total, fresh] = await Promise.all([
      query
        .orderBy('f.createdAt', 'desc')
        .orderBy('f.id', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
      query
        .clearSelect()
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('guide_feedback')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('status', '=', 'new')
        .executeTakeFirstOrThrow(),
    ]);
    const body: FeedbackList = {
      items: rows.map(toItem),
      total: Number(total.n),
      newCount: Number(fresh.n),
    };
    return reply.send(body);
  });

  app.get('/platform/feedback/:id', async (req: Req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    const id = req.params.id ?? '';
    const row = await baseQuery(db)
      .leftJoin('mine as m', 'm.id', 'f.mineId')
      .leftJoin('project as p', 'p.id', 'f.projectId')
      .select(['f.context', 'f.screenshot', 'm.name as mineName', 'p.name as projectName'])
      .where('f.id', '=', id)
      .executeTakeFirst();
    if (!row) return sendError(reply, 404, 'not_found', 'Feedback not found');
    const body: FeedbackDetail = {
      ...toItem(row),
      context: row.context,
      screenshot: row.screenshot,
      mineName: row.mineName,
      projectName: row.projectName,
    };
    return reply.send(body);
  });

  app.patch('/platform/feedback/:id', async (req: Req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    const parsed = updateFeedbackSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'invalid_body', parsed.error.message);
    const { status, adminNote, theme } = parsed.data;
    const id = req.params.id ?? '';
    const updated = await db
      .updateTable('guide_feedback')
      .set({
        updatedAt: new Date(),
        ...(status !== undefined ? { status } : {}),
        ...(adminNote !== undefined ? { adminNote: emptyToNull(adminNote?.trim()) } : {}),
        ...(theme !== undefined ? { theme: emptyToNull(theme) } : {}),
      })
      .where('id', '=', id)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0)
      return sendError(reply, 404, 'not_found', 'Feedback not found');
    const row = await baseQuery(db).where('f.id', '=', id).executeTakeFirstOrThrow();
    return reply.send(toItem(row));
  });

  // Agrupar los pedidos abiertos en temas con el modelo barato (solo texto, sin capturas).
  app.post('/platform/feedback/summarize', async (req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    if (!deps.ai) return sendError(reply, 503, 'ai_not_configured', 'GEMINI_API_KEY is not set');
    const rows = await db
      .selectFrom('guide_feedback')
      .select(['id', 'kind', 'text', 'context'])
      .where('status', 'in', ['new', 'reviewing'])
      .orderBy('createdAt', 'desc')
      .limit(SUMMARIZE_MAX)
      .execute();
    if (rows.length === 0) {
      const empty: FeedbackSummary = { themes: [], considered: 0 };
      return reply.send(empty);
    }
    const model = deps.ai.liteModel ?? DEFAULT_LITE_MODEL;
    const doFetch = deps.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.ai.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SUMMARIZE_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(rows.map(compactForAi)) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      return sendError(reply, 502, 'ai_upstream', err instanceof Error ? err.message : String(err));
    }
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    } | null;
    if (!res.ok || !data)
      return sendError(reply, 502, 'ai_upstream', data?.error?.message ?? `Gemini ${res.status}`);
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    let themes: z.infer<typeof aiThemesSchema>['themes'];
    try {
      const json: unknown = JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, ''));
      themes = aiThemesSchema.parse(json).themes;
    } catch {
      return sendError(reply, 502, 'ai_bad_response', 'The model did not return valid themes');
    }
    // Solo ids reales, sin repetir un pedido en dos temas.
    const known = new Set(rows.map((r) => r.id));
    const used = new Set<string>();
    const result: FeedbackTheme[] = [];
    for (const th of themes) {
      const ids = th.ids.filter((i) => known.has(i) && !used.has(i));
      if (ids.length === 0) continue;
      for (const i of ids) used.add(i);
      result.push({
        theme: th.theme.slice(0, 120),
        summary: th.summary,
        count: ids.length,
        ids,
        suggestion: th.suggestion,
      });
    }
    result.sort((a, b) => b.count - a.count);
    const body: FeedbackSummary = { themes: result, considered: rows.length };
    return reply.send(body);
  });
}
