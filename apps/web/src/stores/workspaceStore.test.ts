import { ApiClient } from '@cronos/api';
import { describe, expect, it } from 'vitest';
import { activeRole, createWorkspaceStore } from './workspaceStore';

const ORG = { id: 'o1', name: 'Minera Sur', role: 'admin', disabled: false } as const;
const mine = (id: string, org: string) => ({
  id,
  organizationId: org,
  name: id,
  epsg: null,
  restricted: false,
  accessUserIds: [],
  createdAt: '2026-09-30T10:00:00Z',
  projectCount: 0,
  lastActivityAt: null,
});

function store(routes: Record<string, [number, unknown]>) {
  const calls: string[] = [];
  const api = new ApiClient({
    baseUrl: '/api',
    fetch: (input, init) => {
      const url = (input instanceof Request ? input.url : input.toString()).replace('/api', '');
      const key = `${init?.method ?? 'GET'} ${url}`;
      calls.push(key);
      const [status, body] = routes[key] ?? [404, { code: 'not_found', message: key }];
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    },
  });
  return { s: createWorkspaceStore(api), calls };
}

describe('workspaceStore (una empresa por persona)', () => {
  it('toma la empresa de la sesión, carga sus minas y expone el rol', async () => {
    const { s } = store({
      'GET /organizations/o1/mines': [200, { mines: [mine('Cuajone', 'o1')] }],
    });
    await s.getState().setOrganization(ORG);
    expect(s.getState().mines?.map((m) => m.name)).toEqual(['Cuajone']);
    expect(activeRole(s.getState())).toBe('admin');
  });

  it('con la empresa desactivada no pide nada al servidor', async () => {
    const { s, calls } = store({});
    await s.getState().setOrganization({ ...ORG, disabled: true });
    expect(calls).toEqual([]);
    expect(await s.getState().createMine({ name: 'X' })).toBeNull();
  });

  it('traduce los rechazos del servidor a mensajes', async () => {
    const { s } = store({
      'GET /organizations/o1/mines': [200, { mines: [] }],
      'PATCH /organizations/o1/members/u1': [409, { code: 'last_admin', message: '' }],
      'POST /organizations/o1/members': [409, { code: 'other_organization', message: '' }],
    });
    await s.getState().setOrganization(ORG);
    expect(await s.getState().updateMemberRole('u1', 'designer')).toBe(false);
    expect(s.getState().error).toBe('workspace.error.lastAdmin');
    expect(await s.getState().addMember({ email: 'x@y.pe', name: 'X', role: 'designer' })).toBe(
      false,
    );
    expect(s.getState().error).toBe('workspace.error.otherOrganization');
  });

  it('crear una mina recarga la lista', async () => {
    const { s, calls } = store({
      'GET /organizations/o1/mines': [200, { mines: [] }],
      'POST /organizations/o1/mines': [201, mine('Toquepala', 'o1')],
    });
    await s.getState().setOrganization(ORG);
    const created = await s.getState().createMine({ name: 'Toquepala' });
    expect(created?.name).toBe('Toquepala');
    expect(calls.filter((c) => c === 'GET /organizations/o1/mines')).toHaveLength(2);
  });
});
