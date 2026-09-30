import { createProjectSchema, permissions, type ProjectSummary } from '@cronos/api';
import { newId, parseProjectFile, uuidv7, type ProjectFile, type ProjectId } from '@cronos/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely, Selectable } from 'kysely';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import type { Database, ProjectTable } from '../db/schema';
import { sendError } from '../http/errors';
import { requireUser } from '../http/session';
import { visibleMine } from '../services/access';
import { recordAudit } from '../services/audit';
import { decodeContent, encodeContent, selectVersions, toVersion } from '../services/versions';
import { toMine } from './organizations';

export interface ProjectRouteDeps {
  auth: Auth;
  db: Db;
}

type Req = FastifyRequest<{ Params: Record<string, string> }>;

/** Valida un ProjectFile recibido con el núcleo (migra versiones anteriores y aplica zod). */
export function validateProjectFile(
  input: unknown,
): { ok: true; file: ProjectFile } | { ok: false; error: string } {
  return parseProjectFile(JSON.stringify(input ?? null));
}

async function toSummary(
  db: Kysely<Database>,
  row: Selectable<ProjectTable>,
): Promise<ProjectSummary> {
  const latest = await selectVersions(db)
    .where('project_version.projectId', '=', row.id)
    .where('project_version.number', '=', row.versionCount)
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    mineId: row.mineId,
    name: row.name,
    versionCount: row.versionCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    latest: toVersion(latest),
  };
}

/** El proyecto y el rol del usuario si puede ver su mina; si no, responde 404 y devuelve `null`. */
export async function visibleProject(
  db: Db,
  projectId: string,
  userId: string,
  reply: FastifyReply,
) {
  const project = await db
    .selectFrom('project')
    .selectAll()
    .where('id', '=', projectId)
    .executeTakeFirst();
  const found = project ? await visibleMine(db, project.mineId, userId) : null;
  if (!project || !found) {
    await sendError(reply, 404, 'not_found', 'Project not found');
    return null;
  }
  return { project, ...found };
}

/** Proyectos de una mina, cada uno con su historial de versiones inmutables (NF-08). */
export function projectRoutes(app: FastifyInstance, deps: ProjectRouteDeps): void {
  const { db } = deps;

  app.get('/mines/:mineId/projects', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleMine(db, req.params.mineId ?? '', user.id);
    if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
    const rows = await db
      .selectFrom('project')
      .selectAll()
      .where('mineId', '=', found.mine.id)
      .orderBy('updatedAt', 'desc')
      .execute();
    return reply.send({ projects: await Promise.all(rows.map((r) => toSummary(db, r))) });
  });

  app.post('/mines/:mineId/projects', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleMine(db, req.params.mineId ?? '', user.id);
    if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
    if (!permissions.editDesign(found.role))
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const body = createProjectSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const parsed = validateProjectFile(body.data.file);
    if (!parsed.ok) return sendError(reply, 400, 'invalid_project', parsed.error);

    // Un id nuevo siempre: importar dos veces el mismo archivo da dos proyectos distintos.
    const projectId = newId<'Project'>() satisfies ProjectId;
    const file: ProjectFile = {
      ...parsed.file,
      project: { ...parsed.file.project, id: projectId },
    };
    const epsg = file.project.coordinateSystem.epsg;
    if (found.mine.epsg && epsg && epsg !== found.mine.epsg)
      return sendError(
        reply,
        409,
        'crs_mismatch',
        `Project CRS EPSG:${epsg} differs from the mine (EPSG:${found.mine.epsg})`,
      );

    const content = await encodeContent(file);
    const row = await db.transaction().execute(async (tx) => {
      const project = await tx
        .insertInto('project')
        .values({
          id: projectId,
          mineId: found.mine.id,
          name: file.project.name,
          versionCount: 1,
          createdBy: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const versionId = uuidv7();
      await tx
        .insertInto('project_version')
        .values({
          id: versionId,
          projectId,
          number: 1,
          parentVersionId: null,
          restoredFromVersionId: null,
          authorId: user.id,
          message: body.data.message ?? '',
          projectName: file.project.name,
          schemaVersion: file.schemaVersion,
          holeCount: content.holeCount,
          sizeBytes: content.sizeBytes,
          contentHash: content.hash,
          content: content.gz,
          summary: null,
        })
        .execute();
      await recordAudit(tx, {
        organizationId: found.mine.organizationId,
        actorId: user.id,
        action: 'project.create',
        targetType: 'project',
        targetId: projectId,
        data: { name: file.project.name, mine: found.mine.name, holes: content.holeCount },
      });
      return project;
    });
    return reply.code(201).send(await toSummary(db, row));
  });

  app.get('/projects/:projectId', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    return reply.send({
      project: await toSummary(db, found.project),
      mine: await toMine(db, found.mine),
      role: found.role,
    });
  });

  // El JSON sale tal cual se guardó (sin parsearlo en el servidor); la web lo valida en el worker.
  app.get('/projects/:projectId/versions/:number/content', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    const wanted =
      req.params.number === 'latest' ? found.project.versionCount : Number(req.params.number);
    if (!Number.isInteger(wanted) || wanted < 1)
      return sendError(
        reply,
        400,
        'invalid_version',
        'Version must be a positive integer or latest',
      );
    const version = await db
      .selectFrom('project_version')
      .select(['content', 'number', 'contentHash'])
      .where('projectId', '=', found.project.id)
      .where('number', '=', wanted)
      .executeTakeFirst();
    if (!version) return sendError(reply, 404, 'not_found', 'Version not found');
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('x-cronos-version', String(version.number))
      .header('etag', `"${version.contentHash}"`)
      .send(await decodeContent(version.content));
  });
}
