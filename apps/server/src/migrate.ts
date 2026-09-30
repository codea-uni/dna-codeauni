import { loadConfig } from './config';
import { createDb, createPool, migrateToLatest } from './db/db';

// `pnpm --filter @cronos/server migrate`: aplica las migraciones sin levantar el servidor.
const db = createDb(createPool(loadConfig().databaseUrl));
try {
  const applied = await migrateToLatest(db);
  console.log(applied.length ? `Aplicadas: ${applied.join(', ')}` : 'Sin migraciones pendientes');
} finally {
  await db.destroy();
}
