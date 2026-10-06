import { mineSchema, projectSummarySchema, type RoomServerMessage } from '@cronos/api';
import { createEmptyProject, toProjectFile } from '@cronos/core';
import type { WebSocket } from '@fastify/websocket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activate,
  createTestApp,
  TEST_ORIGIN,
  type TestApp,
  seedOrganization,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

/** Mensajes recibidos por un socket, con espera por tipo. */
function inbox(ws: WebSocket) {
  const got: RoomServerMessage[] = [];
  ws.on('message', (data: Buffer) => got.push(JSON.parse(data.toString()) as RoomServerMessage));
  return {
    got,
    next: async (type: RoomServerMessage['type']) => {
      for (let i = 0; i < 100; i++) {
        const found = got.find((m) => m.type === type);
        if (found) {
          got.splice(got.indexOf(found), 1);
          return found;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`sin mensaje ${type}`);
    },
  };
}

const pose = {
  head: {
    p: [327_000, 8_108_700, 3_480] as [number, number, number],
    q: [0, 0, 0, 1] as [number, number, number, number],
  },
  hands: [],
};
const state = {
  sequence: { playing: true, t: 0.5, speed: 0.2 },
  layers: { energy: true, vibration: false, labels: true, pile: true },
  hole: null,
};

describe.runIf(await databaseAvailable())('sala de presentación VR (D-19)', () => {
  let t: TestDb;
  let s: TestApp;
  let admin: string;
  let designer: string;
  let url: string;

  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t);
    await s.app.ready();
    await seedOrganization(t.db, s.auth, {
      email: 'admin@sur.pe',
      password: 'admin-inicial',
      name: 'Ana',
      organization: 'Minera Sur',
    });
    admin = await activate(s.app, 'admin@sur.pe', 'admin-inicial');
    const call = async (cookie: string, method: 'GET' | 'POST', path: string, payload?: object) =>
      s.app.inject({
        method,
        url: `/api${path}`,
        headers: { ...TEST_ORIGIN, cookie },
        ...(payload ? { payload } : {}),
      });
    const orgs = (await call(admin, 'GET', '/organizations')).json<{
      organizations: { id: string }[];
    }>();
    const orgId = orgs.organizations[0]?.id ?? '';
    await call(admin, 'POST', `/organizations/${orgId}/members`, {
      email: 'luis@sur.pe',
      name: 'Luis',
      role: 'designer',
      password: 'temporal-123',
    });
    designer = await activate(s.app, 'luis@sur.pe', 'temporal-123');
    const mine = mineSchema.parse(
      (
        await call(admin, 'POST', `/organizations/${orgId}/mines`, { name: 'Cuajone', epsg: 32719 })
      ).json(),
    );
    const file = toProjectFile(createEmptyProject('Banco 3400'), {
      appVersion: 'test',
      now: new Date('2026-10-05T12:00:00Z'),
    });
    const project = projectSummarySchema.parse(
      (await call(designer, 'POST', `/mines/${mine.id}/projects`, { file })).json(),
    );
    url = `/api/rooms/${project.id}/1/ws`;
  });
  /** Entra a la sala escuchando desde antes del `open` (el saludo llega enseguida). */
  const join = async (path: string, cookie: string) => {
    let box: ReturnType<typeof inbox> | undefined;
    const ws = await s.app.injectWS(
      path,
      { headers: { ...TEST_ORIGIN, cookie } },
      {
        onInit: (w) => {
          box = inbox(w);
        },
      },
    );
    if (!box) throw new Error('sin socket');
    return { ws, box };
  };
  afterAll(async () => {
    await s.app.close();
    await t.drop();
  });

  it('sin sesión no entra; con un proyecto ajeno o una versión inválida tampoco', async () => {
    await expect(s.app.injectWS(url, { headers: TEST_ORIGIN })).rejects.toThrow(/401/);
    await expect(
      s.app.injectWS('/api/rooms/no-existe/1/ws', { headers: { ...TEST_ORIGIN, cookie: admin } }),
    ).rejects.toThrow(/404/);
    await expect(
      s.app.injectWS(url.replace('/1/', '/0/'), { headers: { ...TEST_ORIGIN, cookie: admin } }),
    ).rejects.toThrow(/400/);
  });

  it('reenvía poses a los demás y solo acepta el estado del presentador', async () => {
    const { ws: presenter, box: p } = await join(`${url}?role=presenter`, designer);
    const welcomeP = await p.next('welcome');
    expect(welcomeP).toMatchObject({ presenter: (welcomeP as { you: string }).you, peers: [] });

    const { ws: viewer, box: v } = await join(url, admin);
    expect(await v.next('welcome')).toMatchObject({ peers: [{ name: 'Luis' }], state: null });
    expect(await p.next('join')).toMatchObject({ peer: { name: 'Ana' } });

    viewer.send(JSON.stringify({ type: 'pose', pose }));
    expect(await p.next('pose')).toMatchObject({ pose });

    // El estado de un espectador se ignora; el del presentador llega y queda para quien entre tarde.
    viewer.send(JSON.stringify({ type: 'state', state: { ...state, hole: 'h1' } }));
    presenter.send(JSON.stringify({ type: 'state', state }));
    expect(await v.next('state')).toMatchObject({ state });
    expect(p.got.some((m) => m.type === 'state')).toBe(false);

    const { ws: late, box: l } = await join(url, admin);
    expect(await l.next('welcome')).toMatchObject({ state });

    // Mensajes inválidos no rompen la sala.
    viewer.send('{no es json');
    viewer.send(JSON.stringify({ type: 'pose', pose: { head: { p: [1, 2], q: [0, 0, 0, 1] } } }));

    presenter.terminate();
    expect(await v.next('presenter')).toMatchObject({ id: null });
    late.terminate();
    viewer.terminate();
  });
});
