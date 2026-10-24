import { EXAMPLES, type Project } from '@cronos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCalcApp } from './app';
import { UsageGuard } from './guard';
import { InlineExecutor } from './pool';
import { MemoryRunLog } from './runLog';

const TOKEN = 'x'.repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
const caller = {
  'x-calc-organization': 'org-1',
  'x-calc-mine': 'mina-1',
  'x-calc-user': 'u-1',
  'x-calc-conversation': 'c-1',
};

let project: Project;
const runLog = new MemoryRunLog();
const app = buildCalcApp({
  executor: new InlineExecutor(),
  runLog,
  token: TOKEN,
  engineVersion: 'test',
  guard: new UsageGuard({ maxRuns: 30, windowMs: 60_000, sweepRuns: 3 }),
});

beforeAll(async () => {
  const ex = EXAMPLES.find((e) => e.id === 'production');
  if (!ex) throw new Error('falta el ejemplo');
  project = (await ex.build()).project;
});
afterAll(() => app.close());

const run = (
  module: string,
  body: unknown,
  headers: Record<string, string> = { ...auth, ...caller },
) =>
  app.inject({
    method: 'POST',
    url: `/v1/run/${module}`,
    headers,
    payload: body as Record<string, unknown>,
  });

describe('API interna', () => {
  it('/healthz responde sin credencial; el resto la exige', async () => {
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/v1/modules' })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/v1/modules', headers: { authorization: 'Bearer otra' } }))
        .statusCode,
    ).toBe(401);
    const listed = (await app.inject({ url: '/v1/modules', headers: auth })).json<{
      modules: { name: string }[];
    }>();
    expect(listed.modules.map((m) => m.name)).toContain('fragmentation');
  });

  it('exige saber por quién se calcula y el módulo debe existir', async () => {
    expect((await run('fragmentation', { project }, auth)).statusCode).toBe(400);
    expect((await run('magia', { project })).statusCode).toBe(404);
    expect((await run('fragmentation', { project: 'no' })).statusCode).toBe(400);
  });

  it('corre un módulo, devuelve el resultado y lo registra', async () => {
    const res = await run('fragmentation', { project, options: { target_p80_cm: 40 } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ run_id: string; result: { p80_cm: number; vs_target: string } }>();
    expect(body.result.p80_cm).toBeGreaterThan(0);
    expect(['coarser', 'finer', 'on_target']).toContain(body.result.vs_target);
    const runs = await runLog.list({ userId: 'u-1', limit: 10 });
    expect(runs[0]).toMatchObject({
      id: body.run_id,
      module: 'fragmentation',
      ok: true,
      mineId: 'mina-1',
      conversationId: 'c-1',
    });
    const listed = await app.inject({ url: '/v1/runs?user=u-1', headers: auth });
    expect(listed.json<{ runs: unknown[] }>().runs.length).toBeGreaterThan(0);
  });

  it('un proyecto sin la voladura pedida es un error de entrada (400), también registrado', async () => {
    const res = await run('analysis', { project, blast_id: 'no-existe' });
    expect(res.statusCode).toBe(400);
    expect((await runLog.list({ limit: 1 }))[0]).toMatchObject({
      ok: false,
      errorCode: 'bad_input',
    });
  });

  it('marca un barrido de un solo parámetro', async () => {
    const user = { ...caller, 'x-calc-user': 'barredor' };
    for (let i = 0; i < 5; i++) {
      const p = structuredClone(project);
      const pattern = p.blasts.find((b) => b.holes.length > 0)?.patterns[0];
      if (!pattern) throw new Error('sin patrón');
      (pattern as { burden: number }).burden += 0.1 * i;
      await run('fragmentation', { project: p }, { ...auth, ...user });
    }
    const runs = await runLog.list({ userId: 'barredor', limit: 10 });
    expect(runs.some((r) => r.flagged)).toBe(true);
  });

  it('limita las corridas por usuario', async () => {
    const user = { ...caller, 'x-calc-user': 'apurado' };
    let last = 0;
    for (let i = 0; i < 31; i++)
      last = (await run('analysis', { project }, { ...auth, ...user })).statusCode;
    expect(last).toBe(429);
  });
});
