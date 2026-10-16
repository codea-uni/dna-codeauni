import {
  createDesignPresetSchema,
  createKnowledgeDocSchema,
  knowledgeQuerySchema,
  knowledgeSearchQuerySchema,
  permissions,
  putCompanyExplosiveSchema,
  updateKnowledgeDocSchema,
  type DesignPreset,
  type KnowledgeDoc,
  type KnowledgeLayer,
  type ProjectKnowledge,
} from '@cronos/api';
import { explosiveSchema, uuidv7 } from '@cronos/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser, type SessionUser } from '../http/session';
import { memberRole, visibleMine } from '../services/access';
import { recordAudit } from '../services/audit';
import { searchKnowledge, writeChunks } from '../services/knowledge';
import { visibleProject } from './projects';

export interface KnowledgeRouteDeps {
  auth: Auth;
  db: Db;
}

type Req = FastifyRequest<{ Params: Record<string, string>; Querystring: Record<string, string> }>;

/** Lo que el usuario puede hacer con una capa y a qué empresa se audita. */
interface LayerAccess {
  canWrite: boolean;
  /** Empresa dueña (para la auditoría); `null` en la capa general. */
  organizationId: string | null;
  owner: { organizationId: string | null; mineId: string | null; projectId: string | null };
}

/**
 * Permisos por capa: la general la leen todos y la escribe la plataforma; la de la empresa, sus
 * miembros y la escribe el administrador; la de la mina y la del proyecto, quien ve la mina y la
 * escribe quien diseña. Si el usuario no ve el dueño, `null` (404, no se revela que existe).
 */
async function layerAccess(
  db: Db,
  user: SessionUser,
  layer: KnowledgeLayer,
  ownerId: string | null,
): Promise<LayerAccess | null> {
  const none = { organizationId: null, mineId: null, projectId: null };
  if (layer === 'general')
    return ownerId ? null : { canWrite: user.isSuperAdmin, organizationId: null, owner: none };
  if (!ownerId) return null;
  if (layer === 'organization') {
    const role = await memberRole(db, ownerId, user.id);
    if (!role) return null;
    return {
      canWrite: permissions.manageMembers(role),
      organizationId: ownerId,
      owner: { ...none, organizationId: ownerId },
    };
  }
  const mineId =
    layer === 'mine'
      ? ownerId
      : (
          await db
            .selectFrom('project')
            .select('mineId')
            .where('id', '=', ownerId)
            .executeTakeFirst()
        )?.mineId;
  if (!mineId) return null;
  const found = await visibleMine(db, mineId, user.id);
  if (!found) return null;
  return {
    canWrite: permissions.editDesign(found.role),
    organizationId: found.mine.organizationId,
    owner: layer === 'mine' ? { ...none, mineId } : { ...none, projectId: ownerId },
  };
}

function selectDocs(db: Db) {
  return db
    .selectFrom('knowledge_doc as d')
    .leftJoin('user as u', 'u.id', 'd.createdBy')
    .select([
      'd.id',
      'd.layer',
      'd.organizationId',
      'd.mineId',
      'd.projectId',
      'd.category',
      'd.title',
      'd.source',
      'd.createdAt',
      'd.updatedAt',
      'u.id as userId',
      'u.name as userName',
      sql<number>`length(d."content")`.as('chars'),
      sql<number>`(select count(*)::int from "knowledge_chunk" c where c."docId" = d."id")`.as(
        'chunks',
      ),
    ]);
}

type DocRow = Awaited<ReturnType<ReturnType<typeof selectDocs>['execute']>>[number];

function toDoc(r: DocRow): KnowledgeDoc {
  return {
    id: r.id,
    layer: r.layer,
    ownerId: r.organizationId ?? r.mineId ?? r.projectId,
    category: r.category,
    title: r.title,
    source: r.source,
    chars: r.chars,
    chunks: r.chunks,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.userId && r.userName ? { id: r.userId, name: r.userName } : null,
  };
}

/** Documento y permisos del usuario sobre su capa, o responde 404. */
async function docWithAccess(db: Db, user: SessionUser, id: string, reply: FastifyReply) {
  const row = await selectDocs(db).select('d.content').where('d.id', '=', id).executeTakeFirst();
  const access = row
    ? await layerAccess(db, user, row.layer, row.organizationId ?? row.mineId ?? row.projectId)
    : null;
  if (!row || !access) {
    await sendError(reply, 404, 'not_found', 'Document not found');
    return null;
  }
  return { row, access };
}

/**
 * Capas de conocimiento del agente: documentos por capa (general, empresa, mina, proyecto), la
 * búsqueda que usa el agente desde un proyecto y el catálogo de explosivos de la empresa.
 */
export function knowledgeRoutes(app: FastifyInstance, deps: KnowledgeRouteDeps): void {
  const { db } = deps;

  app.get('/knowledge', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const query = knowledgeQuerySchema.safeParse(req.query);
    if (!query.success) return sendError(reply, 400, 'invalid_query', query.error.message);
    const { layer, ownerId = null } = query.data;
    const access = await layerAccess(db, user, layer, ownerId);
    if (!access) return sendError(reply, 404, 'not_found', 'Layer not found');
    let q = selectDocs(db).where('d.layer', '=', layer);
    if (layer === 'organization') q = q.where('d.organizationId', '=', ownerId);
    if (layer === 'mine') q = q.where('d.mineId', '=', ownerId);
    if (layer === 'project') q = q.where('d.projectId', '=', ownerId);
    const rows = await q.orderBy('d.category').orderBy('d.title').execute();
    return reply.send({ docs: rows.map(toDoc), canWrite: access.canWrite });
  });

  app.get('/knowledge/:id', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await docWithAccess(db, user, req.params.id ?? '', reply);
    if (!found) return reply;
    return reply.send({ doc: toDoc(found.row), content: found.row.content });
  });

  app.post('/knowledge', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const body = createKnowledgeDocSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const b = body.data;
    const access = await layerAccess(db, user, b.layer, b.ownerId);
    if (!access) return sendError(reply, 404, 'not_found', 'Layer not found');
    if (!access.canWrite) return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const id = uuidv7();
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('knowledge_doc')
        .values({
          id,
          layer: b.layer,
          ...access.owner,
          category: b.category,
          title: b.title,
          source: b.source ?? null,
          content: b.content,
          createdBy: user.id,
        })
        .execute();
      await writeChunks(tx, id, b.content);
      if (access.organizationId)
        await recordAudit(tx, {
          organizationId: access.organizationId,
          actorId: user.id,
          action: 'knowledge.create',
          targetType: 'knowledge_doc',
          targetId: id,
          data: { layer: b.layer, title: b.title },
        });
    });
    const row = await selectDocs(db).where('d.id', '=', id).executeTakeFirstOrThrow();
    return reply.code(201).send(toDoc(row));
  });

  app.patch('/knowledge/:id', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await docWithAccess(db, user, req.params.id ?? '', reply);
    if (!found) return reply;
    if (!found.access.canWrite)
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const body = updateKnowledgeDocSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const b = body.data;
    const id = found.row.id;
    await db.transaction().execute(async (tx) => {
      await tx
        .updateTable('knowledge_doc')
        .set({
          ...(b.category ? { category: b.category } : {}),
          ...(b.title ? { title: b.title } : {}),
          ...(b.source !== undefined ? { source: b.source } : {}),
          ...(b.content ? { content: b.content } : {}),
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .execute();
      if (b.content) await writeChunks(tx, id, b.content);
      if (found.access.organizationId)
        await recordAudit(tx, {
          organizationId: found.access.organizationId,
          actorId: user.id,
          action: 'knowledge.update',
          targetType: 'knowledge_doc',
          targetId: id,
          data: { layer: found.row.layer, title: b.title ?? found.row.title },
        });
    });
    const row = await selectDocs(db).where('d.id', '=', id).executeTakeFirstOrThrow();
    return reply.send(toDoc(row));
  });

  app.delete('/knowledge/:id', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await docWithAccess(db, user, req.params.id ?? '', reply);
    if (!found) return reply;
    if (!found.access.canWrite)
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    await db.transaction().execute(async (tx) => {
      await tx.deleteFrom('knowledge_doc').where('id', '=', found.row.id).execute();
      if (found.access.organizationId)
        await recordAudit(tx, {
          organizationId: found.access.organizationId,
          actorId: user.id,
          action: 'knowledge.delete',
          targetType: 'knowledge_doc',
          targetId: found.row.id,
          data: { layer: found.row.layer, title: found.row.title },
        });
    });
    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------- Desde un proyecto (agente)

  app.get('/projects/:projectId/knowledge', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    const { project, mine } = found;
    const org = await db
      .selectFrom('organization')
      .select(['id', 'name'])
      .where('id', '=', mine.organizationId)
      .executeTakeFirstOrThrow();
    const docs = await db
      .selectFrom('knowledge_doc')
      .select(['layer', 'title', 'category'])
      .where((eb) =>
        eb.or([
          eb('layer', '=', 'general'),
          eb('organizationId', '=', org.id),
          eb('mineId', '=', mine.id),
          eb('projectId', '=', project.id),
        ]),
      )
      .orderBy('title')
      .execute();
    const explosives = await db
      .selectFrom('organization_explosive')
      .select('name')
      .where('organizationId', '=', org.id)
      .orderBy('name')
      .execute();
    const owners: Record<KnowledgeLayer, string | null> = {
      general: null,
      organization: org.name,
      mine: mine.name,
      project: project.name,
    };
    const body: ProjectKnowledge = {
      organization: org,
      mine: { id: mine.id, name: mine.name },
      project: { id: project.id, name: project.name },
      layers: (['general', 'organization', 'mine', 'project'] as const).map((layer) => ({
        layer,
        owner: owners[layer],
        docs: docs
          .filter((d) => d.layer === layer)
          .map((d) => ({ title: d.title, category: d.category })),
      })),
      companyExplosives: explosives.map((e) => e.name),
    };
    return reply.send(body);
  });

  app.get('/projects/:projectId/knowledge/search', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    const query = knowledgeSearchQuerySchema.safeParse(req.query);
    if (!query.success) return sendError(reply, 400, 'invalid_query', query.error.message);
    const hits = await searchKnowledge(
      db,
      {
        organizationId: found.mine.organizationId,
        mineId: found.mine.id,
        projectId: found.project.id,
      },
      query.data.q,
      {
        ...(query.data.layer ? { layer: query.data.layer } : {}),
        ...(query.data.limit ? { limit: query.data.limit } : {}),
      },
    );
    return reply.send({ hits });
  });

  // ---------------------------------------------------------------- Catálogo de explosivos

  app.get('/organizations/:orgId/explosives', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const orgId = req.params.orgId ?? '';
    if (!(await memberRole(db, orgId, user.id)))
      return sendError(reply, 404, 'not_found', 'Organization not found');
    const rows = await db
      .selectFrom('organization_explosive')
      .select(['data', 'updatedAt'])
      .where('organizationId', '=', orgId)
      .orderBy('name')
      .execute();
    const explosives = rows.flatMap((r) => {
      const e = explosiveSchema.safeParse(r.data);
      return e.success ? [{ explosive: e.data, updatedAt: r.updatedAt.toISOString() }] : [];
    });
    return reply.send({ explosives });
  });

  app.put('/organizations/:orgId/explosives/:id', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const orgId = req.params.orgId ?? '';
    const role = await memberRole(db, orgId, user.id);
    if (!role) return sendError(reply, 404, 'not_found', 'Organization not found');
    if (!permissions.manageMembers(role))
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const body = putCompanyExplosiveSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const e = body.data.explosive;
    if (e.id !== req.params.id) return sendError(reply, 400, 'invalid_body', 'Id mismatch');
    const clash = await db
      .selectFrom('organization_explosive')
      .select('id')
      .where('organizationId', '=', orgId)
      .where('name', '=', e.name)
      .where('id', '!=', e.id)
      .executeTakeFirst();
    if (clash) return sendError(reply, 409, 'name_taken', 'An explosive with this name exists');
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('organization_explosive')
        .values({
          organizationId: orgId,
          id: e.id,
          name: e.name,
          data: JSON.stringify(e),
          updatedBy: user.id,
        })
        .onConflict((oc) =>
          oc.columns(['organizationId', 'id']).doUpdateSet({
            name: e.name,
            data: JSON.stringify(e),
            updatedBy: user.id,
            updatedAt: new Date(),
          }),
        )
        .execute();
      await recordAudit(tx, {
        organizationId: orgId,
        actorId: user.id,
        action: 'explosive.save',
        targetType: 'organization_explosive',
        targetId: e.id,
        data: { name: e.name },
      });
    });
    return reply.send({ explosive: e, updatedAt: new Date().toISOString() });
  });

  app.delete('/organizations/:orgId/explosives/:id', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const orgId = req.params.orgId ?? '';
    const role = await memberRole(db, orgId, user.id);
    if (!role) return sendError(reply, 404, 'not_found', 'Organization not found');
    if (!permissions.manageMembers(role))
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const id = req.params.id ?? '';
    const removed = await db.transaction().execute(async (tx) => {
      const row = await tx
        .deleteFrom('organization_explosive')
        .where('organizationId', '=', orgId)
        .where('id', '=', id)
        .returning('name')
        .executeTakeFirst();
      if (row)
        await recordAudit(tx, {
          organizationId: orgId,
          actorId: user.id,
          action: 'explosive.delete',
          targetType: 'organization_explosive',
          targetId: id,
          data: { name: row.name },
        });
      return row;
    });
    if (!removed) return sendError(reply, 404, 'not_found', 'Explosive not found');
    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------- Presets de diseño

  const selectPresets = () =>
    db
      .selectFrom('design_preset as p')
      .leftJoin('mine as m', 'm.id', 'p.mineId')
      .leftJoin('user as u', 'u.id', 'p.createdBy')
      .select([
        'p.id',
        'p.name',
        'p.description',
        'p.mineId',
        'm.name as mineName',
        'p.steps',
        'p.createdAt',
        'u.name as createdBy',
        'p.organizationId',
      ]);
  const toPreset = (r: Awaited<ReturnType<ReturnType<typeof selectPresets>['execute']>>[number]): DesignPreset => ({
    id: r.id,
    name: r.name,
    description: r.description,
    mineId: r.mineId,
    mineName: r.mineName,
    steps: r.steps,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
  });

  // Los de la empresa y los del sitio (mina) del proyecto.
  app.get('/projects/:projectId/presets', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    const rows = await selectPresets()
      .where('p.organizationId', '=', found.mine.organizationId)
      .where((eb) => eb.or([eb('p.mineId', 'is', null), eb('p.mineId', '=', found.mine.id)]))
      .orderBy('p.createdAt', 'desc')
      .execute();
    return reply.send({ presets: rows.map(toPreset) });
  });

  app.post('/projects/:projectId/presets', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    if (!permissions.editDesign(found.role))
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const body = createDesignPresetSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const b = body.data;
    if (b.mineId !== null && b.mineId !== found.mine.id)
      return sendError(reply, 400, 'invalid_body', 'Preset mine must be the project mine');
    const id = uuidv7();
    try {
      await db
        .insertInto('design_preset')
        .values({
          id,
          organizationId: found.mine.organizationId,
          mineId: b.mineId,
          name: b.name,
          description: b.description ?? null,
          steps: JSON.stringify(b.steps),
          createdBy: user.id,
        })
        .execute();
    } catch (e) {
      if ((e as { code?: string }).code === '23505')
        return sendError(reply, 409, 'name_taken', 'A preset with this name exists');
      throw e;
    }
    const row = await selectPresets().where('p.id', '=', id).executeTakeFirstOrThrow();
    return reply.code(201).send(toPreset(row));
  });

  app.delete('/presets/:id', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const row = await db
      .selectFrom('design_preset')
      .select(['id', 'organizationId', 'createdBy'])
      .where('id', '=', req.params.id ?? '')
      .executeTakeFirst();
    const role = row ? await memberRole(db, row.organizationId, user.id) : null;
    if (!row || !role) return sendError(reply, 404, 'not_found', 'Preset not found');
    if (row.createdBy !== user.id && !permissions.manageMembers(role))
      return sendError(reply, 403, 'forbidden', 'Only the author or an admin can delete it');
    await db.deleteFrom('design_preset').where('id', '=', row.id).execute();
    return reply.send({ ok: true });
  });
}
