import { newId, uuidv7, type ProjectFile, type ProjectId } from '@cronos/core';
import type { Selectable } from 'kysely';
import type { Db } from '../db/db';
import type { ProjectTable } from '../db/schema';
import type { MineRow } from './access';
import { recordAudit } from './audit';
import { syncProjectTopography } from './topography';
import { encodeContent } from './versions';

/**
 * Proyecto nuevo en una mina con su versión 1. Un id nuevo siempre: importar dos veces el mismo
 * archivo da dos proyectos distintos. La topografía se registra en la mina (D-16) y la versión no
 * copia sus binarios. Lo usan la ruta `POST /mines/:id/projects` y la carga de demostración.
 */
export async function createProject(
  db: Db,
  mine: MineRow,
  input: ProjectFile,
  userId: string,
  message: string,
): Promise<Selectable<ProjectTable>> {
  const projectId = newId<'Project'>() satisfies ProjectId;
  const synced = await syncProjectTopography(db, mine, input, userId);
  const file: ProjectFile = { ...synced, project: { ...synced.project, id: projectId } };
  const content = await encodeContent(file);
  return db.transaction().execute(async (tx) => {
    const project = await tx
      .insertInto('project')
      .values({
        id: projectId,
        mineId: mine.id,
        name: file.project.name,
        versionCount: 1,
        createdBy: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await tx
      .insertInto('project_version')
      .values({
        id: uuidv7(),
        projectId,
        number: 1,
        parentVersionId: null,
        restoredFromVersionId: null,
        authorId: userId,
        message,
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
      organizationId: mine.organizationId,
      actorId: userId,
      action: 'project.create',
      targetType: 'project',
      targetId: projectId,
      data: { name: file.project.name, mine: mine.name, holes: content.holeCount },
    });
    return project;
  });
}
