import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import pg from 'pg';
import { createDb, createPool, migrateToLatest, type Db } from '../db/db';

/**
 * PostgreSQL de las pruebas: `TEST_DATABASE_URL` o el de `docker-compose.dev.yml`.
 * Sin base disponible las pruebas del servidor se saltan con un aviso, salvo en CI, donde fallan.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://cronos:cronos@localhost:54329/cronos';

export async function databaseAvailable(): Promise<boolean> {
  const client = new pg.Client({
    connectionString: TEST_DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    if (process.env.CI) throw new Error(`Sin PostgreSQL de pruebas en ${TEST_DATABASE_URL}`);
    console.warn(
      'Pruebas del servidor saltadas: levantar PostgreSQL con `docker compose -f docker-compose.dev.yml up -d`.',
    );
    return false;
  }
}

export interface TestDb {
  db: Db;
  pool: pg.Pool;
  schema: string;
  /** Borra el esquema de la prueba y cierra las conexiones. */
  drop: () => Promise<void>;
}

/** Esquema aislado por archivo de prueba, con todas las migraciones aplicadas. */
export async function createTestDb(): Promise<TestDb> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  await admin.end();

  const pool = createPool(TEST_DATABASE_URL, schema);
  const db = createDb(pool);
  await migrateToLatest(db, schema);
  return {
    db,
    pool,
    schema,
    drop: async () => {
      await sql`drop schema ${sql.id(schema)} cascade`.execute(db);
      await db.destroy();
    },
  };
}
