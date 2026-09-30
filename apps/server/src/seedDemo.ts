import { createAuth } from './auth/auth';
import { loadConfig } from './config';
import { createDb, createPool, migrateToLatest } from './db/db';
import { seedDemo } from './services/demo';

/**
 * Datos de demostración en la base de desarrollo (cuentas del README, empresas, minas y proyectos
 * con topografía). Idempotente. Lo corre `pnpm dev:online`; a mano: `pnpm dev:seed`.
 */
const config = loadConfig();
if (process.env.NODE_ENV === 'production') {
  console.error('Los datos de demostración son solo para desarrollo.');
  process.exit(1);
}
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
