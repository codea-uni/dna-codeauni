import { createHash } from 'node:crypto';
import type { AssetInfo } from '@cronos/api';
import { base64ToBytes, decodeAsset, type ProjectFile, type TopographySurvey } from '@cronos/core';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import { HttpError } from '../http/errors';
import type { MineRow } from './access';
import { recordAudit } from './audit';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Hashes de la lista que la empresa todavía no tiene guardados. */
export async function missingAssets(
  db: Kysely<Database>,
  organizationId: string,
  hashes: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(hashes)];
  if (unique.length === 0) return [];
  const rows = await db
    .selectFrom('topography_asset')
    .select('hash')
    .where('organizationId', '=', organizationId)
    .where('hash', 'in', unique)
    .execute();
  const have = new Set(rows.map((r) => r.hash));
  return unique.filter((h) => !have.has(h));
}

/**
 * Guarda un asset `CRTS` de la empresa: el hash debe ser el SHA-256 del contenido y el contenido un
 * asset válido (lo decodifica el núcleo). Si ya estaba, no hace nada (dedupe por contenido).
 */
export async function storeAsset(
  db: Kysely<Database>,
  a: { organizationId: string; hash: string; bytes: Uint8Array; userId: string },
): Promise<AssetInfo> {
  if (sha256(a.bytes) !== a.hash)
    throw new HttpError(400, 'asset_hash_mismatch', 'The content does not match its hash');
  let kind: AssetInfo['kind'];
  try {
    kind = decodeAsset(a.bytes).kind;
  } catch (err) {
    throw new HttpError(400, 'invalid_asset', err instanceof Error ? err.message : 'Invalid asset');
  }
  await db
    .insertInto('topography_asset')
    .values({
      organizationId: a.organizationId,
      hash: a.hash,
      kind,
      sizeBytes: a.bytes.byteLength,
      content: Buffer.from(a.bytes.buffer, a.bytes.byteOffset, a.bytes.byteLength),
      createdBy: a.userId,
    })
    .onConflict((oc) => oc.columns(['organizationId', 'hash']).doNothing())
    .execute();
  return { hash: a.hash, kind, sizeBytes: a.bytes.byteLength };
}

const surveyHashes = (s: TopographySurvey) =>
  [s.assets.tin, s.assets.lines, s.assets.image].filter((h): h is string => h !== undefined);

/**
 * Topografía de un proyecto que se guarda en el servidor (al crearlo o publicar una versión):
 * - los assets embebidos en el archivo (`.cronos.json` autocontenido) se guardan en la empresa y
 *   se quitan del contenido de la versión: las versiones no copian megabytes;
 * - cada levantamiento debe tener sus assets en la empresa (409 `missing_assets`) y ser de esta
 *   mina (409 `survey_other_mine`); los nuevos se registran en la mina.
 * Devuelve el archivo sin `embeddedAssets`.
 */
export async function syncProjectTopography(
  db: Kysely<Database>,
  mine: MineRow,
  file: ProjectFile,
  userId: string,
): Promise<ProjectFile> {
  const { embeddedAssets, ...rest } = file;
  for (const [hash, b64] of Object.entries(embeddedAssets ?? {}))
    await storeAsset(db, {
      organizationId: mine.organizationId,
      hash,
      bytes: base64ToBytes(b64),
      userId,
    });
  const surveys = rest.project.topography;
  if (surveys.length === 0) return rest;

  const missing = await missingAssets(db, mine.organizationId, surveys.flatMap(surveyHashes));
  if (missing.length > 0)
    throw new HttpError(
      409,
      'missing_assets',
      `Upload the topography data first: ${missing.map((h) => h.slice(0, 12)).join(', ')}`,
    );
  const known = await db
    .selectFrom('topography_survey')
    .select(['id', 'mineId'])
    .where(
      'id',
      'in',
      surveys.map((s) => s.id as string),
    )
    .execute();
  const other = known.find((k) => k.mineId !== mine.id);
  if (other)
    throw new HttpError(409, 'survey_other_mine', 'The project uses a survey of another mine');
  const knownIds = new Set(known.map((k) => k.id));
  for (const s of surveys) {
    if (knownIds.has(s.id)) continue;
    await db
      .insertInto('topography_survey')
      .values({
        id: s.id,
        mineId: mine.id,
        name: s.name,
        surveyDate: s.surveyDate,
        meta: JSON.stringify(s),
        createdBy: userId,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    await recordAudit(db, {
      organizationId: mine.organizationId,
      actorId: userId,
      action: 'survey.create',
      targetType: 'mine',
      targetId: mine.id,
      data: { name: s.name, surveyDate: s.surveyDate },
    });
  }
  return rest;
}
