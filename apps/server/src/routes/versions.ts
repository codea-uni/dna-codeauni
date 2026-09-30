import { permissions, publishVersionSchema, restoreVersionSchema } from '@cronos/api';
import {
  diffProjects,
  isEmptyDiff,
  parseProjectFile,
  uuidv7,
  type ProjectFile,
} from '@cronos/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser, type SessionUser } from '../http/session';
import { recordAudit } from '../services/audit';
import { decodeContent, encodeContent, selectVersions, toVersion } from '../services/versions';
import { validateProjectFile, visibleProject } from './projects';

export interface VersionRouteDeps {
  auth: Auth;
  db: Db;
}

type Req = FastifyRequest<{ Params: Record<string, string> }>;

interface NewVersion {
  projectId: string;
  organizationId: string;
  parentVersionId: string;
  message: string;
  file: ProjectFile;
  restoredFrom: { id: string; number: number } | null;
  user: SessionUser;
}

/**
 * Inserta la versión siguiente con candado de fila sobre el proyecto (concurrencia optimista):
 * si `parentVersionId` no es la última versión, 409 `version_conflict`; si el contenido es igual
 * al de la última, 409 `no_changes`. El resumen de cambios sale de `diffProjects` del núcleo.
 */
async function insertNextVersion(db: Db, reply: FastifyReply, v: NewVersion) {
  const content = await encodeContent(v.file);
  return db.transaction().execute(async (tx) => {
    const project = await tx
      .selectFrom('project')
      .select(['id', 'versionCount'])
      .where('id', '=', v.projectId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const head = await tx
      .selectFrom('project_version')
      .select(['id', 'number', 'contentHash', 'content'])
      .where('projectId', '=', v.projectId)
      .where('number', '=', project.versionCount)
      .executeTakeFirstOrThrow();
    if (head.id !== v.parentVersionId) {
      await sendError(
        reply,
        409,
        'version_conflict',
        `Version ${head.number} was published after the one you edited`,
      );
      return null;
    }
    if (head.contentHash === content.hash) {
      await sendError(reply, 409, 'no_changes', 'Nothing changed since the last version');
      return null;
    }
    const previous = parseProjectFile(await decodeContent(head.content));
    const summary = previous.ok
      ? diffProjects(previous.file.project, v.file.project).summary
      : null;
    if (summary && isEmptyDiff(summary) && !v.restoredFrom) {
      await sendError(reply, 409, 'no_changes', 'Nothing changed since the last version');
      return null;
    }

    const id = uuidv7();
    const number = project.versionCount + 1;
    await tx
      .insertInto('project_version')
      .values({
        id,
        projectId: v.projectId,
        number,
        parentVersionId: head.id,
        restoredFromVersionId: v.restoredFrom?.id ?? null,
        authorId: v.user.id,
        message: v.message,
        projectName: v.file.project.name,
        schemaVersion: v.file.schemaVersion,
        holeCount: content.holeCount,
        sizeBytes: content.sizeBytes,
        contentHash: content.hash,
        content: content.gz,
        summary: summary ? JSON.stringify(summary) : null,
      })
      .execute();
    await tx
      .updateTable('project')
      .set({ versionCount: number, name: v.file.project.name, updatedAt: new Date() })
      .where('id', '=', v.projectId)
      .execute();
    await recordAudit(tx, {
      organizationId: v.organizationId,
      actorId: v.user.id,
      action: v.restoredFrom ? 'version.restore' : 'version.create',
      targetType: 'project',
      targetId: v.projectId,
      data: {
        project: v.file.project.name,
        number,
        ...(v.restoredFrom ? { restoredFrom: v.restoredFrom.number } : {}),
      },
    });
    return id;
  });
}

/** Historial de versiones de un proyecto: listar, publicar y restaurar (NF-08). */
export function versionRoutes(app: FastifyInstance, deps: VersionRouteDeps): void {
  const { db } = deps;

  app.get('/projects/:projectId/versions', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    const rows = await selectVersions(db)
      .where('project_version.projectId', '=', found.project.id)
      .orderBy('project_version.number', 'desc')
      .execute();
    return reply.send({ versions: rows.map(toVersion) });
  });

  app.post('/projects/:projectId/versions', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    if (!permissions.editDesign(found.role))
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const body = publishVersionSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const parsed = validateProjectFile(body.data.file);
    if (!parsed.ok) return sendError(reply, 400, 'invalid_project', parsed.error);
    const file: ProjectFile = {
      ...parsed.file,
      project: { ...parsed.file.project, id: found.project.id as ProjectFile['project']['id'] },
    };
    const epsg = file.project.coordinateSystem.epsg;
    if (found.mine.epsg && epsg && epsg !== found.mine.epsg)
      return sendError(reply, 409, 'crs_mismatch', 'Project CRS differs from the mine');

    const id = await insertNextVersion(db, reply, {
      projectId: found.project.id,
      organizationId: found.mine.organizationId,
      parentVersionId: body.data.parentVersionId,
      message: body.data.message,
      file,
      restoredFrom: null,
      user,
    });
    if (!id) return reply;
    const row = await selectVersions(db)
      .where('project_version.id', '=', id)
      .executeTakeFirstOrThrow();
    return reply.code(201).send(toVersion(row));
  });

  app.post('/projects/:projectId/versions/:number/restore', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const found = await visibleProject(db, req.params.projectId ?? '', user.id, reply);
    if (!found) return reply;
    if (!permissions.editDesign(found.role))
      return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
    const body = restoreVersionSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const old = await db
      .selectFrom('project_version')
      .select(['id', 'number', 'content'])
      .where('projectId', '=', found.project.id)
      .where('number', '=', Number(req.params.number))
      .executeTakeFirst();
    if (!old) return sendError(reply, 404, 'not_found', 'Version not found');
    const parsed = parseProjectFile(await decodeContent(old.content));
    if (!parsed.ok) return sendError(reply, 500, 'internal_error', parsed.error);

    const id = await insertNextVersion(db, reply, {
      projectId: found.project.id,
      organizationId: found.mine.organizationId,
      parentVersionId: body.data.parentVersionId,
      message: body.data.message,
      file: parsed.file,
      restoredFrom: { id: old.id, number: old.number },
      user,
    });
    if (!id) return reply;
    const row = await selectVersions(db)
      .where('project_version.id', '=', id)
      .executeTakeFirstOrThrow();
    return reply.code(201).send(toVersion(row));
  });
}
