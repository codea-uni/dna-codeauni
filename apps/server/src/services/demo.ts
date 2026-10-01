import type { Role } from '@cronos/api';
import { bytesToBase64, EXAMPLES, toProjectFile, uuidv7, type ExampleBuild } from '@cronos/core';
import { createUserWithPassword, type Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { recordAudit } from './audit';
import { createProject } from './projects';

/**
 * Datos de demostración para desarrollo (`pnpm dev:online` / `pnpm dev:seed`): las cuentas del
 * README, dos empresas con sus minas y dos proyectos con topografía en Cuajone. Idempotente: crea
 * lo que falta y no toca lo que ya existe (ni contraseñas cambiadas). Nunca corre en producción.
 */

interface DemoAccount {
  email: string;
  password: string;
  name: string;
  superAdmin?: boolean;
  organization?: string;
  role?: Role;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'qa@cronos.local',
    password: 'cronos123',
    name: 'QA Plataforma',
    superAdmin: true,
  },
  {
    email: 'admin@cronos.local',
    password: 'cronos123',
    name: 'Administrador',
    organization: 'Minera Sur',
    role: 'admin',
  },
  {
    email: 'luis@cronos.local',
    password: 'cronos123',
    name: 'Luis Diseñador',
    organization: 'Minera Sur',
    role: 'designer',
  },
  {
    email: 'rosa@cronos.local',
    password: 'cronos123',
    name: 'Rosa Revisora',
    organization: 'Minera Sur',
    role: 'reviewer',
  },
  {
    email: 'beto@norte.local',
    password: 'cronos123',
    name: 'Beto Norte',
    organization: 'Minera Norte',
    role: 'admin',
  },
];

const DEMO_MINES = [
  { organization: 'Minera Sur', name: 'Cuajone', epsg: 32719 },
  { organization: 'Minera Norte', name: 'Tajo Norte', epsg: 32718 },
] as const;

/** Proyectos de ejemplo que se crean en Cuajone (con su topografía), por id de ejemplo. */
const DEMO_PROJECTS = ['topoMine', 'topoSector', 'topoPit'] as const;

export interface DemoSeedResult {
  users: number;
  organizations: number;
  mines: number;
  projects: number;
}

export async function seedDemo(db: Db, auth: Auth): Promise<DemoSeedResult> {
  const result: DemoSeedResult = { users: 0, organizations: 0, mines: 0, projects: 0 };

  const orgId = async (name: string): Promise<string> => {
    const found = await db
      .selectFrom('organization')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (found) return found.id;
    const id = uuidv7();
    await db.insertInto('organization').values({ id, name }).execute();
    result.organizations++;
    return id;
  };

  const userIds = new Map<string, string>();
  for (const a of DEMO_ACCOUNTS) {
    const found = await db
      .selectFrom('user')
      .select('id')
      .where('email', '=', a.email)
      .executeTakeFirst();
    let id = found?.id;
    if (!id) {
      ({ id } = await createUserWithPassword(auth, {
        email: a.email,
        name: a.name,
        password: a.password,
        mustChangePassword: false,
      }));
      result.users++;
    }
    userIds.set(a.email, id);
    const member = await db
      .selectFrom('member')
      .select('organizationId')
      .where('userId', '=', id)
      .executeTakeFirst();
    if (a.superAdmin) {
      // El superadministrador no pertenece a ninguna empresa (D-15).
      if (!member)
        await db.updateTable('user').set({ isSuperAdmin: true }).where('id', '=', id).execute();
      continue;
    }
    if (member || !a.organization || !a.role) continue;
    const organizationId = await orgId(a.organization);
    await db
      .insertInto('member')
      .values({ id: uuidv7(), organizationId, userId: id, role: a.role })
      .execute();
    await recordAudit(db, {
      organizationId,
      actorId: id,
      action: 'member.add',
      targetType: 'user',
      targetId: id,
      data: { email: a.email, role: a.role, demo: true },
    });
  }

  const creator = userIds.get('luis@cronos.local') ?? '';
  for (const m of DEMO_MINES) {
    const organizationId = await orgId(m.organization);
    let mine = await db
      .selectFrom('mine')
      .selectAll()
      .where('organizationId', '=', organizationId)
      .where('name', '=', m.name)
      .executeTakeFirst();
    if (!mine) {
      mine = await db
        .insertInto('mine')
        .values({ id: uuidv7(), organizationId, name: m.name, epsg: m.epsg, createdBy: null })
        .returningAll()
        .executeTakeFirstOrThrow();
      result.mines++;
    }
    if (m.name !== 'Cuajone' || !creator) continue;
    for (const exampleId of DEMO_PROJECTS) {
      const example = EXAMPLES.find((e) => e.id === exampleId);
      if (!example) continue;
      const built: ExampleBuild = await example.build();
      const exists = await db
        .selectFrom('project')
        .select('id')
        .where('mineId', '=', mine.id)
        .where('name', '=', built.project.name)
        .executeTakeFirst();
      if (exists) continue;
      const file = toProjectFile(
        { ...built.project, coordinateSystem: { ...built.project.coordinateSystem, epsg: m.epsg } },
        {
          appVersion: 'demo',
          embeddedAssets: Object.fromEntries(
            built.assets.map((x) => [x.hash, bytesToBase64(x.bytes)]),
          ),
        },
      );
      await createProject(db, mine, file, creator, 'Proyecto de demostración con topografía');
      result.projects++;
    }
  }
  return result;
}
