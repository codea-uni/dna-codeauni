/**
 * API interna del servicio de cálculo. Solo la llama el agente de IA (credencial entre servicios y
 * red privada): no hay usuarios finales ni API pública. Cada llamada dice por quién se hace
 * (empresa, mina, usuario y conversación) en cabeceras, para el registro y los límites de uso.
 */
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UsageGuard } from './guard';
import { MODULES, runRequestSchema, type ModuleName } from './modules';
import type { Executor } from './pool';
import type { Caller, RunLog } from './runLog';

export interface CalcAppDeps {
  executor: Executor;
  runLog: RunLog;
  /** Credencial que debe traer cada llamada (`Authorization: Bearer …`). */
  token: string;
  engineVersion: string;
  guard?: UsageGuard;
  logger?: boolean;
}

const MODULE_INFO: Record<ModuleName, string> = {
  analysis: 'Carga, cubicación, secuencia de disparo y revisión del diseño.',
  fragmentation: 'P20/P50/P80, sobretamaño, finos y curva granulométrica.',
  vibration: 'PPV, sobrepresión y carga admisible en cada punto de control; alcance de proyección.',
  muckpile: 'Pila de material: volumen, desplazamiento, alcance y altura (banco o subterránea).',
};

/** Error de la corrida → estado HTTP. */
const STATUS: Record<string, number> = {
  bad_input: 400,
  rate_limited: 429,
  busy: 503,
  closed: 503,
  calc_timeout: 504,
  calc_crash: 500,
  calc_error: 500,
};

const hash = (s: string) => createHash('sha256').update(s).digest();

const callerSchema = z.object({
  'x-calc-organization': z.string().min(1).max(100),
  'x-calc-mine': z.string().min(1).max(100),
  'x-calc-user': z.string().min(1).max(200),
  'x-calc-conversation': z.string().min(1).max(200).optional(),
});

function callerOf(req: FastifyRequest): Caller | null {
  const r = callerSchema.safeParse(req.headers);
  if (!r.success) return null;
  return {
    organizationId: r.data['x-calc-organization'],
    mineId: r.data['x-calc-mine'],
    userId: r.data['x-calc-user'],
    conversationId: r.data['x-calc-conversation'] ?? null,
  };
}

const fail = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ code, message });

export function buildCalcApp(deps: CalcAppDeps): FastifyInstance {
  // Un proyecto con miles de taladros pesa varios MB de JSON.
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 50 * 1024 * 1024 });
  const guard = deps.guard ?? new UsageGuard();
  const expected = hash(deps.token);

  app.setErrorHandler((error: unknown, _req, reply) => {
    const e = error as { statusCode?: unknown; message?: unknown };
    const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
    if (status >= 500) app.log.error(error);
    return fail(
      reply,
      status,
      status >= 500 ? 'internal_error' : 'bad_request',
      status >= 500 ? 'Error interno' : String(e.message),
    );
  });
  app.setNotFoundHandler((_req, reply) => fail(reply, 404, 'not_found', 'No existe'));

  // Todo menos /healthz exige la credencial entre servicios.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!given || !timingSafeEqual(hash(given), expected))
      return fail(reply, 401, 'unauthorized', 'Credencial inválida');
  });

  app.get('/healthz', () => ({
    ok: true,
    engine_version: deps.engineVersion,
    workers: deps.executor.stats(),
  }));

  app.get('/v1/modules', () => ({
    modules: MODULES.map((name) => ({ name, description: MODULE_INFO[name] })),
  }));

  app.post<{ Params: { module: string } }>('/v1/run/:module', async (req, reply) => {
    const module = MODULES.find((m) => m === req.params.module);
    if (!module)
      return fail(reply, 404, 'unknown_module', `Módulo desconocido: ${req.params.module}`);
    const caller = callerOf(req);
    if (!caller)
      return fail(
        reply,
        400,
        'missing_caller',
        'Faltan las cabeceras x-calc-organization, x-calc-mine y x-calc-user',
      );
    const body = runRequestSchema.safeParse(req.body);
    if (!body.success)
      return fail(
        reply,
        400,
        'bad_input',
        body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    if (!guard.admit(caller.userId))
      return fail(
        reply,
        STATUS.rate_limited ?? 429,
        'rate_limited',
        'Límite de corridas alcanzado; espera unos minutos.',
      );

    const t0 = performance.now();
    const r = await deps.executor.run(module, body.data);
    const durationMs = performance.now() - t0;
    const flagged = r.ok && r.signature ? guard.observe(caller.userId, module, r.signature) : false;
    if (flagged)
      app.log.warn(
        { caller, module },
        'calc: barrido de un solo parámetro (posible extracción del modelo)',
      );
    const id = randomUUID();
    await deps.runLog
      .add({
        id,
        createdAt: new Date(),
        caller,
        sessionId: null,
        module,
        engineVersion: deps.engineVersion,
        ok: r.ok,
        errorCode: r.error?.code ?? null,
        durationMs: Math.round(durationMs),
        calcMs: Math.round(r.ms),
        flagged,
        input: body.data,
        result: r.ok ? r.result : r.error,
      })
      .catch((e: unknown) => {
        app.log.error(e, 'calc: no se pudo registrar la corrida');
      });
    if (!r.ok) {
      const code = r.error?.code ?? 'calc_error';
      return fail(reply, STATUS[code] ?? 500, code, r.error?.message ?? 'Error de cálculo');
    }
    return {
      run_id: id,
      module,
      engine_version: deps.engineVersion,
      duration_ms: Math.round(durationMs),
      result: r.result,
    };
  });

  const runsQuery = z.object({
    organization: z.string().optional(),
    mine: z.string().optional(),
    user: z.string().optional(),
    module: z.string().optional(),
    since: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
  });
  app.get('/v1/runs', async (req, reply) => {
    const q = runsQuery.safeParse(req.query);
    if (!q.success) return fail(reply, 400, 'bad_input', 'Filtros inválidos');
    const runs = await deps.runLog.list({
      limit: q.data.limit,
      ...(q.data.organization ? { organizationId: q.data.organization } : {}),
      ...(q.data.mine ? { mineId: q.data.mine } : {}),
      ...(q.data.user ? { userId: q.data.user } : {}),
      ...(q.data.module ? { module: q.data.module } : {}),
      ...(q.data.since ? { since: new Date(q.data.since) } : {}),
    });
    return { runs };
  });

  return app;
}
