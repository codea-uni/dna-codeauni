import {
  assetHashSchema,
  MAX_ASSET_BYTES,
  missingAssetsSchema,
  permissions,
  type MineSurvey,
} from '@cronos/api';
import { topographySurveySchema } from '@cronos/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser } from '../http/session';
import { visibleMine } from '../services/access';
import { missingAssets, storeAsset } from '../services/topography';

export interface TopographyRouteDeps {
  auth: Auth;
  db: Db;
}

type Req = FastifyRequest<{ Params: Record<string, string> }>;

/**
 * Topografía de la mina (D-16): assets binarios por hash (subir, consultar cuáles faltan y
 * descargar) y levantamientos registrados. Quien ve la mina descarga; quien diseña sube.
 */
export function topographyRoutes(app: FastifyInstance, deps: TopographyRouteDeps): void {
  const { db } = deps;

  // Binarios: el cuerpo llega tal cual (Buffer), hasta 200 MB por asset.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: MAX_ASSET_BYTES },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post('/mines/:mineId/assets/missing', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleMine(db, req.params.mineId ?? '', user.id);
    if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
    const body = missingAssetsSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const missing = await missingAssets(db, found.mine.organizationId, body.data.hashes);
    return reply.send({ missing });
  });

  app.put(
    '/mines/:mineId/assets/:hash',
    { bodyLimit: MAX_ASSET_BYTES },
    async (req: Req, reply) => {
      const user = await requireUser(deps.auth, db, req, reply);
      if (!user) return reply;
      const found = await visibleMine(db, req.params.mineId ?? '', user.id);
      if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
      if (!permissions.editDesign(found.role))
        return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
      const hash = assetHashSchema.safeParse(req.params.hash);
      if (!hash.success) return sendError(reply, 400, 'invalid_hash', 'Invalid asset hash');
      if (!Buffer.isBuffer(req.body))
        return sendError(reply, 415, 'unsupported_media_type', 'Send application/octet-stream');
      const info = await storeAsset(db, {
        organizationId: found.mine.organizationId,
        hash: hash.data,
        bytes: new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength),
        userId: user.id,
      });
      return reply.code(201).send(info);
    },
  );

  app.get('/mines/:mineId/assets/:hash', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleMine(db, req.params.mineId ?? '', user.id);
    if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
    const hash = req.params.hash ?? '';
    // El contenido de un hash no cambia nunca: la caché del navegador lo puede guardar para siempre.
    const etag = `"${hash}"`;
    const cache = 'private, max-age=31536000, immutable';
    if (req.headers['if-none-match'] === etag)
      return reply.code(304).header('etag', etag).header('cache-control', cache).send();
    const row = await db
      .selectFrom('topography_asset')
      .select('content')
      .where('organizationId', '=', found.mine.organizationId)
      .where('hash', '=', hash)
      .executeTakeFirst();
    if (!row) return sendError(reply, 404, 'not_found', 'Asset not found');
    return reply
      .header('content-type', 'application/octet-stream')
      .header('etag', etag)
      .header('cache-control', cache)
      .send(row.content);
  });

  app.get('/mines/:mineId/surveys', async (req: Req, reply) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return reply;
    const found = await visibleMine(db, req.params.mineId ?? '', user.id);
    if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
    const rows = await db
      .selectFrom('topography_survey')
      .leftJoin('user', 'user.id', 'topography_survey.createdBy')
      .select([
        'topography_survey.meta',
        'topography_survey.createdAt',
        'user.id as userId',
        'user.name as userName',
      ])
      .where('topography_survey.mineId', '=', found.mine.id)
      .orderBy('topography_survey.surveyDate', 'desc')
      .orderBy('topography_survey.createdAt', 'desc')
      .execute();
    const surveys: MineSurvey[] = [];
    for (const r of rows) {
      const survey = topographySurveySchema.safeParse(r.meta);
      if (!survey.success) continue;
      surveys.push({
        survey: survey.data,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.userId && r.userName ? { id: r.userId, name: r.userName } : null,
      });
    }
    return reply.send({ surveys });
  });
}
