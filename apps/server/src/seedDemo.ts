import { createAuth } from './auth/auth';
import { loadConfig } from './config';
import { createDb, createPool, migrateToLatest } from './db/db';
import { seedDemo } from './services/demo';

/**
 * Datos de demostración (cuentas del README, empresas, minas y proyectos
 * con topografía). Idempotente. Lo corre `pnpm dev:online`; a mano: `pnpm dev:seed`.
 */
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const db = createDb(pool);
try {
  await migrateToLatest(db);
  const auth = createAuth({
    pool,
    secret: config.authSecret,
    baseUrl: config.baseUrl,
    rateLimit: false,
  });
  const r = await seedDemo(db, auth);
  const created = r.users + r.organizations + r.mines + r.projects;
  console.log(
    created === 0
      ? 'Datos de demostración: ya estaban.'
      : `Datos de demostración: ${String(r.users)} cuentas, ${String(r.organizations)} empresas, ${String(r.mines)} minas y ${String(r.projects)} proyectos nuevos.`,
  );
} finally {
  await db.destroy();
}
