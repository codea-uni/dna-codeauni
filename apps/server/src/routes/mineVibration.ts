import { permissions, saveMinePointSchema, saveVibrationRecordsSchema } from '@cronos/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser } from '../http/session';
import { visibleMine } from '../services/access';
import {
  deleteMinePoint,
  deleteVibrationRecord,
  listMinePoints,
  listVibrationRecords,
  saveMinePoint,
  saveVibrationRecords,
} from '../services/mineVibration';

export interface MineVibrationRouteDeps {
  auth: Auth;
  db: Db;
}

type Req = FastifyRequest<{ Params: Record<string, string> }>;

/**
 * Vibración de la mina: puntos de control compartidos entre proyectos y mediciones de sismógrafo
 * (calibración de la ley). Quien ve la mina consulta; quien diseña guarda y borra.
 */
export function mineVibrationRoutes(app: FastifyInstance, deps: MineVibrationRouteDeps): void {
  const { db } = deps;

  const mineFor = async (req: Req, reply: FastifyReply, edit: boolean) => {
    const user = await requireUser(deps.auth, db, req, reply);
    if (!user) return null;
    const found = await visibleMine(db, req.params.mineId ?? '', user.id);
    if (!found) {
      sendError(reply, 404, 'not_found', 'Mine not found');
      return null;
    }
    if (edit && !permissions.editDesign(found.role)) {
      sendError(reply, 403, 'forbidden', 'Not allowed for this role');
      return null;
    }
    return { user, mine: found.mine };
  };

  app.get('/mines/:mineId/monitoring-points', async (req: Req, reply) => {
    const ctx = await mineFor(req, reply, false);
    if (!ctx) return reply;
    return reply.send({ points: await listMinePoints(db, ctx.mine.id) });
  });

  app.put('/mines/:mineId/monitoring-points/:pointId', async (req: Req, reply) => {
    const ctx = await mineFor(req, reply, true);
    if (!ctx) return reply;
    const body = saveMinePointSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    if (body.data.point.id !== req.params.pointId)
      return sendError(reply, 400, 'invalid_body', 'Point id does not match the URL');
    const saved = await saveMinePoint(
      db,
      ctx.mine,
      body.data.point,
      body.data.sourceProjectId ?? null,
      ctx.user.id,
    );
    return reply.send(saved);
  });

  app.delete('/mines/:mineId/monitoring-points/:pointId', async (req: Req, reply) => {
    const ctx = await mineFor(req, reply, true);
    if (!ctx) return reply;
    const removed = await deleteMinePoint(db, ctx.mine, req.params.pointId ?? '', ctx.user.id);
    if (!removed) return sendError(reply, 404, 'not_found', 'Point not found');
    return reply.send({ ok: true });
  });

  app.get('/mines/:mineId/vibration-records', async (req: Req, reply) => {
    const ctx = await mineFor(req, reply, false);
    if (!ctx) return reply;
    return reply.send({ records: await listVibrationRecords(db, ctx.mine.id) });
  });

  app.post(
    '/mines/:mineId/vibration-records',
    { bodyLimit: 8 * 1024 * 1024 },
    async (req: Req, reply) => {
      const ctx = await mineFor(req, reply, true);
      if (!ctx) return reply;
      const body = saveVibrationRecordsSchema.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
      await saveVibrationRecords(db, ctx.mine, body.data.records, ctx.user.id);
      return reply.send({ records: await listVibrationRecords(db, ctx.mine.id) });
    },
  );

  app.delete('/mines/:mineId/vibration-records/:id', async (req: Req, reply) => {
    const ctx = await mineFor(req, reply, true);
    if (!ctx) return reply;
    const removed = await deleteVibrationRecord(db, ctx.mine.id, req.params.id ?? '');
    if (!removed) return sendError(reply, 404, 'not_found', 'Record not found');
    return reply.send({ ok: true });
  });
}
