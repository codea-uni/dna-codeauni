import { diffSummarySchema, type ProjectVersion } from '@cronos/api';
import type { ProjectFile } from '@cronos/core';
import type { Kysely, Selectable } from 'kysely';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type { Database, ProjectVersionTable } from '../db/schema';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface EncodedContent {
  gz: Buffer;
  hash: string;
  sizeBytes: number;
  holeCount: number;
}

/** JSON del ProjectFile comprimido (gzip, asíncrono para no bloquear el servidor) y su SHA-256. */
export async function encodeContent(file: ProjectFile): Promise<EncodedContent> {
  const text = JSON.stringify(file);
  const raw = Buffer.from(text, 'utf8');
  return {
    gz: await gzipAsync(raw),
    hash: createHash('sha256').update(raw).digest('hex'),
    sizeBytes: raw.byteLength,
    holeCount: file.project.blasts.reduce((n, b) => n + b.holes.length, 0),
  };
}

export async function decodeContent(gz: Buffer): Promise<string> {
  return (await gunzipAsync(gz)).toString('utf8');
}

type VersionRow = Omit<Selectable<ProjectVersionTable>, 'content'> & {
  authorName: string;
};

/** Columnas de una versión sin el contenido (que puede pesar megabytes). */
export function selectVersions(db: Kysely<Database>) {
  return db
    .selectFrom('project_version')
    .innerJoin('user', 'user.id', 'project_version.authorId')
    .select([
      'project_version.id',
      'project_version.projectId',
      'project_version.number',
      'project_version.parentVersionId',
      'project_version.restoredFromVersionId',
      'project_version.authorId',
      'user.name as authorName',
      'project_version.createdAt',
      'project_version.message',
      'project_version.projectName',
      'project_version.schemaVersion',
      'project_version.holeCount',
      'project_version.sizeBytes',
      'project_version.contentHash',
      'project_version.summary',
    ]);
}

export function toVersion(row: VersionRow): ProjectVersion {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    summary: diffSummarySchema.nullable().parse(row.summary),
  };
}
