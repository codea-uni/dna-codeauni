import { meSchema } from '@cronos/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn, TEST_ORIGIN, type TestApp } from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';
import { DEMO_ACCOUNTS, seedDemo } from './demo';

describe.runIf(await databaseAvailable())('datos de demostración (desarrollo)', () => {
  let t: TestDb;
  let s: TestApp;
  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t);
  });
  afterAll(async () => {
    await t.drop();
  });

  it('crea cuentas, empresas, minas y proyectos con topografía; la segunda vez no crea nada', async () => {
    expect(await seedDemo(t.db, s.auth)).toEqual({
      users: 5,
      organizations: 2,
      mines: 2,
      projects: 2,
    });
    expect(await seedDemo(t.db, s.auth)).toEqual({
      users: 0,
      organizations: 0,
      mines: 0,
      projects: 0,
    });
  });

  it('las cuentas del README entran sin cambiar la contraseña y con su rol', async () => {
    for (const a of DEMO_ACCOUNTS) {
      const cookie = await signIn(s.app, a.email, a.password);
      const me = meSchema.parse(
        (
          await s.app.inject({ method: 'GET', url: '/api/me', headers: { ...TEST_ORIGIN, cookie } })
        ).json(),
      );
      expect(me.user.mustChangePassword).toBe(false);
      expect(me.user.isSuperAdmin).toBe(a.superAdmin === true);
      expect(me.organization?.role ?? null).toBe(a.role ?? null);
    }
  });

  it('Cuajone tiene los dos proyectos con su topografía registrada en la mina', async () => {
    const mine = await t.db
      .selectFrom('mine')
      .selectAll()
      .where('name', '=', 'Cuajone')
      .executeTakeFirstOrThrow();
    const projects = await t.db
      .selectFrom('project')
      .select('name')
      .where('mineId', '=', mine.id)
      .execute();
    expect(projects.map((p) => p.name).sort()).toEqual([
      'Demo · Banco sobre topografía',
      'Demo · Tajo con topografía',
    ]);
    const surveys = await t.db
      .selectFrom('topography_survey')
      .select('name')
      .where('mineId', '=', mine.id)
      .execute();
    expect(surveys).toHaveLength(2);
    const assets = await t.db
      .selectFrom('topography_asset')
      .select('kind')
      .where('organizationId', '=', mine.organizationId)
      .execute();
    expect(assets.map((a) => a.kind).sort()).toEqual(['image', 'lines', 'lines', 'tin', 'tin']);
  });
});
